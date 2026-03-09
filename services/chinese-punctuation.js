const CJK_CHAR_PATTERN = /[\p{sc=Han}]/u;
const CJK_CONTEXT_PATTERN = /[\p{sc=Han}“”‘’（）《》「」『』【】]/u;

const INLINE_PUNCTUATION_MAP = {
  ',': '，',
  ':': '：',
  ';': '；',
  '!': '！',
  '?': '？',
};

const SKIP_TAGS = new Set([
  'CODE',
  'PRE',
  'SCRIPT',
  'STYLE',
  'TEXTAREA',
  'SVG',
]);

function createProtectedSegmentStore() {
  const values = [];

  return {
    protect(value) {
      const token = `\uE000OWC_PUNC_${values.length}\uE001`;
      values.push(String(value || ''));
      return token;
    },
    restore(text) {
      let output = String(text || '');
      let previous = null;

      while (output !== previous) {
        previous = output;
        output = output.replace(/\uE000OWC_PUNC_(\d+)\uE001/gu, (match, index) => {
          const resolved = values[Number(index)];
          return resolved === undefined ? match : resolved;
        });
      }

      return output;
    },
  };
}

function protectByPattern(text, pattern, shouldProtect, store) {
  return String(text || '').replace(pattern, (match, ...args) => {
    if (typeof shouldProtect === 'function' && !shouldProtect(match, ...args)) {
      return match;
    }
    return store.protect(match);
  });
}

function protectUrlSegments(text, store) {
  return String(text || '').replace(/\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'）】」』]+/giu, (match) => {
    const trimmed = match.match(/^(.*?)([,:;!?]+)?$/u);
    const core = trimmed?.[1] || match;
    const trailing = trimmed?.[2] || '';
    return `${store.protect(core)}${trailing}`;
  });
}

function protectTokenWithTrailingPunctuation(text, pattern, store) {
  return String(text || '').replace(pattern, (match) => {
    const trimmed = match.match(/^(.*?)([,:;!?]+)?$/u);
    const core = trimmed?.[1] || match;
    const trailing = trimmed?.[2] || '';
    return `${store.protect(core)}${trailing}`;
  });
}

function looksLikeFunctionSyntax(segment) {
  const value = String(segment || '').trim();
  if (!value) return false;
  if (/[\p{sc=Han}]/u.test(value)) return false;
  if (!/[$A-Za-z_][\w$.]*\s*\(/u.test(value)) return false;
  return true;
}

function protectFunctionSegments(text, store) {
  return protectByPattern(
    text,
    /\b[$A-Za-z_][\w$.]*\s*\((?:[^()\n]|\([^()\n]*\))*\)/gu,
    (match) => looksLikeFunctionSyntax(match),
    store,
  );
}

function protectEmailSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?:\b|$)[,:;!?]?/giu,
    store,
  );
}

function protectVersionSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b(?:v)?\d+\.\d+(?:\.\d+){0,3}(?:-[A-Za-z0-9.-]+)?\b[,:;!?]?/gu,
    store,
  );
}

function protectPathSegments(text, store) {
  let output = protectTokenWithTrailingPunctuation(
    text,
    /(?:^|[\s(（\[【])((?:\.{0,2}\/|\/|~\/)[^\s"'<>|，。！？；：)）\]】]+)[,:;!?]?/gu,
    store,
  );

  output = output.replace(/(^|[\s(（\[【])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_-]+)?)([,:;!?]?)/gu, (match, prefix, token, trailing) => {
    return `${prefix}${store.protect(token)}${trailing || ''}`;
  });

  output = output.replace(/(^|[\s(（\[【])([A-Za-z0-9_.-]+\.(?:md|txt|pdf|docx?|xlsx?|pptx?|csv|json|ya?ml|xml|html?|css|scss|js|jsx|ts|tsx|py|sh|bash|zsh|java|c|cc|cpp|go|rs|swift|kt|sql))(?:[,:;!?]?)/giu, (match, prefix, token) => {
    const trailing = match.slice(prefix.length + token.length);
    return `${prefix}${store.protect(token)}${trailing}`;
  });

  return output;
}

function protectWindowsPathSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\s]+\\)*[^\\/:*?"<>|\r\n\s]+[,:;!?]?/gu,
    store,
  );
}

function protectDateTimeSegments(text, store) {
  let output = protectTokenWithTrailingPunctuation(
    text,
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?[,:;!?]?/gu,
    store,
  );

  output = protectTokenWithTrailingPunctuation(
    output,
    /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|am|pm))?[,:;!?]?/gu,
    store,
  );

  return output;
}

function protectCliSegments(text, store) {
  let output = text.replace(/(^|[\s(（\[【])(-{1,2}[A-Za-z0-9][\w-]*)(?=$|[\s,.:;!?，。！？；：)）\]】])/gu, (match, prefix, token) => {
    return `${prefix}${store.protect(token)}`;
  });

  output = output.replace(/(^|[\s(（\[【])([A-Za-z][\w-]*:[A-Za-z0-9][\w:.-]*)(?=$|[\s,.;!?，。！？；：)）\]】])/gu, (match, prefix, token) => {
    return `${prefix}${store.protect(token)}`;
  });

  return output;
}

function protectEnvAssignmentSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b[A-Z_][A-Z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^\s,;!?，。！？；：]+)[,:;!?]?/gu,
    store,
  );
}

function protectEllipsisSegments(text, store) {
  return String(text || '').replace(/\.{3,}/gu, (match) => store.protect(match));
}

function isTechnicalParentheticalContent(content) {
  const value = String(content || '').trim();
  if (!value) return false;
  if (/[\p{sc=Han}]/u.test(value)) return false;

  if (/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(value)) return true;
  if (/^[A-Za-z]\d*$/u.test(value)) return true;
  if (/[+\-*/=<>^%&|~]/u.test(value)) return true;
  if (/^[A-Za-z0-9_.]+\s*,\s*[A-Za-z0-9_.]+(?:\s*,\s*[A-Za-z0-9_.]+)*$/u.test(value)) return true;
  if (/^[A-Za-z_][\w.]*\s*(?:,\s*[A-Za-z_][\w.]*)+$/u.test(value)) return true;
  if (/^[A-Za-z_][\w.]*\s*(?:=\s*[^,\s()]+)(?:\s*,\s*[A-Za-z_][\w.]*\s*=\s*[^,\s()]+)+$/u.test(value)) return true;

  return false;
}

function protectTechnicalParentheticalSegments(text, store) {
  return String(text || '').replace(/\(([^()\n]+)\)/gu, (match, content) => {
    return isTechnicalParentheticalContent(content) ? store.protect(match) : match;
  });
}

function isCjkChar(char) {
  return !!char && CJK_CHAR_PATTERN.test(char);
}

function isCjkContextChar(char) {
  return !!char && CJK_CONTEXT_PATTERN.test(char);
}

function findPrevNonSpace(text, index) {
  for (let i = index; i >= 0; i -= 1) {
    if (text.charAt(i) === '\uE001') {
      const startIndex = text.lastIndexOf('\uE000', i);
      if (startIndex !== -1) {
        i = startIndex;
        continue;
      }
    }
    const char = text.charAt(i);
    if (!/\s/u.test(char)) return char;
  }
  return '';
}

function findNextNonSpace(text, index) {
  for (let i = index; i < text.length; i += 1) {
    if (text.charAt(i) === '\uE000') {
      const endIndex = text.indexOf('\uE001', i);
      if (endIndex !== -1) {
        i = endIndex;
        continue;
      }
    }
    const char = text.charAt(i);
    if (!/\s/u.test(char)) return char;
  }
  return '';
}

function hasCjkContext(text, index) {
  const prev = findPrevNonSpace(text, index - 1);
  const next = findNextNonSpace(text, index + 1);
  return isCjkContextChar(prev) || isCjkContextChar(next);
}

function normalizeQuotedText(text, quoteChar, openQuote, closeQuote) {
  const pattern = quoteChar === '"'
    ? /"([^"\n]*?)"/gu
    : /'([^'\n]*?)'/gu;

  return text.replace(pattern, (match, inner, offset, fullText) => {
    const prev = findPrevNonSpace(fullText, offset - 1);
    const next = findNextNonSpace(fullText, offset + match.length);
    if (!(isCjkContextChar(prev) || isCjkContextChar(next) || /[\p{sc=Han}]/u.test(inner))) {
      return match;
    }
    return `${openQuote}${inner}${closeQuote}`;
  });
}

function normalizePeriods(text) {
  return text.replace(/\./gu, (match, offset, fullText) => {
    const prev = findPrevNonSpace(fullText, offset - 1);
    const next = findNextNonSpace(fullText, offset + 1);
    if (/\d/u.test(prev) && /\d/u.test(next)) return match;
    return isCjkContextChar(prev) ? '。' : match;
  });
}

function normalizeParentheses(text) {
  let output = text.replace(/([\p{sc=Han}])\(([^()\n]+?)\)/gu, '$1（$2）');
  output = output.replace(/(?<=[\p{sc=Han}“”‘’])\(([^()\n]+?)\)/gu, '（$1）');
  output = output.replace(/\(([^()\n]+?)\)(?=[\p{sc=Han}])/gu, '（$1）');
  return output;
}

function normalizeTextForChinesePunctuation(text) {
  let output = String(text || '');
  if (!output || !/[\p{sc=Han}]/u.test(output)) return output;

  const protectedSegments = createProtectedSegmentStore();
  output = protectEllipsisSegments(output, protectedSegments);
  output = protectUrlSegments(output, protectedSegments);
  output = protectEmailSegments(output, protectedSegments);
  output = protectVersionSegments(output, protectedSegments);
  output = protectPathSegments(output, protectedSegments);
  output = protectWindowsPathSegments(output, protectedSegments);
  output = protectDateTimeSegments(output, protectedSegments);
  output = protectCliSegments(output, protectedSegments);
  output = protectEnvAssignmentSegments(output, protectedSegments);
  output = protectTechnicalParentheticalSegments(output, protectedSegments);
  output = protectFunctionSegments(output, protectedSegments);

  output = normalizeQuotedText(output, '"', '“', '”');
  output = normalizeQuotedText(output, '\'', '‘', '’');
  output = normalizeParentheses(output);
  output = normalizePeriods(output);

  output = output.replace(/[,:;!?]/gu, (match, offset, fullText) => {
    if (!hasCjkContext(fullText, offset)) return match;
    return INLINE_PUNCTUATION_MAP[match] || match;
  });

  return protectedSegments.restore(output);
}

function shouldSkipTextNode(node) {
  if (!node || !node.parentElement) return true;
  let current = node.parentElement;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    current = current.parentElement;
  }
  return false;
}

function normalizeRenderedDomPunctuation(root, options = {}) {
  if (!root || options.enabled !== true) return;
  const documentRef = root.ownerDocument;
  const nodeFilter = documentRef?.defaultView?.NodeFilter;
  if (!documentRef || !nodeFilter) return;

  const walker = documentRef.createTreeWalker(
    root,
    nodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) {
          return nodeFilter.FILTER_REJECT;
        }
        return shouldSkipTextNode(node)
          ? nodeFilter.FILTER_REJECT
          : nodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    node.nodeValue = normalizeTextForChinesePunctuation(node.nodeValue);
  }
}

module.exports = {
  normalizeTextForChinesePunctuation,
  normalizeRenderedDomPunctuation,
};
