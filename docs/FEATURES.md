# MeowCat — Feature Reference

## 1. The cat (renderer)

The cat is **painted procedurally every frame** — no images. Layer stack: ground shadow → tail
(bezier with follow-through + tabby rings) → back legs (darker) → torso (radial volume gradient,
belly patch, ambient-occlusion under the chin, fur pattern, chest tufts) → front legs (with breed
paw-socks) → head group (ears with pink inners, volume gradient, specular gloss, breed face pattern,
whiskers with sway, glossy eyes: iris gradient + pupil + 2 catchlights + eyeliner, nose highlight,
ω-mouth) → accessories → state effects → floating emotes.

| Pose | Motion design |
|---|---|
| Walk | 1.6 Hz diagonal-pair gait (FL+BR vs FR+BL), body rises mid-stride, head follows at 55 %, tail sway 0.8 Hz |
| Run / Chase | 2.6 Hz gait, ±26° swing, 6° forward lean, ears swept back; chasing steers to the mouse each frame |
| Idle | breathing (±1.3 % squash at 0.3 Hz), slow look-around head tilts, blink every ~3.7 s, lazy tail |
| Sit | haunches folded, tail wrapped to the front with slow flicks |
| Sleep | lying flat, ±5 % breathing at 0.17 Hz, closed eyes, purr loop, Zzz rising |
| Dance | 2 Hz bounce + ±12° body roll, alternating paw pumps, ±25° tail wag, note emotes |
| Jump | ballistic: takeoff stretch (vy < −60), apex tuck (legs 46°, squash 0.90), dive (vy > 140); ground shadow shrinks with altitude; landing squash + thud |
| Yarn | crouch + one paw batting at 2 Hz; ball rolls up to 26 px with a trailing thread |
| Scratch | reared against the edge, paws alternating at 4 Hz, pulsing scratch lines |
| Petted | ^^ happy eyes, blush, pack emotes, wiggle |
| Dragged | dangling swaying legs, wide eyes, ears back, shrink-shadow |

## 2. AI brain

Mood: `Happiness` `Energy` `Boredom` ∈ [0,100]. Passive rates: energy −0.10/s (−0.28 while
running/dancing, +6/s asleep), boredom +0.25/s idle / +0.10 walking, happiness drifts to 55.
Completion bonuses: dance/yarn −18 boredom +10 happiness; chase −12/+6; walk −4/+1; scratch −8/+2;
pet +8 happiness (+1 coin, 30 s cooldown); feed +20 happiness +15 energy.

Selection = weighted roulette, no instant repeats (repeat weight 0.15). Sleep weight ×4 when energy
< 30; dance ×3 when boredom > 60; chase ×2.5 when the mouse is moving & boredom > 40; window-jump
enabled when boredom > 25 and windows exist; energy < 8 forces sleep. Standing on a window top
after a jump → automatic hop back down to the floor.

Coins: +1/45 s alive · +2 per action · +5 per dance · +1 per pet · +50 daily gift.

## 3. Cat Store

| Category | Items |
|---|---|
| Breeds | Orange Tabby (free) · Tuxedo 100 · Calico 120 · Siamese 140 · British Shorthair 150 · White Persian 180 |
| Accessories (stackable ×3) | Party Hat 40 · Top Hat 60 · Head Bow 35 · Bow Tie 35 · Round Glasses 50 · Cozy Scarf 55 |
| Emote packs | Classic Hearts (free) · Surprise ! 25 · Zzz Clouds 30 · Music Notes 30 · Sparkles 45 |
| Size | slider 0.5× – 2.0× (free) |

Right pane = live animated preview of the pending look (walking cat at your size setting; choosing
an emote pack showcases it for 2.6 s). Buy once → own forever; equip/unequip freely. Everything is
validated in `CoinWallet` (no overdraft, no double-buy) and covered by unit tests.

## 4. Window jumping

The host enumerates visible, non-minimized, non-cloaked, titled top-level windows ≥ 220×140 px
(excluding our own windows, the taskbar and tool windows) every 1.2 s via user32/DWM. Pick a target
from the menu or let the brain choose one: the cat walks… well, leaps — along a piecewise-parabolic
arc to the window's top edge, lands with a squash + thud, sits proudly, then hops back down when it
next decides to move. The cat can also wander along window tops afterwards — hop-down happens
automatically.

## 5. Sounds

All synthesized (44.1 kHz 16-bit) by `scripts/gen_assets.py`: `meow` (750→460 Hz glide, vibrato),
`purr` (26 Hz modulated rumble), `patter`/`run_patter` (noise taps), `whoosh` (band-swept noise),
`land` (thud + click), `coin` (E6→C6 ding), `scratch` (scrape texture), `chirp`, `dance_loop`
(112 BPM kick/hat/arp). Volume 0.6 default, mute toggle persisted, 120 ms anti-spam cooldown.

## 6. Persistence & settings

`%APPDATA%\MeowCat\config.json` — coins, owned items, equipped breed/accessories/emote pack, size,
sound, mood, daily-gift date, cat name. Corrupt files are backed up (`*.corrupt-*`) and replaced
with defaults; all values sanitized on load.
