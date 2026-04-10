import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  hasMermaidMarker,
  looksLikeMermaidSvg,
  rasterizeRenderedMermaidDiagrams,
} = require('../services/rendered-mermaid');

describe('Rendered Mermaid Service', () => {
  beforeEach(() => {
    global.Node = global.Node || window.Node;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect Mermaid markers from class metadata', () => {
    const el = document.createElement('div');
    el.setAttribute('class', 'mermaid block-language-mermaid');
    expect(hasMermaidMarker(el)).toBe(true);
  });

  it('should identify Mermaid svg while ignoring MathJax svg', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid"><svg id="mermaid-1"></svg></div>',
      '<mjx-container><svg role="img" focusable="false"></svg></mjx-container>',
    ].join('');

    const svgs = Array.from(host.querySelectorAll('svg'));
    expect(looksLikeMermaidSvg(svgs[0])).toBe(true);
    expect(looksLikeMermaidSvg(svgs[1])).toBe(false);
  });

  it('should replace Mermaid svg nodes with PNG images', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="mermaid"><svg id="mermaid-1" width="120" height="80"></svg></div>';
    const rasterizeSvg = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,mermaid',
      width: 120,
      height: 80,
      style: '',
    }));

    await rasterizeRenderedMermaidDiagrams(host, { rasterizeSvg });

    const img = host.querySelector('img.mermaid-diagram-image');
    expect(rasterizeSvg).toHaveBeenCalledTimes(1);
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,mermaid');
    expect(host.querySelector('svg')).toBeNull();
  });
});
