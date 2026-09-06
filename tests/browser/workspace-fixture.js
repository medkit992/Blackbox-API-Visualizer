// Test-only DevTools API shim. Never bundled into the extension.
(() => {
  const finished = [], navigated = [], pending = [];
  let serial = 0, pageUrl = 'https://app.example.test/';
  const event = listeners => ({ addListener: callback => listeners.push(callback), removeListener: callback => { const i = listeners.indexOf(callback); if (i >= 0) listeners.splice(i, 1); } });
  localStorage.setItem('blackbox-network-consent-v2', 'granted');
  window.chrome = {
    runtime: { getURL: path => new URL(path, location.origin).href, getManifest: () => ({ version: '0.4.0' }) },
    devtools: {
      network: { onRequestFinished: event(finished), onNavigated: event(navigated), getHAR: callback => callback({ entries: [] }) },
      inspectedWindow: { tabId: 1, eval: (_expression, callback) => callback(pageUrl, undefined), getResources: callback => callback([]), onResourceAdded: event([]), onResourceContentCommitted: event([]) },
      panels: { openResource: () => {} },
    },
  };
  window.qa = {
    loads: 0,
    emit(options = {}) {
      const index = ++serial;
      const path = options.path ?? `/books/${index}`;
      const status = options.status ?? 200;
      const duration = options.duration ?? 180;
      const body = options.body ?? JSON.stringify({ results: [{ id: index, title: 'Book ' + index }] });
      const raw = {
        startedDateTime: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index * 1500)).toISOString(), time: duration,
        request: { method: options.method ?? 'GET', url: 'https://api.example.test' + path, httpVersion: 'HTTP/2', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 },
        response: { status, statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Not Found', httpVersion: 'HTTP/2', headers: [{ name: 'Content-Type', value: 'application/json' }], cookies: [], redirectURL: '', headersSize: -1, bodySize: body.length, content: { size: body.length, mimeType: 'application/json' } },
        cache: {}, timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 2, wait: Math.max(0, duration - 12), receive: 10 },
        _resourceType: 'fetch', _initiator: { type: 'script', url: 'https://app.example.test/src/books.ts', lineNumber: 12 },
        getContent(callback) { qa.loads++; if (options.delay) pending.push(() => callback(body, '')); else callback(body, ''); },
      };
      finished.forEach(callback => callback(raw));
      return index;
    },
    batch(count) { for (let i = 0; i < count; i++) this.emit(); },
    flush() { pending.splice(0).forEach(callback => callback()); },
    navigate() { pageUrl = 'https://app.example.test/next'; navigated.forEach(callback => callback(pageUrl)); },
  };
})();
