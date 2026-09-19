#!/usr/bin/env python3
"""Fetch real cat sounds from open sources (BBC Rewind SFX, myinstants, archive.org).
Convert to 16-bit 44.1kHz mono WAV for MeowCat v2.0.0."""
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

OUT = "/home/z/my-project/meow/src/MeowCat/Assets/sounds"
TMP = "/home/z/my-project/meow/art_raw/sounds"
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) MeowCatAssetFetcher/2.0"

WANT = {
    "meow_real.wav":  (["cat meow", "kitten meow", "meow", "cat meowing"], 2.6),
    "purr_real.wav":  (["cat purr", "purring", "cat purring"], 3.5),
    "hiss_real.wav":  (["cat hiss", "hiss", "cat snarl"], 1.8),
    "growl_real.wav": (["cat growl", "angry cat", "cat angry"], 2.5),
    "glass_real.wav": (["glass breaking", "glass shatter", "glass smash", "broken glass"], 2.2),
}


def http_get(url, timeout=30, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def dl(url, path, timeout=90):
    data = http_get(url, timeout=timeout, binary=True)
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


# ---------------------------------------------------------------- sources
def bbc_candidates(query):
    """BBC Rewind sound effects open API."""
    try:
        u = ("https://sound-effects-api.bbcrewind.co.uk/api/sfx/v1/search?q="
             + urllib.parse.quote(query) + "&size=8&page=1")
        data = json.loads(http_get(u))
        out = []
        for r in data.get("results", []):
            try:
                audio = r.get("assets", {}).get("audio", {})
                mp3s = audio.get("mp3") if isinstance(audio, dict) else None
                if isinstance(mp3s, list) and mp3s:
                    out.append("https://sound-effects-media.bbcrewind.co.uk/mp3/" + mp3s[0])
                elif isinstance(mp3s, str):
                    out.append("https://sound-effects-media.bbcrewind.co.uk/mp3/" + mp3s)
            except Exception:
                continue
        return out
    except Exception as e:
        print(f"    bbc fail: {e}")
        return []


def myinstants_candidates(query):
    try:
        u = "https://www.myinstants.com/en/search/?name=" + urllib.parse.quote(query)
        html = http_get(u)
        return ["https://www.myinstants.com" + m
                for m in re.findall(r'/media/sounds/[^"\']+\.mp3', html)][:8]
    except Exception as e:
        print(f"    myinstants fail: {e}")
        return []


def archive_candidates(query):
    try:
        u = ("https://archive.org/advancedsearch.php?q=" + urllib.parse.quote(query + " AND mediatype:audio")
             + "&fl%5B%5D=identifier&rows=6&output=json")
        data = json.loads(http_get(u))
        out = []
        for doc in data.get("response", {}).get("docs", []):
            ident = doc["identifier"]
            try:
                meta = json.loads(http_get("https://archive.org/metadata/" + ident))
                for f in meta.get("files", []):
                    name = f.get("name", "")
                    if name.lower().endswith((".mp3", ".ogg", ".wav", ".flac")):
                        out.append("https://archive.org/download/" + ident + "/" + urllib.parse.quote(name))
            except Exception:
                continue
        return out[:6]
    except Exception as e:
        print(f"    archive fail: {e}")
        return []


def wikimedia_candidates(query):
    """Last resort: commons API with generous pacing."""
    try:
        u = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search"
             "&srnamespace=6&srlimit=8&srsearch=" + urllib.parse.quote(query + " filetype:audio"))
        data = json.loads(http_get(u, timeout=40))
        titles = [h["title"] for h in data.get("query", {}).get("search", [])]
        out = []
        for t in titles:
            try:
                u2 = ("https://commons.wikimedia.org/w/api.php?action=query&format=json"
                      "&prop=imageinfo&iiprop=url&titles=" + urllib.parse.quote(t))
                d2 = json.loads(http_get(u2, timeout=40))
                for p in d2.get("query", {}).get("pages", {}).values():
                    for ii in p.get("imageinfo", []):
                        out.append(ii["url"])
            except Exception:
                continue
        return out
    except Exception as e:
        print(f"    wikimedia fail: {e}")
        return []


# ---------------------------------------------------------------- audio utils
def ffprobe_dur(path):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                        "-of", "json", path], capture_output=True, text=True)
    try:
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 0.0


def convert(src, dst, max_sec):
    d = min(max_sec, ffprobe_dur(src))
    if d < 0.25:
        return False
    cmd = ["ffmpeg", "-y", "-i", src, "-t", f"{d:.2f}",
           "-af", (f"loudnorm=I=-18:TP=-3,afade=t=in:st=0:d=0.02,"
                   f"afade=t=out:st={max(0.0, d - 0.15):.2f}:d=0.14"),
           "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 4000


def main():
    ok, fail = [], []
    for out_name, (queries, max_sec) in WANT.items():
        dst = os.path.join(OUT, out_name)
        if os.path.exists(dst) and os.path.getsize(dst) > 20000:
            print(f"skip {out_name} (exists)")
            ok.append(out_name)
            continue
        print(f"==> {out_name}")
        cands = []
        for q in queries:
            for src_fn in (bbc_candidates, myinstants_candidates, archive_candidates, wikimedia_candidates):
                c = src_fn(q)
                if c:
                    cands.extend(c)
                    if len(cands) >= 6:
                        break
            if len(cands) >= 6:
                break
        got = False
        for i, url in enumerate(cands):
            ext = os.path.splitext(urllib.parse.urlparse(url).path)[1][:5] or ".mp3"
            raw = os.path.join(TMP, f"{out_name}.{i}{ext}")
            try:
                n = dl(url, raw)
            except Exception as e:
                print(f"    dl fail {url[:80]}: {e}")
                continue
            if n < 6000:
                continue
            if ffprobe_dur(raw) < 0.25:
                continue
            if convert(raw, dst, max_sec):
                print(f"    OK <- {url[:90]}")
                got = True
                break
        (ok if got else fail).append(out_name)
    print("\nDONE ok=%s fail=%s" % (ok, fail))
    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
