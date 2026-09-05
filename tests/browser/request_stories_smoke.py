"""Optional browser regression fixture; not an installed-extension end-to-end test.

Run from a checkout with `npm ci` completed:
  python -m pip install playwright
  python -m playwright install chromium
  python tests/browser/request_stories_smoke.py

Uses the actual story model/controller/CSS and simulated capture. No live network
requests or arbitrary page code are executed. Output is written outside the repo
unless STORY_QA_OUTPUT is supplied. Set CHROMIUM_EXECUTABLE to use system Chromium.
"""
from pathlib import Path
import re, json, time, os, subprocess, tempfile
from playwright.sync_api import sync_playwright
BASE=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('STORY_QA_OUTPUT', tempfile.mkdtemp(prefix='blackbox-story-qa-')))
OUT.mkdir(parents=True, exist_ok=True)
COMPILED=json.loads(subprocess.run(['node','--input-type=commonjs','-e',"const fs=require('node:fs'), ts=require('typescript');\nconst paths=['src/network/requestStory.ts','src/panel/request-stories.ts'];\nprocess.stdout.write(JSON.stringify(paths.map(p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)));"], cwd=BASE, text=True, encoding='utf-8', capture_output=True, check=True).stdout)
FIXTURE='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Blackbox Request Stories — QA harness</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0b111b;color:#eef3fa;font:12px system-ui}button{font:inherit} .app{display:flex;flex-direction:column} .topbar,.view-switch-bar{display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#111923;border-bottom:1px solid #283547;padding:8px 16px;min-height:38px}.topbar strong{letter-spacing:.02em}.topbar span{font-size:10px;color:#b0c5da}.view-switch-bar{justify-content:flex-start;gap:8px}.view-switch-bar button,.topbar button{padding:5px 10px;background:#1d2b3c;color:#c7daeb;border:1px solid #354a62;border-radius:5px}.view-switch-bar button:last-child{color:#a6e8d6;background:#18352f;border-color:#3e6b60}.workspace{display:grid;position:relative}.details-panel{background:#152538;padding:24px;overflow:auto}.details-panel[hidden]{display:none}</style><body><div class="app rs-active"><header class="topbar"><strong>Blackbox <span> / DevTools</span></strong><span>QA harness · simulated capture</span><div><button id="clear">Clear</button><button id="details-close">Close details</button></div></header><nav class="view-switch-bar"><button id="requests-view">Requests</button><button id="stories-view">Request stories</button></nav><main class="workspace"><section id="graph-panel" class="graph-panel"><div id="request-stories"></div></section><aside class="details-panel" id="request-details" hidden><h2 id="inspector-title"></h2><p id="inspector-status"></p></aside></main></div></body></html>\n'
HARNESS="let rows=[]; let inspected=[];\nconst root=document.querySelector('#request-stories');\nconst controller=createRequestStories(root,{\n getRequests:()=>rows,getPageUrl:()=> 'https://shop.example.test/',\n inspect:(id,tab)=>{inspected.push({id,tab});document.querySelector('#request-details').hidden=false;document.querySelector('#inspector-title').textContent=id;document.querySelector('#inspector-status').textContent=tab;},\n});\ncontroller.setVisible(true);\ndocument.querySelector('#clear').onclick=()=>{rows=[];controller.reset();};\ndocument.querySelector('#details-close').onclick=()=>document.querySelector('#request-details').hidden=true;\ndocument.querySelector('#requests-view').onclick=()=>{controller.setVisible(false);root.hidden=true;};\ndocument.querySelector('#stories-view').onclick=()=>{root.hidden=false;controller.setVisible(true);};\nwindow.qa={controller,samples:exampleRequests,setRows:(r)=>{rows=r;controller.update();},getRows:()=>rows,inspected};\n"
def bundled():
    parts=[]
    for text in [*COMPILED, HARNESS]:
        text=re.sub(r'^import\s.*?;\n','',text,flags=re.S|re.M)
        text=re.sub(r'^export\s+','',text,flags=re.M)
        parts.append(text)
    return '\n'.join(parts)
def markup():
    return FIXTURE.replace('<body>', '<style>'+(BASE/'src/panel/request-stories.css').read_text(encoding='utf-8')+'</style><body>')
def mount(page):
    page.set_content(markup()); page.add_script_tag(content=bundled())
def fill(page):
    page.evaluate('qa.setRows(qa.samples())')
    page.wait_for_selector('.rs-story')
def click_center(page, selector):
    node=page.locator(selector).first
    node.scroll_into_view_if_needed()
    box=node.bounding_box()
    assert box
    x=box['x']+box['width']/2; y=box['y']+box['height']/2
    hit=page.evaluate('([x,y])=>document.elementFromPoint(x,y)?.outerHTML',[x,y])
    if not node.evaluate('(button,[x,y])=>document.elementFromPoint(x,y)?.closest("button")===button',[x,y]):
        page.screenshot(path=str(OUT/'hit-failure.png'))
        raise AssertionError({'selector':selector,'box':box,'hit':hit,'viewport':page.viewport_size})
    page.mouse.click(x,y)
def choose(page, id):
    if not page.locator('.rs-rail').is_visible():
        page.locator('[data-action=picker]').click()
    click_center(page, f'.rs-endpoint[data-select="{id}"]')
def in_bounds(page):
    sizes=page.evaluate('({doc:document.documentElement.scrollWidth,view:innerWidth,root:document.querySelector(".rs-root").getBoundingClientRect().width,height:document.documentElement.scrollHeight,vh:innerHeight,content:document.querySelector(".rs-content").clientHeight})')
    assert sizes['doc']<=sizes['view']+1, sizes
    assert sizes['height']<=sizes['vh']+1, sizes
    assert sizes['content']>90,sizes
    return sizes
results=[]; all_errors=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),headless=True,args=['--no-sandbox'])
    for width,height in [(1440,900),(1024,768),(768,700),(480,800),(360,640),(320,480),(600,420)]:
        print('Testing',width,height,flush=True)
        page=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        mount(page); fill(page); sizes=in_bounds(page)
        choose(page,'example-search')
        assert page.locator('.rs-story').get_attribute('data-request-id')=='example-search'
        page.locator('.rs-content').evaluate('(e)=>e.scrollTop=e.scrollHeight')
        # Native click coordinates after scroll and a width/height change.
        page.set_viewport_size({'width':width+19,'height':height+13})
        click_center(page,'.rs-step[data-inspect=response]')
        assert page.evaluate('qa.inspected.at(-1).id')=='example-search'
        assert page.evaluate('qa.inspected.at(-1).tab')=='response'
        page.locator('#details-close').click()
        choose(page,'example-catalog')
        assert page.locator('.rs-relation').count()==1
        click_center(page,'.rs-relation')
        assert page.locator('.rs-story').get_attribute('data-request-id')=='example-image'
        in_bounds(page)
        assert not errors,errors
        results.append({'viewport':f'{width}x{height}','resize_scroll_hit_targets':'pass','relations':'pass','containment':'pass'})
        all_errors.extend(errors); page.close()
    # Density/zoom: no canvas-space assumptions at non-default CSS zoom / pixel ratio.
    for zoom,scale in [(1.25,1),(2,2)]:
        page=b.new_page(viewport={'width':1280,'height':900},device_scale_factor=scale)
        page.on('pageerror',lambda e:all_errors.append(str(e)))
        mount(page);fill(page)
        page.evaluate('(z)=>{const a=document.querySelector(".app");a.style.zoom=z;a.style.width=(100/z)+"vw";a.style.height=(100/z)+"dvh"}',zoom)
        choose(page,'example-catalog');click_center(page,'.rs-step[data-inspect=response]')
        assert page.evaluate('qa.inspected.at(-1).id')=='example-catalog'
        results.append({'zoom':zoom,'device_scale_factor':scale,'hit_targets':'pass'})
        page.close()
    page=b.new_page(viewport={'width':1440,'height':1050})
    page.on('pageerror',lambda e:all_errors.append(str(e)))
    mount(page);fill(page)
    # Incoming traffic never replaces the selected story DOM underneath the pointer.
    page.evaluate('window.oldStory=document.querySelector(".rs-story");qa.setRows([...qa.getRows(),...qa.samples().map(r=>({...r,id:r.id+"-new"}))])')
    page.wait_for_timeout(80)
    assert page.evaluate('window.oldStory===document.querySelector(".rs-story")')
    assert '+7 calls' in page.locator('[data-action=refresh]').inner_text()
    # Hidden view has no DOM work. Re-enter keeps the snapshot until explicit refresh.
    page.locator('#requests-view').click()
    before=page.locator('.rs-root').inner_html()
    page.evaluate('qa.setRows([...qa.getRows(),...qa.samples().map(r=>({...r,id:r.id+"-hidden"}))])')
    page.wait_for_timeout(80);assert before==page.locator('.rs-root').inner_html()
    page.locator('#stories-view').click()
    # Keyboard activation and sample isolation / restoration.
    choose(page,'example-catalog')
    original=page.evaluate('qa.getRows().length')
    page.locator('.rs-header [data-action=example]').focus();page.keyboard.press('Enter')
    assert page.locator('.rs-example-banner').is_visible()
    assert page.evaluate('qa.getRows().length')==original
    page.locator('[data-action=live]').click()
    assert page.locator('.rs-story').get_attribute('data-request-id')=='example-catalog'
    # Search never destroys input focus.
    page.locator('.rs-search').fill('missing')
    page.wait_for_timeout(180)
    assert page.evaluate('document.activeElement.classList.contains("rs-search")')
    assert page.locator('.rs-picker-empty').is_visible()
    page.locator('[data-action=reset-filters]').first.click()
    # Simulated HTML payloads must remain inert text.
    page.locator('#clear').click()
    page.evaluate('qa.setRows([{...qa.samples()[0],id:"unsafe",path:"/<img src=x onerror=alert(1)>",host:"<svg/onload=alert(1)>",initiator:{type:"script",url:"https://user:secret@app.test/app.js?token=secret"}}])')
    page.wait_for_selector('.rs-story')
    assert page.locator('.rs-root img').count()==0
    assert 'secret' not in page.locator('.rs-story').inner_text()
    assert '<img src=x onerror=alert(1)>' in page.locator('.rs-story-header').inner_text()
    results.append({'snapshot_stability':'pass','hidden_view':'pass','keyboard':'pass','example_isolation':'pass','search_focus':'pass','escaped_content':'pass'})
    # 50k capture / 5k analytical window with CPU throttling; not a real device benchmark.
    page.locator('#clear').click();session=page.context.new_cdp_session(page)
    session.send('Emulation.setCPUThrottlingRate',{'rate':4})
    page.evaluate('qa.setRows(Array.from({length:50000},(_,i)=>({...qa.samples()[0],id:"load-"+i,path:"/products/"+i,url:"https://api.test/products/"+i})))')
    page.wait_for_selector('.rs-story',timeout=15000)
    assert page.locator('.rs-endpoint').count()==40
    assert '45,000 older' in page.locator('.rs-snapshot-status').inner_text()
    start=time.perf_counter();page.locator('[data-action=refresh]').click();duration=(time.perf_counter()-start)*1000
    results.append({'captured_rows':50000,'analysis_window':5000,'visible_endpoints':40,'cpu_throttle':4,'refresh_click_roundtrip_ms':round(duration)})
    session.send('Emulation.setCPUThrottlingRate',{'rate':1})
    page.locator('#clear').click();assert page.locator('.rs-story').count()==0
    page.screenshot(path=str(OUT/'empty-wide.png'))
    page.locator('.rs-header [data-action=example]').click()
    page.screenshot(path=str(OUT/'story-wide.png'))
    choose(page,'example-catalog')
    page.screenshot(path=str(OUT/'story-data-wide.png'))
    page.set_viewport_size({'width':390,'height':844})
    page.locator('.rs-content').evaluate('(e)=>e.scrollTop=0')
    page.screenshot(path=str(OUT/'story-narrow.png'))
    page.locator('.rs-content').evaluate('(e)=>e.scrollTop=620')
    page.screenshot(path=str(OUT/'story-narrow-evidence.png'))
    page.close();b.close()
assert not all_errors,all_errors
(OUT/'browser-results.json').write_text(json.dumps({'results':results,'page_errors':all_errors},indent=2))
print(json.dumps(results,indent=2))

print(f'Browser fixture outputs: {OUT}')
