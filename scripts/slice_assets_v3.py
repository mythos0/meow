#!/usr/bin/env python3
"""Final asset pipeline: high-frame-count slicing for smooth animation.

  * Motion clips (grey_tabby): A+B 2x2 sheets interleaved -> 8 frames per clip
  * Stationary clips (grey_tabby): single 2x2 sheets -> 4 frames
  * Other breeds: existing walk/scratch 2x2 (4 frames) + sit 1x2 (2 frames)
  * Green-screen and magenta-screen keying (auto-detected per sheet)
  * Union-bbox crop (no scale pumping), bottom-center align into 512x512
  * FX sheets (black bg) -> white/alpha glass decals
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

# (breed, clip) -> list of sheet names; 2x2 sheets contribute 4 frames each,
# 1x2 sheets 2 frames; frames are interleaved across sheets in order.
SHEETS = {
    ("grey_tabby", "walk"):    ["grey_tabby_walk", "gt_walk_b"],
    ("grey_tabby", "run"):     ["grey_tabby_run", "gt_run_b"],
    ("grey_tabby", "jump"):    ["grey_tabby_jump", "gt_jump_b"],
    ("grey_tabby", "dance"):   ["grey_tabby_dance", "gt_dance_b"],
    ("grey_tabby", "scratch"): ["grey_tabby_scratch", "gt_scratch_b"],
    ("grey_tabby", "pounce"):  ["gt_pounce4"],
    ("grey_tabby", "eat"):     ["gt_eat4"],
    ("grey_tabby", "sit"):     ["gt_sit4"],
    ("grey_tabby", "sleep"):   ["gt_sleep4"],
    ("grey_tabby", "idle"):    ["gt_idle4"],
    ("grey_tabby", "happy"):   ["gt_happy4"],
    ("grey_tabby", "angry"):   ["gt_angry4"],
    ("grey_tabby", "dangle"):  ["gt_dangle4"],
    ("orange_tabby", "walk"):    ["orange_tabby_walk"],
    ("orange_tabby", "sit"):     ["orange_tabby_sit"],
    ("orange_tabby", "scratch"): ["orange_tabby_scratch"],
    ("tuxedo", "walk"):    ["tuxedo_walk"],
    ("tuxedo", "sit"):     ["tuxedo_sit"],
    ("tuxedo", "scratch"): ["tuxedo_scratch"],
    ("siamese", "walk"):    ["siamese_walk"],
    ("siamese", "sit"):     ["siamese_sit"],
    ("siamese", "scratch"): ["siamese_scratch"],
    ("persian", "walk"):    ["persian_walk"],
    ("persian", "sit"):     ["persian_sit"],
    ("persian", "scratch"): ["persian_scratch"],
}

# green-dominance gate overrides for pale-fur sheets (min dom for dist<58 candidates)
MIN_DOM = {
    "siamese_walk": 10, "siamese_sit": 10, "siamese_scratch": 10,
    "persian_walk": 10, "persian_sit": 10, "persian_scratch": 10,
    "tuxedo_walk": 12, "tuxedo_sit": 12, "tuxedo_scratch": 12,
    "gt_walk_b": 12, "gt_run_b": 12, "gt_jump_b": 12, "gt_dance_b": 14,
    "gt_scratch_b": 12, "gt_pounce4": 10, "gt_eat4": 10,
    "gt_sit4": 10, "gt_sleep4": 10, "gt_idle4": 10, "gt_happy4": 12,
    "gt_angry4": 10, "gt_dangle4": 10,
}

MAGENTA_SHEETS = {
    "walk": ["calico_walk_magenta"],
    "sit": ["calico_sit_magenta"],
    "scratch": ["calico_scratch_magenta"],
}

GRID2 = {"gt_walk", "gt_run", "gt_jump", "gt_dance", "gt_scratch", "gt_pounce4", "gt_eat4",
         "gt_sit4", "gt_sleep4", "gt_idle4", "gt_happy4", "gt_angry4", "gt_dangle4",
         "gt_walk_b", "gt_run_b", "gt_jump_b", "gt_dance_b", "gt_scratch_b",
         "grey_tabby_walk", "grey_tabby_run", "grey_tabby_jump", "grey_tabby_dance", "grey_tabby_scratch",
         "orange_tabby_walk", "orange_tabby_scratch", "tuxedo_walk", "tuxedo_scratch",
         "siamese_walk", "siamese_scratch", "persian_walk", "persian_scratch",
         "calico_walk_magenta", "calico_scratch_magenta", "calico_walk", "calico_scratch"}
# everything else in the mappings above that is 1x2:
GRID1 = {"orange_tabby_sit", "tuxedo_sit", "siamese_sit", "persian_sit", "calico_sit_magenta"}


def slice_cells(path, grid):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    T = 6  # trim cell edges: kills the grey grid lines the model sometimes draws
    if grid == 2:
        cw, ch = W // 2, H // 2
        return [im.crop((T, T, cw - T, ch - T)), im.crop((cw + T, T, W - T, ch - T)),
                im.crop((T, ch + T, cw - T, H - T)), im.crop((cw + T, ch + T, W - T, H - T))]
    cw = W // 2
    return [im.crop((T, T, cw - T, H - T)), im.crop((cw + T, T, W - T, H - T))]


def key_background(rgb: np.ndarray, min_dom: float = 6.0, dist_thr: float = 58.0) -> np.ndarray:
    """Background removal for green OR magenta screens (auto-detected).
    1. bg samples from 8 border patches; hue = green-dominance or magenta-dominance.
    2. candidates = close to bg color OR bg-hue-dominant.
    3. bg = border-connected flood fill, minus a protected zone around sure-fg.
    4. enclosed holes filled; despill; 1px halo cut."""
    h, w, _ = rgb.shape
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)

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

    # hue dominance of the background: green (g high) or magenta (min(r,b) high)
    med = samples[-1]
    green_dom = med[1] - max(med[0], med[2])
    magenta_dom = min(med[0], med[2]) - med[1]
    if magenta_dom > green_dom:
        dom = np.minimum(r, b) - g          # magenta dominance
        dom_bg = float(magenta_dom)
    else:
        dom = g - np.maximum(r, b)          # green dominance
        dom_bg = float(green_dom)

    if dom_bg > 10:
        cand = ((dist < dist_thr) & (dom > min_dom)) | ((dom > 12) & (dist < dist_thr + 85))
    else:
        cand = (dist < dist_thr) | ((dom > 12) & (dist < dist_thr + 85))

    labels, _ = ndimage.label(cand)
    border_labels = set(np.unique(np.concatenate([
        labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])))
    border_labels.discard(0)
    bg = np.isin(labels, list(border_labels)) if border_labels else np.zeros((h, w), bool)

    sure_fg = (dom < 4) | (dist > 115)
    protect = np.asarray(Image.fromarray((sure_fg * 255).astype(np.uint8))
                         .filter(ImageFilter.MaxFilter(5)), dtype=np.uint8) > 0
    bg &= ~protect

    fg_filled = ndimage.binary_fill_holes(~bg)
    bg = ~fg_filled

    alpha = np.where(bg, 0.0, 255.0)
    spill = (~bg) & (dom > 8)
    g2 = g.copy()
    if magenta_dom > green_dom:
        # magenta spill: pull r/b toward each other
        over = np.minimum(r, b) - g
        fix = spill & (over > 8)
        r2 = r.copy(); b2 = b.copy()
        r2[fix] = (r[fix] + b[fix]) / 2
        b2[fix] = r2[fix]
        img = np.dstack([r2, g, b2, alpha]).astype(np.uint8)
    else:
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

    arr = np.asarray(im).astype(np.float32)
    edge = (arr[..., 3] > 0) & (arr[..., 3] < 250)
    dom2 = arr[..., 1] - np.maximum(arr[..., 0], arr[..., 2])
    fix = edge & (dom2 > 12)
    arr[..., 1][fix] = np.maximum(arr[..., 0][fix], arr[..., 2][fix]) * 1.04
    return np.clip(arr, 0, 255).astype(np.uint8)


def content_bbox(rgba, erode=0):
    a = rgba[..., 3]
    if erode:
        a = np.asarray(Image.fromarray(a).filter(ImageFilter.MinFilter(1 + 2 * erode)))
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def key_adaptive(rgb, min_dom):
    """Key with a growing distance threshold until the background actually lets go
    (vignettes / gradients need more head-room than flat screens)."""
    for thr in (58, 70, 82):
        k = key_background(rgb, min_dom, dist_thr=thr)
        h, w = k.shape[:2]
        bb = content_bbox(k)
        if bb is None:
            continue
        x0, y0, x1, y1 = bb
        if (x1 - x0) < 0.94 * w and (y1 - y0) < 0.94 * h:
            return k
    return k


def process_clip(breed, clip, sheet_names):
    """Slice every sheet, normalize sizes across sheets, interleave frames, crop, save."""
    sheet_frames = []          # list of lists of keyed arrays
    sheet_boxes = []           # per-sheet union bbox (tight, eroded)
    for name in sheet_names:
        src = os.path.join(RAW, name + ".png")
        if not os.path.exists(src):
            print(f"MISSING sheet {name}")
            return False
        grid = 2 if name in GRID2 else (1 if name in GRID1 else None)
        if grid is None:
            print(f"UNKNOWN GRID for {name}")
            return False
        cells = slice_cells(src, grid)
        md = MIN_DOM.get(name, 6.0)
        keyed = [key_adaptive(np.asarray(c), md) for c in cells]
        boxes = [content_bbox(k, erode=2) for k in keyed]
        if any(b is None for b in boxes):
            boxes = [b for b in boxes if b]
        if not boxes:
            print(f"EMPTY sheet {name}")
            return False
        bx0 = min(b[0] for b in boxes); by0 = min(b[1] for b in boxes)
        bx1 = max(b[2] for b in boxes); by1 = max(b[3] for b in boxes)
        sheet_frames.append(keyed)
        sheet_boxes.append((bx0, by0, bx1, by1))

    # ---- size normalization: the smallest cat height is the reference, so the
    # same kitten never changes size between interleaved sheets
    ref_h = min(b[3] - b[1] for b in sheet_boxes)
    scaled = []
    for keyed, (bx0, by0, bx1, by1) in zip(sheet_frames, sheet_boxes):
        h = by1 - by0
        s = min(ref_h / h, 1.0) if h > 0 else 1.0
        if abs(s - 1.0) < 0.03:
            s = 1.0
            scaled.append(keyed)
            continue
        w = bx1 - bx0
        tw, th = max(1, int(w * s)), max(1, int(h * s))
        sheet_scaled = []
        for k in keyed:
            crop = Image.fromarray(k).crop((bx0, by0, bx1, by1)).resize((tw, th), Image.LANCZOS)
            sheet_scaled.append(np.asarray(crop))
        scaled.append(sheet_scaled)

    # ---- interleave: A0 B0 A1 B1 ...
    keyed = []
    max_len = max(len(k) for k in scaled)
    for i in range(max_len):
        for k in scaled:
            if i < len(k):
                keyed.append(k[i])

    # ---- global union bbox (eroded to ignore edge remnants), pad, crop, place
    boxes = [content_bbox(k, erode=2) for k in keyed]
    if any(b is None for b in boxes):
        boxes = [b for b in boxes if b]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    x0 = max(0, x0 - 4); y0 = max(0, y0 - 4)
    x1 = min(keyed[0].shape[1], x1 + 4); y1 = min(keyed[0].shape[0], y1 + 4)

    crop_w, crop_h = x1 - x0, y1 - y0
    scale = min(MAX_SIDE / max(crop_w, crop_h), 1.0)
    tw, th = max(1, int(crop_w * scale)), max(1, int(crop_h * scale))

    outdir = os.path.join(OUT, breed, clip)
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.startswith("frame_") and f.endswith(".png"):
            os.remove(os.path.join(outdir, f))
    for i, k in enumerate(keyed):
        cropped = Image.fromarray(k).crop((x0, y0, x1, y1)).resize((tw, th), Image.LANCZOS)
        canvas = Image.new("RGBA", (BOX, BOX), (0, 0, 0, 0))
        canvas.paste(cropped, ((BOX - tw) // 2, BOX - th), cropped)
        canvas.save(os.path.join(outdir, f"frame_{i:02d}.png"), optimize=True)
    print(f"OK {breed}/{clip}: {len(keyed)} frames")
    return True


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
            print(f"MISSING fx {src_name}")
            continue
        im = Image.open(src).convert("RGB")
        arr = np.asarray(im).astype(np.float32)
        lum = arr.max(axis=2)
        alpha = np.clip((lum - 26) / (110 - 26), 0, 1) ** 0.9 * 255
        out = np.zeros((*lum.shape, 4), dtype=np.uint8)
        out[..., 0] = np.clip(228 + lum * 0.12, 0, 255).astype(np.uint8)
        out[..., 1] = np.clip(236 + lum * 0.10, 0, 255).astype(np.uint8)
        out[..., 2] = 255
        out[..., 3] = alpha.astype(np.uint8)
        base = Image.fromarray(out)
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
    for (breed, clip), sheets in SHEETS.items():
        if only and f"{breed}/{clip}" not in only:
            continue
        process_clip(breed, clip, sheets)
    for clip, sheets in MAGENTA_SHEETS.items():
        if only and f"calico/{clip}" not in only:
            continue
        process_clip("calico", clip, sheets)
    if not only or "fx" in only:
        process_glass()


if __name__ == "__main__":
    main()
