// voice-listener.js — v3.16 offline SAPI fallback engine (Windows).
//
// v3.15 shipped ONE engine: this SAPI listener. On real user machines it
// failed SILENTLY in three ways: (a) a non-English Windows has no default
// en-US recognizer, so the en-US GrammarBuilder grammar never loaded — but
// $ErrorActionPreference='SilentlyContinue' swallowed it and the script
// printed ready:true while recognizing NOTHING; (b) the default
// SpeechRecognitionEngine() constructor binds whatever recognizer the system
// locale suggests, which can mismatch the grammar culture; (c) non-ASCII
// transcripts were mangled by the OEM console codepage.
//
// v3.16 fixes all three: recognizers are ENUMERATED and an en-* one is
// picked explicitly (grammar culture = picked culture), a failed grammar
// load is REPORTED as {"error":"grammar-failed"} instead of being
// swallowed, stdout is forced UTF-8, and a diagnostic
// {"status":"listening","recognizer":…,"culture":…} line tells the
// Settings page exactly what is running. This engine is now the FALLBACK —
// the primary engine is Chromium's Web Speech API in windows/voice.html
// (cloud-quality recognition, far better with accents, cross-platform).
//
// The grammar is deliberately command-shaped: (wake word / control phrases)
// followed by free dictation so the song title rides along:
//   "hey cat play music ghum kariya nilo sokhi"
// The raw text ALWAYS goes to the pure parser (voice.js) — the grammar only
// gates what gets transcribed, the parser decides what it means.
//
// The manager NEVER throws: a broken mic degrades the voice feature, never
// the app (same contract as typing-hook.js).

'use strict';

export const VOICE_SCRIPT = `
$ErrorActionPreference = 'Stop'
function Emit($o) { try { [Console]::Out.WriteLine((ConvertTo-Json $o -Compress)) } catch { } }
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { Add-Type -AssemblyName System.Speech } catch { Emit @{error='no-sapi'}; exit 0 }

# v3.16: ENUMERATE the installed recognizers and pick one explicitly.
# SpeechRecognitionEngine() (parameterless) binds the system-locale
# recognizer, which on a non-English Windows cannot load an en-US grammar —
# the v3.15 silent death. Prefer en-US, then any en-*, then whatever exists.
$pick = $null
$rec = $null
try {
  $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if (-not $recognizers -or $recognizers.Count -eq 0) { Emit @{error='no-recognizer'}; exit 0 }
  $pick = $recognizers | Where-Object { $_.Culture.Name -eq 'en-US' } | Select-Object -First 1
  if (-not $pick) { $pick = $recognizers | Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1 }
  if (-not $pick) { $pick = $recognizers | Select-Object -First 1 }
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($pick.Id)
  $rec.SetInputToDefaultAudioDevice()
} catch {
  Emit @{error='no-mic'}
  exit 0
}
Emit @{status='listening'; recognizer="$($pick.Id)"; culture="$($pick.Culture.Name)"}
$cmds = New-Object System.Speech.Recognition.Choices
foreach ($c in @('hey cat','hey kitty','ok cat','play music','play','put on','pause','pause the music','resume','resume the music','stop the music','stop music','stop','next song','next','skip','previous song','go back','volume up','louder','volume down','quieter','mute','unmute','stop listening')) { $null = $cmds.Add($c) }
$gb = New-Object System.Speech.Recognition.GrammarBuilder
$gb.Culture = $pick.Culture
$null = $gb.Append($cmds)
$null = $gb.AppendDictation()
$g = New-Object System.Speech.Recognition.Grammar($gb)
# v3.16: a failed load is REPORTED, not swallowed (the v3.15 silent death)
$loaded = $false
try {
  $rec.LoadGrammar($g)
  $loaded = ($rec.Grammars.Count -gt 0)
} catch { $loaded = $false }
if (-not $loaded) { Emit @{error='grammar-failed'}; exit 0 }
$rec.EndSilenceTimeout = [TimeSpan]::FromSeconds(0.45)
$rec.BabbleTimeout = [TimeSpan]::FromSeconds(0)
$rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds(0)
$onRec = {
  param($sender, $e)
  try {
    if ($e.Result -and $e.Result.Text) {
      $obj = @{ text = $e.Result.Text; confidence = [math]::Round($e.Result.Confidence, 2) }
      [Console]::Out.WriteLine((ConvertTo-Json $obj -Compress))
    }
  } catch { }
}
$rec.add_SpeechRecognized($onRec)
$rec.add_SpeechRecognitionRejected({ param($s, $e) })
$rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
[Console]::Out.WriteLine('{"ready":true}')
while ($true) { Start-Sleep -Milliseconds 400 }
`.trim() + '\n';

// stdout line → { text, confidence } | { ready:true } | { status, engine, culture } | { error } | null
export function parseVoiceLine(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    if (typeof v.text === 'string') {
      return {
        text: v.text.slice(0, 200),
        confidence: Number.isFinite(v.confidence) ? Math.max(0, Math.min(1, v.confidence)) : 0,
      };
    }
    if (v.ready) return { ready: true };
    if (v.status) return { status: true, engine: String(v.recognizer || '').slice(0, 80), culture: String(v.culture || '').slice(0, 20) };
    if (v.error) return { error: String(v.error).slice(0, 80) };
    return null;
  } catch {
    if (/no-mic/i.test(s)) return { error: 'no-mic' };
    return null;
  }
}

export function createVoiceListener(opts = {}) {
  const spawnFn = opts.spawnFn || null;
  const platform = opts.platform || process.platform;
  const onPhrase = opts.onPhrase || (() => {});
  const onDown = opts.onDown || (() => {});
  const onStatus = opts.onStatus || (() => {});
  const minConfidence = Number.isFinite(opts.minConfidence) ? opts.minConfidence : 0.45;
  let child = null;
  let wanted = false;
  let respawnTimer = null;
  let attempt = 0;
  let lastError = '';
  let engineInfo = '';   // v3.16: recognizer id/culture from the status line
  const BACKOFFS = [1500, 4000, 12000, 30000];

  function clearTimer() { if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; } }

  function scheduleRespawn() {
    if (!wanted || respawnTimer) return;
    const delay = BACKOFFS[Math.min(attempt, BACKOFFS.length - 1)];
    attempt++;
    respawnTimer = setTimeout(() => { respawnTimer = null; spawnChild(); }, delay);
    if (respawnTimer.unref) respawnTimer.unref();
  }

  function spawnChild() {
    if (!wanted || child || platform !== 'win32') return;
    try {
      child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', VOICE_SCRIPT],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      child = null;
      lastError = 'spawn-failed';
      scheduleRespawn();
      return;
    }
    let buf = '';
    child.stdout?.on('data', d => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        const parsed = parseVoiceLine(line);
        if (!parsed) continue;
        if (parsed.ready) { attempt = 0; lastError = ''; continue; }
        if (parsed.status) { engineInfo = parsed.engine ? `${parsed.engine} (${parsed.culture})` : 'sapi'; try { onStatus(parsed); } catch { } continue; }
        if (parsed.error) { lastError = parsed.error; continue; }
        if (parsed.text && parsed.confidence >= minConfidence) {
          try { onPhrase(parsed.text, parsed.confidence); } catch { /* never breaks us */ }
        }
      }
    });
    child.stderr?.on('data', () => { /* SAPI chatter */ });
    child.on('error', () => { child = null; lastError = 'spawn-failed'; scheduleRespawn(); });
    child.on('exit', () => {
      const wasLive = !!child;
      child = null;
      if (!wanted) return;
      if (wasLive) { try { onDown(lastError); } catch {} }
      scheduleRespawn();
    });
  }

  return {
    start() {
      if (wanted) return;
      wanted = true;
      attempt = 0;
      clearTimer();
      spawnChild();
    },
    stop() {
      wanted = false;
      clearTimer();
      if (child) { try { child.kill(); } catch {} child = null; }
    },
    get running() { return wanted && !!child; },
    get lastError() { return lastError; },
    get engineInfo() { return engineInfo; },
  };
}
