#!/usr/bin/env python3
"""Slice AI sprite sheets into transparent game-ready frames — v2 robust keyer.

Improvements over v1:
  * Background color sampled per-sheet from the four corners (handles muted greens).
  * Border-connected flood fill (background is contiguous with the frame border),
    so green-ish cat parts are never removed.
  * Edge-zone despill + halo feather.
  * Leftover green floor-shadow slivers under the feet are caught by the flood fill
    because they touch the bottom border via the background.
Pipeline per sheet:
  1. Slice grid cells (2x2 @1024, or 1x2 @1024).
  2. Key background (corner-sampled color + green dominance + border flood fill).
  3. Union-bbox crop per clip (constant scale across frames, no pumping).
  4. Bottom-center align into a 512x512 art box (feet at y=512).
  5. Save frame_XX.png into src/MeowCat/Assets/sprites/<breed>/<clip>/.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAW = "/home/z/my-project/meow/art_raw"
OUT = "/home/z/my-project/meow/src/MeowCat/Assets/sprites"
BOX = 512
MAX_SIDE = 470

from slice_assets import SHEETS  # reuse the mapping

# per-sheet minimum green dominance for dist<58 candidates (protect pale/white fur)
MIN_DOM = {
    "calico_walk": 20, "calico_sit": 20, "calico_scratch": 20,
    "siamese_walk": 10, "siamese_sit": 10, "siamese_scratch": 10,
    "persian_walk": 10, "persian_sit": 10, "persian_scratch": 10,
}


def key_background(rgb: np.ndarray, min_dom: int = 6) -> np.ndarray:
    """RGBA with background removed. Strategy:
    1. Candidates = close to sampled bg color OR green-dominant (catches vignettes/shadows).
    2. bg = border-connected component of candidates (flood fill).
    3. SURE-FOREGROUND protection: pixels that are clearly NOT green screen
       (hue-neutral OR far from bg) dilated by 3px are removed from bg again —
       this keeps wispy boundary fur from being eaten through spill-connections.
    4. Despill kept pixels, 1px halo cut, interior re-solidified.
    """
    h, w, _ = rgb.shape
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)

    # ---- 1. background samples from 8 border patches
    P = 24
    patches = [
        rgb[0:P, 0:P], rgb[0:P, w - P:w], rgb[h - P:h, 0:P], rgb[h - P:h, w - P:w],
        rgb[0:P, w // 2 - P // 2:w // 2 + P // 2], rgb[h - P:h, w // 2 - P // 2:w // 2 + P // 2],
        rgb[h // 2 - P // 2:h // 2 + P // 2, 0:P], rgb[h // 2 - P // 2:h // 2 + P // 2, w - P:w],
    ]
    samples = [np.median(p.reshape(-1, 3), axis=0).astype(np.float32) for p in patches]
    samples.append(np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0).astype(np.float32))

    stack = np.stack([np.sqrt((r - s[0]) ** 2 + (g - s[1]) ** 2 + (b - s[2]) ** 2) for s in samples])
    dist = stack.min(axis=0)
    dom = g - np.maximum(r, b)

    # when the sheet bg is genuinely green, require a green cast on candidate pixels too
    # (protects white/cream fur against pale green screens)
    dom_bg = float(np.median([s[1] - max(s[0], s[2]) for s in samples]))
    if dom_bg > 10:
        cand = ((dist < 58) & (dom > min_dom)) | ((dom > 12) & (dist < 140))
    else:
        cand = (dist < 58) | ((dom > 12) & (dist < 140))

    # ---- 2. border-connected flood fill
    labels, _ = ndimage.label(cand)
    border_labels = set(np.unique(np.concatenate([
        labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])))
    border_labels.discard(0)
    bg = np.isin(labels, list(border_labels)) if border_labels else np.zeros((h, w), bool)

    # ---- 3. sure-foreground protection
    # hue-neutral pixels (no green cast at all) or very far from every bg sample
    sure_fg = (dom < 4) | (dist > 115)
    protect = np.asarray(Image.fromarray((sure_fg * 255).astype(np.uint8))
                         .filter(ImageFilter.MaxFilter(5)), dtype=np.uint8) > 0
    bg &= ~protect

    # ---- 3b. fill enclosed holes (bites fully surrounded by fur)
    fg_filled = ndimage.binary_fill_holes(~bg)
    bg = ~fg_filled

    # ---- 4. alpha + despill + boundary refinement
    alpha = np.where(bg, 0.0, 255.0)
    spill = (~bg) & (dom > 8)
    g2 = g.copy()
    g2[spill] = np.maximum(r[spill], b[spill]) * 1.05 + g[spill] * 0.15
    g2 = np.clip(g2, 0, 255)

    img = np.dstack([r, g2, b, alpha]).astype(np.uint8)
    im = Image.fromarray(img)

    core_fg = np.asarray(
        Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)),
        dtype=np.uint8)
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    a_np = np.asarray(a, dtype=np.float32)
    a_np[core_fg == 255] = 255
    a_np[bg] = 0
    im.putalpha(Image.fromarray(np.clip(a_np, 0, 255).astype(np.uint8)))

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
    keyed = [key_background(np.asarray(c), MIN_DOM.get(name, 6)) for c in cells]

    boxes = [content_bbox(k) for k in keyed]
    if any(b is None for b in boxes):
        boxes = [b for b in boxes if b]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    x0 = max(0, x0 - 4); y0 = max(0, y0 - 4)
    x1 = min(cells[0].size[0], x1 + 4); y1 = min(cells[0].size[1], y1 + 4)

    crop_w, crop_h = x1 - x0, y1 - y0
    scale = min(MAX_SIDE / max(crop_w, crop_h), 1.0)
    tw, th = max(1, int(crop_w * scale)), max(1, int(crop_h * scale))

    outdir = os.path.join(OUT, breed, clip)
    os.makedirs(outdir, exist_ok=True)
    frames = []
    for i, k in enumerate(keyed):
        cropped = Image.fromarray(k).crop((x0, y0, x1, y1)).resize((tw, th), Image.LANCZOS)
        canvas = Image.new("RGBA", (BOX, BOX), (0, 0, 0, 0))
        canvas.paste(cropped, ((BOX - tw) // 2, BOX - th), cropped)
        fp = os.path.join(outdir, f"frame_{i:02d}.png")
        canvas.save(fp, optimize=True)
        frames.append(fp)
    return frames


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


if __name__ == "__main__":
    main()
