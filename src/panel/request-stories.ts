import {
  createStorySnapshot, durationLabel, endpointKey, explainRequest, filterStories,
  findStoryRelations, getStorySource, isApi, isProblem, isSlow, measuredPhases,
  safeLocation, statusLabel, summarizeBody,
  type StoryFilter, type StoryRequest, type StorySnapshot, type InspectorTab,
} from '../network/requestStory.js';

interface StoryOptions {
  getRequests: () => readonly StoryRequest[];
  getPageUrl: () => string;
  inspect: (id: string, tab: InspectorTab) => void;
  onSelect?: (id: string) => void;
}
export interface StoryController {
  setVisible(visible: boolean): void;
  update(): void;
  responseLoaded(id: string): void;
  select(id: string): void;
  reset(): void;
  destroy(): void;
}
const escape = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon = (path: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${path}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const codeIcon = icon('m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16');
const exchangeIcon = icon('M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4');
const dataIcon = icon('M8 4H6v16h2m8-16h2v16h-2M10 9h4m-4 6h4');
const arrow = icon('M5 12h14m-5-5 5 5-5 5');

/** Native DOM hit targets and native scrolling: there is no canvas coordinate transform. */
export function createRequestStories(root: HTMLElement, options: StoryOptions): StoryController {
  const abort = new AbortController(); const events = { signal: abort.signal };
  let visible = false, example = false, selectedId: string | undefined;
  let snapshot: StorySnapshot = createStorySnapshot([]);
  let filter: StoryFilter = 'all', search = '', apiOnly = true, page = 1;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingFrame = 0, destroyed = false;
  let liveState: { selectedId?: string; filter: StoryFilter; search: string; apiOnly: boolean; page: number } | undefined;
  const samples = exampleRequests();
  root.classList.add('rs-root');
  root.innerHTML = `
    <header class="rs-header">
      <div><p class="rs-eyebrow">BLACKBOX / NETWORK EXPLORER</p><h1>Request stories<span class="rs-heading-dot">.</span></h1><p class="rs-subtitle">Start with a symptom. Follow the evidence.</p></div>
      <div class="rs-header-actions"><button type="button" data-action="example" class="rs-button rs-button-quiet">Learning example</button><button type="button" data-action="refresh" class="rs-button">Refresh snapshot</button></div>
    </header>
    <div class="rs-example-banner" hidden><span><strong>Learning example</strong> · Simulated traffic. Not your page.</span><button type="button" class="rs-button" data-action="live">Exit example</button></div>
    <nav class="rs-metrics" aria-label="Find a request to investigate"></nav>
    <div class="rs-snapshot-line"><span class="rs-snapshot-status" role="status" aria-live="polite"></span><span class="rs-still-note">Your view stays still until you refresh.</span></div>
    <div class="rs-pickerbar"><button type="button" class="rs-button" data-action="picker" aria-expanded="false">Choose a request</button><span>Scroll naturally. No dragging needed.</span></div>
    <div class="rs-layout">
      <aside class="rs-rail" aria-label="Choose a request">
        <div class="rs-rail-head"><div class="rs-section-label">REQUEST PICKER</div><label class="rs-search-label"><span class="rs-sr-only">Search endpoint or host</span><input type="search" class="rs-search" placeholder="Search endpoint or host…" autocomplete="off"></label><label class="rs-api-label"><input type="checkbox" class="rs-api" checked> API calls only <span>Fetch / XHR</span></label></div>
        <div class="rs-endpoints" tabindex="-1"></div><button type="button" data-action="more" class="rs-more" hidden>Show more endpoints</button>
      </aside>
      <section class="rs-content" tabindex="-1" aria-label="Selected request story"></section>
    </div>`;
  const el = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const content = el('.rs-content'), endpoints = el('.rs-endpoints');
  const refreshButton = el<HTMLButtonElement>('[data-action="refresh"]');
  const searchInput = el<HTMLInputElement>('.rs-search');

  function preserveReplace(target: HTMLElement, html: string): void {
    const active = document.activeElement as HTMLElement | null;
    const key = active && target.contains(active) ? active.dataset.key : undefined;
    const top = target.scrollTop;
    target.innerHTML = html;
    if (key) target.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    target.scrollTop = top;
  }
  function selected(): StoryRequest | undefined { return snapshot.requests.find(r => r.id === selectedId); }
  function picker(open: boolean): void {
    root.classList.toggle('rs-picker-open', open);
    const button = el('[data-action="picker"]');
    button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'Back to story' : 'Choose a request';
  }
  function renderStatus(): void {
    if (!visible) return;
    const pending = example ? 0 : Math.max(0, options.getRequests().length - snapshot.totalCaptured);
    refreshButton.textContent = pending ? `Refresh · +${pending.toLocaleString()} calls` : 'Refresh snapshot';
    refreshButton.disabled = example;
    el('.rs-snapshot-status').textContent = example ? 'Example snapshot · simulated requests' :
      `${snapshot.requests.length.toLocaleString()} captured calls in this snapshot${snapshot.omitted > 0 ? ` · ${snapshot.omitted.toLocaleString()} older calls remain in Requests` : ''}${pending ? ` · ${pending.toLocaleString()} new calls available` : ''}`;
  }
  function renderPicker(): void {
    const groups = filterStories(snapshot, filter, search, apiOnly);
    const labels: { key: StoryFilter; label: string; help: string }[] = [
      {key:'all',label:'Explore',help:'All endpoints'}, {key:'problems',label:'What failed?',help:'HTTP errors / no response'},
      {key:'slow',label:'What is slow?',help:'Calls over 1 second'}, {key:'repeated',label:'What repeats?',help:'Same method and path'},
    ];
    preserveReplace(el('.rs-metrics'), labels.map(item => {
      const count = filterStories(snapshot, item.key, '', apiOnly).length;
      return `<button type="button" data-filter="${item.key}" data-key="filter-${item.key}" class="rs-metric ${item.key === filter ? 'is-active' : ''}" aria-pressed="${item.key === filter}"><span>${item.label}</span><strong>${count.toLocaleString()}</strong><small>${item.help}</small></button>`;
    }).join(''));
    const current = selected();
    preserveReplace(endpoints, groups.slice(0, page * 40).map(g => {
      const active = current && endpointKey(current) === g.key;
      const tone = g.problems ? 'error' : g.slow ? 'warning' : 'success';
      return `<button type="button" class="rs-endpoint ${active ? 'is-selected' : ''}" data-select="${escape(g.representative.id)}" data-key="endpoint-${escape(g.representative.id)}" aria-current="${active ? 'true' : 'false'}"><span class="rs-endpoint-top"><span class="rs-method">${escape(g.method)}</span><span class="rs-endpoint-count">${g.requests.length} call${g.requests.length === 1 ? '' : 's'}</span></span><strong>${escape(g.path)}</strong><span class="rs-host">${escape(g.host)}</span><span class="rs-endpoint-bottom"><span class="rs-state rs-state-${tone}">${g.problems ? `${g.problems} problem${g.problems === 1 ? '' : 's'}` : g.slow ? `${g.slow} slow` : 'HTTP received'}</span><span>${escape(durationLabel(g.representative.duration))}</span></span></button>`;
    }).join('') || `<div class="rs-picker-empty"><strong>No matching endpoints</strong><p>${apiOnly ? 'Try All traffic by clearing “API calls only”, or change the filter.' : 'Change the search or filter to see more calls.'}</p><button type="button" class="rs-button" data-action="reset-filters">Reset filters</button></div>`);
    el('[data-action="more"]').hidden = groups.length <= page * 40;
  }
  function renderStory(): void {
    const r = selected();
    if (!r && snapshot.requests.length) {
      preserveReplace(content, '<section class="rs-empty"><h2>No matching request.</h2><p>Try another filter or include non-API traffic. Your captured calls have not been removed.</p><button type="button" class="rs-button" data-action="reset-filters">Show all traffic</button></section>');
      return;
    }
    if (!r) {
      preserveReplace(content, `<section class="rs-empty"><span class="rs-empty-icon">${exchangeIcon}</span><p class="rs-eyebrow">FROM INVISIBLE TO UNDERSTANDABLE</p><h2>See the story behind an API call.</h2><p>Open this panel before reloading your app. Then choose a failed, slow, or repeated request to find a useful next step.</p><div class="rs-empty-route"><span>Your code</span><span aria-hidden="true">→</span><span>API response</span><span aria-hidden="true">→</span><span>Returned data</span></div><button type="button" class="rs-button rs-button-primary" data-action="example">Explore a learning example ${arrow}</button><small>The example uses local, simulated data. It sends no network requests.</small></section>`);
      return;
    }
    const finding = explainRequest(r), source = getStorySource(r), body = summarizeBody(r);
    const relations = findStoryRelations(r, snapshot.requests, example ? 'https://shop.example.test/' : options.getPageUrl());
    const phases = measuredPhases(r), measured = phases.reduce((sum, p) => sum + p.ms, 0);
    const group = snapshot.groups.find(g => g.key === endpointKey(r));
    const attempts = group?.requests.slice(-10) ?? [r];
    const maxDuration = Math.max(1, ...attempts.map(a => Math.max(0, Number.isFinite(a.duration) ? a.duration : 0)));
    const hasCurrent = filterStories(snapshot, filter, search, apiOnly).some(g => g.key === endpointKey(r));
    const stage = (num: string, label: string, pictogram: string, title: string, text: string, tab: InspectorTab) => `<button type="button" class="rs-step" data-inspect="${tab}" data-key="stage-${tab}"><span class="rs-step-heading"><span class="rs-step-icon">${pictogram}</span><span>${label}</span><span class="rs-step-number">${num}</span></span><strong>${escape(title)}</strong><p>${escape(text)}</p><span class="rs-step-link">${example ? 'Explore sample' : 'Inspect evidence'} ${arrow}</span></button>`;
    preserveReplace(content, `
      <section class="rs-story" data-request-id="${escape(r.id)}">
        <header class="rs-story-header"><div><p class="rs-eyebrow">${example ? 'LEARNING EXAMPLE' : 'SELECTED REQUEST'}</p><h2><span class="rs-method">${escape(r.method)}</span>${escape(r.path)}</h2><p class="rs-host">${escape(r.host)} · ${escape(r.category)} · ${escape(durationLabel(r.duration))}</p></div><button type="button" class="rs-button rs-button-primary" data-inspect="overview" data-key="open-debugger">${example ? 'Sample details' : 'Open debugger'} ${arrow}</button></header>
        ${!hasCurrent ? '<div class="rs-selection-note">This related request is outside the current picker filter. <button type="button" data-action="reset-filters">Show all traffic</button></div>' : ''}
        <section class="rs-verdict rs-verdict-${finding.tone}" aria-label="Request outcome"><span class="rs-verdict-mark" aria-hidden="true">${finding.tone === 'error' ? '!' : finding.tone === 'success' ? '✓' : 'i'}</span><div><span class="rs-section-label">${escape(statusLabel(r))}</span><h3>${escape(finding.title)}</h3><p>${escape(finding.summary)}</p></div></section>
        <div class="rs-section-heading"><h3>The request, explained</h3><span>Captured evidence, not application state</span></div>
        <div class="rs-steps">
          ${stage('01','Your code',codeIcon,source.label,source.detail,'overview')}
          ${stage('02','HTTP exchange',exchangeIcon,statusLabel(r),`${r.method} request · ${durationLabel(r.duration)} total. Open the request to inspect its URL, parameters and body.`,'request')}
          ${stage('03','Returned data',dataIcon,body.title,body.detail,'response')}
        </div>
        <aside class="rs-learning-note"><span class="rs-note-label">THE IMPORTANT DISTINCTION</span><p>${escape(finding.lesson)}</p></aside>
        <div class="rs-section-heading"><h3>What to check next</h3><span>Start here—not with guesswork</span></div>
        <div class="rs-actions">${finding.next.map((a,i) => `<button type="button" class="rs-next" data-inspect="${a.tab}" data-key="next-${i}"><span class="rs-next-number">${i+1}</span><span><strong>${escape(a.title)}</strong><span>${escape(a.text)}</span></span>${arrow}</button>`).join('')}</div>
        <section class="rs-evidence-section"><div class="rs-section-heading"><h3>Connected evidence <span class="rs-count">${relations.links.length}${relations.omitted ? '+' : ''}</span></h3><span>Relationships need evidence</span></div>
          <div class="rs-relations">${relations.links.map((link,i) => `<button type="button" class="rs-relation" data-select="${escape(link.request.id)}" data-key="relation-${i}"><span class="rs-relation-direction">${link.direction === 'before' ? 'EARLIER' : 'LATER'}</span><span><span class="rs-relation-kind">${escape(link.label)}</span><strong>${escape(link.request.method)} ${escape(link.request.path)}</strong><span class="rs-relation-proof">${escape(link.evidence)}</span></span>${arrow}</button>`).join('') || '<div class="rs-no-evidence"><strong>No connected request verified in this snapshot.</strong><p>Requests occurring close together are not automatically related. A source location above can still be useful even when no matching resource was captured.</p></div>'}</div>
          <p class="rs-footnote">Only this snapshot is searched. ${relations.bodiesExamined} earlier loaded API response${relations.bodiesExamined === 1 ? '' : 's'} checked${relations.bodySearchLimited ? ' (search capped at 40)' : ''}. Body analysis is size-limited and checks at most 1,200 values and 8 levels. ${relations.omitted ? `${relations.omitted} additional matches omitted from this view.` : ''} Unloaded bodies are not fetched here.</p>
        </section>
        <section class="rs-timing-section"><div class="rs-section-heading"><h3>Where the measured time went</h3><button type="button" class="rs-text-button" data-inspect="timing" data-key="timing">Inspect timing ${arrow}</button></div>
          ${measured > 0 ? `<div class="rs-timing-bar" aria-hidden="true">${phases.map(p => `<span class="rs-phase-${p.key}" style="flex-grow:${p.ms / measured}"></span>`).join('')}</div><dl class="rs-timing-legend">${phases.map(p => `<div><dt><span class="rs-phase-dot rs-phase-${p.key}"></span>${p.label}</dt><dd>${escape(durationLabel(p.ms))}</dd></div>`).join('')}</dl>` : '<p class="rs-no-evidence">No non-zero timing phases were exposed. The total duration is not a substitute for missing phases.</p>'}
          <p class="rs-footnote">${phases.length} of 6 phases available. The bar compares measured phases only; missing phases are not zero. TLS is part of Connection and is not counted twice.</p>
        </section>
        <section class="rs-attempt-section"><div class="rs-section-heading"><h3>Calls to this endpoint <span class="rs-count">${group?.requests.length ?? 1}</span></h3><span>Latest ${attempts.length} in snapshot</span></div><p class="rs-footnote">Same method, origin and path. Query parameters or bodies may differ—these are not necessarily duplicates.</p><div class="rs-attempts">${attempts.map((a,i) => `<button type="button" class="rs-attempt ${a.id === r.id ? 'is-current' : ''}" data-select="${escape(a.id)}" data-key="attempt-${escape(a.id)}" aria-current="${a.id === r.id}"><span class="rs-attempt-number">${(group?.requests.length ?? 1)-attempts.length+i+1}</span><span class="rs-attempt-status rs-state-${isProblem(a) ? 'error' : isSlow(a) ? 'warning' : 'success'}">${a.status || 'No HTTP'}</span><span class="rs-attempt-track" aria-hidden="true"><span style="width:${Math.max(2, Math.min(100, (Number.isFinite(a.duration) ? Math.max(0, a.duration) : 0) / maxDuration * 100))}%"></span></span><span>${escape(durationLabel(a.duration))}</span>${a.id === r.id ? '<span class="rs-attempt-selected">Selected</span>' : '<span class="rs-attempt-selected">Inspect</span>'}</button>`).join('')}</div></section>
        <details class="rs-peek"><summary>${example ? 'Sample captured fields' : 'What this view can and cannot tell you'}</summary><div>${example ? `<pre>${escape(JSON.stringify({ url: r.url, status: r.status, response: r.responseBody ? JSON.parse(r.responseBody) : null }, null, 2))}</pre>` : '<p>Blackbox observes captured network records and content loaded through the existing debugger. It does not observe React state, Promise resolution, property access, or whether your page rendered correctly. A URL match is a correlation, not proof that one request caused another. Repeated calls are grouped, not diagnosed as accidental duplicates.</p>'}</div></details>
      </section>`);
  }
  function refresh(pinned?: string): void {
    if (destroyed) return;
    snapshot = createStorySnapshot(example ? samples : options.getRequests(), pinned ?? selectedId);
    if (!snapshot.requests.some(r => r.id === selectedId)) selectedId = snapshot.groups[0]?.representative.id;
    if (pinned && snapshot.requests.some(r => r.id === pinned)) selectedId = pinned;
    if (visible) { renderStatus(); renderPicker(); renderStory(); }
  }
  function choose(id: string): void {
    if (!snapshot.requests.some(r => r.id === id)) return;
    selectedId = id; picker(false);
    if (!example) options.onSelect?.(id);
    renderPicker(); renderStory(); content.scrollTop = 0;
    content.focus({ preventScroll: true });
  }
  function resetFilters(): void { if (!selectedId) selectedId = snapshot.groups[0]?.representative.id; filter = 'all'; search = ''; apiOnly = false; page = 1; searchInput.value = ''; el<HTMLInputElement>('.rs-api').checked = false; renderPicker(); renderStory(); }
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || !root.contains(target)) return;
    if (target.dataset.select) { choose(target.dataset.select); return; }
    if (target.dataset.filter) {
      filter = target.dataset.filter as StoryFilter; page = 1;
      const first = filterStories(snapshot, filter, search, apiOnly)[0];
      selectedId = first?.representative.id;
      renderPicker(); renderStory(); content.scrollTop = 0; return;
    }
    if (target.dataset.inspect) {
      if (!selectedId) return;
      if (example) {
        const peek = content.querySelector<HTMLDetailsElement>('.rs-peek');
        if (peek) { peek.open = true; peek.scrollIntoView({block:'nearest',behavior:'auto'}); peek.querySelector('summary')?.focus({preventScroll:true}); }
      } else options.inspect(selectedId, target.dataset.inspect as InspectorTab);
      return;
    }
    switch (target.dataset.action) {
      case 'refresh': refresh(); break;
      case 'more': page++; renderPicker(); break;
      case 'picker': picker(!root.classList.contains('rs-picker-open')); break;
      case 'reset-filters': resetFilters(); break;
      case 'example':
        if (!example) liveState = { selectedId, filter, search, apiOnly, page };
        example = true; root.classList.add('rs-example-mode'); selectedId = undefined; filter = 'all'; search = ''; apiOnly = true; page = 1; searchInput.value = ''; el<HTMLInputElement>('.rs-api').checked = true;
        el('.rs-example-banner').hidden = false; el('[data-action="example"]').hidden = true; picker(false); refresh(); content.scrollTop = 0; break;
      case 'live':
        example = false; root.classList.remove('rs-example-mode'); selectedId = liveState?.selectedId; filter = liveState?.filter ?? 'all'; search = liveState?.search ?? ''; apiOnly = liveState?.apiOnly ?? true; page = liveState?.page ?? 1; searchInput.value = search; el<HTMLInputElement>('.rs-api').checked = apiOnly; liveState = undefined; el('.rs-example-banner').hidden = true; el('[data-action="example"]').hidden = false; refresh(selectedId); content.scrollTop = 0; break;
    }
  }, events);
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (!destroyed) { search = searchInput.value; page = 1; renderPicker(); } }, 100);
  }, events);
  el<HTMLInputElement>('.rs-api').addEventListener('change', event => {
    apiOnly = (event.target as HTMLInputElement).checked; page = 1; renderPicker(); renderStory();
  }, events);
  return {
    setVisible(value) { visible = value; if (value) { if (!snapshot.requests.length) refresh(); else { renderStatus(); renderPicker(); renderStory(); } } },
    update() {
      if (!visible || destroyed || pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; if (!visible || destroyed) return; if (!snapshot.requests.length && !example) refresh(); else renderStatus(); });
    },
    responseLoaded(id) { if (visible && !example && snapshot.requests.some(r => r.id === id)) renderStory(); },
    select(id) { if (!example && selectedId !== id) { selectedId = id; refresh(id); } },
    reset() {
      selectedId = undefined; liveState = undefined; example = false; root.classList.remove('rs-example-mode'); snapshot = createStorySnapshot([]);
      if (pendingFrame) cancelAnimationFrame(pendingFrame); pendingFrame = 0;
      el('.rs-example-banner').hidden = true; el('[data-action="example"]').hidden = false;
      if (visible) { renderStatus(); renderPicker(); renderStory(); }
    },
    destroy() { destroyed = true; abort.abort(); clearTimeout(searchTimer); if (pendingFrame) cancelAnimationFrame(pendingFrame); snapshot = createStorySnapshot([]); root.replaceChildren(); },
  };
}

/** An opt-in, conspicuously labelled offline lesson. Never enters the capture store. */
export function exampleRequests(): StoryRequest[] {
  const make = (id: string, path: string, status: number, duration: number, start: number, extra: Partial<StoryRequest> = {}): StoryRequest => ({
    id: `example-${id}`, startedAt: new Date(Date.UTC(2026,0,1,12,0,0,start)).toISOString(), duration,
    category:'Fetch', method:'GET', url:`https://api.example.test${path}`, host:'api.example.test', path, protocol:'https', status,
    statusText:({200:'OK',401:'Unauthorized',404:'Not Found',429:'Too Many Requests'} as Record<number,string>)[status] ?? '',
    responseSize:480, responseMimeType:'application/json', responseBody:JSON.stringify({message:'Example response'}), responseBodyLoaded:true,
    requestHeaders:[], responseHeaders:[], initiator:{type:'script',url:'https://shop.example.test/src/catalog.js',lineNumber:41},
    timings:{blocked:0,dns:0,connect:0,send:2,wait:Math.max(0,duration-12),receive:10,ssl:0,total:duration},
    raw:{timings:{blocked:0,dns:0,connect:0,send:2,wait:Math.max(0,duration-12),receive:10}}, ...extra,
  });
  return [
    make('catalog','/products',200,184,0,{responseBody:JSON.stringify({products:[{id:1,title:'Mechanical keyboard',image:'https://cdn.example.test/keyboard.webp'}]})}),
    make('image','/keyboard.webp',200,64,250,{category:'Image',url:'https://cdn.example.test/keyboard.webp',host:'cdn.example.test',responseMimeType:'image/webp',responseBody:undefined,responseBodyLoaded:false,initiator:undefined}),
    make('profile','/account/profile',401,87,400,{responseBody:JSON.stringify({error:'Session expired',message:'Sign in again to request this profile.'})}),
    make('search','/search',200,1640,600,{responseBody:JSON.stringify({results:[{id:1,title:'Keyboard'}]})}),
    make('poll1','/notifications',200,120,2400), make('poll2','/notifications',200,144,3400), make('poll3','/notifications',200,112,4400),
  ];
}
