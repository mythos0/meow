#!/usr/bin/env python3
"""Parallel sprite-sheet generator (4 workers). Resumable: skips existing files.
Run repeatedly until it reports ALL_DONE. Exits 0 when done, 2 when the time
budget ran out (just call it again)."""
import concurrent.futures as cf
import os
import subprocess
import sys
import time

RAW = "/home/z/my-project/meow/art_raw"
os.makedirs(RAW, exist_ok=True)
BUDGET = 540  # seconds per invocation

GREY = "fluffy grey tabby kitten with white muzzle chest belly and paws, soft dark grey tabby stripes, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
ORANGE = "fluffy orange tabby kitten with white muzzle chest belly and paws, soft darker orange stripes, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
TUX = "fluffy black-and-white tuxedo kitten with black fur and white chest belly muzzle and white paws, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
CALICO = "fluffy calico kitten with white fur with orange and black patches, white muzzle chest belly and paws, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
SIAM = "fluffy siamese kitten with cream fur and dark brown points on the face ears paws and tail, huge round sapphire-blue eyes, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
PERS = "fluffy white persian kitten with long soft white fur, huge round sapphire-blue eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"

SUFFIX = "Solid flat pure green background, no text, no labels, no grid lines, no shadow on the ground, even soft lighting"

WALK = "four sequential frames of the kitten walking, full body side view facing right, each cell a different phase of the walking gait with the legs in different positions, all four cells identical scale, same kitten in every cell"
RUN = "four sequential frames of the kitten running fast, full body side view facing right, stretched galloping pose with front legs reaching forward and back legs pushing off, all four cells identical scale, same kitten in every cell"
JUMP = "four sequential frames of the kitten jumping: first cell crouched ready to leap, second cell launching upward fully stretched, third cell mid-air with legs tucked, fourth cell landing on front paws, full body side view facing right, all four cells identical scale, same kitten in every cell"
DANCE = "four sequential frames of the kitten dancing upright standing on its hind legs, front paws raised up swaying side to side, happy open-mouth smile, front view, all four cells identical scale, same kitten in every cell"
SCRATCH = "four sequential frames of the kitten scratching a glass pane: first cell reared up tall on hind legs with front paws raised high, second cell claws fully extended reaching up, third cell swiping the claws down fast, fourth cell crouched follow-through after the swipe, full body side view facing right, all four cells identical scale, same kitten in every cell"
SIT = "two frames of the kitten sitting upright, tail wrapped around its front paws, the two frames differ only in tail position, front view, identical scale in both cells, same kitten in every cell"
SLEEP = "two frames of the kitten sleeping curled up in a ball with eyes closed peacefully, tail wrapped around the body, the two frames differ only in breathing position, side view, identical scale in both cells, same kitten in every cell"
IDLE = "two frames of the kitten standing on all fours, alert curious expression looking slightly upward, the two frames differ only in head position, full body side view facing right, identical scale in both cells, same kitten in every cell"
HAPPY = "two frames of the kitten being petted, eyes closed in a happy smiling expression with blushing cheeks, sitting upright and bouncing with joy, front view, identical scale in both cells, same kitten in every cell"
ANGRY = "two frames of the kitten angry: arched back with fur puffed up, ears flattened back, hissing with open mouth showing tiny teeth, front three-quarter view, identical scale in both cells, same kitten in every cell"
DANGLE = "two frames of the kitten held up in the air dangling, body hanging relaxed with all four legs dangling straight down, wide surprised cute eyes, front view, identical scale in both cells, same kitten in every cell"
EAT = "two frames of the kitten eating from a small blue food bowl on the ground, head lowered into the bowl, the two frames differ only in head position, full body side view facing right, identical scale in both cells, same kitten in every cell"
POUNCE = "two frames of the kitten crouched low in a playful pose batting a small blue yarn ball with one front paw, the two frames differ only in paw position, full body side view facing right, identical scale in both cells, same kitten in every cell"

JOBS = []
def add(name, size, prompt):
    JOBS.append((name, size, prompt))

add("grey_tabby_walk", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {WALK}. {GREY}. {SUFFIX}")
add("grey_tabby_run", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {RUN}. {GREY}. {SUFFIX}")
add("grey_tabby_jump", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {JUMP}. {GREY}. {SUFFIX}")
add("grey_tabby_dance", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {DANCE}. {GREY}. {SUFFIX}")
add("grey_tabby_scratch", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {GREY}. {SUFFIX}")
add("grey_tabby_sit", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {GREY}. {SUFFIX}")
add("grey_tabby_sleep", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SLEEP}. {GREY}. {SUFFIX}")
add("grey_tabby_idle", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {IDLE}. {GREY}. {SUFFIX}")
add("grey_tabby_happy", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {HAPPY}. {GREY}. {SUFFIX}")
add("grey_tabby_angry", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {ANGRY}. {GREY}. {SUFFIX}")
add("grey_tabby_dangle", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {DANGLE}. {GREY}. {SUFFIX}")
add("grey_tabby_eat", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {EAT}. {GREY}. {SUFFIX}")
add("grey_tabby_pounce", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {POUNCE}. {GREY}. {SUFFIX}")
add("orange_tabby_walk", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {WALK}. {ORANGE}. {SUFFIX}")
add("orange_tabby_sit", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {ORANGE}. {SUFFIX}")
add("orange_tabby_scratch", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {ORANGE}. {SUFFIX}")
add("tuxedo_walk", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {WALK}. {TUX}. {SUFFIX}")
add("tuxedo_sit", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {TUX}. {SUFFIX}")
add("tuxedo_scratch", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {TUX}. {SUFFIX}")
add("calico_walk", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {WALK}. {CALICO}. {SUFFIX}")
add("calico_sit", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {CALICO}. {SUFFIX}")
add("calico_scratch", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {CALICO}. {SUFFIX}")
add("siamese_walk", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {WALK}. {SIAM}. {SUFFIX}")
add("siamese_sit", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {SIAM}. {SUFFIX}")
add("siamese_scratch", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {SIAM}. {SUFFIX}")
add("persian_walk", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {WALK}. {PERS}. {SUFFIX}")
add("persian_sit", "1344x768", f"Sprite sheet for animation: a horizontal row of 2 cells of {SIT}. {PERS}. {SUFFIX}")
add("persian_scratch", "1024x1024", f"Sprite sheet for animation: a 2x2 grid of {SCRATCH}. {PERS}. {SUFFIX}")
add("fx_glass_shatter", "1024x1024", "Photorealistic shattered glass effect: spiderweb cracks radiating from one central impact point, thin bright white fracture lines, small triangular glass shard chips near the impact, subtle prismatic rainbow glints in the cracks, isolated on a pure solid black background, nothing else in frame, no text, high detail")
add("fx_claw_marks", "1024x1024", "Photorealistic claw scratch marks gouged deep into glass: three long vertical parallel scratch gouges with fine bright white scratched streaks, glass dust and tiny chips along the scratches, sharp claw points at the bottom ends, isolated on a pure solid black background, nothing else in frame, no text, high detail")
add("wallpaper", "1440x720", "Windows 11 style desktop wallpaper, abstract flowing silky blue and violet light ribbons blooming on a deep dark blue background, soft glow, glossy, clean minimal composition, high quality")


def generate(job):
    name, size, prompt = job
    out = os.path.join(RAW, name + ".png")
    for attempt in range(3):
        r = subprocess.run(["z-ai", "image", "-p", prompt, "-o", out, "-s", size],
                           capture_output=True, text=True, timeout=420)
        if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 10000:
            return name, True
        time.sleep(4)
    return name, False


def main():
    start = time.time()
    todo = [(n, s, p) for (n, s, p) in JOBS
            if not (os.path.exists(os.path.join(RAW, n + ".png"))
                    and os.path.getsize(os.path.join(RAW, n + ".png")) > 10000)]
    print(f"pending: {len(todo)}/{len(JOBS)}", flush=True)
    if not todo:
        print("ALL_DONE", flush=True)
        return 0

    done = fail = 0
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(generate, j): j[0] for j in todo}
        for fut in cf.as_completed(futs, timeout=BUDGET):
            name, ok = fut.result()
            done += 1
            if not ok:
                fail += 1
                print(f"FAIL {name}", flush=True)
            else:
                print(f"OK {name} ({done} finished, {time.time()-start:.0f}s)", flush=True)
            if time.time() - start > BUDGET:
                break

    remaining = [n for (n, s, p) in JOBS
                 if not (os.path.exists(os.path.join(RAW, n + ".png"))
                         and os.path.getsize(os.path.join(RAW, n + ".png")) > 10000)]
    print(f"remaining: {len(remaining)} {remaining[:6]}", flush=True)
    print("ALL_DONE" if not remaining else "TIME_UP", flush=True)
    return 0 if not remaining else 2


if __name__ == "__main__":
    sys.exit(main())
