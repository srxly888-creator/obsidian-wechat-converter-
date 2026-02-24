import { describe, it, expect, beforeEach, vi } from 'vitest';

function createObsidianLikeElement(tag = 'div') {
  const el = document.createElement(tag);
  el.empty = function empty() {
    this.innerHTML = '';
  };
  el.addClass = function addClass(cls) {
    this.classList.add(cls);
  };
  el.removeClass = function removeClass(cls) {
    this.classList.remove(cls);
  };
  el.setText = function setText(text) {
    this.textContent = text;
  };
  el.createEl = function createEl(childTag, opts = {}) {
    const child = createObsidianLikeElement(childTag);
    if (opts.cls) child.className = opts.cls;
    if (opts.text !== undefined) child.textContent = opts.text;
    if (opts.attr) {
      Object.entries(opts.attr).forEach(([key, value]) => {
        child.setAttribute(key, String(value));
      });
    }
    this.appendChild(child);
    return child;
  };
  el.createDiv = function createDiv(opts = {}) {
    return this.createEl('div', opts);
  };
  return el;
}

function installModalMock(obsidianMock) {
  const openedModals = [];

  class ModalMock {
    constructor(app) {
      this.app = app;
      this.titleEl = createObsidianLikeElement('h2');
      this.contentEl = createObsidianLikeElement('div');
      this.modalEl = createObsidianLikeElement('div');
      openedModals.push(this);
    }

    open() {
      this.isOpen = true;
    }

    close() {
      this.isOpen = false;
    }
  }

  obsidianMock.Modal = ModalMock;
  return {
    getLastModal: () => openedModals[openedModals.length - 1],
  };
}

describe('AppleStyleView - sync modal mobile UI', () => {
  let AppleStyleView;
  let view;
  let getLastModal;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    ({ getLastModal } = installModalMock(obsidianMock));

    const inputModule = require('../input.js');
    AppleStyleView = inputModule.AppleStyleView;

    view = new AppleStyleView(null, {
      settings: {
        wechatAccounts: [{ id: 'acc-1', name: '账号1', appId: 'wx1', appSecret: 'sec1' }],
        defaultAccountId: 'acc-1',
        proxyUrl: '',
      },
    });

    view.app = { isMobile: true };
    view.currentHtml = '<p>同步内容</p>';
    view.getPublishContextFile = vi.fn(() => ({ path: 'note-a.md', basename: 'note-a' }));
  });

  it('should auto-expand advanced options on mobile when cover is missing', () => {
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc: null }));
    view.getFirstImageFromArticle = vi.fn(() => null);

    view.showSyncModal();

    const modal = getLastModal();
    const advanced = modal.contentEl.querySelector('details.wechat-sync-advanced');
    const hint = modal.contentEl.querySelector('.wechat-sync-mobile-quick-hint');
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');

    expect(advanced).not.toBeNull();
    expect(advanced.hasAttribute('open')).toBe(true);
    expect(hint.textContent).toContain('未检测到封面');
    expect(syncBtn.disabled).toBe(true);
    expect(syncBtn.textContent).toBe('请先设置封面');
  });

  it('should keep advanced options collapsed on mobile when cover exists', () => {
    const coverSrc = 'data:image/png;base64,abc';
    view.getFrontmatterPublishMeta = vi.fn(() => ({ excerpt: '', coverSrc }));
    view.getFirstImageFromArticle = vi.fn(() => null);

    view.showSyncModal();

    const modal = getLastModal();
    const advanced = modal.contentEl.querySelector('details.wechat-sync-advanced');
    const hint = modal.contentEl.querySelector('.wechat-sync-mobile-quick-hint');
    const syncBtn = modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta');
    const previewImg = modal.contentEl.querySelector('.wechat-modal-cover-preview img');

    expect(advanced).not.toBeNull();
    expect(advanced.hasAttribute('open')).toBe(false);
    expect(hint.textContent).toContain('可直接同步');
    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.textContent).toBe('开始同步');
    expect(previewImg.getAttribute('src')).toBe(coverSrc);
  });
});
