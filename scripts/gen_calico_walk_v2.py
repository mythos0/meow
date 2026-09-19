#!/usr/bin/env python3
"""Regenerate the calico WALK sheet until it keys clean.

The first magenta walk sheet painted a real floor under the cat (cream/brown
strip with magenta bounce) — no color rule can separate paws from a floor.
So: generate several candidates with a hard anti-floor prompt, key each one
with the production keyer, and keep the candidate whose bottom band is the
cleanest (a floating cat keys to nearly nothing below the paws).
"""
import os
import shutil
import subprocess
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import slice_assets_v2 as S

RAW = "/home/z/my-project/meow/art_raw"
NAME = "calico_walk_magenta"

CALICO = ("fluffy calico kitten with white fur with orange and black patches, "
          "white muzzle chest belly and paws, huge round golden-amber eyes, "
          "pink nose, wearing a red collar with a round golden tag, "
          "photorealistic 3D rendered character, ultra-detailed realistic fur, "
          "cute Pixar-style kitty")
WALK = ("four sequential frames of the kitten walking, full body side view facing right, "
        "each cell a different phase of the walking gait with the legs in different positions, "
        "all four cells identical scale, same kitten in every cell")
MAG = ("seamless flat solid magenta studio backdrop filling the whole frame edge to edge, "
       "the kitten floats in mid-air with nothing under its paws, "
       "NO floor, NO ground, NO surface, NO ground shadow, NO reflection, NO haze, "
       "the bottom of every cell is pure flat magenta, no text, no grid lines, "
       "even soft lighting, background is one single uniform magenta color")


def candidates():
    yield "CURRENT", os.path.join(RAW, NAME + ".png")
    for tag in ("a", "b", "c"):
        yield tag, os.path.join(RAW, f"{NAME}_v2_{tag}.png")


def gen(tag: str) -> str:
    out = os.path.join(RAW, f"{NAME}_v2_{tag}.png")
    prompt = f"Sprite sheet for animation: a 2x2 grid of {WALK}. {CALICO}. {MAG}"
    r = subprocess.run(["z-ai", "image", "-p", prompt, "-o", out, "-s", "1024x1024"],
                       capture_output=True, text=True, timeout=420)
    if r.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) < 10000:
        print(f"  gen {tag} FAILED: rc={r.returncode} {r.stderr[-160:]}")
        return None
    return out


def bottom_junk_score(path: str) -> float:
    """Opaque ratio in the bottom 12% of each cell after production keying."""
    try:
        cells = S.slice_cells(path, 2)
    except Exception as ex:
        print(f"  score {os.path.basename(path)} unreadable: {ex}")
        return 1.0
    scores = []
    for c in cells:
        k = S.key_background(np.asarray(c), S.MIN_DOM[NAME])
        h = k.shape[0]
        band = k[int(h * 0.88):, :, 3] > 40
        scores.append(float(band.mean()))
    s = max(scores)
    print(f"  score {os.path.basename(path)}: bottom_opaque={s:.3f}")
    return s


def main():
    results = []
    for tag, path in candidates():
        if tag != "CURRENT":
            path = None
            for attempt in range(2):
                path = gen(tag)
                if path:
                    break
                time.sleep(8)
            if not path:
                continue
        if path and os.path.exists(path):
            results.append((bottom_junk_score(path), path))
        time.sleep(2)

    if not results:
        print("no candidates — keeping current sheet")
        return
    results.sort(key=lambda t: t[0])
    best_score, best = results[0]
    cur = os.path.join(RAW, NAME + ".png")
    if best != cur:
        print(f"best candidate {os.path.basename(best)} ({best_score:.3f}) -> {NAME}.png")
        shutil.copy(best, cur)
    else:
        print(f"current sheet stays (score {best_score:.3f})")


if __name__ == "__main__":
    main()
