/** Pure, bounded analysis for Request Stories. Never fetches or mutates captured data. */
export interface StoryRequest {
  id: string; startedAt: string; duration: number; category: string; method: string;
  url: string; host: string; path: string; protocol: string; status: number;
  statusText: string; responseSize: number; responseMimeType: string;
  responseBody?: string; responseBodyEncoding?: string; responseBodyLoaded: boolean;
  requestBody?: string; requestHeaders: { name: string; value: string }[];
  responseHeaders: { name: string; value: string }[]; redirectUrl?: string;
  initiator?: { type: string; url?: string; lineNumber?: number; stack?: unknown };
  timings: { blocked: number; dns: number; connect: number; send: number; wait: number; receive: number; ssl: number; total: number };
  raw?: { timings?: { blocked?: number; dns?: number; connect?: number; send?: number; wait?: number; receive?: number; ssl?: number } };
}
export type StoryFilter = 'all' | 'problems' | 'slow' | 'repeated';
export type StoryTone = 'success' | 'warning' | 'error' | 'neutral';
export type InspectorTab = 'overview' | 'request' | 'response' | 'headers' | 'timing';
export const STORY_WINDOW = 5000;
export const SLOW_MS = 1000;
export const MAX_BODY_CHARS = 262144;
export const MAX_RELATIONSHIPS = 12;
const MAX_BODY_CANDIDATES = 40;
const MAX_VALUES = 1200;

export interface EndpointStory {
  key: string; method: string; path: string; host: string; requests: StoryRequest[];
  representative: StoryRequest; problems: number; slow: number;
}
export interface StorySnapshot {
  requests: StoryRequest[]; groups: EndpointStory[]; totalCaptured: number;
  omitted: number; counts: Record<StoryFilter, number>;
}
export interface StoryFinding {
  tone: StoryTone; title: string; summary: string; lesson: string;
  next: { title: string; text: string; tab: InspectorTab }[];
}
export interface StoryLink {
  request: StoryRequest; direction: 'before' | 'after';
  kind: 'initiator' | 'redirect' | 'preflight' | 'response-url';
  label: string; evidence: string;
}
export interface StoryRelations {
  links: StoryLink[]; omitted: number; bodiesExamined: number;
  bodySearchLimited: boolean;
}
export interface BodySummary { title: string; detail: string; parsed: boolean; json: boolean }

const finite = (n: number): boolean => Number.isFinite(n) && n >= 0;
export const isProblem = (r: StoryRequest): boolean => r.status === 0 || r.status >= 400;
export const isSlow = (r: StoryRequest): boolean => finite(r.duration) && r.duration > SLOW_MS;
export const isApi = (r: StoryRequest): boolean => r.category === 'Fetch' || r.category === 'XHR';
export function durationLabel(ms: number): string {
  return !finite(ms) ? 'Unavailable' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}
export function statusLabel(r: StoryRequest): string {
  return r.status === 0 ? 'No HTTP response' : `${r.status}${r.statusText ? ` ${r.statusText}` : ''}`;
}
/** Query values, credentials and fragments are deliberately not part of the story title. */
export function safeLocation(value: string): string {
  try { const u = new URL(value); return `${u.host}${u.pathname}`; }
  catch { return value.split(/[?#]/)[0].slice(0, 300); }
}
export function endpointKey(r: StoryRequest): string {
  // Grouping is NOT duplicate detection: query strings and bodies may differ.
  return JSON.stringify([r.protocol, r.host, r.method, r.path]);
}
function priority(r: StoryRequest): number { return isProblem(r) ? 3 : isSlow(r) ? 2 : 1; }
export function createStorySnapshot(all: readonly StoryRequest[], pinnedId?: string): StorySnapshot {
  const requests = all.slice(-STORY_WINDOW);
  if (pinnedId && !requests.some(r => r.id === pinnedId)) {
    const pinned = all.find(r => r.id === pinnedId);
    if (pinned) requests.unshift(pinned);
  }
  const groups = new Map<string, EndpointStory>();
  for (const r of requests) {
    const key = endpointKey(r);
    let g = groups.get(key);
    if (!g) {
      g = { key, method: r.method, path: r.path, host: r.host, requests: [], representative: r, problems: 0, slow: 0 };
      groups.set(key, g);
    }
    g.requests.push(r);
    g.problems += Number(isProblem(r)); g.slow += Number(isSlow(r));
    if (priority(r) >= priority(g.representative)) g.representative = r;
  }
  const sorted = [...groups.values()].sort((a, b) =>
    Number(isApi(b.representative)) - Number(isApi(a.representative)) ||
    priority(b.representative) - priority(a.representative) ||
    b.requests.length - a.requests.length || a.key.localeCompare(b.key));
  return { requests, groups: sorted, totalCaptured: all.length, omitted: all.length - requests.length,
    counts: { all: sorted.length, problems: sorted.filter(g => g.problems > 0).length,
      slow: sorted.filter(g => g.slow > 0).length, repeated: sorted.filter(g => g.requests.length > 1).length } };
}
export function filterStories(snapshot: StorySnapshot, filter: StoryFilter, search = '', apiOnly = true): EndpointStory[] {
  const q = search.toLowerCase().trim();
  return snapshot.groups.filter(g => (!apiOnly || g.requests.some(isApi)) &&
    (filter === 'all' || (filter === 'problems' && g.problems > 0) || (filter === 'slow' && g.slow > 0) || (filter === 'repeated' && g.requests.length > 1)) &&
    (!q || `${g.method} ${g.host}${g.path}`.toLowerCase().includes(q)));
}

export function explainRequest(r: StoryRequest): StoryFinding {
  const action = (title: string, text: string, tab: InspectorTab) => ({title, text, tab});
  const networkLesson = 'An HTTP result describes the network exchange, not whether your JavaScript parsed the response or rendered the page correctly.';
  if (r.status === 0) return { tone: 'warning', title: 'No HTTP response was captured',
    summary: 'Chrome did not provide an HTTP status for this entry. That alone does not identify CORS, cancellation, an offline device, or another network error.',
    lesson: 'No status is not a pending state. This view receives completed network entries, not live Promise state.',
    next: [action('Check the browser error', 'Compare this entry with Chrome Network and Console for the actual error message.', 'overview'), action('Check the destination', 'Inspect the full URL, scheme, and request settings. Do not change CORS settings based on status 0 alone.', 'request')] };
  if (r.status === 401 || r.status === 403) return { tone: 'error', title: r.status === 401 ? 'The server rejected authentication' : 'The server refused access',
    summary: `${statusLabel(r)} was captured. ${r.status === 401 ? 'Check how this request authenticates.' : 'Check the account permissions and the server’s explanation.'}`,
    lesson: '401 concerns authentication; 403 means the server refuses the request. Neither proves that a particular token or permission is the root cause.',
    next: [action('Read the server’s explanation', 'The response may describe an expired session, missing credential, or access rule.', 'response'), action('Inspect authentication context', 'Review headers and cookies in the request details. Do not share credentials in screenshots.', 'headers')] };
  if (r.status === 404) return { tone: 'error', title: 'The server could not find this resource', summary: `${r.method} ${r.path} returned 404. The API host responded, but this URL did not return the requested resource.`, lesson: 'A 404 does not mean the internet is broken. It can be the endpoint, an identifier, a route prefix, or a deliberately hidden resource.', next: [action('Check the full endpoint', 'Compare the URL, identifier and method with the API documentation.', 'request'), action('Read the response', 'Look for a route or resource error from the server.', 'response')] };
  if (r.status === 429) return { tone: 'error', title: 'The server is limiting requests', summary: 'This call returned 429 Too Many Requests. Inspect the response before deciding how long to wait.', lesson: 'Repeated requests can contribute to a rate limit, but this capture does not establish your quota or all traffic using the same account.', next: [action('Check retry guidance', 'Look for Retry-After and rate-limit response headers. Do not immediately replay the request.', 'headers'), action('Read the server’s explanation', 'The response may describe the affected quota or policy.', 'response')] };
  if (r.status >= 500) return { tone: 'error', title: 'The server returned an error', summary: `${statusLabel(r)} is an HTTP error from the server or an upstream service. The exact cause is not visible from the status alone.`, lesson: networkLesson, next: [action('Inspect the error response', 'Look for an error message or request ID that can be compared with server logs.', 'response'), action('Verify what was sent', 'Check that the method, parameters and body match the API contract.', 'request')] };
  if (r.status >= 400) return { tone: 'error', title: 'The request was rejected', summary: `The captured result is ${statusLabel(r)}. Start with the response rather than guessing which field is wrong.`, lesson: networkLesson, next: [action('Read the error details', 'Look for validation messages or an explanation of the rejected request.', 'response'), action('Compare the request with the contract', 'Inspect the method, parameters and body expected by this endpoint.', 'request')] };
  if (r.status === 304) return { tone: 'neutral', title: 'The server confirmed cached content', summary: '304 Not Modified asks the browser to reuse cached content. An empty network response here is expected.', lesson: 'A cache-validation response is not a fresh JSON payload; application data may come from the browser cache.', next: [action('Inspect cache headers', 'Compare the conditional request and response headers.', 'headers')] };
  if (r.status >= 300 && r.status < 400) return { tone: 'neutral', title: 'The server returned a redirect-class response', summary: `${statusLabel(r)} was captured. A Location header may point to another URL; inspect related evidence below.`, lesson: 'A destination URL can be correlated with another captured request, but the capture may not expose an unambiguous redirect-chain ID.', next: [action('Check the destination header', 'Inspect Location and the final request result.', 'headers')] };
  if (r.status >= 200 && r.status < 300) return { tone: isSlow(r) ? 'warning' : 'success', title: isSlow(r) ? 'The response arrived, but it was slow' : 'The HTTP request succeeded', summary: `${statusLabel(r)} arrived in ${durationLabel(r.duration)}. ${isSlow(r) ? 'Use the measured phases below to narrow the investigation.' : 'If the page still looks wrong, inspect the returned data and how your code uses it.'}`, lesson: networkLesson, next: [action('Inspect the returned data', 'Compare the actual response shape with the object or array your code expects.', 'response'), action(isSlow(r) ? 'Inspect timing evidence' : 'Check the initiating code', isSlow(r) ? 'Waiting time includes network latency and server work; it cannot identify a slow database on its own.' : 'Use the debugger’s source context, then compare your property access and rendering code.', isSlow(r) ? 'timing' : 'overview')] };
  return { tone: 'neutral', title: 'The result needs more context', summary: `${statusLabel(r)} was captured. Inspect the technical details before classifying the result.`, lesson: networkLesson, next: [action('Open the request debugger', 'Review the captured evidence and browser context.', 'overview')] };
}

const bodyCache = new WeakMap<StoryRequest, { body: string; value: unknown; valid: boolean }>();
function parsedBody(r: StoryRequest): { valid: boolean; value: unknown } {
  const body = r.responseBody;
  if (!r.responseBodyLoaded || !body || body.length > MAX_BODY_CHARS || r.responseBodyEncoding === 'base64') return { valid: false, value: undefined };
  const existing = bodyCache.get(r);
  if (existing?.body === body) return existing;
  let result: { body: string; valid: boolean; value: unknown };
  try { result = { body, valid: true, value: JSON.parse(body) as unknown }; }
  catch { result = { body, valid: false, value: undefined }; }
  bodyCache.set(r, result); return result;
}
export function summarizeBody(r: StoryRequest): BodySummary {
  if (!r.responseBodyLoaded) return { title: 'Response not inspected', detail: 'Open Response to retrieve the captured content. This view does not load bodies automatically.', parsed: false, json: false };
  if (!r.responseBody) return { title: 'Empty captured body', detail: r.status === 204 || r.status === 304 || r.method === 'HEAD' ? 'This result can legitimately have no response body.' : 'Chrome supplied no body content. This does not establish what your app received or parsed.', parsed: false, json: false };
  if (r.responseBodyEncoding === 'base64') return { title: 'Encoded response', detail: 'Use the existing Response Explorer to inspect this content.', parsed: false, json: false };
  if (r.responseBody.length > MAX_BODY_CHARS) return { title: 'Large response', detail: 'Automatic shape analysis is size-limited. Open Response for the existing explorer.', parsed: false, json: false };
  const parsed = parsedBody(r);
  if (!parsed.valid) return { title: /json/i.test(r.responseMimeType) ? 'Not valid JSON in this capture' : 'Text or non-JSON content', detail: 'Blackbox could not parse this captured text as JSON. That is not evidence that your app attempted JSON parsing.', parsed: false, json: false };
  const value = parsed.value;
  const title = value === null ? 'JSON null' : Array.isArray(value) ? `Array · ${value.length} item${value.length === 1 ? '' : 's'}` : typeof value === 'object' ? `Object · ${Object.keys(value).length} top-level field${Object.keys(value).length === 1 ? '' : 's'}` : `JSON ${typeof value}`;
  return { title, detail: 'Blackbox parsed the captured JSON. Whether your app parsed or used it successfully is not observed.', parsed: true, json: true };
}

export function getStorySource(r: StoryRequest): { label: string; detail: string; url?: string } {
  let url = r.initiator?.url; let line = r.initiator?.lineNumber;
  let stack = r.initiator?.stack;
  for (let depth = 0; !url && stack && typeof stack === 'object' && depth < 8; depth++) {
    const record = stack as Record<string, unknown>;
    if (Array.isArray(record.callFrames)) {
      for (const frame of record.callFrames.slice(0, 32)) {
        if (frame && typeof frame === 'object' && typeof frame.url === 'string' && frame.url) {
          url = frame.url; line = typeof frame.lineNumber === 'number' ? frame.lineNumber : undefined; break;
        }
      }
    }
    stack = record.parent;
  }
  if (!url) return { label: 'Source not exposed', detail: 'Chrome did not expose a source location here. This is not proof that the page itself caused the request.' };
  return { label: safeLocation(url) + (line !== undefined && finite(line) ? `:${line + 1}` : ''), detail: 'Browser-reported initiator location. A source location is debugging context, not proof of the root cause.', url };
}
export function measuredPhases(r: StoryRequest): { key: string; label: string; ms: number }[] {
  const keys = ['blocked', 'dns', 'connect', 'send', 'wait', 'receive'] as const;
  const names = ['Queue / blocked', 'DNS lookup', 'Connection', 'Sending', 'Waiting for response', 'Receiving'];
  const raw = r.raw?.timings;
  return keys.flatMap((key, i) => {
    const ms = raw ? raw[key] : r.timings[key];
    // Normalization turns unavailable values into zero; only raw values prove a real zero.
    return typeof ms === 'number' && finite(ms) && (raw !== undefined || ms > 0) ? [{ key, label: names[i], ms }] : [];
  });
}
function canonical(value: string, base?: string): string | undefined {
  try { const u = new URL(value, base); if (!/^https?:$/.test(u.protocol)) return; u.hash = ''; return u.href; } catch { return; }
}
function header(r: StoryRequest, side: 'requestHeaders' | 'responseHeaders', key: string): string | undefined {
  return r[side].find(h => h.name.toLowerCase() === key)?.value;
}
function completedBefore(a: StoryRequest, b: StoryRequest): boolean {
  const left = Date.parse(a.startedAt), right = Date.parse(b.startedAt);
  return Number.isFinite(left) && Number.isFinite(right) && finite(a.duration) && left + a.duration <= right;
}
interface UrlValue { url: string; path: string }
function bodyUrls(r: StoryRequest, pageUrl?: string): UrlValue[] {
  const parsed = parsedBody(r); if (!parsed.valid) return [];
  const found: UrlValue[] = [];
  const queue: { value: unknown; path: string; depth: number }[] = [{ value: parsed.value, path: 'data', depth: 0 }];
  let visited = 0;
  while (queue.length && visited++ < MAX_VALUES) {
    const item = queue.pop()!;
    if (typeof item.value === 'string') {
      // Avoid interpreting ordinary text/IDs as relative resource URLs.
      if (!/^(?:https?:\/\/|\/|\.\.?\/)|^[^\s/]+\/[^\s]+\.[a-z0-9]+(?:[?#].*)?$/i.test(item.value)) continue;
      for (const base of new Set([r.url, pageUrl].filter(Boolean) as string[])) {
        const url = canonical(item.value, base); if (url) found.push({ url, path: item.path });
      }
    } else if (item.value && typeof item.value === 'object' && item.depth < 8) {
      const array = Array.isArray(item.value);
      const entries = Object.entries(item.value).slice(0, Math.max(0, MAX_VALUES - visited - queue.length));
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, value] = entries[i];
        const suffix = array ? `[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
        queue.push({ value, path: item.path + suffix, depth: item.depth + 1 });
      }
    }
  }
  return found;
}
/** Relationships are correlations with visible evidence, not invented causal chains. */
export function findStoryRelations(selected: StoryRequest, rows: readonly StoryRequest[], pageUrl?: string): StoryRelations {
  const links: StoryLink[] = []; const seen = new Set<string>();
  const add = (request: StoryRequest, direction: StoryLink['direction'], kind: StoryLink['kind'], label: string, evidence: string) => {
    const key = `${request.id}:${kind}:${direction}`;
    if (request.id !== selected.id && !seen.has(key)) { seen.add(key); links.push({ request, direction, kind, label, evidence }); }
  };
  const selectedUrl = canonical(selected.url), sourceUrl = canonical(getStorySource(selected).url ?? '');
  const destination = selected.redirectUrl || header(selected, 'responseHeaders', 'location');
  const selectedRedirect = destination && [301, 302, 303, 307, 308].includes(selected.status) ? canonical(destination, selected.url) : undefined;
  const starts = (a: StoryRequest, b: StoryRequest) => Number.isFinite(Date.parse(a.startedAt)) && Number.isFinite(Date.parse(b.startedAt)) && Date.parse(a.startedAt) < Date.parse(b.startedAt);
  for (const r of rows) {
    if (r.id === selected.id) continue;
    const url = canonical(r.url);
    if (sourceUrl && url === sourceUrl && completedBefore(r, selected) && ['Script', 'Document', 'Stylesheet'].includes(r.category)) add(r, 'before', 'initiator', 'Initiator resource match', 'The captured resource URL matches Chrome’s initiator location. Repeated loads may make the exact instance ambiguous.');
    if (selectedUrl && canonical(getStorySource(r).url ?? '') === selectedUrl && completedBefore(selected, r) && ['Script', 'Document', 'Stylesheet'].includes(selected.category)) add(r, 'after', 'initiator', 'Initiator resource match', 'Chrome’s initiator location names this resource URL. This is source context, not proof of a data dependency.');
    if (selectedRedirect && url === selectedRedirect && starts(selected, r)) add(r, 'after', 'redirect', 'Redirect destination candidate', 'The explicit redirect destination matches this later captured URL. A browser chain ID is not available to prove the pairing.');
    const redirect = [301, 302, 303, 307, 308].includes(r.status) ? r.redirectUrl || header(r, 'responseHeaders', 'location') : undefined;
    if (redirect && selectedUrl && canonical(redirect, r.url) === selectedUrl && starts(r, selected)) add(r, 'before', 'redirect', 'Redirect destination candidate', 'An earlier response names this destination. Matching the URL does not prove which captured instance followed the redirect.');
    if (url && url === selectedUrl) {
      if (r.method === 'OPTIONS' && selected.method !== 'OPTIONS' && header(r, 'requestHeaders', 'access-control-request-method')?.toUpperCase() === selected.method.toUpperCase() && completedBefore(r, selected)) add(r, 'before', 'preflight', 'Preflight candidate', 'URL and Access-Control-Request-Method match. No browser request ID is exposed to confirm the exact pairing.');
      if (selected.method === 'OPTIONS' && r.method !== 'OPTIONS' && header(selected, 'requestHeaders', 'access-control-request-method')?.toUpperCase() === r.method.toUpperCase() && completedBefore(selected, r)) add(r, 'after', 'preflight', 'Preflight candidate', 'URL and requested method match; this is a candidate, not a verified browser linkage.');
    }
  }
  const candidates = rows.filter(r => r.id !== selected.id && isApi(r) && r.status >= 200 && r.status < 300 && r.responseBodyLoaded && completedBefore(r, selected)).slice(-MAX_BODY_CANDIDATES);
  for (const r of candidates) {
    const match = bodyUrls(r, pageUrl).find(v => v.url === selectedUrl);
    if (match) add(r, 'before', 'response-url', 'URL found in a response', `${match.path} contains this exact URL. This proves a value match, not that application code used that value.`);
  }
  if (isApi(selected) && selected.status >= 200 && selected.status < 300) {
    const values = new Map(bodyUrls(selected, pageUrl).map(v => [v.url, v.path]));
    for (const r of rows) {
      const path = values.get(canonical(r.url) ?? '');
      if (path && completedBefore(selected, r)) add(r, 'after', 'response-url', 'URL found in this response', `${path} matches this later resource URL. The actual application data flow is not observed.`);
    }
  }
  links.sort((a, b) => (a.kind === 'response-url' ? 0 : 1) - (b.kind === 'response-url' ? 0 : 1));
  return { links: links.slice(0, MAX_RELATIONSHIPS), omitted: Math.max(0, links.length - MAX_RELATIONSHIPS), bodiesExamined: candidates.length, bodySearchLimited: candidates.length === MAX_BODY_CANDIDATES };
}
