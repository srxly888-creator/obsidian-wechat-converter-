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

function createObsidianFetchAdapter(requestUrlImpl) {
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
      const requestPromise = requestUrlImpl({
        url,
        method: options.method || 'GET',
        headers,
        body: options.body,
        contentType: getHeaderValue(headers, 'content-type'),
      });
      const response = await (abortPromise ? Promise.race([requestPromise, abortPromise]) : requestPromise);
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
          return responseText ? JSON.parse(responseText) : null;
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
};
