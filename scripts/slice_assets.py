#!/usr/bin/env python3
"""Slice AI sprite sheets into transparent game-ready frames.

Pipeline per sheet:
  1. Slice grid cells (2x2 @1024, or 1x2 @1344x768).
  2. Global green-screen key (green-dominance) + despill + edge feather.
  3. Union-bbox crop per clip (constant scale across frames, no pumping).
  4. Bottom-center align into a 512x512 art box (feet at y=512).
  5. Save frame_XX.png into src/MeowCat/Assets/sprites/<breed>/<clip>/.

Also converts the two black-background glass FX sheets into white/alpha decals.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter

RAW = "/home/z/my-project/meow/art_raw"
OUT = "/home/z/my-project/meow/src/MeowCat/Assets/sprites"
BOX = 512
MAX_SIDE = 470  # max content extent inside the art box

# name -> (grid, clip, breed)
SHEETS = {
    "grey_tabby_walk":    (2, "walk",    "grey_tabby"),
    "grey_tabby_run":     (2, "run",     "grey_tabby"),
    "grey_tabby_jump":    (2, "jump",    "grey_tabby"),
    "grey_tabby_dance":   (2, "dance",   "grey_tabby"),
    "grey_tabby_scratch": (2, "scratch", "grey_tabby"),
    "grey_tabby_sit":     (1, "sit",     "grey_tabby"),
    "grey_tabby_sleep":   (1, "sleep",   "grey_tabby"),
    "grey_tabby_idle":    (1, "idle",    "grey_tabby"),
    "grey_tabby_happy":   (1, "happy",   "grey_tabby"),
    "grey_tabby_angry":   (1, "angry",   "grey_tabby"),
    "grey_tabby_dangle":  (1, "dangle",  "grey_tabby"),
    "grey_tabby_eat":     (1, "eat",     "grey_tabby"),
    "grey_tabby_pounce":  (1, "pounce",  "grey_tabby"),
    "orange_tabby_walk":    (2, "walk",    "orange_tabby"),
    "orange_tabby_sit":     (1, "sit",     "orange_tabby"),
    "orange_tabby_scratch": (2, "scratch", "orange_tabby"),
    "tuxedo_walk":    (2, "walk",    "tuxedo"),
    "tuxedo_sit":     (1, "sit",     "tuxedo"),
    "tuxedo_scratch": (2, "scratch", "tuxedo"),
    "calico_walk":    (2, "walk",    "calico"),
    "calico_sit":     (1, "sit",     "calico"),
    "calico_scratch": (2, "scratch", "calico"),
    "siamese_walk":    (2, "walk",    "siamese"),
    "siamese_sit":     (1, "sit",     "siamese"),
    "siamese_scratch": (2, "scratch", "siamese"),
    "persian_walk":    (2, "walk",    "persian"),
    "persian_sit":     (1, "sit",     "persian"),
    "persian_scratch": (2, "scratch", "persian"),
}


def key_green(rgb: np.ndarray) -> np.ndarray:
    """RGBA with green screen removed, despilled, feathered."""
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    dom = g - np.maximum(r, b)                      # green dominance
    bright = g
    bg = (dom > 24) & (bright > 60)                 # hard background core
    soft = (dom > 8) & (bright > 45)                # halo zone

    alpha = np.where(bg, 0.0, 255.0).astype(np.float32)

    # despill: reduce green dominance on kept pixels
    spill = (~bg) & (dom > 10)
    g2 = g.copy()
    g2[spill] = np.maximum(r[spill], b[spill]) * 1.06 + g[spill] * 0.12
    g2 = np.clip(g2, 0, 255)

    img = np.dstack([r, g2, b, alpha]).astype(np.uint8)
    im = Image.fromarray(img, "RGBA")

    # erode 1px to cut the fringe, then feather the alpha edge
    a = im.getchannel("A").filter(ImageFilter.MinFilter(3))
    a = a.filter(ImageFilter.GaussianBlur(1.1))
    # keep interior solid: original mask overrides blur where fully bg / fully fg
    a_np = np.asarray(a, dtype=np.float32)
    core_fg = np.asarray(Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), "L")
                         .filter(ImageFilter.MinFilter(5)), dtype=np.uint8)
    a_np[core_fg == 255] = 255
    a_np[bg] = 0
    im.putalpha(Image.fromarray(np.clip(a_np, 0, 255).astype(np.uint8), "L"))

    # second despill pass on semi-transparent edge pixels
    arr = np.asarray(im).astype(np.float32)
    edge = (arr[..., 3] > 0) & (arr[..., 3] < 250)
    dom2 = arr[..., 1] - np.maximum(arr[..., 0], arr[..., 2])
    fix = edge & (dom2 > 12)
    arr[..., 1][fix] = np.maximum(arr[..., 0][fix], arr[..., 2][fix]) * 1.04
    return np.clip(arr, 0, 255).astype(np.uint8)


def slice_cells(path, grid):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    if grid == 2:
        cw, ch = W // 2, H // 2
        return [im.crop((0, 0, cw, ch)), im.crop((cw, 0, W, ch)),
                im.crop((0, ch, cw, H)), im.crop((cw, ch, W, H))]
    cw = W // 2
    return [im.crop((0, 0, cw, H)), im.crop((cw, 0, W, H))]


def content_bbox(rgba):
    a = rgba[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def process_sheet(name):
    grid, clip, breed = SHEETS[name]
    src = os.path.join(RAW, name + ".png")
    if not os.path.exists(src):
        return None
    cells = slice_cells(src, grid)
    keyed = [key_green(np.asarray(c)) for c in cells]

    # union bbox => identical crop size for every frame (no scale pumping)
    boxes = [content_bbox(k) for k in keyed]
    if any(b is None for b in boxes):
        boxes = [b for b in boxes if b]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    # pad a little
    x0 = max(0, x0 - 4); y0 = max(0, y0 - 4)
    x1 = min(cells[0].size[0], x1 + 4); y1 = min(cells[0].size[1], y1 + 4)

    crop_w, crop_h = x1 - x0, y1 - y0
    scale = min(MAX_SIDE / max(crop_w, crop_h), 1.0)
    tw, th = max(1, int(crop_w * scale)), max(1, int(crop_h * scale))

    outdir = os.path.join(OUT, breed, clip)
    os.makedirs(outdir, exist_ok=True)
    n = len(keyed)
    frames = []
    for i, k in enumerate(keyed):
        cropped = Image.fromarray(k, "RGBA").crop((x0, y0, x1, y1)).resize((tw, th), Image.LANCZOS)
        canvas = Image.new("RGBA", (BOX, BOX), (0, 0, 0, 0))
        canvas.paste(cropped, ((BOX - tw) // 2, BOX - th), cropped)
        fp = os.path.join(outdir, f"frame_{i:02d}.png")
        canvas.save(fp, optimize=True)
        frames.append(fp)
    return frames


def process_glass():
    """White-on-black FX -> white decal with alpha (plus mirrored variants)."""
    fxdir = os.path.join(OUT, "_fx")
    os.makedirs(fxdir, exist_ok=True)
    jobs = {
        "fx_glass_shatter": ["crack_shatter", "crack_shatter2"],
        "fx_claw_marks": ["crack_claws", "crack_claws2"],
    }
    for src_name, outs in jobs.items():
        src = os.path.join(RAW, src_name + ".png")
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert("RGB")
        arr = np.asarray(im).astype(np.float32)
        lum = arr.max(axis=2)                      # brightest channel = crack line
        alpha = np.clip((lum - 26) / (110 - 26), 0, 1) ** 0.9 * 255
        out = np.zeros((*lum.shape, 4), dtype=np.uint8)
        # cool ice-white tint
        out[..., 0] = np.clip(228 + lum * 0.12, 0, 255).astype(np.uint8)
        out[..., 1] = np.clip(236 + lum * 0.10, 0, 255).astype(np.uint8)
        out[..., 2] = 255
        out[..., 3] = alpha.astype(np.uint8)
        base = Image.fromarray(out, "RGBA")
        # trim to content
        bb = base.getbbox()
        if bb:
            base = base.crop(bb)
        for j, name in enumerate(outs):
            v = base.transpose(Image.FLIP_LEFT_RIGHT) if j == 1 else base
            v = v.resize((v.width // 2, v.height // 2), Image.LANCZOS)
            v.save(os.path.join(fxdir, name + ".png"), optimize=True)
        print(f"glass: {outs}")


def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for name in SHEETS:
        if only and name not in only:
            continue
        frames = process_sheet(name)
        if frames is None:
            print(f"MISSING sheet {name}")
        else:
            print(f"OK {name}: {len(frames)} frames -> {os.path.relpath(frames[0], OUT)}")
    if not only or any(n.startswith("fx_") for n in (only or [])):
        process_glass()


if __name__ == "__main__":
    main()
