import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const { AppleStyleView } = require('../input.js');

describe('AppleStyleView - copyHTML clipboard behavior', () => {
  let view;
  let writeMock;
  let readTextMock;
  let realBlob;
  let realExecCommand;
  const blobToText = async (blob) => {
    if (blob && typeof blob.text === 'function') return blob.text();
    return new Response(blob).text();
  };

  beforeEach(() => {
    view = new AppleStyleView(null, null);
    view.currentHtml = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    view.processImagesToDataURL = vi.fn().mockResolvedValue(false);
    view.cleanHtmlForDraft = vi.fn(() => '<ol><li>清理时机： 正文</li></ol>');

    writeMock = vi.fn().mockResolvedValue(undefined);
    readTextMock = vi.fn().mockResolvedValue('清理时机： 正文');
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { write: writeMock, readText: readTextMock },
      configurable: true,
    });

    global.ClipboardItem = class ClipboardItemMock {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items);
      }
    };

    realBlob = global.Blob;
    global.Blob = class BlobMock {
      constructor(parts = [], options = {}) {
        this.parts = parts;
        this.type = options.type || '';
      }
      async text() {
        return this.parts
          .map((part) => (typeof part === 'string' ? part : String(part)))
          .join('');
      }
    };

    window.__OWC_LAST_CLIPBOARD_HTML = undefined;
    window.__OWC_LAST_CLIPBOARD_TEXT = undefined;

    realExecCommand = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    delete global.ClipboardItem;
    global.Blob = realBlob;
    if (realExecCommand) {
      document.execCommand = realExecCommand;
    } else {
      delete document.execCommand;
    }
  });

  it('should use clipboard html on desktop and expose debug snapshots', async () => {
    await view.copyHTML();

    expect(document.execCommand).not.toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
    const item = writeMock.mock.calls[0][0][0];
    expect(Object.keys(item.items)).toEqual(['text/html']);
    const html = await blobToText(item.items['text/html']);
    expect(html).toBe('<ol><li>清理时机： 正文</li></ol>');
    expect(window.__OWC_LAST_CLIPBOARD_TEXT).toBe('清理时机： 正文');
  });

  it('should fail on desktop when clipboard html write is unavailable', async () => {
    Object.defineProperty(global.navigator, 'clipboard', {
      value: {},
      configurable: true,
    });

    await view.copyHTML();

    expect(document.execCommand).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('should fail fast on mobile when rich selection copy fails', async () => {
    view.app = { isMobile: true };
    document.execCommand = vi.fn().mockReturnValue(false);

    await view.copyHTML();

    expect(writeMock).not.toHaveBeenCalled();
    expect(readTextMock).not.toHaveBeenCalled();
  });

  it('should fail on mobile when copy cannot be verified by clipboard readback', async () => {
    view.app = { isMobile: true };
    document.execCommand = vi.fn().mockReturnValue(true);
    readTextMock.mockResolvedValue('旧剪贴板内容');

    await view.copyHTML();

    expect(writeMock).not.toHaveBeenCalled();
    expect(readTextMock).toHaveBeenCalledTimes(1);
  });

  it('should restore user selection after rich selection copy', async () => {
    view.app = { isMobile: true };
    const textEl = document.createElement('div');
    textEl.textContent = 'abcdef';
    document.body.appendChild(textEl);

    const originalRange = document.createRange();
    originalRange.setStart(textEl.firstChild, 1);
    originalRange.setEnd(textEl.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(originalRange);

    await view.copyHTML();

    expect(selection.rangeCount).toBe(1);
    const restored = selection.getRangeAt(0);
    expect(restored.startContainer).toBe(textEl.firstChild);
    expect(restored.startOffset).toBe(1);
    expect(restored.endContainer).toBe(textEl.firstChild);
    expect(restored.endOffset).toBe(3);

    textEl.remove();
  });

  it('should block copy when latest render has failed', async () => {
    view.currentHtml = null;
    view.lastRenderError = 'native boom';

    await view.copyHTML();

    expect(view.processImagesToDataURL).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });
});
