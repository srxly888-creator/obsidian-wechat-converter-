function hashBytesFNV1a(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function computeBlobFingerprint(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return 'unknown';
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentHash = hashBytesFNV1a(bytes);
  const type = blob.type || 'application/octet-stream';
  return `${type}:${bytes.length}:${contentHash}`;
}

function getCachedEntry(cache, key) {
  if (!cache || !cache.has(key)) return null;
  const value = cache.get(key);
  if (typeof value === 'string') {
    // Backward compatibility with old cache format (url string only)
    return { url: value, fingerprint: '' };
  }
  if (value && typeof value === 'object' && typeof value.url === 'string') {
    return value;
  }
  return null;
}

async function processAllImages({
  html,
  api,
  progressCallback,
  pMap,
  srcToBlob,
  imageUploadCache,
  cacheNamespace = '',
  onImageFailure = null,
}) {

    const div = document.createElement('div');
    div.innerHTML = html;
    const imgs = Array.from(div.querySelectorAll('img'));

    // 1. 提取唯一图片 URL
    const uniqueUrls = new Set();
    // 建立 src -> new_url 的映射
    const urlMap = new Map();

    for (const img of imgs) {
        if (img.src) uniqueUrls.add(img.src);
    }

    const total = uniqueUrls.size;
    let completed = 0;
    const failedImages = [];

    // 2. 定义并发上传任务
    const tasks = Array.from(uniqueUrls);

    await pMap(tasks, async (src) => {
        const cacheKey = `${cacheNamespace}::${src}`;
        const cached = getCachedEntry(imageUploadCache, cacheKey);
        try {
          const blob = await srcToBlob(src);
          const fingerprint = await computeBlobFingerprint(blob);

          if (
            cached &&
            cached.fingerprint &&
            cached.fingerprint === fingerprint &&
            cached.url
          ) {
            urlMap.set(src, cached.url);
            completed++;
            if (progressCallback) {
              progressCallback(completed, total);
            }
            return;
          }

          const res = await api.uploadImage(blob);
          urlMap.set(src, res.url);
          if (imageUploadCache) {
            imageUploadCache.set(cacheKey, {
              url: res.url,
              fingerprint,
            });
          }
        } catch (error) {
          // 熔断机制：如果是配额超限等致命错误，停止后续所有上传
          if (error.isFatal) throw error;

          if (cached && cached.url) {
            console.warn('图片读取失败，使用缓存链接兜底:', src);
            urlMap.set(src, cached.url);
          } else {
            console.error('图片处理失败，已跳过:', src, error);
            failedImages.push({
              src,
              message: error?.message || String(error || ''),
            });
          }
          // 先记录失败项，稍后在正文中替换为占位提示，草稿同步继续进行。
        }

        completed++;
        if (progressCallback) {
            progressCallback(completed, total);
        }
    }, 3); // 并发数限制为 3

    const failedSrcs = new Set(failedImages.map(item => item.src));

    // 3. 替换 DOM 中的图片链接
    for (const img of imgs) {
      if (urlMap.has(img.src)) {
        img.src = urlMap.get(img.src);
      } else if (failedSrcs.has(img.src)) {
        const placeholder = document.createElement('p');
        placeholder.setAttribute('style', 'margin:12px 0;padding:10px 12px;border:1px dashed #d0d7de;border-radius:6px;color:#8c6d1f;background:#fff8e5;font-size:13px;line-height:1.7;');
        placeholder.textContent = `图片上传失败，请在微信后台手动补传：${img.getAttribute('src') || img.src}`;
        img.replaceWith(placeholder);
      }
    }

    if (failedImages.length > 0 && typeof onImageFailure === 'function') {
      onImageFailure(failedImages);
    }

    return div.innerHTML;
  }

async function processMathFormulas({
  html,
  api,
  progressCallback,
  pMap,
  simpleHash,
  svgUploadCache,
  svgToPngBlob,
}) {
    const INLINE_MATH_IMAGE_STYLE = 'display:inline-block; vertical-align:middle; transform:translateY(-0.12em); margin:0 1px;';
    const BLOCK_MATH_WRAP_STYLE = 'display:block; width:100%; margin:1em auto; text-align:center; max-width:100%;';
    const BLOCK_MATH_IMAGE_STYLE = 'display:block; max-width:100%; height:auto; margin:0 auto;';

    const appendStyle = (base, extra) => {
      const left = String(base || '').trim();
      const right = String(extra || '').trim();
      if (!left) return right;
      if (!right) return left;
      return `${left}${left.endsWith(';') ? '' : ';'}${right}`;
    };

    const filterMathStyle = (styleText, { keepVerticalAlign = false } = {}) => {
      let style = String(styleText || '');
      style = style.replace(/display\s*:\s*[^;]+;?/gi, '');
      style = style.replace(/margin(?:-[a-z]+)?\s*:\s*[^;]+;?/gi, '');
      if (!keepVerticalAlign) {
        style = style.replace(/vertical-align\s*:\s*[^;]+;?/gi, '');
      }
      return style.trim();
    };

    const isBlockMathHost = (svg) => {
      const parent = svg?.parentElement;
      if (!parent) return false;
      const parentTag = parent.tagName.toLowerCase();
      const styleText = String(parent.getAttribute('display') || parent.getAttribute('style') || '').toLowerCase();
      if (parentTag === 'section') return true;
      if (parentTag === 'mjx-container' && (styleText.includes('true') || styleText.includes('display:block') || styleText.includes('display: block'))) {
        return true;
      }
      if (parentTag === 'p') {
        const meaningfulChildren = Array.from(parent.childNodes).filter((node) => {
          if (node.nodeType === Node.TEXT_NODE) return /\S/.test(node.textContent || '');
          return true;
        });
        return meaningfulChildren.length === 1;
      }
      return false;
    };

    // 创建临时容器并挂载到 DOM (为了正确计算 SVG 尺寸)
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px'; // 模拟常见的文章宽度
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
      // 查找所有 SVG 容器 (MathJax 公式或其他矢量图)
      // 之前只查找 mjx-container svg，导致部分 MathJax 配置下(直接输出svg)无法识别
      // 现在改为通过 querySelectorAll('svg') 捕获所有 SVG，彻底解决内容过长问题
      const mathNodes = Array.from(container.querySelectorAll('svg'));
      if (mathNodes.length === 0) return html;

      const total = mathNodes.length;
      let completed = 0;

      // 并发处理
      await pMap(mathNodes, async (svg) => {
        try {
          // 0. 计算 SVG 指纹 (简单的 Hash)
          const svgStr = new XMLSerializer().serializeToString(svg);
          // 加上样式属性作为指纹一部分，因为同样的公式可能有不同的 style (color/align)
          const styleAttr = svg.getAttribute('style') || '';
          const fillAttr = svg.getAttribute('fill') || '';
          const fingerprint = simpleHash(svgStr + styleAttr + fillAttr);

          let wechatUrl = '';
          let logicalWidth, logicalHeight, rawStyle;

          // 1. 检查缓存
          if (svgUploadCache.has(fingerprint)) {
            // console.log('DEBUG: Hit SVG Cache!', fingerprint);
            const cachedData = svgUploadCache.get(fingerprint);
            wechatUrl = cachedData.url;
            logicalWidth = cachedData.width;
            logicalHeight = cachedData.height;
            rawStyle = cachedData.style;
          } else {
            // 2. 缓存未命中，执行转图和上传
            const result = await svgToPngBlob(svg); // { blob, width, height, style }
            const res = await api.uploadImage(result.blob);

            wechatUrl = res.url;
            logicalWidth = result.width;
            logicalHeight = result.height;
            rawStyle = result.style;

            // 写入缓存
            svgUploadCache.set(fingerprint, {
                url: wechatUrl,
                width: logicalWidth,
                height: logicalHeight,
                style: rawStyle
            });
          }

          // 3. 替换 DOM
          const img = document.createElement('img');
          img.src = wechatUrl;
          img.className = 'math-formula-image';

          // 4. 关键修复：设置显示尺寸为原始逻辑尺寸
          if (logicalWidth) img.setAttribute('width', logicalWidth);
          if (logicalHeight) img.setAttribute('height', logicalHeight);

          // 5. 样式继承
          const svgStyle = svg.getAttribute('style');
          const parent = svg.parentElement;
          const isBlockMath = isBlockMathHost(svg);

          if (isBlockMath) {
             const extraStyle = appendStyle(filterMathStyle(svgStyle), rawStyle);
             img.setAttribute('style', appendStyle(BLOCK_MATH_IMAGE_STYLE, extraStyle));
             const wrapper = document.createElement('section');
             wrapper.setAttribute('style', BLOCK_MATH_WRAP_STYLE);
             wrapper.appendChild(img);

             if (parent && parent.tagName.toLowerCase() === 'p' && parent.parentElement) {
               parent.replaceWith(wrapper);
             } else if (parent && parent.tagName.toLowerCase().includes('mjx')) {
               parent.replaceWith(wrapper);
             } else {
               svg.replaceWith(wrapper);
             }
          } else {
             let finalStyle = INLINE_MATH_IMAGE_STYLE;
             finalStyle = appendStyle(finalStyle, filterMathStyle(svgStyle, { keepVerticalAlign: false }));
             if (parent && parent.tagName.toLowerCase().includes('mjx')) {
               finalStyle = appendStyle(finalStyle, filterMathStyle(parent.getAttribute('style'), { keepVerticalAlign: false }));
             }
             finalStyle = appendStyle(finalStyle, filterMathStyle(rawStyle, { keepVerticalAlign: false }));
             img.setAttribute('style', finalStyle);
             if (parent && parent.tagName.toLowerCase().includes('mjx')) {
               parent.replaceWith(img);
             } else {
               svg.replaceWith(img);
             }
          }

          completed++;
          if (progressCallback) progressCallback(completed, total);
        } catch (error) {
          // 熔断机制：如果是配额超限等致命错误，停止后续所有上传
          if (error.isFatal) throw error;

          console.error('公式转换失败，保留原SVG:', error);
        }
      }, 3); // 限制并发数

      return container.innerHTML;
    } finally {
      // 清理 DOM
      document.body.removeChild(container);
    }
  }

module.exports = {
  processAllImages,
  processMathFormulas,
};
