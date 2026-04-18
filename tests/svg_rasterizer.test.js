import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  getSvgLogicalSize,
  rasterizeSvgToPngDataUrl,
} = require('../services/svg-rasterizer');

describe('SVG Rasterizer', () => {
  beforeEach(() => {
    global.URL = global.URL || {};
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should derive logical size from viewBox when layout size is unavailable', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 240 120');
    const size = getSvgLogicalSize(svg);
    expect(size.logicalWidth).toBe(240);
    expect(size.logicalHeight).toBe(120);
  });

  it('should inline computed styles before rasterization so Mermaid colors are preserved', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 80');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '120');
    rect.setAttribute('height', '80');
    svg.appendChild(rect);

    const computedMap = new Map([
      [svg, {
        getPropertyValue: (prop) => {
          if (prop === 'background-color') return 'rgb(255, 255, 255)';
          return '';
        },
      }],
      [rect, {
        getPropertyValue: (prop) => {
          if (prop === 'fill') return 'rgb(236, 235, 255)';
          if (prop === 'stroke') return 'rgb(139, 124, 246)';
          if (prop === 'stroke-width') return '1px';
          return '';
        },
      }],
    ]);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => computedMap.get(el) || {
      getPropertyValue: () => '',
    });

    let serialized = '';
    vi.stubGlobal('XMLSerializer', class XMLSerializerMock {
      serializeToString(node) {
        serialized = node.outerHTML;
        return serialized;
      }
    });

    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/png;base64,mock');
    const getContext = vi.fn(() => ({ scale: vi.fn(), drawImage }));
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext,
          toDataURL,
        };
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
    });

    class FakeImage {
      set src(_value) {
        setTimeout(() => {
          if (typeof this.onload === 'function') this.onload();
        }, 0);
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const result = await rasterizeSvgToPngDataUrl(svg);

    expect(result.dataUrl).toContain('data:image/png;base64,mock');
    expect(serialized).toContain('fill="rgb(236, 235, 255)"');
    expect(serialized).toContain('stroke="rgb(139, 124, 246)"');
    expect(serialized).toContain('stroke-width="1px"');
  });
});
