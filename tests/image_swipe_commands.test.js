import { describe, it, expect } from 'vitest';

const {
  createImageSwipeCalloutMarkdown,
  getImageSwipeCommandCopy,
} = require('../input');

describe('Image swipe editor commands', () => {
  it('should wrap selected images in an image-swipe callout', () => {
    const selected = [
      '![[png1.png]]',
      '![[png2.png]]',
    ].join('\n');

    const markdown = createImageSwipeCalloutMarkdown('image-swipe', selected, {
      vault: { getConfig: () => 'zh-CN' },
    });

    expect(markdown).toBe([
      '> [!image-swipe] 左右滑动查看图片',
      '> ![[png1.png]]',
      '> ![[png2.png]]',
    ].join('\n'));
  });

  it('should insert a sensitive-image template when nothing is selected', () => {
    const markdown = createImageSwipeCalloutMarkdown('sensitive-image', '', {
      vault: { getConfig: () => 'zh-CN' },
    });

    expect(markdown).toContain('> [!sensitive-image] 此类图片可能引发不适，向左滑动查看');
    expect(markdown).toContain('> ![[图片1.png]]');
    expect(markdown).toContain('> ![[图片2.png]]');
  });

  it('should localize command names for non-Chinese Obsidian locales', () => {
    const imageCopy = getImageSwipeCommandCopy({
      vault: { getConfig: () => 'en' },
    }, 'image-swipe');
    const sensitiveCopy = getImageSwipeCommandCopy({
      vault: { getConfig: () => 'en' },
    }, 'sensitive-image');

    expect(imageCopy.name).toBe('Insert image block');
    expect(sensitiveCopy.name).toBe('Insert sensitive image block');
  });
});
