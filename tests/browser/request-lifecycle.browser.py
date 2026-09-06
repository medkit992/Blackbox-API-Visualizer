"""Optional real-Chromium lifecycle regression fixture (no inspected-site traffic).

Install Python Playwright + Chromium, npm ci, then:
    python tests/browser/request-lifecycle.browser.py
CHROMIUM_PATH can select a system browser. No server, telemetry, or network access
is required by the fixture; all browser resources are fulfilled from local files.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/request-lifecycle.css">
<style>
*{box-sizing:border-box}body{margin:0;padding:10px;font:12px system-ui;background:#0b0d12;color:#e5e7eb}
main{width:min(100%,680px);margin:auto}#anchor{padding:12px;color:#a6afc2}
</style></head><body><main><section id="anchor">Existing Request Diagnosis</section></main>
<script type="module">
import {createRequestLifecycleView} from '/panel/request-lifecycle.js';
window.calls=[];
window.request={id:'a',category:'Fetch',method:'GET',status:200,duration:180,cached:false,
 responseBodyLoaded:true,responseBody:'{"results":[{"title":"Book"}]}',responseMimeType:'application/json',
 initiator:{type:'script'},raw:{timings:{send:1,wait:154,receive:25}}};
window.view=createRequestLifecycleView(document.querySelector('#anchor'), target=>window.calls.push(target));
window.view.render(window.request);
</script></body></html>"""

def main():
    with tempfile.TemporaryDirectory(prefix="blackbox-lifecycle-") as directory:
        output = Path(directory)
        compiler = ROOT / "node_modules/typescript/bin/tsc"
        command = ["node", str(compiler)] if compiler.exists() else [shutil.which("tsc") or "tsc"]
        subprocess.run(command + ["--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022",
            "--lib", "ES2022,DOM", "--strict", "--skipLibCheck", "--rootDir", "src", "--outDir", str(output),
            "src/panel/request-lifecycle.ts"], cwd=ROOT, check=True)
        with sync_playwright() as p:
            executable = os.environ.get("CHROMIUM_PATH")
            browser = p.chromium.launch(headless=True, **({"executable_path": executable} if executable else {}))
            context = browser.new_context(reduced_motion="reduce")
            errors = []
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            # Inline compiled modules into an isolated document: no localhost server,
            # route interception, or browser network permission is needed.
            model_js = (output / "network/requestLifecycle.js").read_text()
            view_js = (output / "panel/request-lifecycle.js").read_text()
            view_js = re.sub(r'import\s+\{[\s\S]*?\}\s+from\s+"\.\./network/requestLifecycle\.js";?', "", view_js, count=1)
            code = re.sub(r"^export (?=(?:function|const|let|class) )", "", model_js + "\n" + view_js, flags=re.M)
            bootstrap = HTML.split('<script type="module">', 1)[1].split('</script>', 1)[0]
            bootstrap = re.sub(r"import[^;]+;", "", bootstrap, count=1)
            markup = re.sub(r'<script[\s\S]*?</script>', '', HTML)
            markup = re.sub(r'<link[^>]+>', '', markup)
            page.set_content(markup)
            page.add_style_tag(content=(ROOT / "src/panel/request-lifecycle.css").read_text())
            page.add_script_tag(content="(() => {" + code + "\n" + bootstrap + "})()")
            page.wait_for_selector(".lc-checkpoint")
            for width, height in [(1440, 1000), (430, 850), (390, 700), (320, 300), (1000, 380)]:
                page.set_viewport_size({"width": width, "height": height})
                page.evaluate("window.scrollTo(0,0)")
                page.wait_for_timeout(40)
                bounds = page.evaluate("""() => ({
                    viewport: innerWidth, scroll: document.documentElement.scrollWidth,
                    root: document.querySelector('.request-lifecycle').getBoundingClientRect().width,
                    ring: getComputedStyle(document.querySelector('.lc-track')).display !== 'none'
                })""")
                assert bounds["scroll"] <= bounds["viewport"], (width, height, bounds)
                assert bounds["ring"] == (bounds["root"] >= 392 and height >= 620), bounds
                for index, label in enumerate(["Initiator", "Request", "Send", "Wait", "Response", "Parse", "Data ready", "Use data"]):
                    button = page.locator(".lc-checkpoint").nth(index)
                    button.click()
                    assert button.get_attribute("aria-pressed") == "true"
                    assert page.locator(".lc-step-title").inner_text() == label
                print(f"PASS {width}x{height}: layout, containment, all eight native hit targets")
            page.set_viewport_size({"width": 1440, "height": 1000})
            page.locator('[data-step="parse"]').click()
            page.evaluate("window.savedButton=document.querySelector('[data-step=\"parse\"]'); window.savedButton.focus(); window.request.responseBody='{\"updated\":true}'; window.view.render(window.request)")
            assert page.evaluate("window.savedButton===document.querySelector('[data-step=\"parse\"]') && document.activeElement===window.savedButton")
            assert page.locator('[data-step="parse"]').get_attribute("aria-pressed") == "true"
            print("PASS same-request response update preserves node identity, focus, and checkpoint")
            for key, title in [("success", "Lifecycle completed"), ("http-error", "HTTP error, valid JSON"), ("parse-error", "Failed at parsing")]:
                page.locator(".lc-examples").select_option(key)
                assert page.locator(".lc-mode").inner_text() == "Simulated example"
                assert page.locator(".lc-headline").inner_text() == title
                assert page.locator(".lc-action").is_hidden()
            page.evaluate("window.scrollTo(0,0)")
            screenshot_dir = os.environ.get("LIFECYCLE_SCREENSHOTS")
            if screenshot_dir:
                Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(Path(screenshot_dir) / "lifecycle-ring.png"), full_page=True)
            page.locator(".lc-examples").select_option("captured")
            assert page.locator(".lc-headline").inner_text() == "HTTP succeeded"
            assert page.locator('[data-step="parse"]').get_attribute("aria-pressed") == "true"
            page.locator('[data-step="response"]').click()
            page.locator(".lc-action").click()
            assert page.evaluate("window.calls") == ["response"]
            page.locator(".lc-examples").select_option("parse-error")
            page.evaluate("window.view.render({...window.request,id:'b',status:404})")
            assert page.locator(".lc-examples").input_value() == "captured"
            assert page.locator(".lc-headline").inner_text() == "HTTP error response"
            print("PASS isolated examples, real inspector action, and new-request restoration")
            # Untrusted strings must remain text, including malformed-body parser output.
            page.evaluate("window.view.render({...window.request,id:'unsafe',initiator:{type:'<img src=x onerror=alert(1)>'},responseBody:'{secret-token'})")
            page.locator('[data-step="initiator"]').click()
            assert page.locator(".request-lifecycle img").count() == 0
            assert "secret-token" not in page.locator(".request-lifecycle").inner_text()
            # Keyboard access is provided by the very same native buttons.
            page.locator('[data-step="wait"]').focus()
            page.keyboard.press("Enter")
            assert page.locator('[data-step="wait"]').get_attribute("aria-pressed") == "true"
            page.locator(".lc-toggle").click()
            assert page.locator(".lc-body").is_hidden()
            page.locator(".lc-toggle").click()
            assert page.locator(".lc-body").is_visible()
            page.emulate_media(forced_colors="active")
            assert page.locator('[data-step="wait"]').is_visible()
            page.emulate_media(forced_colors="none")
            if screenshot_dir:
                page.set_viewport_size({"width": 390, "height": 700})
                page.evaluate("window.view.render(window.request);window.scrollTo(0,0)")
                page.screenshot(path=str(Path(screenshot_dir) / "lifecycle-compact.png"), full_page=True)
            page.evaluate("window.view.reset()")
            assert page.locator(".request-lifecycle").is_hidden()
            assert page.locator(".lc-evidence").inner_text() == ""
            assert not errors, errors
            print("PASS escaping, keyboard, collapse, forced colors, clear/reset, no browser exceptions")
            browser.close()

if __name__ == "__main__":
    main()
