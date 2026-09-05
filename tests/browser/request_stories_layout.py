"""Optional packaged-panel layout regression; DevTools/capture are MOCKED.

Build first: npm ci && npm run build
Then: python -m pip install playwright && python -m playwright install chromium
      python tests/browser/request_stories_layout.py [path/to/dist]

No live site or installed extension is exercised. Tests execute the built panel
HTML/CSS/JS in Chromium with in-memory capture/storage. Only the module-preload
bootstrap is omitted for set_content(); module strict scoping is preserved.
Set CHROMIUM_EXECUTABLE for a system browser, STORY_QA_OUTPUT for results, and
STORY_LAYOUT_CSS to preview an unbundled candidate stylesheet locally.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os
import re
import sys
import tempfile

BASE = Path(__file__).resolve().parents[2]
DIST = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else BASE / 'dist'
OUT = Path(os.environ.get('STORY_QA_OUTPUT', tempfile.mkdtemp(prefix='blackbox-layout-')))
OUT.mkdir(parents=True, exist_ok=True)
HTML_PATH = DIST / 'src/panel/panel.html'
HTML = HTML_PATH.read_text(encoding='utf-8')
STYLES = re.findall(r'<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"', HTML)
# Vite may serialize href before rel.
if not STYLES:
    STYLES = re.findall(r'<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"', HTML)
SCRIPTS = re.findall(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>', HTML)
assert STYLES and len(SCRIPTS) == 1, 'Expected one bundled panel module and its styles'

def asset(ref):
    path = (DIST / ref.lstrip('/')) if ref.startswith('/') else (HTML_PATH.parent / ref).resolve()
    assert path.is_relative_to(DIST), path
    return path.read_text(encoding='utf-8')

JS = asset(SCRIPTS[0])
JS = re.sub(r'^import\s*["\']\./modulepreload-polyfill-[^"\']+["\'];?', '', JS)
assert not JS.startswith('import'), 'New bundle imports need explicit fixture support'
MARKUP = re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>', '', HTML, flags=re.S)
MOCK = r'''(() => {
  const rows = [], navigations = [], stored = new Map();
  Object.defineProperty(window, 'localStorage', {value:{
    getItem:k=>stored.get(k)??null, setItem:(k,v)=>stored.set(k,String(v)), removeItem:k=>stored.delete(k)
  }});
  let nextId = 0;
  if (!crypto.randomUUID) crypto.randomUUID = () => 'qa-' + (++nextId);
  window.chrome = {devtools:{
    network:{onRequestFinished:{addListener:f=>rows.push(f)},onNavigated:{addListener:f=>navigations.push(f)},getHAR:cb=>cb({entries:[]})},
    inspectedWindow:{eval:(s,cb)=>cb(s==='location.href'?'https://shop.example.test/':null),getResources:cb=>cb([])}
  }};
  window.qaEmit = (id, status=401, path='/programs/fes') => rows.forEach(f=>f({
    startedDateTime:new Date(1788638400000+id*1000).toISOString(),time:158,
    request:{method:'GET',url:'https://api.example.test'+path,httpVersion:'HTTP/2',headers:[],queryString:[],cookies:[],headersSize:0,bodySize:0},
    response:{status,statusText:status===401?'Unauthorized':'OK',httpVersion:'HTTP/2',headers:[{name:'Content-Type',value:'application/json'}],cookies:[],redirectURL:'',headersSize:0,bodySize:90,content:{size:90,mimeType:'application/json'}},
    cache:{},timings:{blocked:1,dns:-1,connect:-1,send:1,wait:144,receive:12,ssl:-1},
    _resourceType:'xhr',_initiator:{type:'script',stack:{callFrames:[{functionName:'getProgram',url:'https://shop.example.test/src/programs.ts',lineNumber:41,columnNumber:6}]}},
    getContent:cb=>cb('{"message":"Authentication is required."}','')
  }));
})();'''

def mount(page):
    page.set_default_timeout(5000)
    page.set_content(MARKUP)
    for style in STYLES:
        page.add_style_tag(content=asset(style))
    if os.environ.get('STORY_LAYOUT_CSS'):
        page.add_style_tag(path=os.environ['STORY_LAYOUT_CSS'])
    page.add_script_tag(content=MOCK)
    page.add_script_tag(content='(()=>{"use strict";' + JS + '\n})();')
    page.locator('#consent-accept').click()
    page.evaluate('for(let i=1;i<=3;i++) qaEmit(i); for(let i=4;i<=27;i++) qaEmit(i,200,"/items/"+i)')
    page.locator('[data-view="graph"]').click()
    page.wait_for_selector('.rs-story')


def center_click(page, selector):
    target = page.locator(selector).first
    target.scroll_into_view_if_needed()
    box = target.bounding_box()
    assert box, selector
    point = [box['x'] + box['width']/2, box['y'] + box['height']/2]
    assert target.evaluate('(e,p)=>e.contains(document.elementFromPoint(...p))', point), (selector, box)
    page.mouse.click(*point)


def geometry(page):
    return page.evaluate('''() => {
      const rect = s => {const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
      const content=document.querySelector('.rs-content');
      return {viewport:{width:innerWidth,height:innerHeight},root:rect('.rs-root'),content:rect('.rs-content'),steps:rect('.rs-steps'),
        documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
        contentWidth:content.clientWidth,contentScrollWidth:content.scrollWidth,
        bodyFont:getComputedStyle(document.querySelector('.rs-step > p')).fontSize};
    }''')


sizes = [(1916,680),(1532,544),(1440,900),(1366,600),(1024,600),(800,600),(768,500),
         (650,480),(480,640),(360,480),(320,480),(600,300),(400,300),(320,300)]
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'), headless=True, args=['--no-sandbox'])
    for width,height in sizes:
        page = browser.new_page(viewport={'width':width,'height':height})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        mount(page)
        g = geometry(page)
        assert g['documentWidth'] <= width + 1 and g['documentHeight'] <= height + 1, g
        assert g['contentScrollWidth'] <= g['contentWidth'] + 1, g
        assert float(g['bodyFont'].removesuffix('px')) >= 12, g
        if width >= 1300 and height >= 544:
            assert g['steps']['bottom'] <= height, ('Evidence cards below the fold', g)
        if (width,height) in [(1916,680),(1532,544),(480,640),(320,480)]:
            page.screenshot(path=str(OUT/f'layout-{width}x{height}.png'))
        # Scroll to the end, then click a stage by real screen coordinates.
        page.locator('.rs-content').evaluate('e=>e.scrollTop=e.scrollHeight')
        page.locator('.rs-root').evaluate('e=>e.scrollTop=e.scrollHeight')
        center_click(page, '.rs-step[data-inspect="response"]')
        assert page.locator('#request-details').is_visible()
        assert page.locator('#tab-response').is_visible()
        assert 'Authentication is required' in page.locator('#details-response-body').text_content()
        center_click(page, '#close-details')
        if not page.locator('.rs-rail').is_visible():
            center_click(page, '[data-action="picker"]')
        center_click(page, '.rs-endpoint:last-child')
        assert '/items/' in page.locator('.rs-story-header').inner_text()
        # Resize while scrolled; controls still resolve to the same request.
        page.set_viewport_size({'width':width+19,'height':height+13})
        center_click(page, '.rs-step[data-inspect="request"]')
        assert page.locator('#tab-request').is_visible()
        center_click(page, '#close-details')
        # Incoming traffic must not replace the story while reading it.
        assert page.evaluate('''() => {window.oldStory=document.querySelector('.rs-story');qaEmit(99);return oldStory===document.querySelector('.rs-story');}''')
        # Sampling remains reachable even when chrome must scroll away.
        center_click(page, '.rs-header [data-action="example"]')
        assert page.locator('.rs-example-banner').is_visible()
        center_click(page, '[data-action="live"]')
        assert not page.locator('.rs-example-banner').is_visible()
        assert not errors, errors
        results.append({'size':f'{width}x{height}','geometry':g,'scroll_resize_clicks':'pass','sample_controls':'pass','errors':errors})
        print('PASS',width,height,flush=True)
        page.close()
    # Simulated CSS zoom supplements effective viewport tests above. This is
    # not a claim that Playwright changed Chrome's actual DevTools zoom setting.
    for zoom in [1.25,2]:
        page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=2)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        mount(page)
        page.evaluate('z=>{const a=document.querySelector(".app");a.style.zoom=z;a.style.width=(100/z)+"vw";a.style.height=(100/z)+"dvh"}',zoom)
        center_click(page,'.rs-step[data-inspect="response"]')
        assert page.locator('#tab-response').is_visible()
        center_click(page,'#close-details')
        center_click(page,'.rs-header [data-action="example"]')
        center_click(page,'[data-action="live"]')
        assert not errors, errors
        results.append({'css_zoom':zoom,'device_scale_factor':2,'clicks':'pass','errors':errors})
        page.close()
    browser.close()
(OUT/'layout-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print('Saved results:',OUT)
