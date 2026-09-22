// gen-sfx.mjs — procedural SFX for the v3.6 contextual sound pack.
// Everything in MeowCat is code-drawn/code-made: these two little sounds are
// synthesized with raw PCM math (no external assets), then written as WAVs.
//   glass.wav  — soft paw-tap on a window edge (short damped sine tick)
//   squeak.wav — tiny toy-squeak for jump landings (rising sine chirp)
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'sounds');
mkdirSync(OUT, { recursive: true });

const SR = 22050;

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

// soft glass tap: 45ms damped 1500Hz sine with a click transient
function glass() {
  const dur = 0.05, n = Math.floor(SR * dur), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 90);
    const tick = i < 40 ? (Math.random() * 2 - 1) * 0.25 * (1 - i / 40) : 0;
    out[i] = (Math.sin(2 * Math.PI * 1500 * t) * 0.55 + Math.sin(2 * Math.PI * 2400 * t) * 0.2) * env + tick;
  }
  return out;
}

// toy squeak: 130ms chirp gliding 620 -> 980 Hz, soft envelope
function squeak() {
  const dur = 0.13, n = Math.floor(SR * dur), out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / dur;
    const f = 620 + 360 * Math.sin(p * Math.PI);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5) * Math.exp(-p * 2.2);
    out[i] = Math.sin(phase) * 0.5 * env + Math.sin(phase * 2) * 0.12 * env;
  }
  return out;
}

writeFileSync(path.join(OUT, 'glass.wav'), toWav(glass()));
writeFileSync(path.join(OUT, 'squeak.wav'), toWav(squeak()));
console.log('wrote glass.wav + squeak.wav to', OUT);
