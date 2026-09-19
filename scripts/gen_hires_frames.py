#!/usr/bin/env python3
"""Complementary 2x2 sheets for 8-frame motion clips + 4-frame stationary clips.
B-sheets capture the opposite half of each cycle so A+B interleave into 8 frames.
Resumable; sequential with 429 backoff."""
import os
import subprocess
import sys
import time

RAW = "/home/z/my-project/meow/art_raw"
GREY = "fluffy grey tabby kitten with white muzzle chest belly and paws, soft dark grey tabby stripes, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
GREEN = "Solid flat pure green background, no text, no labels, no grid lines, no shadow on the ground, even soft lighting"

JOBS = [
    # B-halves of the motion cycles (interleave with existing A sheets -> 8 frames)
    ("gt_walk_b", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten walking in profile, full body side view facing right, whole body always visible, the four cells show the OPPOSITE half of the walking stride compared to the first half: front legs reaching far forward, back legs extended pushing off, body gliding between steps, legs in clearly different positions in every cell, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_run_b", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten running fast in profile, full body side view facing right, the four cells show the second half of the gallop cycle: body stretched long with front paws reaching, then gathered compact with hind paws under the body, airborne moment, legs clearly different in every cell, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_jump_b", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten jumping in profile, full body side view facing right: cell 1 deep crouch compressing before the leap, cell 2 hind legs pushing off the ground, cell 3 high in the air body stretched upward, cell 4 descending with front paws reaching for the ground, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_dance_b", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten dancing upright on its hind legs, front view, swaying to the RIGHT side now with front paws up and hips swung right, one paw pointing up, all four cells clearly different dance poses, identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_scratch_b", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten scratching a glass pane in profile, full body side view facing right: cell 1 crouched low gathering, cell 2 rising up with paws mid-height, cell 3 claws extended high above the head scratching down, cell 4 landing back on all fours, legs and body clearly different in every cell, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    # 4-frame versions of clips that only had 2 frames
    ("gt_pounce4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten playing with a small blue yarn ball, full body side view facing right: crouch low, wiggle shoulders, bat the ball with one front paw, ball rolling away with kitten chasing one step, clearly different poses in every cell, identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_eat4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the same kitten eating from a small blue food bowl, full body side view facing right: head lowering, head in the bowl nibbling, head lifting with mouth closed chewing, head up licking lips happy, clearly different in every cell, identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_sit4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four frames of the same kitten sitting upright, tail wrapped around its front paws, front view, the frames differ subtly in breathing depth, ear position and tail tip movement, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_sleep4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four frames of the same kitten sleeping curled up in a ball with eyes closed peacefully, side view, the frames differ subtly in breathing depth and paw twitch, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_idle4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four frames of the same kitten standing on all fours alert and curious, full body side view facing right, the frames differ subtly in head angle, ear flick and tail sway, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_happy4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four frames of the same kitten being petted and bouncing with joy, eyes closed in a happy smiling expression with blushing cheeks, front view, the frames differ in bounce height and paw position, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_angry4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four frames of the same angry kitten: arched back with fur puffed up, ears flattened back, hissing with open mouth, front three-quarter view, the frames differ in back arch depth and tail lashing position, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("gt_dangle4", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four frames of the same kitten held up in the air dangling in a gentle hand, body hanging relaxed with all four legs dangling straight down, wide surprised cute eyes, front view, the frames differ in leg sway angle, all four cells identical scale, same kitten in every cell. {GREY}. {GREEN}"),
    ("calico_walk_magenta", "1024x1024",
     f"Sprite sheet for animation: a 2x2 grid of four sequential frames of the kitten walking, full body side view facing right, each cell a different phase of the walking gait with the legs in different positions, all four cells identical scale, same kitten in every cell. fluffy calico kitten with white fur with orange and black patches, white muzzle chest belly and paws, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty. Solid flat pure magenta background, no text, no labels, no grid lines, no shadow on the ground, even soft lighting"),
    ("wallpaper", "1440x720",
     "Windows 11 style desktop wallpaper, abstract flowing silky blue and violet light ribbons blooming on a deep dark blue background, soft glow, glossy, clean minimal composition, high quality"),
]


def generate(job):
    name, size, prompt = job
    out = os.path.join(RAW, name + ".png")
    if "--force" not in sys.argv and os.path.exists(out) and os.path.getsize(out) > 10000:
        return name, "skip"
    for attempt in range(6):
        try:
            r = subprocess.run(["z-ai", "image", "-p", prompt, "-o", out, "-s", size],
                               capture_output=True, text=True, timeout=420)
            if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 10000:
                return name, "OK"
            wait = 25 + attempt * 20
            print(f"  retry {name} in {wait}s (rc={r.returncode})", flush=True)
        except Exception as ex:
            wait = 25 + attempt * 20
            print(f"  retry {name} in {wait}s ({ex})", flush=True)
        time.sleep(wait)
    return name, "FAIL"


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    todo = [j for j in JOBS if not only or j[0] in only]
    for job in todo:
        name, status = generate(job)
        print(f"{status} {name}", flush=True)
    print("ALL_DONE")


if __name__ == "__main__":
    main()
