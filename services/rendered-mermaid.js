const { isMathJaxSvg, rasterizeSvgToPngDataUrl } = require('./svg-rasterizer');

function hasMermaidMarker(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const values = [
    el.getAttribute('class'),
    el.getAttribute('id'),
    el.getAttribute('data-type'),
    el.getAttribute('aria-label'),
    el.getAttribute('aria-roledescription'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return values.includes('mermaid');
}

function looksLikeMermaidSvg(svg) {
  if (!svg || svg.tagName?.toLowerCase?.() !== 'svg') return false;
  if (isMathJaxSvg(svg)) return false;
  if (svg.closest('.callout-icon')) return false;
  if (hasMermaidMarker(svg)) return true;

  let cursor = svg.parentElement;
  let depth = 0;
  while (cursor && depth < 5) {
    if (hasMermaidMarker(cursor)) return true;
    cursor = cursor.parentElement;
    depth += 1;
  }

  return !!svg.querySelector(
    'g.node,g.edgePath,g.cluster,g.edgeLabel,g.messageText,g.actor,.node,.edgePath,.cluster,.edgeLabel'
  );
}

async function rasterizeRenderedMermaidDiagrams(root, options = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const {
    rasterizeSvg = rasterizeSvgToPngDataUrl,
    scale = 3,
  } = options;

  const svgs = Array.from(root.querySelectorAll('svg')).filter(looksLikeMermaidSvg);
  for (const svg of svgs) {
    try {
      const result = await rasterizeSvg(svg, { scale });
      const img = document.createElement('img');
      img.setAttribute('src', result.dataUrl);
      img.setAttribute('alt', 'Mermaid diagram');
      img.setAttribute('class', 'mermaid-diagram-image');
      if (result.width) img.setAttribute('width', String(Math.round(result.width)));
      if (result.height) img.setAttribute('height', String(Math.round(result.height)));
      img.setAttribute('style', 'display:block;max-width:100%;height:auto;margin:16px auto;');
      svg.replaceWith(img);
    } catch (error) {
      console.error('Mermaid 图表栅格化失败，保留原始 SVG:', error);
    }
  }
}

module.exports = {
  hasMermaidMarker,
  looksLikeMermaidSvg,
  rasterizeRenderedMermaidDiagrams,
};
