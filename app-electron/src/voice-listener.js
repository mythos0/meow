// voice-listener.js — v3.15 always-on voice commands ("hey cat …").
//
// Windows: one long-lived PowerShell child runs the legacy SAPI engine
// (System.Speech — ships with Windows, no language-pack install, no cloud,
// no mic-permission broker beyond the classic recording device). It prints
// ONE JSON line per recognized phrase: {"text":"…","confidence":0.87}.
//
// The grammar is deliberately command-shaped: (wake word / control phrases)
// followed by free dictation so the song title rides along:
//   "hey cat play music ghum kariya nilo sokhi"
// The raw text ALWAYS goes to the pure parser (voice.js) — the grammar only
// gates what gets transcribed, the parser decides what it means.
//
// Linux/dev: no SAPI — the listener reports unavailable and stays quiet.
// The manager NEVER throws: a broken mic degrades the voice feature, never
// the app (same contract as typing-hook.js).

'use strict';

export const VOICE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$rec = $null
try {
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $rec.SetInputToDefaultAudioDevice()
} catch {
  [Console]::Out.WriteLine('{"error":"no-mic"}')
  exit 0
}
$cmds = New-Object System.Speech.Recognition.Choices
foreach ($c in @('hey cat','hey kitty','ok cat','play music','play','put on','pause','pause the music','resume','resume the music','stop the music','stop music','stop','next song','next','skip','previous song','go back','volume up','louder','volume down','quieter','mute','unmute','stop listening')) { $null = $cmds.Add($c) }
$gb = New-Object System.Speech.Recognition.GrammarBuilder
$gb.Culture = [System.Globalization.CultureInfo]::GetCultureInfo('en-US')
$null = $gb.Append($cmds)
$null = $gb.AppendDictation()
$g = New-Object System.Speech.Recognition.Grammar($gb)
$rec.LoadGrammar($g) | Out-Null
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
while ($true) { Start-Sleep -Milliseconds 500 }
`.trim() + '\n';

// stdout line → { text, confidence } | { ready:true } | { error } | null
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
  const minConfidence = Number.isFinite(opts.minConfidence) ? opts.minConfidence : 0.45;
  let child = null;
  let wanted = false;
  let respawnTimer = null;
  let attempt = 0;
  let lastError = '';
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
  };
}
