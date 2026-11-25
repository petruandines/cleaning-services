"""Notify IndexNow for changed public pages only; never submit private URLs."""
import json
import os
import re
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
BEFORE = os.environ.get("BEFORE_SHA", "")
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

def deployment_ready():
    if not REPO or not TOKEN:
        return False
    url = f"https://api.github.com/repos/{REPO}/deployments?" + urllib.parse.urlencode({"sha": HEAD, "environment": "github-pages", "per_page": 10})
    headers = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    status, body = request(url, extra=headers)
    if status != 200:
        return False
    try:
        deployments = json.loads(body)
        for dep in deployments:
            status, body = request(f"https://api.github.com/repos/{REPO}/deployments/{dep['id']}/statuses?per_page=1", extra=headers)
            if status == 200 and any(x.get("state") == "success" for x in json.loads(body)):
                return True
    except (ValueError, KeyError, TypeError):
        return False
    return False

def normalize_html(data):
    # Ignore whitespace and the project base path rewritten by the CDN.
    s = data.decode("utf-8", errors="replace")
    s = s.replace("/cleaning-services/", "/")
    return re.sub(r"\s+", " ", s).strip()

def main():
    current = sitemap(Path("sitemap.xml").read_bytes())
    old = set()
    changed = set()
    if BEFORE and set(BEFORE) != {"0"}:
        try:
            old = sitemap(git("show", BEFORE + ":sitemap.xml"))
            changed = set(git("diff", "--name-only", "--no-renames", BEFORE, HEAD).splitlines())
        except subprocess.CalledProcessError:
            print("Previous revision unavailable; use manual workflow to submit offers.")
    if SCOPE == "all":
        selected = current
    elif SCOPE == "offers":
        selected = set(OFFERS) & current
    else:
        selected = {url for url in current | old if public_file(url) in changed} | (current ^ old)
        if ".github/workflows/indexnow.yml" in changed or "scripts/indexnow.py" in changed:
            selected |= set(OFFERS) & current
    if not selected:
        print("No changed public pages to notify.")
        return
    print("URLs selected:", *sorted(selected), sep="\n")
    # GitHub Pages can finish deploying after the push event.
    time.sleep(45)
    deadline = time.monotonic() + 600
    pending = set(selected)
    key_ok = False
    while time.monotonic() < deadline:
        status, body = request(KEY_URL)
        key_ok = status == 200 and body.decode("utf-8", errors="replace").strip() == KEY
        deployed = deployment_ready() if key_ok else False
        if key_ok:
            for url in sorted(pending):
                status, body = request(url)
                if url not in current:
                    if status in (404, 410) or deployed and status in (200, 301, 302, 308):
                        pending.remove(url)
                    continue
                if status != 200:
                    continue
                file = Path(public_file(url))
                matches = file.is_file() and normalize_html(body) == normalize_html(file.read_bytes())
                if deployed or matches:
                    pending.remove(url)
        if key_ok and not pending:
            break
        print("Awaiting public deployment; pending:", len(pending), "key verified:", key_ok)
        time.sleep(25)
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
        raise SystemExit("Public update could not be confirmed for: " + ", ".join(sorted(pending)) + ". Run manually after deployment.")

if __name__ == "__main__":
    main()
