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
    expect(container.querySelector('.apple-settings-area')).toBeTruthy();
    expect(container.querySelector('.apple-toolbar-plugin-name')).toBeNull();
    expect(container.querySelector('.apple-icon-btn[aria-label="样式设置"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="一键同步到草稿箱"]')).toBeTruthy();
    expect(container.querySelector('.apple-icon-btn[aria-label="复制到公众号"]')).toBeNull();
  });
});
