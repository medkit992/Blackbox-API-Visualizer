import { describe, it, expect } from 'vitest';
import {
  createStorySnapshot, filterStories, endpointKey, explainRequest, durationLabel,
  statusLabel, safeLocation, summarizeBody, getStorySource, measuredPhases,
  findStoryRelations, STORY_WINDOW, MAX_BODY_CHARS, MAX_RELATIONSHIPS,
  type StoryRequest,
} from '../../src/network/requestStory.js';
function make(extra: Partial<StoryRequest> = {}): StoryRequest {
  return {id:'a', startedAt:'2026-01-01T00:00:00Z', duration:100, category:'Fetch', method:'GET',
    url:'https://api.test/products', host:'api.test', path:'/products', protocol:'https', status:200, statusText:'OK',
    responseSize:200, responseMimeType:'application/json', responseBodyLoaded:false, requestHeaders:[],responseHeaders:[],
    timings:{blocked:0,dns:0,connect:0,send:1,wait:80,receive:19,ssl:0,total:100}, ...extra};
}
const later = (extra: Partial<StoryRequest> = {}) => make({id:'b',startedAt:'2026-01-01T00:00:01Z',url:'https://cdn.test/item.webp',host:'cdn.test',path:'/item.webp',category:'Image',...extra});
const withBody = (value: unknown, extra: Partial<StoryRequest> = {}) => make({responseBodyLoaded:true,responseBody:JSON.stringify(value),...extra});

describe('Request Stories: bounded snapshots and truthful grouping', () => {
  it('starts empty', () => expect(createStorySnapshot([]).counts).toEqual({all:0,problems:0,slow:0,repeated:0}));
  it('keeps schemes, hosts, methods and paths distinct', () => {
    const a=make(); for(const r of [make({protocol:'http'}),make({host:'other.test'}),make({method:'POST'}),make({path:'/other'})]) expect(endpointKey(a)).not.toBe(endpointKey(r));
  });
  it('groups query variants without claiming they are duplicate requests', () => {
    const s=createStorySnapshot([make(),make({id:'b',url:'https://api.test/products?q=second'})]);
    expect(s.groups.length).toBe(1);expect(s.counts.repeated).toBe(1);expect(s.groups[0].requests.length).toBe(2);
  });
  it('selects a problem rather than hiding it behind a newer success', () => {
    const s=createStorySnapshot([make({status:500}),make({id:'b'})]);expect(s.groups[0].representative.id).toBe('a');
  });
  it('prioritizes API calls over unrelated asset errors', () => {
    expect(createStorySnapshot([later({status:404}),make()]).groups[0].representative.id).toBe('a');
  });
  it('caps the analysis window without mutating capture', () => {
    const rows=Array.from({length:STORY_WINDOW+100},(_,i)=>make({id:String(i)}));
    const s=createStorySnapshot(rows);expect(s.requests.length).toBe(STORY_WINDOW);expect(s.omitted).toBe(100);expect(rows.length).toBe(STORY_WINDOW+100);
  });
  it('pins an older selected request outside the window', () => {
    const rows=Array.from({length:STORY_WINDOW+2},(_,i)=>make({id:String(i)}));
    const s=createStorySnapshot(rows,'0');expect(s.requests.length).toBe(STORY_WINDOW+1);expect(s.requests[0].id).toBe('0');expect(s.omitted).toBe(1);
  });
  it('filters slow, failed, repeated and searched endpoints', () => {
    const s=createStorySnapshot([make(),make({id:'2'}),later({id:'3',category:'XHR',path:'/slow',duration:1400}),later({id:'4',category:'XHR',path:'/bad',status:500})]);
    expect(filterStories(s,'slow').length).toBe(1);expect(filterStories(s,'problems').length).toBe(1);expect(filterStories(s,'repeated').length).toBe(1);expect(filterStories(s,'all','/bad').length).toBe(1);
  });
});
describe('Request Stories: outcome, body and timing evidence', () => {
  it('does not call HTTP success application success', () => {
    expect(explainRequest(make()).tone).toBe('success');expect(explainRequest(make()).lesson).toMatch(/not whether your JavaScript/);
  });
  it('does not invent CORS or pending state from status zero', () => {
    const r=make({status:0});expect(statusLabel(r)).toBe('No HTTP response');expect(explainRequest(r).summary).toMatch(/does not identify/);expect(explainRequest(r).lesson).toMatch(/not a pending state/);
  });
  it('uses separate guidance for authentication, not-found, rate limits and server failures', () => {
    for(const n of [401,403,404,429,500]) {const f=explainRequest(make({status:n}));expect(f.tone).toBe('error');expect(f.next.length).toBeTruthy();}
  });
  it('treats a slow successful response separately from an HTTP error', () => {
    const f=explainRequest(make({duration:2000}));expect(f.tone).toBe('warning');expect(f.title).toMatch(/slow/);expect(f.next[1].tab).toBe('timing');
  });
  it('explains 304 cache validation', () => expect(explainRequest(make({status:304})).summary).toMatch(/reuse cached content/));
  it('does not parse unloaded bodies or base64 content', () => {
    expect(summarizeBody(make({responseBody:'{}'})).parsed).toBe(false);expect(summarizeBody(withBody({}, {responseBodyEncoding:'base64'})).parsed).toBe(false);
  });
  it('describes object, array, primitive and null shapes', () => {
    expect(summarizeBody(withBody({x:1})).title).toMatch(/Object/);expect(summarizeBody(withBody([1,2])).title).toMatch(/2 items/);expect(summarizeBody(withBody(null)).title).toBe('JSON null');expect(summarizeBody(withBody(false)).title).toBe('JSON boolean');
  });
  it('does not turn invalid captured JSON into an HTTP failure', () => {
    const r=withBody(null,{responseBody:'{bad'});expect(summarizeBody(r).parsed).toBe(false);expect(explainRequest(r).tone).toBe('success');
  });
  it('bounds parsing of large bodies', () => expect(summarizeBody(withBody(null,{responseBody:' '.repeat(MAX_BODY_CHARS+1)})).parsed).toBe(false));
  it('invalidates parsed JSON when the loaded body changes', () => {
    const r=withBody({x:1});expect(summarizeBody(r).title).toMatch(/Object/);r.responseBody='[]';expect(summarizeBody(r).title).toMatch(/Array/);
  });
  it('marks valid empty-body responses accurately', () => expect(summarizeBody(withBody(null,{status:204,responseBody:''})).detail).toMatch(/legitimately/));
  it('omits normalized zero phases without raw availability evidence', () => expect(measuredPhases(make()).map(p=>p.key)).toEqual(['send','wait','receive']));
  it('preserves real raw zeros, excludes missing/negative phases and never double-counts TLS', () => {
    const phases=measuredPhases(make({raw:{timings:{blocked:-1,dns:0,connect:20,ssl:10,send:1,wait:79}}}));
    expect(phases.map(p=>p.key)).toEqual(['dns','connect','send','wait']);expect(phases.reduce((s,p)=>s+p.ms,0)).toBe(100);
  });
  it('formats unavailable durations rather than NaN', () => {expect(durationLabel(NaN)).toBe('Unavailable');expect(durationLabel(-1)).toBe('Unavailable');expect(durationLabel(0)).toBe('0 ms');});
});
describe('Request Stories: sources and conservative correlations', () => {
  it('redacts query strings, fragments and URL credentials from display locations', () => expect(safeLocation('https://user:secret@a.test/file.js?token=secret#x')).toBe('a.test/file.js'));
  it('keeps absent source unknown instead of inventing a page root', () => expect(getStorySource(make()).label).toBe('Source not exposed'));
  it('uses nested initiator frames and one-based display lines', () => {
    const r=make({initiator:{type:'script',stack:{parent:{callFrames:[{url:'https://app.test/main.js?key=x',lineNumber:0}]}}}});
    expect(getStorySource(r).label).toBe('app.test/main.js:1');
  });
  it('does not connect unrelated requests merely because they are close in time', () => expect(findStoryRelations(later(),[make(),later()]).links.length).toBe(0));
  it('finds exact URL values and paths in already-loaded JSON', () => {
    const a=withBody({items:[{image:'https://cdn.test/item.webp'}]}), b=later();
    const link=findStoryRelations(b,[a,b]).links[0];expect(link.kind).toBe('response-url');expect(link.evidence).toMatch(/data.items\[0\].image/);expect(link.evidence).toMatch(/not that application code/);
  });
  it('rejects substrings, unrelated text and future responses', () => {
    const b=later();
    for(const a of [withBody({url:b.url+'-other'}),withBody({message:'See '+b.url}),withBody({url:b.url},{startedAt:'2026-01-01T00:00:03Z'})]) expect(findStoryRelations(b,[a,b]).links.length).toBe(0);
  });
  it('rejects missing timeline evidence instead of guessing', () => {
    const a=withBody({url:'https://cdn.test/item.webp'},{startedAt:'invalid'}),b=later();expect(findStoryRelations(b,[a,b]).links.length).toBe(0);
  });
  it('does not load response bodies as a side effect', () => {
    const a=withBody({url:'https://cdn.test/item.webp'},{responseBodyLoaded:false}),b=later();expect(findStoryRelations(b,[a,b]).links.length).toBe(0);expect(a.responseBodyLoaded).toBe(false);
  });
  it('finds page-relative response URL values', () => {
    const a=withBody({image:'/item.webp'}),b=later();expect(findStoryRelations(b,[a,b],'https://cdn.test/').links[0].kind).toBe('response-url');
  });
  it('retains multiple matching source candidates rather than inventing one cause', () => {
    const a=withBody({image:'https://cdn.test/item.webp'}),c=withBody({image:'https://cdn.test/item.webp'},{id:'c'}),b=later();expect(findStoryRelations(b,[a,c,b]).links.length).toBe(2);
  });
  it('bounds visible links', () => {
    const a=withBody({image:'https://cdn.test/item.webp'});const rows=[a,...Array.from({length:100},(_,i)=>later({id:String(i)}))];
    const result=findStoryRelations(a,rows);expect(result.links.length).toBe(MAX_RELATIONSHIPS);expect(result.omitted).toBe(100-MAX_RELATIONSHIPS);
  });
  it('requires an explicit redirect target', () => {
    const a=make({status:302}),b=later({url:a.url});expect(findStoryRelations(a,[a,b]).links.length).toBe(0);
  });
  it('labels redirect matching as a candidate and keeps the explicit evidence', () => {
    const a=make({status:302,redirectUrl:'https://cdn.test/item.webp'}),b=later();const result=findStoryRelations(a,[a,b]);expect(result.links[0].kind).toBe('redirect');expect(result.links[0].label).toMatch(/candidate/);
  });
  it('requires the preflight requested method, not just OPTIONS and a matching URL', () => {
    const a=make({method:'OPTIONS'}),b=later({url:a.url,method:'POST'});expect(findStoryRelations(b,[a,b]).links.length).toBe(0);
    a.requestHeaders=[{name:'Access-Control-Request-Method',value:'POST'}];expect(findStoryRelations(b,[a,b]).links[0].kind).toBe('preflight');
  });
  it('does not treat a failed JSON response as the source of resource data', () => {
    const a=withBody({url:'https://cdn.test/item.webp'},{status:500}),b=later();expect(findStoryRelations(b,[a,b]).links.length).toBe(0);
  });
});
