"""Notify IndexNow for changed public pages only; never submit private URLs."""
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "https://petruandines.com"
HOST = "petruandines.com"
KEY = "27d2ad93a7f04a799f2ca681b23461c3"
KEY_URL = BASE + "/" + KEY + ".txt"
OFFERS = [BASE + p for p in ("/oferte/", "/noiembrie-casa-luna/", "/decembrie-luna-zero/")]
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
HEAD = os.environ.get("AFTER_SHA", "HEAD")
DEPLOY_RUN = os.environ.get("DEPLOY_RUN_ID", "")
SCOPE = os.environ.get("SUBMIT_SCOPE", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GH_TOKEN", "")

def git(*args):
    return subprocess.check_output(["git", *args], text=True, stderr=subprocess.DEVNULL)

def sitemap(data):
    urls = set()
    for elem in ET.fromstring(data).findall("s:url/s:loc", NS):
        url = (elem.text or "").strip()
        p = urllib.parse.urlsplit(url)
        if p.scheme == "https" and p.netloc == HOST and not p.query and not p.fragment:
            urls.add(url)
    return urls

def public_file(url):
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path).lstrip("/")
    return (path + "index.html") if not path or path.endswith("/") else path

def request(url, method="GET", data=None, extra=None):
    headers = {"User-Agent": "PetruAndInes-IndexNow/1.0", "Cache-Control": "no-cache"}
    headers.update(extra or {})
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError) as e:
        print("Network error:", str(e))
        return 0, b""

def successful_deployments():
    if not REPO or not TOKEN:
        raise SystemExit("GitHub read-only Actions access is required.")
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/cloudflare-migration.yml/runs?" + urllib.parse.urlencode({"branch": "main", "status": "success", "per_page": 100})
    status, body = request(url, extra={"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    if status != 200:
        raise SystemExit(f"Cannot verify Cloudflare workflow history: HTTP {status}")
    return json.loads(body)["workflow_runs"]

def previous_deployment():
    runs = successful_deployments()
    if DEPLOY_RUN:
        current = next((x for x in runs if str(x["id"]) == DEPLOY_RUN and x["head_sha"] == HEAD), None)
    else:
        current = next((x for x in runs if x["head_sha"] == HEAD), None)
    if not current:
        raise SystemExit("No successful Cloudflare deployment found for this revision. Run after publication.")
    print("Cloudflare publication verified:", current["id"], HEAD)
    prior = next((x for x in runs if x["run_number"] < current["run_number"]), None)
    return prior["head_sha"] if prior else ""

def main():
    current = sitemap(Path("sitemap.xml").read_bytes())
    before = previous_deployment()
    old = set()
    changed = set()
    if before:
        try:
            old = sitemap(git("show", before + ":sitemap.xml"))
            changed = set(git("diff", "--name-only", "--no-renames", before, HEAD).splitlines())
        except (subprocess.CalledProcessError, ET.ParseError):
            print("Previous public revision unavailable; limiting initial submission to campaign URLs.")
    if SCOPE == "all":
        selected = current
    elif SCOPE == "offers":
        selected = set(OFFERS) & current
    else:
        selected = {url for url in current | old if public_file(url) in changed} | ((current ^ old) if old else set())
        if not old or ".github/workflows/indexnow.yml" in changed or "scripts/indexnow.py" in changed:
            selected |= set(OFFERS) & current
    # Never notify private portal routes or URLs outside the canonical site.
    selected = {u for u in selected if not urllib.parse.urlsplit(u).path.startswith(("/portal/", "/portal-v2-"))}
    if not selected:
        print("No changed public pages to notify.")
        return
    print("URLs selected:", *sorted(selected), sep="\n")
    deadline = time.monotonic() + 180
    pending = set(selected)
    key_ok = False
    while time.monotonic() < deadline:
        status, body = request(KEY_URL)
        key_ok = status == 200 and body.decode("utf-8", errors="replace").strip() == KEY
        print(f"Verification key: HTTP {status}; valid={key_ok}")
        if key_ok:
            for url in sorted(pending):
                status, body = request(url)
                print(f"Public URL check: HTTP {status} {url}")
                if (url in current and status == 200 and body) or (url not in current and status in (200, 404, 410)):
                    pending.remove(url)
        if key_ok and not pending:
            break
        time.sleep(15)
    if not key_ok:
        raise SystemExit("IndexNow verification file is not publicly readable. No URLs submitted.")
    ready = selected - pending
    if ready:
        payload = json.dumps({"host": HOST, "key": KEY, "keyLocation": KEY_URL, "urlList": sorted(ready)}).encode()
        status, body = request("https://api.indexnow.org/indexnow", "POST", payload, {"Content-Type": "application/json; charset=utf-8"})
        print("IndexNow HTTP:", status, body.decode(errors="replace")[:500])
        if status not in (200, 202):
            raise SystemExit("IndexNow did not accept the request.")
        print("Notification accepted for", len(ready), "URL(s). Indexing itself is not guaranteed.")
    if pending:
        raise SystemExit("Public URLs not confirmed: " + ", ".join(sorted(pending)) + ". Run manually after publication.")

if __name__ == "__main__":
    main()
