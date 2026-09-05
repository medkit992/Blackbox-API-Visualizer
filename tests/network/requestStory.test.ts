import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
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
  it('starts empty', () => assert.deepEqual(createStorySnapshot([]).counts,{all:0,problems:0,slow:0,repeated:0}));
  it('keeps schemes, hosts, methods and paths distinct', () => {
    const a=make(); for(const r of [make({protocol:'http'}),make({host:'other.test'}),make({method:'POST'}),make({path:'/other'})]) assert.notEqual(endpointKey(a),endpointKey(r));
  });
  it('groups query variants without claiming they are duplicate requests', () => {
    const s=createStorySnapshot([make(),make({id:'b',url:'https://api.test/products?q=second'})]);
    assert.equal(s.groups.length,1);assert.equal(s.counts.repeated,1);assert.equal(s.groups[0].requests.length,2);
  });
  it('selects a problem rather than hiding it behind a newer success', () => {
    const s=createStorySnapshot([make({status:500}),make({id:'b'})]);assert.equal(s.groups[0].representative.id,'a');
  });
  it('prioritizes API calls over unrelated asset errors', () => {
    assert.equal(createStorySnapshot([later({status:404}),make()]).groups[0].representative.id,'a');
  });
  it('caps the analysis window without mutating capture', () => {
    const rows=Array.from({length:STORY_WINDOW+100},(_,i)=>make({id:String(i)}));
    const s=createStorySnapshot(rows);assert.equal(s.requests.length,STORY_WINDOW);assert.equal(s.omitted,100);assert.equal(rows.length,STORY_WINDOW+100);
  });
  it('pins an older selected request outside the window', () => {
    const rows=Array.from({length:STORY_WINDOW+2},(_,i)=>make({id:String(i)}));
    const s=createStorySnapshot(rows,'0');assert.equal(s.requests.length,STORY_WINDOW+1);assert.equal(s.requests[0].id,'0');assert.equal(s.omitted,1);
  });
  it('filters slow, failed, repeated and searched endpoints', () => {
    const s=createStorySnapshot([make(),make({id:'2'}),later({id:'3',category:'XHR',path:'/slow',duration:1400}),later({id:'4',category:'XHR',path:'/bad',status:500})]);
    assert.equal(filterStories(s,'slow').length,1);assert.equal(filterStories(s,'problems').length,1);assert.equal(filterStories(s,'repeated').length,1);assert.equal(filterStories(s,'all','/bad').length,1);
  });
});
describe('Request Stories: outcome, body and timing evidence', () => {
  it('does not call HTTP success application success', () => {
    assert.equal(explainRequest(make()).tone,'success');assert.match(explainRequest(make()).lesson,/not whether your JavaScript/);
  });
  it('does not invent CORS or pending state from status zero', () => {
    const r=make({status:0});assert.equal(statusLabel(r),'No HTTP response');assert.match(explainRequest(r).summary,/does not identify/);assert.match(explainRequest(r).lesson,/not a pending state/);
  });
  it('uses separate guidance for authentication, not-found, rate limits and server failures', () => {
    for(const n of [401,403,404,429,500]) {const f=explainRequest(make({status:n}));assert.equal(f.tone,'error');assert.ok(f.next.length);}
  });
  it('treats a slow successful response separately from an HTTP error', () => {
    const f=explainRequest(make({duration:2000}));assert.equal(f.tone,'warning');assert.match(f.title,/slow/);assert.equal(f.next[1].tab,'timing');
  });
  it('explains 304 cache validation', () => assert.match(explainRequest(make({status:304})).summary,/reuse cached content/));
  it('does not parse unloaded bodies or base64 content', () => {
    assert.equal(summarizeBody(make({responseBody:'{}'})).parsed,false);assert.equal(summarizeBody(withBody({}, {responseBodyEncoding:'base64'})).parsed,false);
  });
  it('describes object, array, primitive and null shapes', () => {
    assert.match(summarizeBody(withBody({x:1})).title,/Object/);assert.match(summarizeBody(withBody([1,2])).title,/2 items/);assert.equal(summarizeBody(withBody(null)).title,'JSON null');assert.equal(summarizeBody(withBody(false)).title,'JSON boolean');
  });
  it('does not turn invalid captured JSON into an HTTP failure', () => {
    const r=withBody(null,{responseBody:'{bad'});assert.equal(summarizeBody(r).parsed,false);assert.equal(explainRequest(r).tone,'success');
  });
  it('bounds parsing of large bodies', () => assert.equal(summarizeBody(withBody(null,{responseBody:' '.repeat(MAX_BODY_CHARS+1)})).parsed,false));
  it('invalidates parsed JSON when the loaded body changes', () => {
    const r=withBody({x:1});assert.match(summarizeBody(r).title,/Object/);r.responseBody='[]';assert.match(summarizeBody(r).title,/Array/);
  });
  it('marks valid empty-body responses accurately', () => assert.match(summarizeBody(withBody(null,{status:204,responseBody:''})).detail,/legitimately/));
  it('omits normalized zero phases without raw availability evidence', () => assert.deepEqual(measuredPhases(make()).map(p=>p.key),['send','wait','receive']));
  it('preserves real raw zeros, excludes missing/negative phases and never double-counts TLS', () => {
    const phases=measuredPhases(make({raw:{timings:{blocked:-1,dns:0,connect:20,ssl:10,send:1,wait:79}}}));
    assert.deepEqual(phases.map(p=>p.key),['dns','connect','send','wait']);assert.equal(phases.reduce((s,p)=>s+p.ms,0),100);
  });
  it('formats unavailable durations rather than NaN', () => {assert.equal(durationLabel(NaN),'Unavailable');assert.equal(durationLabel(-1),'Unavailable');assert.equal(durationLabel(0),'0 ms');});
});
describe('Request Stories: sources and conservative correlations', () => {
  it('redacts query strings, fragments and URL credentials from display locations', () => assert.equal(safeLocation('https://user:secret@a.test/file.js?token=secret#x'),'a.test/file.js'));
  it('keeps absent source unknown instead of inventing a page root', () => assert.equal(getStorySource(make()).label,'Source not exposed'));
  it('uses nested initiator frames and one-based display lines', () => {
    const r=make({initiator:{type:'script',stack:{parent:{callFrames:[{url:'https://app.test/main.js?key=x',lineNumber:0}]}}}});
    assert.equal(getStorySource(r).label,'app.test/main.js:1');
  });
  it('does not connect unrelated requests merely because they are close in time', () => assert.equal(findStoryRelations(later(),[make(),later()]).links.length,0));
  it('finds exact URL values and paths in already-loaded JSON', () => {
    const a=withBody({items:[{image:'https://cdn.test/item.webp'}]}), b=later();
    const link=findStoryRelations(b,[a,b]).links[0];assert.equal(link.kind,'response-url');assert.match(link.evidence,/data.items\[0\].image/);assert.match(link.evidence,/not that application code/);
  });
  it('rejects substrings, unrelated text and future responses', () => {
    const b=later();
    for(const a of [withBody({url:b.url+'-other'}),withBody({message:'See '+b.url}),withBody({url:b.url},{startedAt:'2026-01-01T00:00:03Z'})]) assert.equal(findStoryRelations(b,[a,b]).links.length,0);
  });
  it('rejects missing timeline evidence instead of guessing', () => {
    const a=withBody({url:'https://cdn.test/item.webp'},{startedAt:'invalid'}),b=later();assert.equal(findStoryRelations(b,[a,b]).links.length,0);
  });
  it('does not load response bodies as a side effect', () => {
    const a=withBody({url:'https://cdn.test/item.webp'},{responseBodyLoaded:false}),b=later();assert.equal(findStoryRelations(b,[a,b]).links.length,0);assert.equal(a.responseBodyLoaded,false);
  });
  it('finds page-relative response URL values', () => {
    const a=withBody({image:'/item.webp'}),b=later();assert.equal(findStoryRelations(b,[a,b],'https://cdn.test/').links[0].kind,'response-url');
  });
  it('retains multiple matching source candidates rather than inventing one cause', () => {
    const a=withBody({image:'https://cdn.test/item.webp'}),c=withBody({image:'https://cdn.test/item.webp'},{id:'c'}),b=later();assert.equal(findStoryRelations(b,[a,c,b]).links.length,2);
  });
  it('bounds visible links', () => {
    const a=withBody({image:'https://cdn.test/item.webp'});const rows=[a,...Array.from({length:100},(_,i)=>later({id:String(i)}))];
    const result=findStoryRelations(a,rows);assert.equal(result.links.length,MAX_RELATIONSHIPS);assert.equal(result.omitted,100-MAX_RELATIONSHIPS);
  });
  it('requires an explicit redirect target', () => {
    const a=make({status:302}),b=later({url:a.url});assert.equal(findStoryRelations(a,[a,b]).links.length,0);
  });
  it('labels redirect matching as a candidate and keeps the explicit evidence', () => {
    const a=make({status:302,redirectUrl:'https://cdn.test/item.webp'}),b=later();const result=findStoryRelations(a,[a,b]);assert.equal(result.links[0].kind,'redirect');assert.match(result.links[0].label,/candidate/);
  });
  it('requires the preflight requested method, not just OPTIONS and a matching URL', () => {
    const a=make({method:'OPTIONS'}),b=later({url:a.url,method:'POST'});assert.equal(findStoryRelations(b,[a,b]).links.length,0);
    a.requestHeaders=[{name:'Access-Control-Request-Method',value:'POST'}];assert.equal(findStoryRelations(b,[a,b]).links[0].kind,'preflight');
  });
  it('does not treat a failed JSON response as the source of resource data', () => {
    const a=withBody({url:'https://cdn.test/item.webp'},{status:500}),b=later();assert.equal(findStoryRelations(b,[a,b]).links.length,0);
  });
});
