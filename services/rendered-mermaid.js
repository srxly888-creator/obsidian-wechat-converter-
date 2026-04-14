const { isMathJaxSvg, rasterizeSvgToPngDataUrl } = require('./svg-rasterizer');

const MERMAID_COMPAT_THEME = {
  theme: 'base',
  flowchart: {
    htmlLabels: false,
    useMaxWidth: true,
    curve: 'basis',
  },
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#efeaff',
    primaryBorderColor: '#b197fc',
    primaryTextColor: '#2f2f2f',
    secondaryColor: '#efeaff',
    secondaryBorderColor: '#b197fc',
    secondaryTextColor: '#2f2f2f',
    tertiaryColor: '#fff7cc',
    tertiaryBorderColor: '#d6c978',
    tertiaryTextColor: '#2f2f2f',
    clusterBkg: '#fff7cc',
    clusterBorder: '#d6c978',
    lineColor: '#555555',
    defaultLinkColor: '#555555',
    edgeLabelBackground: '#ffffff',
    mainBkg: '#efeaff',
    nodeBorder: '#b197fc',
    textColor: '#2f2f2f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
};

function hasMermaidInitDirective(source) {
  return /^\s*%%\{init:/m.test(String(source || ''));
}

function buildMermaidCompatSource(source) {
  const normalized = String(source || '').trim();
  if (!normalized) return '';
  if (hasMermaidInitDirective(normalized)) return normalized;
  return `%%{init: ${JSON.stringify(MERMAID_COMPAT_THEME)}}%%\n${normalized}`;
}

function normalizeMermaidPreviewHost(host) {
  if (!host || typeof host.setAttribute !== 'function') return;
  host.style.display = 'block';
  host.style.width = '100%';
  host.style.maxWidth = '100%';
  host.style.margin = '16px auto';
  host.style.overflow = 'hidden';
  host.style.textAlign = 'center';
}

function normalizeMermaidPreviewSvg(svg) {
  if (!svg || typeof svg.setAttribute !== 'function') return;
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  svg.style.margin = '0 auto';
}

function appendInlineStyle(el, declarations) {
  if (!el || !declarations) return;
  const current = String(el.getAttribute('style') || '').trim();
  const normalized = current ? (current.endsWith(';') ? current : `${current};`) : '';
  el.setAttribute('style', `${normalized}${declarations}`);
}

function normalizeMermaidRuleSelector(selector, svg) {
  const raw = String(selector || '').trim();
  if (!raw || raw.startsWith('@')) return null;

  const svgId = String(svg?.getAttribute?.('id') || '').trim();
  let normalized = raw;

  if (svgId) {
    const escapedId = svgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`#${escapedId}\\b`, 'g'), '').trim();
  }

  normalized = normalized
    .replace(/^svg\b/i, '')
    .replace(/^:root\b/i, '')
    .replace(/^\s*>\s*/, '')
    .trim();

  if (!normalized) return ':scope';
  return normalized;
}

function inlineMermaidSvgStyles(svg) {
  if (!svg || typeof svg.querySelectorAll !== 'function') return 0;

  const styleNodes = Array.from(svg.querySelectorAll('style'));
  if (styleNodes.length === 0) return 0;

  let appliedCount = 0;

  for (const styleNode of styleNodes) {
    const cssText = String(styleNode.textContent || '');
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(cssText))) {
      const selectorGroup = String(match[1] || '').trim();
      const declarations = String(match[2] || '').trim();
      if (!selectorGroup || !declarations) continue;

      const selectors = selectorGroup.split(',').map((selector) => normalizeMermaidRuleSelector(selector, svg)).filter(Boolean);
      for (const selector of selectors) {
        let targets = [];
        try {
          if (selector === ':scope') {
            targets = [svg];
          } else {
            targets = Array.from(svg.querySelectorAll(selector));
          }
        } catch (error) {
          continue;
        }

        for (const target of targets) {
          appendInlineStyle(target, declarations);
          appliedCount += 1;
        }
      }
    }

    styleNode.remove();
  }

  return appliedCount;
}

function normalizeRenderedMermaidDiagrams(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;

  let normalizedCount = 0;
  const svgs = Array.from(root.querySelectorAll('svg')).filter(looksLikeMermaidSvg);
  for (const svg of svgs) {
    inlineMermaidSvgStyles(svg);
    const host = svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
    if (host) {
      normalizeMermaidPreviewHost(host);
    }
    normalizeMermaidPreviewSvg(svg);
    normalizedCount += 1;
  }

  const images = Array.from(root.querySelectorAll('img.mermaid-diagram-image'));
  for (const img of images) {
    const host = img.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
    if (host) {
      normalizeMermaidPreviewHost(host);
    }
    if (!img.getAttribute('style')) {
      const maxWidthStyle = img.getAttribute('width')
        ? `${Math.round(Number(img.getAttribute('width')) || 0)}px`
        : '100%';
      img.setAttribute(
        'style',
        `display:block;width:100%;max-width:${maxWidthStyle};height:auto;margin:0 auto;`
      );
    }
    normalizedCount += 1;
  }

  return normalizedCount;
}

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

function isMermaidCodeBlock(codeEl) {
  if (!codeEl || codeEl.tagName?.toLowerCase?.() !== 'code') return false;
  const className = String(codeEl.getAttribute('class') || '').toLowerCase();
  if (className.split(/\s+/).includes('language-mermaid')) return true;
  if (className.includes('language-mermaid')) return true;
  return !!codeEl.closest('.block-language-mermaid');
}

function resolveMermaidApi(options = {}) {
  if (options.mermaidApi && typeof options.mermaidApi.render === 'function') {
    return options.mermaidApi;
  }
  const globalApi = globalThis?.mermaid || (typeof window !== 'undefined' ? window.mermaid : null);
  if (globalApi && typeof globalApi.render === 'function') {
    return globalApi;
  }
  return null;
}

let mermaidRenderNonce = 0;

async function renderMermaidCodeBlocks(root, options = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;

  const mermaidApi = resolveMermaidApi(options);
  if (!mermaidApi) return 0;

  const codeBlocks = Array.from(root.querySelectorAll('pre > code')).filter(isMermaidCodeBlock);
  let renderedCount = 0;

  for (const codeEl of codeBlocks) {
    const source = String(codeEl.textContent || '').trim();
    if (!source) continue;

    try {
      mermaidRenderNonce += 1;
      const renderSource = buildMermaidCompatSource(source);
      const renderResult = await mermaidApi.render(`obsidian-wechat-mermaid-${mermaidRenderNonce}`, renderSource);
      const svg = typeof renderResult === 'string' ? renderResult : renderResult?.svg || '';
      if (!svg) continue;

      const host = document.createElement('div');
      host.setAttribute('class', 'mermaid');
      host.setAttribute('data-obsidian-wechat-mermaid', 'true');
      host.innerHTML = svg;
      normalizeRenderedMermaidDiagrams(host);

      if (typeof renderResult?.bindFunctions === 'function') {
        renderResult.bindFunctions(host);
      }

      const pre = codeEl.closest('pre');
      (pre || codeEl).replaceWith(host);
      renderedCount += 1;
    } catch (error) {
      console.error('Mermaid 代码块渲染失败，保留原始代码块:', error);
    }
  }

  return renderedCount;
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
      const maxWidthStyle = result.width ? `${Math.round(result.width)}px` : '100%';
      img.setAttribute(
        'style',
        `display:block;width:100%;max-width:${maxWidthStyle};height:auto;margin:0 auto;`
      );

      const host = svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
      if (host && host !== root) {
        normalizeMermaidPreviewHost(host);
        host.replaceChildren(img);
      } else {
        svg.replaceWith(img);
      }
    } catch (error) {
      console.error('Mermaid 图表栅格化失败，保留原始 SVG:', error);
    }
  }
}

module.exports = {
  hasMermaidMarker,
  looksLikeMermaidSvg,
  isMermaidCodeBlock,
  buildMermaidCompatSource,
  normalizeRenderedMermaidDiagrams,
  renderMermaidCodeBlocks,
  rasterizeRenderedMermaidDiagrams,
};
