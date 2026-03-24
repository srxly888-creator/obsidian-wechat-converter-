import { describe, it, expect, vi, afterEach } from 'vitest';

const { AppleStyleView } = require('../input.js');

function createObsidianLikeElement(tag = 'div') {
  const el = document.createElement(tag);
  el.empty = function empty() {
    this.innerHTML = '';
  };
  el.setText = function setText(text) {
    this.textContent = text;
  };
  el.addClass = function addClass(cls) {
    this.classList.add(cls);
  };
  el.removeClass = function removeClass(cls) {
    this.classList.remove(cls);
  };
  el.createEl = function createEl(childTag, opts = {}) {
    const child = createObsidianLikeElement(childTag);
    if (opts.cls) child.className = opts.cls;
    if (opts.text) child.textContent = opts.text;
    if (opts.attr && typeof opts.attr === 'object') {
      Object.entries(opts.attr).forEach(([k, v]) => {
        child.setAttribute(k, String(v));
      });
    }
    if (opts.type) child.setAttribute('type', String(opts.type));
    if (opts.value !== undefined) child.value = String(opts.value);
    if (opts.placeholder) child.setAttribute('placeholder', String(opts.placeholder));
    if (opts.title) child.setAttribute('title', String(opts.title));
    this.appendChild(child);
    return child;
  };
  el.createDiv = function createDiv(opts = {}) {
    return this.createEl('div', opts);
  };
  return el;
}

describe('AppleStyleView native render + lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('getDisplayText should keep the unified plugin title', () => {
    const view = new AppleStyleView(null, { settings: {} });
    expect(view.getDisplayText()).toBe('微信公众号转换器');
  });

  it('convertCurrent should render native html in silent mode', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>native</p></section>');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBe('<section><p>native</p></section>');
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(true);
    expect(view.previewContainer.innerHTML).toContain('<p>native</p>');
  });

  it('convertCurrent should invalidate stale html on silent render failure', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.addClass('apple-has-content');
    view.previewContainer.innerHTML = '<section><p>stale</p></section>';
    view.currentHtml = '<section><p>stale</p></section>';
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockRejectedValue(new Error('native boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBeNull();
    expect(view.lastRenderError).toBe('native boom');
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(false);
    expect(view.previewContainer.textContent).toContain('渲染失败');
    expect(view.previewContainer.textContent).toContain('native boom');
  });

  it('onSyncToWechat should stop before sync when render result is unavailable', async () => {
    const view = new AppleStyleView(null, {
      settings: {
        wechatAccounts: [{ id: 'acc-1', name: '账号1', appId: 'wx-1', appSecret: 'sec-1' }],
        defaultAccountId: 'acc-1',
        proxyUrl: '',
      },
    });
    view.currentHtml = null;
    view.lastRenderError = 'native boom';
    view.selectedAccountId = 'acc-1';

    const processAllImagesSpy = vi.spyOn(view, 'processAllImages');

    await view.onSyncToWechat();

    expect(processAllImagesSpy).not.toHaveBeenCalled();
  });

  it('onClose should detach listeners and clear all view-level caches', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    const removeEditorScroll = vi.fn();
    const removePreviewScroll = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    view.activeEditorScroller = {
      removeEventListener: removeEditorScroll,
    };
    view.editorScrollListener = vi.fn();

    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.innerHTML = '<p>preview</p>';
    view.previewContainer.removeEventListener = removePreviewScroll;
    view.previewScrollListener = vi.fn();

    view.articleStates = new Map([['note-a', { coverBase64: 'x', digest: 'd' }]]);
    view.svgUploadCache = new Map([['svg-hash', 'https://wx/svg.png']]);
    view.imageUploadCache = new Map([['acc-1::app://img', 'https://wx/img.png']]);

    await view.onClose();

    expect(removeEditorScroll).toHaveBeenCalledWith('scroll', view.editorScrollListener);
    expect(removePreviewScroll).toHaveBeenCalledWith('scroll', view.previewScrollListener);
    expect(view.previewContainer.innerHTML).toBe('');
    expect(view.articleStates.size).toBe(0);
    expect(view.svgUploadCache.size).toBe(0);
    expect(view.imageUploadCache.size).toBe(0);
  });

  it('scheduleActiveLeafRender should debounce and call convertCurrent with loading options', async () => {
    vi.useFakeTimers();
    const view = new AppleStyleView(null, { settings: {} });
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleActiveLeafRender();
    view.scheduleActiveLeafRender();

    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(16);

    expect(convertSpy).toHaveBeenCalledTimes(1);
    expect(convertSpy).toHaveBeenCalledWith(true, {
      showLoading: true,
      loadingText: '正在切换文章预览...',
      loadingDelay: 150,
    });
    expect(view.activeLeafRenderTimer).toBeNull();
  });

  it('scheduleSidePaddingPreview should debounce convertCurrent calls', async () => {
    vi.useFakeTimers();
    const view = new AppleStyleView(null, { settings: {} });
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleSidePaddingPreview(120);
    view.scheduleSidePaddingPreview(120);

    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(119);
    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(convertSpy).toHaveBeenCalledTimes(1);
    expect(convertSpy).toHaveBeenCalledWith(true);
    expect(view.sidePaddingPreviewTimer).toBeNull();
  });

  it('convertCurrent should avoid showing loading class when render finishes before loadingDelay', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# fast' },
          file: { path: 'fixtures/fast.md', basename: 'fast' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>fast</p></section>');
    const setLoadingSpy = vi.spyOn(view, 'setPreviewLoading');

    await view.convertCurrent(true, {
      showLoading: true,
      loadingDelay: 150,
      loadingText: 'testing',
    });

    expect(setLoadingSpy).not.toHaveBeenCalledWith(true, 'testing');
    expect(setLoadingSpy).toHaveBeenCalledWith(false);
    expect(view.loadingVisibilityTimer).toBeNull();
    expect(view.previewContainer.classList.contains('apple-preview-loading')).toBe(false);
  });

  it('convertCurrent should reuse last resolved markdown when no active view is available', async () => {
    const activeView = {
      editor: { getValue: () => '# cached markdown' },
      file: { path: 'fixtures/cached.md', basename: 'cached' },
    };
    const getActiveViewOfType = vi
      .fn()
      .mockReturnValueOnce(activeView)
      .mockReturnValueOnce(null);

    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: { getActiveViewOfType },
      vault: { read: vi.fn() },
    };

    const renderSpy = vi
      .spyOn(view, 'renderMarkdownForPreview')
      .mockImplementation(async (markdown) => `<section><p>${markdown}</p></section>`);

    await view.convertCurrent(true);
    await view.convertCurrent(true);

    expect(renderSpy).toHaveBeenNthCalledWith(1, '# cached markdown', 'fixtures/cached.md');
    expect(renderSpy).toHaveBeenNthCalledWith(2, '# cached markdown', 'fixtures/cached.md');
    expect(view.currentHtml).toContain('# cached markdown');
  });

  it('onClose should clear active leaf/loading/side-padding timers', async () => {
    vi.useFakeTimers();
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleActiveLeafRender();
    view.scheduleSidePaddingPreview(120);
    view.loadingVisibilityTimer = setTimeout(() => {}, 200);

    await view.onClose();
    await vi.runAllTimersAsync();

    expect(convertSpy).not.toHaveBeenCalled();
    expect(view.activeLeafRenderTimer).toBeNull();
    expect(view.sidePaddingPreviewTimer).toBeNull();
    expect(view.loadingVisibilityTimer).toBeNull();
  });

  it('createSettingsPanel should keep mobile DOM state aligned (overlay + actions)', () => {
    const view = new AppleStyleView(null, {
      settings: {
        theme: 'github',
        themeColor: 'blue',
        customColor: '#0366d6',
        fontFamily: 'sans-serif',
        fontSize: 3,
        coloredHeader: false,
        macCodeBlock: true,
        codeLineNumber: true,
        sidePadding: 16,
        showImageCaption: true,
        enableWatermark: false,
      },
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: true };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [
        { value: 'github', label: '简约' },
        { value: 'wechat', label: '经典' },
      ],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    container.addClass('apple-converter-mobile');
    view.createSettingsPanel(container);

    expect(container.querySelector('.apple-top-toolbar')).toBeTruthy();
    expect(container.querySelector('.apple-settings-overlay')).toBeTruthy();
    expect(container.querySelector('.apple-ai-layout-overlay')).toBeTruthy();
    expect(container.querySelector('.apple-settings-area')).toBeTruthy();
    expect(container.querySelector('.apple-toolbar-plugin-name')).toBeNull();
    expect(container.querySelector('.apple-icon-btn[aria-label="样式设置"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="AI 编排"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="一键同步到草稿箱"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="复制到公众号"]')).toBeNull();
  });

  it('createSettingsPanel should mark AI entry disabled when feature toggle is off', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: false,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
    });
    view.app = { isMobile: false };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const aiBtn = container.querySelector('.apple-icon-btn[aria-label="AI 编排"]');
    expect(aiBtn).toBeTruthy();
    expect(aiBtn.classList.contains('is-disabled')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('AI 编排已在插件设置中关闭');
  });

  it('refreshAiLayoutPanel should surface provider, structure and fallback details', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 3,
        sectionCount: 2,
        leadParagraphCount: 1,
        bulletGroupCount: 1,
        imageCount: 2,
        aiBlockCount: 3,
        finalBlockCount: 5,
        fallbackUsed: true,
        fallbackBlockCount: 2,
        fallbackBlockTypes: ['cta-card'],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: 'AI 编排实践' },
          { index: 1, type: 'case-block', source: 'ai', label: '第一部分' },
          { index: 2, type: 'phone-frame', source: 'ai', label: 'image-1' },
          { index: 3, type: 'lead-quote', source: 'fallback', label: '导语' },
          { index: 4, type: 'cta-card', source: 'fallback', label: '继续阅读' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: 'AI 编排实践' },
          { type: 'case-block', caseLabel: 'CASE 01', title: '第一部分' },
          { type: 'phone-frame', imageId: 'image-1', caption: '截图' },
          { type: 'lead-quote', text: '这是一段导语' },
          { type: 'cta-card', title: '继续阅读' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).toContain('章节：2');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('Provider DeepSeek');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('补全 2 块');
    const originBadges = Array.from(container.querySelectorAll('.apple-ai-layout-block-origin')).map((el) => el.textContent);
    expect(originBadges).toContain('AI');
    expect(originBadges).toContain('补全');
  });

  it('refreshAiLayoutPanel should toggle debug panel for layout json and error details', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'error',
      lastError: '401 unauthorized',
      lastAttemptStatus: 'error',
      lastAttemptError: '401 unauthorized',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const jsonBtn = container.querySelector('.apple-ai-layout-debug-btn');
    const errorBtn = container.querySelectorAll('.apple-ai-layout-debug-btn')[1];
    expect(jsonBtn?.textContent).toContain('查看布局 JSON');
    expect(errorBtn?.textContent).toContain('查看错误详情');

    jsonBtn.click();
    expect(container.querySelector('.apple-ai-layout-debug-panel')?.classList.contains('visible')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-debug-title')?.textContent).toContain('布局 JSON');
    expect(container.querySelector('.apple-ai-layout-debug-body')?.textContent).toContain('"layoutJson"');

    errorBtn.click();
    expect(container.querySelector('.apple-ai-layout-debug-title')?.textContent).toContain('错误详情');
    expect(container.querySelector('.apple-ai-layout-debug-body')?.textContent).toContain('401 unauthorized');
    expect(container.querySelector('.apple-ai-layout-debug-body')?.textContent).toContain('"providerName": "DeepSeek"');
  });

  it('copyAiLayoutDebugSnapshot should copy current debug payload to clipboard', async () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const jsonBtn = container.querySelector('.apple-ai-layout-debug-btn');
    const copyBtn = container.querySelector('.apple-ai-layout-debug-copy');

    jsonBtn.click();
    await view.copyAiLayoutDebugSnapshot();

    expect(copyBtn?.disabled).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('mode: json');
    expect(writeText.mock.calls[0][0]).toContain('"layoutJson"');
    expect(writeText.mock.calls[0][0]).toContain('sourcePath: notes/demo.md');
  });

  it('copyAiLayoutPromptContext should copy prompt-ready diagnosis context', async () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo\n\n这是一段正文。\n\n## 第二段\n更多内容。';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);

    const promptBtn = container.querySelectorAll('.apple-ai-layout-debug-copy')[0];
    await view.copyAiLayoutPromptContext();

    expect(promptBtn?.disabled).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('# 公众号 AI 编排调试上下文');
    expect(writeText.mock.calls[0][0]).toContain('1. [AI] lead-quote - 一句摘要');
    expect(writeText.mock.calls[0][0]).toContain('## 文章正文摘录');
    expect(writeText.mock.calls[0][0]).toContain('这是一段正文');
  });

  it('refreshAiLayoutPanel should surface schema validation failure separately', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'schema-error',
      lastError: 'AI 返回的布局结果未通过 schema 校验（2 项）',
      lastAttemptStatus: 'schema-error',
      lastAttemptError: 'AI 返回的布局结果未通过 schema 校验（2 项）',
      lastAttemptSchemaValidation: {
        isValid: false,
        fatal: true,
        issueCount: 2,
        issues: [
          { path: '$.blocks[0].type', message: '不支持的 block type: unknown-block。', fatal: true },
        ],
      },
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 1,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 0,
        finalBlockCount: 0,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: {
          isValid: false,
          fatal: true,
          issueCount: 2,
          issues: [
            { path: '$.blocks[0].type', message: '不支持的 block type: unknown-block。', fatal: true },
          ],
        },
        blockOrigins: [],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('校验失败');
    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).toContain('schema 校验');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('Schema 2 项');
    expect(container.querySelector('.apple-ai-layout-issues')?.textContent).toContain('不支持的 block type');
    const applyBtn = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === '应用到预览');
    expect(applyBtn?.disabled).toBe(true);
  });

  it('refreshAiLayoutPanel should show schema warnings even when generation succeeds', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 1,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: {
          isValid: false,
          fatal: false,
          issueCount: 1,
          issues: [
            { path: '$.blocks[0].extraField', message: 'lead-quote 不支持字段 extraField。', fatal: false },
          ],
        },
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('Schema 1 项');
    expect(container.querySelector('.apple-ai-layout-issues')?.textContent).toContain('extraField');
    expect(container.querySelector('.apple-ai-layout-issues-title')?.textContent).toContain('Schema 提醒');
  });

  it('refreshAiLayoutPanel should keep apply available after a failed regenerate when previous layout is reusable', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now() - 1000,
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'error',
      lastAttemptError: '429 rate limited',
      lastAttemptAt: Date.now(),
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 1,
        finalBlockCount: 1,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        schemaValidation: { isValid: true, fatal: false, issueCount: 0, issues: [] },
        blockOrigins: [
          { index: 0, type: 'lead-quote', source: 'ai', label: '一句摘要' },
        ],
      },
      layoutJson: {
        articleType: 'article',
        stylePack: 'tech-green',
        blocks: [
          { type: 'lead-quote', text: '一句摘要' },
        ],
      },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          defaultProviderId: 'provider-1',
          providers: [{
            id: 'provider-1',
            name: 'DeepSeek',
            kind: 'openai-compatible',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
            model: 'deepseek-chat',
            enabled: true,
          }],
          articleLayoutsByPath: {
            'notes/demo.md': cachedState,
          },
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => cachedState),
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    cachedState.sourceHash = String(view.simpleHash('# demo'));
    view.lastResolvedSourceHash = cachedState.sourceHash;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('可回退');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('最近一次生成失败');
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-mini-note')).some((el) => el.textContent.includes('429 rate limited'))).toBe(true);
    const applyBtn = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === '应用到预览');
    expect(applyBtn?.disabled).toBe(false);
  });
});
