#!/usr/bin/env python3
"""Post-slice repair pass for calico walk frames.

Two deterministic fixes on the final 512x512 frames:
  1. bite-fill: small transparent holes fully enclosed by the cat (chest/muzzle
     bites where pink-lit fur keyed through) become opaque again.
  2. pink-drop: small opaque pockets of screen color low in the frame (trapped
     magenta floor between the legs) become transparent. Face zone is exempt
     so pink noses / tongues are never touched.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = "/home/z/my-project/meow/src/MeowCat/Assets/sprites/calico"
MAX_BITE = 1500          # px — enclosed transparent regions below this are fur bites
MAX_PINK = 4500          # px — opaque screen pockets below this and low in frame are floor
FACE_Y = 0.45            # pink-drop never touches the top 45% (face)


def repair_frame(path: str) -> None:
    im = np.asarray(Image.open(path).convert("RGBA")).copy()
    a = im[..., 3]
    fg = a > 40

    # 1. bite-fill: enclosed transparent regions (small ones)
    filled = ndimage.binary_fill_holes(fg)
    holes = filled & ~fg
    lab, n = ndimage.label(holes)
    if n:
        sizes = ndimage.sum(holes, lab, range(1, n + 1))
        for i, s in enumerate(sizes):
            if 0 < s <= MAX_BITE:
                comp = lab == (i + 1)
                a[comp] = 255

    # 2. pink-drop: opaque magenta pockets low in the frame
    r, g, b = im[..., 0].astype(float), im[..., 1].astype(float), im[..., 2].astype(float)
    dom = np.minimum(r, b) - g
    h = a.shape[0]
    pink = (a > 40) & (dom > 12) & (np.arange(h)[:, None] > h * FACE_Y)
    lab2, n2 = ndimage.label(pink)
    if n2:
        sizes2 = ndimage.sum(pink, lab2, range(1, n2 + 1))
        for i, s in enumerate(sizes2):
            if 0 < s <= MAX_PINK:
                comp = lab2 == (i + 1)
                med_dom = float(np.median(dom[comp]))
                if med_dom > 20:            # clearly screen-colored, not warm fur
                    a[comp] = 0

    im[..., 3] = a
    Image.fromarray(im).save(path, optimize=True)
    print(f"repaired {os.path.basename(os.path.dirname(path))}/{os.path.basename(path)}")


def main():
    clip = sys.argv[1] if len(sys.argv) > 1 else "walk"
    d = os.path.join(ROOT, clip)
    for f in sorted(os.listdir(d)):
        if f.endswith(".png"):
            repair_frame(os.path.join(d, f))


if __name__ == "__main__":
    main()
