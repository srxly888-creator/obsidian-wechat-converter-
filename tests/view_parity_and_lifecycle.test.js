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
    view.app = { workspace: { getActiveViewOfType: vi.fn(() => null) } };
    const convertSpy = vi.spyOn(view, 'convertCurrent').mockResolvedValue();

    view.scheduleActiveLeafRender();
    view.scheduleActiveLeafRender();

    expect(convertSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(16);

    expect(convertSpy).toHaveBeenCalledTimes(1);
    expect(convertSpy).toHaveBeenCalledWith(true, {
      showLoading: true,
      loadingText: '正在切换文章预览...',
      loadingDelay: 120,
      sourceOverride: null,
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

  it('convertCurrent should prefer sourceOverride on note switching path', async () => {
    const getActiveViewOfType = vi.fn(() => null);
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: { getActiveViewOfType },
      vault: { read: vi.fn() },
    };

    const renderSpy = vi
      .spyOn(view, 'renderMarkdownForPreview')
      .mockImplementation(async (markdown) => `<section><p>${markdown}</p></section>`);

    await view.convertCurrent(true, {
      sourceOverride: {
        markdown: '# overridden',
        sourcePath: 'fixtures/override.md',
      },
    });

    expect(renderSpy).toHaveBeenCalledWith('# overridden', 'fixtures/override.md');
    expect(view.app.vault.read).not.toHaveBeenCalled();
    expect(view.currentHtml).toContain('# overridden');
  });

  it('convertCurrent should skip AI panel refresh when AI UI is inactive', async () => {
    const activeView = {
      editor: { getValue: () => '# 普通预览' },
      file: { path: 'fixtures/plain.md', basename: 'plain' },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      getArticleLayoutState: vi.fn(() => ({
        sourceHash: '123',
        layoutJson: { blocks: [{ type: 'hero', title: 'AI' }] },
      })),
    });
    view.previewContainer = createObsidianLikeElement();
    view.aiLayoutOverlay = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
      },
    };
    view.aiPreviewApplied = false;
    view.aiLayoutLoading = false;

    const refreshSpy = vi.spyOn(view, 'refreshAiLayoutPanel').mockImplementation(() => {});
    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>plain</p></section>');

    await view.convertCurrent(true);

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(view.plugin.getArticleLayoutState).not.toHaveBeenCalled();
  });

  it('convertCurrent should refresh AI panel when AI panel is visible', async () => {
    const activeView = {
      editor: { getValue: () => '# AI 面板' },
      file: { path: 'fixtures/ai.md', basename: 'ai' },
    };

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      getArticleLayoutState: vi.fn(() => null),
    });
    view.previewContainer = createObsidianLikeElement();
    view.aiLayoutOverlay = createObsidianLikeElement();
    view.aiLayoutOverlay.addClass('visible');
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
      },
    };

    const refreshSpy = vi.spyOn(view, 'refreshAiLayoutPanel').mockImplementation(() => {});
    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>ai</p></section>');

    await view.convertCurrent(true);

    expect(refreshSpy).toHaveBeenCalled();
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

  it('createSettingsPanel should hide AI entry when feature toggle is off', () => {
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
    expect(aiBtn.hidden).toBe(true);
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('AI 编排已在插件设置中关闭');
  });

  it('updateAiToolbarState should close AI panel when feature toggle is turned off', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
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

    view.aiLayoutOverlay.classList.add('visible');
    view.aiLayoutBtn.classList.add('active');
    view.plugin.settings.ai.enabled = false;

    view.updateAiToolbarState();

    expect(view.aiLayoutBtn.hidden).toBe(true);
    expect(view.aiLayoutOverlay.classList.contains('visible')).toBe(false);
    expect(view.aiLayoutBtn.classList.contains('active')).toBe(false);
  });

  it('createSettingsPanel should render AI panel with dedicated content area', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
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

    expect(container.querySelector('.apple-ai-layout-overlay')).toBeTruthy();
    expect(container.querySelector('.apple-ai-layout-area')).toBeTruthy();
  });

  it('AI layout overlay should contain wheel scroll instead of bubbling to preview wrapper', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
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
    const parentWheelSpy = vi.fn();
    container.addEventListener('wheel', parentWheelSpy);
    view.createSettingsPanel(container);

    const overlay = container.querySelector('.apple-ai-layout-overlay');
    expect(overlay).toBeTruthy();
    overlay.classList.add('visible');
    Object.defineProperty(overlay, 'scrollHeight', { value: 720, configurable: true });
    Object.defineProperty(overlay, 'clientHeight', { value: 360, configurable: true });
    Object.defineProperty(overlay, 'scrollTop', { value: 360, configurable: true, writable: true });

    const event = new window.WheelEvent('wheel', {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });

    overlay.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(parentWheelSpy).not.toHaveBeenCalled();
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
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
          { index: 2, type: 'phone-frame', source: 'ai', label: 'image-1' },
          { index: 3, type: 'section-block', source: 'fallback', label: '第二部分' },
          { index: 4, type: 'part-nav', source: 'fallback', label: '继续阅读' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: 'AI 编排实践' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, sectionLabel: 'PART 01', headingLevel: 2, paragraphs: ['正文一'], bulletGroups: [], imageIds: [] },
          { type: 'phone-frame', imageId: 'image-1', caption: '截图' },
          { type: 'section-block', title: '第二部分', sectionIndex: 1, sectionLabel: 'SUB 02', headingLevel: 3, paragraphs: ['正文二'], bulletGroups: [], imageIds: [] },
          { type: 'part-nav', items: [{ label: 'PART 01', text: '第一部分' }] },
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
    expect(originBadges).toContain('原文');
    expect(originBadges).toContain('补全');
  });

  it('refreshAiLayoutPanel should reset to initial state when selected color palette has no cached result', () => {
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
        aiBlockCount: 2,
        finalBlockCount: 2,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: '文章标题' },
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: '文章标题' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, sectionLabel: 'PART 01', headingLevel: 2, paragraphs: ['正文'], bulletGroups: [], imageIds: [] },
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
    view.pendingAiStylePack = 'ocean-blue';
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-badge')?.textContent).toContain('未生成');
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('当前布局和颜色组合还没有生成结果');
    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).toContain('将为');
    expect(container.querySelector('.apple-ai-layout-empty')?.textContent).toContain('生成后会展示区块清单');
    expect(container.querySelectorAll('.apple-ai-layout-block-item')).toHaveLength(0);
  });

  it('refreshAiLayoutPanel should restore cached blocks when switching back to another generated color palette', () => {
    const greenState = {
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
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '科技绿标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [{ type: 'hero', title: '科技绿标题' }],
      },
    };

    const blueState = {
      ...greenState,
      stylePack: 'ocean-blue',
      generationMeta: {
        ...greenState.generationMeta,
        stylePackLabel: '深海蓝',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '深海蓝标题' }],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'ocean-blue',
        blocks: [{ type: 'hero', title: '深海蓝标题' }],
      },
    };

    const getArticleLayoutState = vi.fn((_, stylePack) => {
      if (stylePack === 'ocean-blue') return blueState;
      return greenState;
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
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState,
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

    view.pendingAiStylePack = 'ocean-blue';
    view.refreshAiLayoutPanel();
    expect(container.querySelector('.apple-ai-layout-block-name')?.textContent).toContain('深海蓝标题');

    view.pendingAiStylePack = 'tech-green';
    view.refreshAiLayoutPanel();
    expect(container.querySelector('.apple-ai-layout-block-name')?.textContent).toContain('科技绿标题');
    expect(getArticleLayoutState).toHaveBeenCalledWith('notes/demo.md', expect.objectContaining({ colorPalette: 'tech-green' }));
    expect(getArticleLayoutState).toHaveBeenCalledWith('notes/demo.md', expect.objectContaining({ colorPalette: 'ocean-blue' }));
    expect(getArticleLayoutState).toHaveBeenCalledWith('notes/demo.md', 'ocean-blue');
  });

  it('ensureAiLayoutSelectionState should derive and persist a new color variant from the current layout', async () => {
    const greenState = {
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      selection: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      recommendedLayoutFamily: 'editorial-lite',
      recommendedColorPalette: 'graphite-rose',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '轻杂志型',
        colorPaletteLabel: '科技绿',
        stylePackLabel: '科技绿',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '经验复盘' }],
      },
      layoutJson: {
        articleType: 'article',
        selection: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        resolved: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        recommendedLayoutFamily: 'editorial-lite',
        recommendedColorPalette: 'graphite-rose',
        stylePack: 'tech-green',
        layoutFamily: 'editorial-lite',
        title: '经验复盘',
        summary: '这是一句摘要。',
        blocks: [{ type: 'hero', title: '经验复盘' }],
      },
    };

    const getArticleLayoutState = vi.fn((_, selection) => {
      if (selection && typeof selection === 'object' && selection.colorPalette === 'ocean-blue') return null;
      return greenState;
    });
    const saveArticleLayoutState = vi.fn().mockResolvedValue(true);

    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultLayoutFamily: 'editorial-lite',
          defaultColorPalette: 'tech-green',
          providers: [],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState,
      saveArticleLayoutState,
    });
    view.app = {
      isMobile: false,
      workspace: {
        getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })),
      },
    };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.lastResolvedSourceHash = '123';

    const derivedState = await view.ensureAiLayoutSelectionState(greenState, {
      layoutFamily: 'editorial-lite',
      colorPalette: 'ocean-blue',
    });

    expect(derivedState).toBeTruthy();
    expect(derivedState.stylePack).toBe('ocean-blue');
    expect(derivedState.layoutJson.stylePack).toBe('ocean-blue');
    expect(derivedState.selection.colorPalette).toBe('ocean-blue');
    expect(saveArticleLayoutState).toHaveBeenCalledWith(
      'notes/demo.md',
      expect.objectContaining({
        stylePack: 'ocean-blue',
        selection: expect.objectContaining({ colorPalette: 'ocean-blue' }),
      }),
      expect.objectContaining({
        layoutFamily: 'editorial-lite',
        colorPalette: 'ocean-blue',
      })
    );
  });

  it('refreshAiLayoutPanel should hide dismissed blocks and enable restore action', () => {
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
      dismissedBlockKeys: ['section-block::0::第一部分::1'],
      generationMeta: {
        providerName: 'DeepSeek',
        providerModel: 'deepseek-chat',
        stylePackLabel: '科技绿',
        headingCount: 2,
        sectionCount: 1,
        leadParagraphCount: 1,
        bulletGroupCount: 0,
        imageCount: 0,
        aiBlockCount: 2,
        finalBlockCount: 2,
        fallbackUsed: false,
        fallbackBlockCount: 0,
        fallbackBlockTypes: [],
        blockOrigins: [
          { index: 0, type: 'hero', source: 'ai', label: '文章标题' },
          { index: 1, type: 'section-block', source: 'ai', label: '第一部分' },
        ],
      },
      layoutJson: {
        articleType: 'tutorial',
        stylePack: 'tech-green',
        blocks: [
          { type: 'hero', title: '文章标题' },
          { type: 'section-block', title: '第一部分', sectionIndex: 0, sectionLabel: 'PART 01', headingLevel: 2, paragraphs: ['正文'], bulletGroups: [], imageIds: [] },
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

    expect(container.querySelectorAll('.apple-ai-layout-block-item')).toHaveLength(1);
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).toContain('已移除 1 块');
    expect(Array.from(container.querySelectorAll('.apple-ai-layout-actions button')).some((button) => button.textContent === '恢复已移除' && button.disabled === false)).toBe(true);
  });

  it('refreshAiLayoutPanel should show full-panel loading state while generating', () => {
    const view = new AppleStyleView(null, {
      settings: {
        ai: {
          enabled: true,
          defaultStylePack: 'tech-green',
          includeImagesInLayout: true,
          requestTimeoutMs: 45000,
          providers: [{ id: 'provider-1', name: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.example.com/v1', apiKey: 'secret', model: 'deepseek-chat', enabled: true }],
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => null),
    });
    view.app = {
      isMobile: false,
      workspace: { getActiveFile: vi.fn(() => ({ path: 'notes/demo.md', basename: 'demo' })) },
    };
    view.theme = { update: vi.fn() };
    view.converter = { updateConfig: vi.fn() };
    view.lastResolvedSourcePath = 'notes/demo.md';
    view.lastResolvedMarkdown = '# demo';
    view.aiLayoutLoading = true;

    global.AppleTheme = {
      getThemeList: () => [{ value: 'github', label: '简约' }],
      getColorList: () => [{ value: 'blue', color: '#0366d6' }],
    };

    const container = createObsidianLikeElement();
    view.createSettingsPanel(container);
    view.refreshAiLayoutPanel();

    expect(container.querySelector('.apple-ai-layout-overlay')?.classList.contains('is-loading')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-loading-mask')?.classList.contains('visible')).toBe(true);
    expect(container.querySelector('.apple-ai-layout-status-text')?.textContent).toContain('正在基于当前文章、布局和颜色生成');
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

  it('refreshAiLayoutPanel should keep the pending style pack selection before regeneration', () => {
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
          articleLayoutsByPath: {},
        },
      },
      saveSettings: vi.fn(),
      getArticleLayoutState: vi.fn(() => null),
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
    view.aiStylePackSelect.value = 'ocean-blue';
    view.aiStylePackSelect.dispatchEvent(new Event('change'));

    expect(view.aiStylePackSelect.value).toBe('ocean-blue');
    view.refreshAiLayoutPanel();
    expect(view.aiStylePackSelect.value).toBe('ocean-blue');
  });

  it('refreshAiLayoutPanel should not surface stale schema issues after a timeout-style failure', () => {
    const cachedState = {
      version: 1,
      updatedAt: Date.now() - 1000,
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: 'AI 请求超时（45s）',
      lastAttemptStatus: 'error',
      lastAttemptError: 'AI 请求超时（45s）',
      lastAttemptAt: Date.now(),
      lastAttemptSchemaValidation: null,
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
        schemaValidation: {
          isValid: false,
          fatal: true,
          issueCount: 2,
          issues: [
            { path: '$.blocks[0].type', message: 'block 缺少合法的 type。', fatal: true },
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
    expect(container.querySelector('.apple-ai-layout-summary')?.textContent).not.toContain('schema');
    expect(container.querySelector('.apple-ai-layout-meta-chips')?.textContent).not.toContain('Schema');
    expect(container.querySelector('.apple-ai-layout-issues')?.classList.contains('visible')).toBe(false);

    const errorBtn = container.querySelectorAll('.apple-ai-layout-debug-btn')[1];
    errorBtn.click();
    const errorBody = container.querySelector('.apple-ai-layout-debug-body')?.textContent || '';
    expect(errorBody).toContain('"status": "ready"');
    expect(errorBody).toContain('"lastAttempt"');
    expect(errorBody).toContain('AI 请求超时（45s）');
    expect(errorBody).toContain('"currentLayoutGenerationMeta"');
  });
});
