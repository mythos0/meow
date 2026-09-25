// music-launcher.js — v3.15 "hey cat, play music <title>" executor.
//
// Flow: YouTube search → first result's videoId → open it in BRAVE (the
// user's preferred browser) as a NEW window; if Brave is not installed fall
// back to the default browser. Watch pages autoplay on open, so the first
// result really starts playing — and the existing music watcher (SMTC) sees
// the playback and makes the cat bop along.
//
// The YouTube fetch is a plain server-side GET of the results page: the
// first "videoRenderer" videoId in the HTML is the first organic result.
// Everything is seam-injected (fetchFn / spawnFn / existsFn) so tests run
// with zero network and zero processes.

'use strict';
import path from 'path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export function buildSearchUrl(q) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}

export function buildWatchUrl(id) {
  return 'https://www.youtube.com/watch?v=' + id + '&autoplay=1';
}

// the first organic result wins (videoRenderer; ads live in other shapes)
export function extractFirstVideoId(html) {
  const s = String(html || '');
  const m = s.match(/"videoRenderer":\s*\{"videoId":"([A-Za-z0-9_-]{11})"/);
  if (m) return m[1];
  const m2 = s.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
  return m2 ? m2[1] : null;
}

// Brave, preferred: per-user install first, then machine-wide. Returns the
// exe path or null (→ default browser).
export function braveCandidates(env) {
  const e = env || process.env;
  const out = [];
  if (e.LOCALAPPDATA) out.push(path.join(e.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  if (e.ProgramFiles) out.push(path.join(e.ProgramFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  if (e['ProgramFiles(x86)']) out.push(path.join(e['ProgramFiles(x86)'], 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  return out.filter(Boolean);
}

export function createMusicLauncher(opts = {}) {
  const spawnFn = opts.spawnFn || (() => {});
  const fetchFn = opts.fetchFn || (async () => null);
  const existsFn = opts.existsFn || (() => false);
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;

  async function resolveFirstVideo(q) {
    try {
      const res = await fetchFn(buildSearchUrl(q), {
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      });
      const html = res && (typeof res.text === 'function' ? await res.text() : String(res.body || ''));
      return extractFirstVideoId(html);
    } catch { return null; }
  }

  return {
    // returns { ok, browser, url, videoId } — never throws
    async play(query) {
      const q = String(query || '').trim().slice(0, 120);
      if (!q) return { ok: false, reason: 'empty-query' };
      const vid = await resolveFirstVideo(q);
      const url = vid ? buildWatchUrl(vid) : buildSearchUrl(q);
      let browser = 'default';
      if (platform === 'win32') {
        const brave = braveCandidates(env).find(p => { try { return existsFn(p); } catch { return false; } });
        if (brave) {
          browser = 'brave';
          try { spawnFn(brave, ['--new-window', url]); } catch { /* cosmetic */ }
        } else {
          try { spawnFn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }); } catch { /* cosmetic */ }
        }
      } else {
        // non-Windows (dev/test): xdg-open or the injected spawnFn
        try { spawnFn(platform === 'darwin' ? 'open' : 'xdg-open', [url]); } catch { /* cosmetic */ }
      }
      return { ok: true, browser, url, videoId: vid };
    },
  };
}
