function isMathJaxSvg(svgElement) {
  if (!svgElement || typeof svgElement.getAttribute !== 'function') return false;
  if (svgElement.getAttribute('role') === 'img') return true;
  if (svgElement.getAttribute('focusable') === 'false') return true;
  if (svgElement.classList?.contains('MathJax')) return true;
  return !!svgElement.closest?.('mjx-container,mjx-math,.MathJax');
}

function getSvgLogicalSize(svgElement) {
  const rect = typeof svgElement?.getBoundingClientRect === 'function'
    ? svgElement.getBoundingClientRect()
    : { width: 0, height: 0 };

  let logicalWidth = Number(rect?.width) || 0;
  let logicalHeight = Number(rect?.height) || 0;

  const rawWidth = svgElement?.getAttribute?.('width') || '';
  const rawHeight = svgElement?.getAttribute?.('height') || '';
  const rawStyle = svgElement?.getAttribute?.('style') || '';
  const viewBox = svgElement?.getAttribute?.('viewBox') || '';

  if (logicalWidth === 0 || logicalHeight === 0) {
    logicalWidth = parseFloat(rawWidth) || logicalWidth;
    logicalHeight = parseFloat(rawHeight) || logicalHeight;
  }

  if ((logicalWidth === 0 || logicalHeight === 0) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map((value) => parseFloat(value));
    if (parts.length === 4) {
      if (logicalWidth === 0 && Number.isFinite(parts[2]) && parts[2] > 0) {
        logicalWidth = parts[2];
      }
      if (logicalHeight === 0 && Number.isFinite(parts[3]) && parts[3] > 0) {
        logicalHeight = parts[3];
      }
    }
  }

  if (logicalWidth === 0) logicalWidth = 100;
  if (logicalHeight === 0) logicalHeight = 20;

  return {
    logicalWidth,
    logicalHeight,
    rawStyle,
  };
}

function prepareSvgClone(svgElement) {
  const clonedSvg = svgElement.cloneNode(true);
  const { logicalWidth, logicalHeight, rawStyle } = getSvgLogicalSize(svgElement);

  if (isMathJaxSvg(svgElement)) {
    clonedSvg.setAttribute('fill', '#333333');
    if (clonedSvg.style) {
      clonedSvg.style.color = '#333333';
    }

    clonedSvg.querySelectorAll('*').forEach((el) => {
      if (el.getAttribute('fill') === 'currentColor' || !el.getAttribute('fill')) {
        el.setAttribute('fill', '#333333');
      }
      if (el.getAttribute('stroke') === 'currentColor') {
        el.setAttribute('stroke', '#333333');
      }
    });
  }

  return {
    clonedSvg,
    logicalWidth,
    logicalHeight,
    rawStyle,
  };
}

async function rasterizeSvg(svgElement, options = {}) {
  const { scale = 3, output = 'blob' } = options;

  return new Promise((resolve, reject) => {
    try {
      const {
        clonedSvg,
        logicalWidth,
        logicalHeight,
        rawStyle,
      } = prepareSvgClone(svgElement);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = logicalWidth * scale;
          canvas.height = logicalHeight * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas context unavailable'));
            return;
          }

          ctx.scale(scale, scale);
          ctx.drawImage(image, 0, 0, logicalWidth, logicalHeight);
          URL.revokeObjectURL(url);

          if (output === 'dataUrl') {
            resolve({
              dataUrl: canvas.toDataURL('image/png'),
              width: logicalWidth,
              height: logicalHeight,
              style: rawStyle,
            });
            return;
          }

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            resolve({
              blob,
              width: logicalWidth,
              height: logicalHeight,
              style: rawStyle,
            });
          }, 'image/png');
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('SVG image load failed'));
      };
      image.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

async function rasterizeSvgToPngBlob(svgElement, options = {}) {
  return rasterizeSvg(svgElement, { ...options, output: 'blob' });
}

async function rasterizeSvgToPngDataUrl(svgElement, options = {}) {
  return rasterizeSvg(svgElement, { ...options, output: 'dataUrl' });
}

module.exports = {
  isMathJaxSvg,
  getSvgLogicalSize,
  rasterizeSvgToPngBlob,
  rasterizeSvgToPngDataUrl,
};
