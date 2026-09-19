#!/usr/bin/env python3
"""Download real cat sounds (meow / purr / hiss / growl / glass break) from Wikimedia
Commons and convert them to 16-bit 44.1kHz WAV for MeowCat v2.0.0."""
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

OUT = "/home/z/my-project/meow/src/MeowCat/Assets/sounds"
TMP = "/home/z/my-project/meow/art_raw/sounds"
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

UA = "MeowCatAssetFetcher/2.0 (desktop pet app build script)"
API = "https://commons.wikimedia.org/w/api.php"

# target output -> list of (search terms, prefer mime, max seconds)
WANT = {
    "meow_real.wav":  (["cat meow", "kitten meow", "meow"], 2.6),
    "purr_real.wav":  (["cat purr", "purring cat"], 3.5),
    "hiss_real.wav":  (["cat hiss", "cat snarl"], 1.8),
    "growl_real.wav": (["cat growl", "angry cat", "cat growling"], 2.5),
    "glass_real.wav": (["glass breaking", "glass shatter", "broken glass"], 2.2),
}


def api(params):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def search_files(terms, limit=12):
    found = []
    for t in terms:
        try:
            data = api({"action": "query", "list": "search", "srnamespace": 6,
                        "srlimit": limit, "srsearch": f"{t} filetype:audio"})
        except Exception as e:
            print(f"  search failed for {t!r}: {e}")
            continue
        for hit in data.get("query", {}).get("search", []):
            title = hit["title"]
            if not title.lower().startswith("file:"):
                continue
            low = title.lower()
            if any(ext in low for ext in (".ogg", ".oga", ".wav", ".flac", ".mp3", ".opus")):
                found.append(title)
    return found


def file_url(title):
    data = api({"action": "query", "prop": "imageinfo", "iiprop": "url|size|mime",
                "titles": title})
    pages = data.get("query", {}).get("pages", {})
    for p in pages.values():
        for ii in p.get("imageinfo", []):
            return ii.get("url"), ii.get("mime", ""), ii.get("size", 0)
    return None, None, 0


def dl(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            f.write(chunk)


def convert(src, dst, max_sec):
    """ffmpeg: mono, 44.1k, s16, trimmed, gentle fades, loudness-normalized-ish."""
    cmd = ["ffmpeg", "-y", "-i", src, "-t", str(max_sec),
           "-af", "afade=t=in:st=0:d=0.02,afade=t=out:st=%.2f:d=0.12" % max(0, max_sec - 0.13),
           "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 4000


def ffprobe_dur(path):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                        "-of", "json", path], capture_output=True, text=True)
    try:
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 0.0


def main():
    ok, fail = [], []
    for out_name, (terms, max_sec) in WANT.items():
        dst = os.path.join(OUT, out_name)
        if os.path.exists(dst) and os.path.getsize(dst) > 20000:
            print(f"skip {out_name} (exists)")
            ok.append(out_name)
            continue
        print(f"==> {out_name}")
        candidates = search_files(terms)
        got = False
        for title in candidates:
            try:
                url, mime, size = file_url(title)
            except Exception as e:
                print(f"  info failed {title}: {e}")
                continue
            if not url or size > 4_000_000:
                continue
            ext = os.path.splitext(urllib.parse.urlparse(url).path)[1] or ".ogg"
            raw = os.path.join(TMP, "raw_" + title.replace(":", "_").replace("/", "_").replace(" ", "_") + ext)
            try:
                dl(url, raw)
            except Exception as e:
                print(f"  dl failed {title}: {e}")
                continue
            if os.path.getsize(raw) < 8000:
                continue
            dur = ffprobe_dur(raw)
            if dur < 0.25 or dur > 30:
                continue
            if convert(raw, dst, min(max_sec, dur)):
                print(f"  OK {title} ({dur:.1f}s) -> {out_name} ({os.path.getsize(dst)//1024} KB)")
                got = True
                break
        (ok if got else fail).append(out_name)
    print("\nDONE ok=%s fail=%s" % (ok, fail))
    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
