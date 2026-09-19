#!/usr/bin/env python3
"""MeowCat asset generator: app icon (multi-size .ico) + synthesized SFX WAV pack.
All sounds are synthesized from scratch (no external files) at 44.1 kHz 16-bit mono."""
import numpy as np, wave, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "MeowCat", "Assets")
SR = 44100
rng = np.random.default_rng(42)

# ---------------------------------------------------------------- helpers
def save_wav(name, x, peak=0.5):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    pcm = (x * 32767).astype(np.int16)
    path = os.path.join(OUT, "sounds", name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  {name}: {len(x)/SR:.2f}s")

def t(dur): return np.arange(int(dur * SR)) / SR

def env_ad(n, a, r):
    e = np.ones(n)
    ai, ri = int(a * SR), int(r * SR)
    if ai > 0: e[:ai] = np.linspace(0, 1, ai)
    if ri > 0: e[-ri:] *= np.linspace(1, 0, ri)
    return e

def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))

def sine(f, dur, ph=0.0):
    return np.sin(2 * np.pi * f * t(dur) + ph)

# ---------------------------------------------------------------- SFX pack
def gen_meow():
    dur = 0.55; tt = t(dur)
    # pitch contour: 750 -> 460 -> 520 Hz (classic mrrp-ow)
    f0 = np.interp(tt, [0, 0.18, 0.40, dur], [750, 460, 500, 430])
    f0 *= 1 + 0.025 * np.sin(2 * np.pi * 6 * tt)          # vibrato
    phase = 2 * np.pi * np.cumsum(f0) / SR
    x = np.sin(phase) + 0.55 * np.sin(2 * phase) + 0.30 * np.sin(3 * phase) + 0.12 * np.sin(4 * phase)
    x *= env_ad(len(tt), 0.05, 0.20)
    x += 0.05 * bandpass(rng.standard_normal(len(tt)), 800, 2500) * env_ad(len(tt), 0.03, 0.3)
    save_wav("meow.wav", x, 0.55)

def gen_purr():
    dur = 2.6; tt = t(dur)
    base = sum(a * np.sin(2 * np.pi * (85 * k) * tt + k) for k, a in
               [(1, 1.0), (2, 0.6), (3, 0.35), (4, 0.2), (5, 0.1)])
    mod = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 26 * tt))
    mod = np.convolve(mod, np.ones(240) / 240, mode="same")  # soften square
    x = base * mod * env_ad(len(tt), 0.25, 0.5)
    save_wav("purr.wav", x, 0.35)

def _patter(n_taps, gap, tap_len, lo, hi):
    out = np.zeros(int((gap * n_taps + 0.1) * SR))
    for i in range(n_taps):
        n = int(tap_len * SR)
        tap = bandpass(rng.standard_normal(n), lo, hi) * np.exp(-np.linspace(0, 9, n))
        s = int((i * gap + 0.02) * SR)
        out[s:s + n] += tap * (0.8 + 0.2 * (i % 2))
    return out

def gen_patter():     save_wav("patter.wav", _patter(4, 0.17, 0.045, 700, 2200), 0.30)
def gen_run_patter(): save_wav("run_patter.wav", _patter(8, 0.09, 0.032, 900, 2600), 0.32)

def gen_whoosh():
    dur = 0.38
    x = bandpass(rng.standard_normal(int(dur * SR)), 250, 1600)
    tt = t(dur)
    x *= np.sin(np.pi * tt / dur) ** 1.5                 # rise-fall
    x += 0.25 * sine(320 * (1 + 1.5 * tt / dur), dur) * np.sin(np.pi * tt / dur)
    save_wav("whoosh.wav", x, 0.42)

def gen_land():
    dur = 0.22; tt = t(dur)
    f = np.interp(tt, [0, dur], [110, 45])
    ph = 2 * np.pi * np.cumsum(f) / SR
    thump = np.sin(ph) * np.exp(-tt * 22)
    click = bandpass(rng.standard_normal(len(tt)), 1200, 3500) * np.exp(-tt * 260)
    save_wav("land.wav", thump + 0.4 * click, 0.5)

def gen_coin():
    a = sine(1318.5, 0.09) * np.exp(-t(0.09) * 18)
    b = sine(1046.5, 0.28) * np.exp(-t(0.28) * 9)
    b += 0.35 * sine(2093.0, 0.28) * np.exp(-t(0.28) * 14)
    x = np.concatenate([a, b])
    save_wav("coin.wav", x, 0.5)

def gen_scratch():
    out = np.zeros(int(1.0 * SR))
    for i in range(6):
        n = int(0.08 * SR)
        scrap = bandpass(rng.standard_normal(n), 1000, 3200)
        scrap *= 0.5 * (1 + np.sin(2 * np.pi * 30 * t(0.08)))   # scrape texture
        scrap *= np.sin(np.pi * np.linspace(0, 1, n)) ** 0.5
        s = int((i * 0.13 + 0.02) * SR)
        out[s:s + n] += scrap
    save_wav("scratch.wav", out, 0.4)

def gen_chirp():
    parts = []
    for _ in range(2):
        dur = 0.13; tt = t(dur)
        f = np.interp(tt, [0, dur], [520, 1050])
        ph = 2 * np.pi * np.cumsum(f) / SR
        p = np.sin(ph) + 0.3 * np.sin(2 * ph)
        p *= env_ad(len(tt), 0.02, 0.05)
        parts.append(p); parts.append(np.zeros(int(0.05 * SR)))
    save_wav("chirp.wav", np.concatenate(parts), 0.45)

def gen_dance_loop():
    bpm = 112; beat = 60 / bpm; total = 4 * beat
    out = np.zeros(int(total * SR) + SR)
    def put(sig, at):
        s = int(at * SR); e = min(s + len(sig), len(out))
        out[s:e] += sig[:e - s]
    for b in range(4):                                       # kicks
        d = 0.11; tt = t(d); f = np.interp(tt, [0, d], [150, 45])
        put(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 30), b * beat)
    for b in range(8):                                       # hats
        n = int(0.03 * SR)
        put(bandpass(rng.standard_normal(n), 5000, 9000) * np.exp(-np.linspace(0, 8, n)),
            b * beat / 2 + beat / 4)
    notes = [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 880.0, 783.99]  # arp
    for i, f in enumerate(notes):                            # square-ish arps
        d = beat / 2 * 0.9; n = int(d * SR); tt = t(d)
        sig = (np.sign(np.sin(2 * np.pi * f * tt)) * 0.25 + np.sin(2 * np.pi * f * tt) * 0.75)
        put(sig * np.exp(-tt * 7), i * beat / 2)
    save_wav("dance_loop.wav", out[:int(total * SR)], 0.38)

# ---------------------------------------------------------------- app icon
def radial(size, cx, cy, r, c_in, c_out):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r
    d = np.clip(d, 0, 1) ** 1.4
    col = np.zeros((size, size, 4), np.float32)
    for i in range(3):
        col[..., i] = c_in[i] + (c_out[i] - c_in[i]) * d
    col[..., 3] = 255
    return col

def gen_icon():
    S = 256
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # head with radial shading (light top-left -> dark rim): 3D look
    head = Image.fromarray(radial(S, 92, 88, 170, (255, 205, 148), (206, 122, 52)).astype(np.uint8))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([28, 52, 228, 236], fill=255)
    img.paste(head, (0, 0), mask)
    d = ImageDraw.Draw(img)
    # ears with inner pink
    for sx, flip in [(1, False), (-1, True)]:
        ex = 128 + sx * 78
        d.polygon([(ex - 34, 84), (ex + 34 * (1 if not flip else -1) + 34 * flip, 84), (ex + sx * 14, 14)], fill=(219, 141, 66, 255))
        d.polygon([(ex - 22, 78), (ex + 22, 78), (ex + sx * 12, 32)], fill=(255, 168, 168, 255))
    # forehead stripes
    for dx in (-34, 0, 34):
        d.arc([128 + dx - 26, 40, 128 + dx + 26, 108], 200, 340, fill=(183, 104, 38, 255), width=7)
    # eyes: iris gradient + pupil + catchlights
    for ex in (86, 170):
        iris = Image.fromarray(radial(60, 22, 20, 34, (150, 235, 190), (32, 130, 90)).astype(np.uint8))
        imask = Image.new("L", (60, 60), 0)
        ImageDraw.Draw(imask).ellipse([2, 2, 58, 58], fill=255)
        img.paste(iris, (ex - 30, 128 - 30), imask)
        d.ellipse([ex - 11, 128 - 15, ex + 11, 128 + 15], fill=(24, 20, 26, 255))
        d.ellipse([ex - 8, 128 - 12, ex - 1, 128 - 5], fill=(255, 255, 255, 235))
        d.ellipse([ex + 4, 128 + 4, ex + 9, 128 + 9], fill=(255, 255, 255, 160))
        d.arc([ex - 24, 108, ex + 24, 150], 25, 155, fill=(120, 66, 20, 255), width=4)
    # nose + mouth
    d.polygon([(112, 166), (144, 166), (128, 184)], fill=(232, 118, 128, 255))
    d.arc([104, 178, 130, 202], 20, 160, fill=(120, 66, 20, 255), width=5)
    d.arc([126, 178, 152, 202], 20, 160, fill=(120, 66, 20, 255), width=5)
    # whiskers
    for sy in (-6, 4, 14):
        d.line([(76, 172 + sy), (18, 164 + sy * 2)], fill=(255, 248, 240, 200), width=3)
        d.line([(180, 172 + sy), (238, 164 + sy * 2)], fill=(255, 248, 240, 200), width=3)
    # specular highlight
    shine = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shine).ellipse([52, 70, 118, 128], fill=(255, 255, 255, 70))
    shine = shine.filter(ImageFilter.GaussianBlur(9))
    img = Image.alpha_composite(img, shine)
    ico_path = os.path.join(OUT, "app.ico")
    img.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    png_path = os.path.join(os.path.dirname(__file__), "..", "docs", "icon-preview.png")
    img.save(png_path)
    print("  app.ico + docs/icon-preview.png")

if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "sounds"), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), "..", "docs"), exist_ok=True)
    print("Generating SFX pack:")
    gen_meow(); gen_purr(); gen_patter(); gen_run_patter(); gen_whoosh()
    gen_land(); gen_coin(); gen_scratch(); gen_chirp(); gen_dance_loop()
    print("Generating icon:")
    gen_icon()
    print("Done.")
