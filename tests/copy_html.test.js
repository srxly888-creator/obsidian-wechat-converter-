import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const { AppleStyleView } = require('../input.js');

describe('AppleStyleView - copyHTML clipboard behavior', () => {
  let view;
  let writeMock;
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
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { write: writeMock },
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

  it('should prefer rich selection copy and expose debug snapshots', async () => {
    await view.copyHTML();

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(writeMock).not.toHaveBeenCalled();
    const html = window.__OWC_LAST_CLIPBOARD_HTML;
    expect(html).toBe('<ol><li>清理时机： 正文</li></ol>');
    expect(window.__OWC_LAST_CLIPBOARD_TEXT).toBe('清理时机： 正文');
  });

  it('should fallback to clipboard html on desktop when selection copy fails', async () => {
    document.execCommand = vi.fn().mockReturnValue(false);

    await view.copyHTML();

    expect(writeMock).toHaveBeenCalledTimes(1);
    const item = writeMock.mock.calls[0][0][0];
    expect(Object.keys(item.items)).toEqual(['text/html']);
    const html = await blobToText(item.items['text/html']);
    expect(html).toBe('<ol><li>清理时机： 正文</li></ol>');
  });

  it('should fail fast on mobile when rich selection copy fails', async () => {
    view.app = { isMobile: true };
    document.execCommand = vi.fn().mockReturnValue(false);

    await view.copyHTML();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it('should restore user selection after rich selection copy', async () => {
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
