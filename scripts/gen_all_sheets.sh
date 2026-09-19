#!/usr/bin/env bash
# Batch-generate all sprite sheets + FX assets for MeowCat v2.0.0
# Each line: name|size|prompt
set -u
cd "$(dirname "$0")/../art_raw"

GREY="fluffy grey tabby kitten with white muzzle chest belly and paws, soft dark grey tabby stripes, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
ORANGE="fluffy orange tabby kitten with white muzzle chest belly and paws, soft darker orange stripes, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
TUX="fluffy black-and-white tuxedo kitten with black fur and white chest belly muzzle and white paws, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
CALICO="fluffy calico kitten with white fur with orange and black patches, white muzzle chest belly and paws, huge round golden-amber eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
SIAM="fluffy siamese kitten with cream fur and dark brown points on the face ears paws and tail, huge round sapphire-blue eyes, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"
PERS="fluffy white persian kitten with long soft white fur, huge round sapphire-blue eyes, pink nose, wearing a red collar with a round golden tag, photorealistic 3D rendered character, ultra-detailed realistic fur, cute Pixar-style kitty"

SUFFIX="Solid flat pure green background, no text, no labels, no grid lines, no shadow on the ground, even soft lighting"

WALK_DESC="four sequential frames of the kitten walking, full body side view facing right, each cell a different phase of the walking gait with the legs in different positions, all four cells identical scale, same kitten in every cell"
RUN_DESC="four sequential frames of the kitten running fast, full body side view facing right, stretched galloping pose with front legs reaching forward and back legs pushing off, all four cells identical scale, same kitten in every cell"
JUMP_DESC="four sequential frames of the kitten jumping: first cell crouched ready to leap, second cell launching upward fully stretched, third cell mid-air with legs tucked, fourth cell landing on front paws, full body side view facing right, all four cells identical scale, same kitten in every cell"
DANCE_DESC="four sequential frames of the kitten dancing upright standing on its hind legs, front paws raised up swaying side to side, happy open-mouth smile, front view, all four cells identical scale, same kitten in every cell"
SCRATCH_DESC="four sequential frames of the kitten scratching a glass pane: first cell reared up tall on hind legs with front paws raised high, second cell claws fully extended reaching up, third cell swiping the claws down fast, fourth cell crouched follow-through after the swipe, full body side view facing right, all four cells identical scale, same kitten in every cell"
SIT_DESC="two frames of the kitten sitting upright, tail wrapped around its front paws, the two frames differ only in tail position, front view, identical scale in both cells, same kitten in every cell"
SCR2_DESC="two frames of the kitten sleeping curled up in a ball with eyes closed peacefully, tail wrapped around the body, the two frames differ only in breathing position, side view, identical scale in both cells, same kitten in every cell"
IDLE_DESC="two frames of the kitten standing on all fours, alert curious expression looking slightly upward, the two frames differ only in head position, full body side view facing right, identical scale in both cells, same kitten in every cell"
HAPPY_DESC="two frames of the kitten being petted, eyes closed in a happy smiling expression with blushing cheeks, sitting upright and bouncing with joy, front view, identical scale in both cells, same kitten in every cell"
ANGRY_DESC="two frames of the kitten angry: arched back with fur puffed up, ears flattened back, hissing with open mouth showing tiny teeth, front three-quarter view, identical scale in both cells, same kitten in every cell"
DANGLE_DESC="two frames of the kitten held up in the air dangling, body hanging relaxed with all four legs dangling straight down, wide surprised cute eyes, front view, identical scale in both cells, same kitten in every cell"
EAT_DESC="two frames of the kitten eating from a small blue food bowl on the ground, head lowered into the bowl, the two frames differ only in head position, full body side view facing right, identical scale in both cells, same kitten in every cell"
POUNCE_DESC="two frames of the kitten crouched low in a playful pose batting a small blue yarn ball with one front paw, the two frames differ only in paw position, full body side view facing right, identical scale in both cells, same kitten in every cell"

PROMPTS=(
"grey_tabby_walk|1024x1024|Sprite sheet for animation: a 2x2 grid of $WALK_DESC. $GREY. $SUFFIX"
"grey_tabby_run|1024x1024|Sprite sheet for animation: a 2x2 grid of $RUN_DESC. $GREY. $SUFFIX"
"grey_tabby_jump|1024x1024|Sprite sheet for animation: a 2x2 grid of $JUMP_DESC. $GREY. $SUFFIX"
"grey_tabby_dance|1024x1024|Sprite sheet for animation: a 2x2 grid of $DANCE_DESC. $GREY. $SUFFIX"
"grey_tabby_scratch|1024x1024|Sprite sheet for animation: a 2x2 grid of $SCRATCH_DESC. $GREY. $SUFFIX"
"grey_tabby_sit|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SIT_DESC. $GREY. $SUFFIX"
"grey_tabby_sleep|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SCR2_DESC. $GREY. $SUFFIX"
"grey_tabby_idle|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $IDLE_DESC. $GREY. $SUFFIX"
"grey_tabby_happy|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $HAPPY_DESC. $GREY. $SUFFIX"
"grey_tabby_angry|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $ANGRY_DESC. $GREY. $SUFFIX"
"grey_tabby_dangle|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $DANGLE_DESC. $GREY. $SUFFIX"
"grey_tabby_eat|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $EAT_DESC. $GREY. $SUFFIX"
"grey_tabby_pounce|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $POUNCE_DESC. $GREY. $SUFFIX"
"orange_tabby_walk|1024x1024|Sprite sheet for animation: a 2x2 grid of $WALK_DESC. $ORANGE. $SUFFIX"
"orange_tabby_sit|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SIT_DESC. $ORANGE. $SUFFIX"
"orange_tabby_scratch|1024x1024|Sprite sheet for animation: a 2x2 grid of $SCRATCH_DESC. $ORANGE. $SUFFIX"
"tuxedo_walk|1024x1024|Sprite sheet for animation: a 2x2 grid of $WALK_DESC. $TUX. $SUFFIX"
"tuxedo_sit|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SIT_DESC. $TUX. $SUFFIX"
"tuxedo_scratch|1024x1024|Sprite sheet for animation: a 2x2 grid of $SCRATCH_DESC. $TUX. $SUFFIX"
"calico_walk|1024x1024|Sprite sheet for animation: a 2x2 grid of $WALK_DESC. $CALICO. $SUFFIX"
"calico_sit|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SIT_DESC. $CALICO. $SUFFIX"
"calico_scratch|1024x1024|Sprite sheet for animation: a 2x2 grid of $SCRATCH_DESC. $CALICO. $SUFFIX"
"siamese_walk|1024x1024|Sprite sheet for animation: a 2x2 grid of $WALK_DESC. $SIAM. $SUFFIX"
"siamese_sit|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SIT_DESC. $SIAM. $SUFFIX"
"siamese_scratch|1024x1024|Sprite sheet for animation: a 2x2 grid of $SCRATCH_DESC. $SIAM. $SUFFIX"
"persian_walk|1024x1024|Sprite sheet for animation: a 2x2 grid of $WALK_DESC. $PERS. $SUFFIX"
"persian_sit|1344x768|Sprite sheet for animation: a horizontal row of 2 cells of $SIT_DESC. $PERS. $SUFFIX"
"persian_scratch|1024x1024|Sprite sheet for animation: a 2x2 grid of $SCRATCH_DESC. $PERS. $SUFFIX"
"fx_glass_shatter|1024x1024|Photorealistic shattered glass effect: spiderweb cracks radiating from one central impact point, thin bright white fracture lines, small triangular glass shard chips near the impact, subtle prismatic rainbow glints in the cracks, isolated on a pure solid black background, nothing else in frame, no text, high detail"
"fx_claw_marks|1024x1024|Photorealistic claw scratch marks gouged deep into glass: three long vertical parallel scratch gouges with fine bright white scratched streaks, glass dust and tiny chips along the scratches, sharp claw points at the bottom ends, isolated on a pure solid black background, nothing else in frame, no text, high detail"
"wallpaper|1440x720|Windows 11 style desktop wallpaper, abstract flowing silky blue and violet light ribbons blooming on a deep dark blue background, soft glow, glossy, clean minimal composition, high quality"
)

LOG=/home/z/my-project/meow/art_raw/gen.log
: > "$LOG"
for entry in "${PROMPTS[@]}"; do
  name="${entry%%|*}"; rest="${entry#*|}"; size="${rest%%|*}"; prompt="${rest#*|}"
  if [ -s "$name.png" ]; then echo "SKIP $name" >> "$LOG"; continue; fi
  ok=0
  for attempt in 1 2 3; do
    if z-ai image -p "$prompt" -o "$name.png" -s "$size" >> "$LOG" 2>&1; then
      ok=1; break
    fi
    echo "RETRY $name (attempt $attempt)" >> "$LOG"; sleep 3
  done
  if [ $ok -eq 1 ]; then echo "OK $name" >> "$LOG"; else echo "FAIL $name" >> "$LOG"; fi
done
echo "ALL_DONE" >> "$LOG"
