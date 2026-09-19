#!/usr/bin/env python3
"""Regenerate the problematic calico sheets (magenta screen) + missing FX sheets + wallpaper.
Uses the z-ai image CLI. Sequential with retries; skips existing outputs unless --force."""
import os
import subprocess
import sys
import time

RAW = "/home/z/my-project/meow/art_raw"
os.makedirs(RAW, exist_ok=True)

CALICO = "fluffy calico kitten with white fur with orange and black patches, white muzzle chest belly and paws, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
MAG = "Solid flat pure magenta background, no text, no labels, no grid lines, no shadow on the ground, even soft lighting"

WALK = "four sequential frames of the kitten walking, full body side view facing right, each cell a different phase of the walking gait with the legs in different positions, all four cells identical scale, same kitten in every cell"
SIT = "two frames of the kitten sitting upright, tail wrapped around its front paws, the two frames differ only in tail position, front view, identical scale in both cells, same kitten in every cell"
SCRATCH = "four sequential frames of the kitten scratching a glass pane: first cell reared up tall on hind legs with front paws raised high, second cell claws fully extended reaching up, third cell swiping the claws down fast, fourth cell crouched follow-through after the swipe, full body side view facing right, all four cells identical scale, same kitten in every cell"

JOBS = [
    ("calico_walk_magenta", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of {WALK}. {CALICO}. {MAG}"),
    ("calico_sit_magenta", "1344x768",
     f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {CALICO}. {MAG}"),
    ("calico_scratch_magenta", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {CALICO}. {MAG}"),
    ("fx_glass_shatter", "1024x1024",
     "Photorealistic shattered glass effect: spiderweb cracks radiating from one central impact point, thin bright white fracture lines, small triangular glass shard chips near the impact, subtle prismatic rainbow glints in the cracks, isolated on a pure solid black background, nothing else in frame, no text, high detail"),
    ("fx_claw_marks", "1024x1024",
     "Photorealistic claw scratch marks gouged deep into glass: three long vertical parallel scratch gouges with fine bright white scratched streaks, glass dust and tiny chips along the scratches, sharp claw points at the bottom ends, isolated on a pure solid black background, nothing else in frame, no text, high detail"),
    ("wallpaper", "1440x720",
     "Windows 11 style desktop wallpaper, abstract flowing silky blue and violet light ribbons blooming on a deep dark blue background, soft glow, glossy, clean minimal composition, high quality"),
]


def main():
    force = "--force" in sys.argv
    for name, size, prompt in JOBS:
        out = os.path.join(RAW, name + ".png")
        if not force and os.path.exists(out) and os.path.getsize(out) > 10000:
            print(f"skip {name}")
            continue
        ok = False
        for attempt in range(3):
            try:
                r = subprocess.run(["z-ai", "image", "-p", prompt, "-o", out, "-s", size],
                                   capture_output=True, text=True, timeout=420)
                if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 10000:
                    print(f"OK {name}")
                    ok = True
                    break
                print(f"retry {name} (attempt {attempt + 1}): rc={r.returncode} {r.stderr[-200:]}")
            except Exception as ex:
                print(f"retry {name} (attempt {attempt + 1}): {ex}")
            time.sleep(4)
        if not ok:
            print(f"FAIL {name}")
    print("DONE")


if __name__ == "__main__":
    main()
