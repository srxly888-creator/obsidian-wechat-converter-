import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  hasMermaidMarker,
  looksLikeMermaidSvg,
  isMermaidCodeBlock,
  buildMermaidCompatSource,
  normalizeRenderedMermaidDiagrams,
  renderMermaidCodeBlocks,
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

  it('should detect Mermaid fenced code blocks before explicit rendering', () => {
    const host = document.createElement('div');
    host.innerHTML = '<pre><code class="language-mermaid">graph TD\\nA-->B</code></pre>';
    expect(isMermaidCodeBlock(host.querySelector('code'))).toBe(true);
  });

  it('should inject compatible Mermaid init config when source lacks one', () => {
    const source = buildMermaidCompatSource('graph TD\nA-->B');
    expect(source).toContain('%%{init:');
    expect(source).toContain('"htmlLabels":false');
    expect(source).toContain('graph TD');
  });

  it('should render Mermaid code blocks into Mermaid svg hosts', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<pre><code class="language-mermaid">graph TD\\nA-->B</code></pre>';
    const mermaidApi = {
      render: vi.fn(async () => ({
        svg: '<svg id="mermaid-rendered"></svg>',
      })),
    };

    const renderedCount = await renderMermaidCodeBlocks(host, { mermaidApi });

    expect(renderedCount).toBe(1);
    expect(mermaidApi.render).toHaveBeenCalledTimes(1);
    expect(mermaidApi.render.mock.calls[0][1]).toContain('"htmlLabels":false');
    expect(host.querySelector('svg#mermaid-rendered')).not.toBeNull();
    expect(host.querySelector('pre')).toBeNull();
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
    expect(img.getAttribute('style')).toContain('width:100%');
    expect(host.querySelector('.mermaid')?.getAttribute('style') || '').toContain('max-width: 100%');
    expect(host.querySelector('svg')).toBeNull();
  });

  it('should normalize rendered Mermaid svg hosts for responsive preview', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="mermaid"><svg id="mermaid-preview" viewBox="0 0 400 120"></svg></div>';

    const normalized = normalizeRenderedMermaidDiagrams(host);

    expect(normalized).toBe(1);
    expect(host.querySelector('.mermaid')?.getAttribute('style') || '').toContain('width: 100%');
    expect(host.querySelector('svg#mermaid-preview')?.getAttribute('style') || '').toContain('max-width: 100%');
  });

  it('should inline Mermaid svg style rules before preview serialization strips style tags', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid">',
      '  <svg id="mermaid-style-test" viewBox="0 0 100 60">',
      '    <style>#mermaid-style-test .node rect { fill:#efeaff; stroke:#b197fc; } #mermaid-style-test .label { color:#2f2f2f; }</style>',
      '    <g class="node"><rect width="40" height="20"></rect></g>',
      '    <text class="label">Hello</text>',
      '  </svg>',
      '</div>',
    ].join('');

    normalizeRenderedMermaidDiagrams(host);

    const svg = host.querySelector('svg#mermaid-style-test');
    const rect = host.querySelector('rect');
    const text = host.querySelector('text.label');
    expect(svg?.querySelector('style')).toBeNull();
    expect(rect?.getAttribute('style') || '').toContain('fill:#efeaff');
    expect(rect?.getAttribute('style') || '').toContain('stroke:#b197fc');
    expect(text?.getAttribute('style') || '').toContain('color:#2f2f2f');
  });
});
