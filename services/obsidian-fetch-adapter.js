function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function normalizeHeaders(headers) {
  if (!headers) return undefined;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function getHeaderValue(headers, name) {
  const normalized = normalizeHeaders(headers);
  if (!normalized) return undefined;
  const target = String(name || '').toLowerCase();
  const match = Object.keys(normalized).find((key) => key.toLowerCase() === target);
  return match ? normalized[match] : undefined;
}

function findFirstJsonContainer(text) {
  const source = String(text || '');
  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  if (objectStart === -1) return arrayStart;
  if (arrayStart === -1) return objectStart;
  return Math.min(objectStart, arrayStart);
}

function findJsonContainerEnd(text, startIndex) {
  const source = String(text || '');
  const firstChar = source[startIndex];
  const stack = firstChar === '{' ? ['}'] : firstChar === '[' ? [']'] : [];
  if (!stack.length) return -1;

  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    const expectedClose = stack[stack.length - 1];
    if (char === expectedClose) {
      stack.pop();
      if (!stack.length) return index + 1;
    }
  }

  return -1;
}

function parseJsonResponseText(text) {
  const source = String(text || '');
  if (!source.trim()) return null;

  try {
    return JSON.parse(source);
  } catch (error) {
    const startIndex = findFirstJsonContainer(source);
    if (startIndex === -1) throw error;

    const endIndex = findJsonContainerEnd(source, startIndex);
    if (endIndex === -1) throw error;

    try {
      return JSON.parse(source.slice(startIndex, endIndex));
    } catch (_) {
      throw error;
    }
  }
}

function resolveRequestImplementations(requestSource) {
  if (typeof requestSource === 'function') {
    return {
      requestUrlImpl: requestSource,
      requestTextImpl: null,
    };
  }
  return {
    requestUrlImpl: requestSource?.requestUrl,
    requestTextImpl: requestSource?.request,
  };
}

function isJsonParseFailure(error) {
  if (error instanceof SyntaxError) return true;
  const message = String(error?.message || error || '');
  return /json|unexpected non-whitespace|unexpected token|parse/i.test(message);
}

function createObsidianFetchAdapter(requestSource) {
  const { requestUrlImpl, requestTextImpl } = resolveRequestImplementations(requestSource);
  if (typeof requestUrlImpl !== 'function') {
    throw new Error('Obsidian requestUrl is not available');
  }

  return async function obsidianFetchAdapter(url, options = {}) {
    const signal = options.signal;
    if (signal?.aborted) {
      throw createAbortError();
    }

    let abortHandler = null;
    const abortPromise = signal
      ? new Promise((_, reject) => {
        abortHandler = () => reject(createAbortError());
        signal.addEventListener('abort', abortHandler, { once: true });
      })
      : null;

    try {
      const headers = normalizeHeaders(options.headers);
      const requestOptions = {
        url,
        method: options.method || 'GET',
        headers,
        body: options.body,
        contentType: getHeaderValue(headers, 'content-type'),
        throw: false,
      };
      const withAbort = (promise) => (abortPromise ? Promise.race([promise, abortPromise]) : promise);
      let response;
      try {
        response = await withAbort(requestUrlImpl(requestOptions));
      } catch (error) {
        if (typeof requestTextImpl !== 'function' || !isJsonParseFailure(error)) {
          throw error;
        }
        const text = await withAbort(Promise.resolve(requestTextImpl(requestOptions)));
        response = {
          status: 200,
          text,
          headers: {},
        };
      }
      const responseText = response?.text !== undefined
        ? String(response.text)
        : (response?.json !== undefined ? JSON.stringify(response.json) : '');

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: String(response.status || ''),
        headers: response.headers || {},
        text: async () => responseText,
        json: async () => {
          if (response?.json !== undefined) return response.json;
          return parseJsonResponseText(responseText);
        },
      };
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  };
}

module.exports = {
  createObsidianFetchAdapter,
  isJsonParseFailure,
  parseJsonResponseText,
};
