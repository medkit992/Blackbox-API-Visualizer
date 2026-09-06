"""Production-panel regression with mocked DevTools APIs, not installed-extension acceptance.

npm ci && npm run build
python -m pip install playwright
python -m playwright install chromium
python tests/browser/workspace.browser.py

CHROMIUM_PATH can select system Chromium. WORKSPACE_QA_OUTPUT selects an output
folder for screenshots/results. The fixture only serves the local dist/ bundle.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

BASE = Path(__file__).resolve().parents[2]
DIST = BASE / "dist"
OUT = Path(os.environ.get("WORKSPACE_QA_OUTPUT", tempfile.mkdtemp(prefix="blackbox-workspace-")))
OUT.mkdir(parents=True, exist_ok=True)
assert (DIST / "src/panel/panel.html").is_file(), "Run npm run build first"
MOCK = (BASE / "tests/browser/workspace-fixture.js").read_text(encoding="utf-8")

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(DIST)))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_port}/src/panel/panel.html"
results, errors = [], []

def check_bounds(page):
    sizes = page.evaluate("""() => ({width: innerWidth, height: innerHeight, docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, area: document.querySelector('.workspace').getBoundingClientRect().height})""")
    assert sizes["docWidth"] <= sizes["width"] + 1, sizes
    assert sizes["docHeight"] <= sizes["height"] + 1, sizes
    assert sizes["area"] > 90, sizes
    visible = page.locator(".workspace > section:visible")
    assert visible.count() == 1, visible.count()
    box = visible.bounding_box()
    assert box and box["width"] >= sizes["width"] - 2, box

def primary(page, view):
    page.locator(f'#view-switch [data-view="{view}"]').click()

def tab(page, name):
    page.locator(f'.details-tabs [data-tab="{name}"]').click()
    expect(page.locator(f'#tab-{name}')).to_be_visible()

def first_request(page):
    primary(page, "requests")
    page.locator("#request-search").fill("")
    page.locator('[data-category="All"]').click()
    page.locator(".request-open-button").first.click()
    expect(page.locator("#request-details")).to_be_visible()

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"), headless=True, args=["--no-sandbox"])
        def mount(width=1440, height=1000):
            page = browser.new_page(viewport={"width": width, "height": height})
            page.add_init_script(MOCK)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(f"http://127.0.0.1:{server.server_port}/") else route.abort())
            page.goto(URL)
            expect(page.locator("#dashboard-panel")).to_be_visible()
            page.evaluate("qa.emit({path:'/books/one'}); qa.emit({path:'/private',status:401}); qa.emit({path:'/search',duration:1600}); qa.emit({path:'/books/two'})")
            expect(page.locator("#request-count")).to_have_text("4")
            return page

        for width, height in [(1440,1000), (1024,768), (430,850), (390,700), (320,300), (1000,380)]:
            print(f"Testing workspace {width}x{height}", flush=True)
            page = mount(width, height)
            check_bounds(page)
            page.screenshot(path=str(OUT / f"dashboard-{width}x{height}.png"))
            page.locator('[data-dashboard-filter="Errors"]').click()
            expect(page.locator("#request-panel")).to_be_visible()
            expect(page.locator("#request-list tr")).to_have_count(1)
            page.locator(".request-open-button").click()
            expect(page.locator("#details-status")).to_have_text("401")
            expect(page.locator("#close-details")).to_have_text("← Requests")
            expect(page.locator("#tab-overview")).to_be_visible()
            assert page.locator("#tab-overview .request-lifecycle").count() == 0
            assert page.locator("#tab-overview #request-diagnosis").count() == 0
            for destination in ["lifecycle", "diagnosis", "request", "response", "timing", "headers", "overview"]:
                tab(page, destination)
                check_bounds(page)
            tab(page, "lifecycle")
            page.locator('.lc-checkpoint[data-step="parse"]').click()
            expect(page.locator(".lc-detail")).to_contain_text("Not observed")
            page.screenshot(path=str(OUT / f"lifecycle-{width}x{height}.png"))
            page.locator("#close-details").click()
            expect(page.locator("#request-panel")).to_be_visible()
            expect(page.locator('[data-category="Errors"]')).to_have_attribute("aria-pressed", "true")
            # Primary navigation and Dashboard direct selection use their own origin.
            primary(page, "dashboard")
            page.locator(".dashboard-recent-row").first.click()
            expect(page.locator("#close-details")).to_have_text("← Dashboard")
            primary(page, "graph")
            expect(page.locator("#graph-panel")).to_be_visible()
            expect(page.locator("#request-details")).to_be_hidden()
            check_bounds(page)
            page.close()
            results.append({"viewport": f"{width}x{height}", "full_width_routes_and_tools": "pass"})

        page = mount()
        page.evaluate("qa.batch(503)")
        expect(page.locator("#request-count")).to_have_text("507")
        primary(page, "requests")
        expect(page.locator("#request-list tr")).to_have_count(200)
        page.locator("#request-page-next").click()
        expect(page.locator("#request-page-status")).to_contain_text("201–400")
        page.locator(".request-table-wrapper").evaluate("e => e.scrollTop = 800")
        opener = page.locator(".request-open-button").nth(30)
        opener.focus()
        expected_url = opener.get_attribute("title")
        before_top = page.locator(".request-table-wrapper").evaluate("e => e.scrollTop")
        opener.press("Enter")
        page.evaluate("window.oldRows=document.querySelector('#request-list').innerHTML; qa.batch(5)")
        page.wait_for_timeout(80)
        assert page.evaluate("oldRows === document.querySelector('#request-list').innerHTML")
        page.locator("#close-details").click()
        expect(page.locator("#request-page-status")).to_contain_text("201–400")
        assert abs(page.locator(".request-table-wrapper").evaluate("e => e.scrollTop") - before_top) <= 1
        assert page.evaluate("document.activeElement.title") == expected_url
        # Search/category persist through inspection and origin return.
        page.locator("#request-search").fill("GET /private 401")
        expect(page.locator("#request-list tr")).to_have_count(1)
        page.locator(".request-open-button").click()
        tab(page, "response")
        expect(page.locator("#response-tree .response-tree__row")).to_have_count(1)
        page.locator("#response-tree .response-tree__row").first.click()
        page.evaluate("window.savedTree=document.querySelector('#response-tree'); window.savedHtml=savedTree.innerHTML")
        tab(page, "lifecycle"); tab(page, "response")
        assert page.evaluate("savedTree === document.querySelector('#response-tree') && savedHtml === savedTree.innerHTML")
        page.locator("#response-view-raw").click(); tab(page, "headers"); tab(page, "response")
        expect(page.locator("#details-response-body")).to_be_visible()
        tab(page, "lifecycle")
        page.locator(".lc-examples").select_option("parse-error")
        page.locator('.lc-checkpoint[data-step="parse"]').click()
        page.evaluate("window.savedCheckpoint=document.querySelector('.lc-checkpoint[data-step=parse]')")
        tab(page, "overview"); tab(page, "lifecycle")
        expect(page.locator(".lc-examples")).to_have_value("parse-error")
        assert page.evaluate("savedCheckpoint === document.querySelector('.lc-checkpoint[data-step=parse]')")
        page.locator(".lc-examples").select_option("captured")
        page.locator('.lc-checkpoint[data-step="initiator"]').click(); page.locator(".lc-action").click()
        expect(page.locator("#tab-overview")).to_be_visible()
        assert page.evaluate("document.activeElement.id") == "details-source"
        tab(page, "lifecycle")
        page.locator('.lc-checkpoint[data-step="response"]').click()
        # An HTTP-error response checkpoint opens its diagnosis, not the Summary bucket.
        page.locator(".lc-action").click()
        expect(page.locator("#tab-diagnosis")).to_be_visible()
        tab(page, "overview")
        page.locator('[data-open-tab="diagnosis"]').click()
        expect(page.locator("#tab-diagnosis")).to_be_visible()
        # Roving tabs never trap keyboard navigation or reset response state.
        page.locator('[data-tab="overview"]').focus()
        page.keyboard.press("ArrowRight"); page.keyboard.press("Enter")
        expect(page.locator("#tab-lifecycle")).to_be_visible()
        page.keyboard.press("End"); page.keyboard.press("Space")
        expect(page.locator("#tab-headers")).to_be_visible()
        page.locator("#close-details").click()
        expect(page.locator("#request-search")).to_have_value("GET /private 401")
        results.append({"pagination_search_back_focus_scroll": "pass", "hidden_view_work": "pass", "tool_state_and_keyboard": "pass"})

        # Stories retains its own search, snapshot and inspector origin.
        primary(page, "graph")
        page.locator(".rs-search").fill("private")
        page.wait_for_timeout(160)
        page.locator(".rs-endpoint").first.click()
        page.locator('.rs-step[data-inspect="response"]').click()
        expect(page.locator("#close-details")).to_have_text("← Request Stories")
        expect(page.locator("#tab-response")).to_be_visible()
        page.evaluate("qa.emit({path:'/new-during-story'})")
        page.locator("#close-details").click()
        expect(page.locator(".rs-search")).to_have_value("private")
        expect(page.locator('[data-action="refresh"]')).to_contain_text("+1")
        assert page.evaluate("document.activeElement.dataset.inspect") == "response"
        results.append({"stories_origin_snapshot_and_focus": "pass"})

        # Reset and delayed response callbacks must never restore closed/cleared data.
        page.locator("#clear-requests").click()
        primary(page, "dashboard")
        page.evaluate("qa.emit({path:'/delayed',delay:true,body:'{\"secret\":\"late value\"}'})")
        page.locator(".dashboard-recent-row").first.click()
        tab(page, "response")
        expect(page.locator("#response-explorer-status")).to_contain_text("Loading")
        page.locator("#clear-requests").click()
        page.evaluate("qa.flush()")
        expect(page.locator("#request-details")).to_be_hidden()
        expect(page.locator("#request-count")).to_have_text("0")
        assert "late value" not in page.locator("#details-response-body").inner_text()
        # Pause then revoke/reaccept must not leave the local Pause toggle inverted.
        page.evaluate("qa.emit()")
        expect(page.locator("#request-count")).to_have_text("1")
        page.locator("#toggle-recording").click()
        page.evaluate("qa.emit()")
        expect(page.locator("#request-count")).to_have_text("1")
        page.locator("#privacy-settings").click(); page.locator("#consent-revoke").click()
        expect(page.locator("#toggle-recording")).to_be_disabled()
        page.evaluate("qa.emit(); qa.flush()")
        expect(page.locator("#request-count")).to_have_text("0")
        page.locator("#consent-accept").click()
        page.locator("#toggle-recording").click()
        expect(page.locator("#toggle-recording")).to_have_text("Resume")
        page.evaluate("qa.emit()")
        expect(page.locator("#request-count")).to_have_text("0")
        page.locator("#toggle-recording").click(); page.evaluate("qa.emit()")
        expect(page.locator("#request-count")).to_have_text("1")
        page.locator(".dashboard-recent-row").click()
        page.evaluate("qa.navigate()")
        expect(page.locator("#request-details")).to_be_hidden()
        expect(page.locator("#request-count")).to_have_text("0")
        results.append({"late_body_clear_navigation_revoke_pause": "pass"})

        # Escaped URL content cannot become UI markup.
        page.evaluate("qa.emit({path:'/literal/<img src=x onerror=alert(1)>'})")
        assert page.locator("#dashboard-recent-list img").count() == 0
        # CSS zoom is a hit-target simulation, not native browser/DevTools zoom.
        # Unlike a real browser zoom, it does not change the layout viewport.
        for zoom in [1.25, 2]:
            page.evaluate("z => {const app=document.querySelector('.app');app.style.zoom=z;app.style.width=(100/z)+'vw';app.style.height=(100/z)+'vh'}", zoom)
            page.locator(".dashboard-recent-row").click(); tab(page, "lifecycle")
            page.locator('.lc-checkpoint[data-step="response"]').click()
            expect(page.locator('.lc-checkpoint[data-step="response"]')).to_have_attribute("aria-pressed", "true")
            page.locator("#close-details").click()
        # Restore the actual viewport before independent forced-colors bounds.
        # Keeping synthetic CSS zoom here conflates two different test layouts.
        page.evaluate("() => {const app=document.querySelector('.app');for (const name of ['zoom','width','height']) app.style.removeProperty(name)}")
        page.emulate_media(reduced_motion="reduce", forced_colors="active")
        first_request(page); tab(page, "diagnosis"); check_bounds(page)
        results.append({"escaping_zoom_forced_colors": "pass"})
        page.close(); browser.close()
    assert not errors, errors
finally:
    server.shutdown()
    (OUT / "results.json").write_text(json.dumps({"results": results, "page_errors": errors}, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
print(f"Workspace browser outputs: {OUT}")
