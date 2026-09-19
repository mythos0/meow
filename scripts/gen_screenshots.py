#!/usr/bin/env python3
"""Generate promotional screenshots for the public release repo.
Composites the actual game-ready cat frames onto a Windows 11 style desktop mockup."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = "/home/z/my-project/meow"
SPR = os.path.join(ROOT, "src/MeowCat/Assets/sprites")
OUT = os.path.join(ROOT, "docs/screenshots")
os.makedirs(OUT, exist_ok=True)

W, H = 1600, 900

# ---------------------------------------------------------------- wallpaper
def wallpaper():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    px = np.zeros((H, W, 3), np.float32)                            # 0-255 space
    base = np.array([16, 12, 46], np.float32)                       # deep night blue
    fx = xx / W; fy = yy / H
    for i, (cx, cy, col, amp) in enumerate([
        (0.30, 0.35, (86, 60, 220), 130),
        (0.72, 0.55, (40, 90, 210), 120),
        (0.55, 0.20, (150, 60, 200), 80),
        (0.85, 0.85, (30, 60, 160), 65),
    ]):
        d = np.sqrt(((fx - cx) * 1.4) ** 2 + (fy - cy) ** 2)
        glow = np.exp(-(d * 2.3) ** 2) * amp                        # 0..amp
        ribbon = np.sin(fx * 5.5 + i * 1.7 + fy * 2.0) * 0.5 + 0.5
        glow *= 0.55 + 0.45 * ribbon
        px += glow[..., None] * (np.array(col, np.float32) / 255.0)
    px += base
    px = np.clip(px, 0, 255).astype(np.uint8)
    img = Image.fromarray(px)
    # vignette
    vig = Image.new("L", (W, H), 0)
    dv = ImageDraw.Draw(vig)
    dv.ellipse([-W * 0.25, -H * 0.35, W * 1.25, H * 1.35], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(180))
    dark = Image.new("RGB", (W, H), (6, 4, 22))
    img = Image.composite(img, dark, vig)
    return img


def font(size, bold=True):
    names = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
             else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for n in names:
        if os.path.exists(n):
            return ImageFont.truetype(n, size)
    return ImageFont.load_default()


def paste_cat(base, frame_path, cx, feet_y, height=190):
    cat = Image.open(frame_path).convert("RGBA")
    ratio = height / cat.height
    cat = cat.resize((int(cat.width * ratio), height), Image.LANCZOS)
    shadow = Image.new("RGBA", (cat.width + 30, 34), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    ds.ellipse([0, 8, shadow.width, 30], fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    base.alpha_composite(shadow, (int(cx - cat.width / 2 - 15), feet_y - 18))
    base.alpha_composite(cat, (int(cx - cat.width / 2), feet_y - cat.height))


def window_mockup(base, x, y, w, h, title, accent=(58, 110, 220)):
    box = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(box)
    # rounded window with subtle border + shadow
    d.rounded_rectangle([0, 0, w - 1, h - 1], 10, fill=(250, 250, 252, 246),
                        outline=(180, 184, 194, 255), width=1)
    d.rounded_rectangle([0, 0, w - 1, 36], 10, fill=(243, 243, 246, 250))
    d.rectangle([0, 26, w - 1, 36], fill=(243, 243, 246, 250))
    d.text((14, 8), title, font=font(15, bold=False), fill=(60, 60, 66))
    # caption buttons
    for i, c in enumerate([(200, 200, 205), (200, 200, 205), (232, 84, 84)]):
        d.ellipse([w - 90 + i * 28, 14, w - 80 + i * 28, 24], fill=c + (255,))
    # fake content: browser-ish bars / text lines
    d.rectangle([12, 48, w - 12, 76], fill=(238, 240, 245, 255))
    d.rounded_rectangle([20, 54, w - 120, 70], 8, fill=(255, 255, 255, 255))
    yy = 90
    while yy < h - 24:
        d.rounded_rectangle([16, yy, 16 + int((w - 40) * 0.86), yy + 9], 4, fill=(228, 231, 238, 255))
        d.rounded_rectangle([16, yy + 15, 16 + int((w - 40) * 0.62), yy + 24], 4, fill=(228, 231, 238, 255))
        yy += 40
    d.rectangle([0, 0, 4, h], fill=accent + (255,))
    sh = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    dsh = ImageDraw.Draw(sh)
    dsh.rounded_rectangle([20, 20, w + 20, h + 20], 12, fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(sh, (x - 20, y - 20))
    base.alpha_composite(box, (x, y))


def folder_icon(size=64):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w, h = size, size
    d.rounded_rectangle([4, h * 0.32, w - 4, h - 6], 6, fill=(255, 200, 87, 255))
    d.polygon([(4, h * 0.34), (4, h * 0.22), (w * 0.45, h * 0.22), (w * 0.52, h * 0.32)],
              fill=(255, 214, 110, 255))
    d.rounded_rectangle([4, h * 0.34, w - 4, h - 6], 6, outline=(214, 158, 46, 255), width=2)
    return img


def taskbar(base):
    h = 56
    bar = Image.new("RGBA", (W, h), (14, 16, 24, 216))
    d = ImageDraw.Draw(bar)
    d.line([(0, 0), (W, 0)], fill=(90, 100, 130, 120), width=1)
    base.alpha_composite(bar, (0, H - h))
    # start + app icons
    x = W // 2 - 160
    for i, col in enumerate([(90, 140, 250), (110, 200, 240), (250, 200, 90), (150, 150, 158), (240, 110, 130)]):
        d2 = ImageDraw.Draw(base)
        d2.rounded_rectangle([x + i * 52, H - 42, x + i * 52 + 34, H - 8], 7, fill=col + (235,))
    clock = ImageDraw.Draw(base)
    clock.text((W - 110, H - 40), "14:32\n20/09/2026", font=font(11, bold=False), fill=(230, 232, 240))


def speech_bubble(base, cx, top, title, message):
    f_t, f_m = font(20), font(17, bold=False)
    d = ImageDraw.Draw(base)
    tw = d.textlength(title, font=f_t)
    mw = d.textlength(message, font=f_m)
    w = max(tw, mw) + 44
    h = 46 + (34 if message else 0)
    x, y = int(cx - w / 2), int(top)
    pad = 18
    bubble = Image.new("RGBA", (int(w) + pad * 2, h + pad * 2 + 20), (0, 0, 0, 0))
    db = ImageDraw.Draw(bubble)
    db.rounded_rectangle([pad, pad, pad + w, pad + h], 16, fill=(255, 255, 255, 242),
                         outline=(90, 96, 110, 160))
    db.polygon([(pad + w / 2 - 10, pad + h - 1), (pad + w / 2, pad + h + 16), (pad + w / 2 + 11, pad + h - 1)],
               fill=(255, 255, 255, 242))
    db.line([(pad + w / 2 - 9, pad + h), (pad + w / 2, pad + h + 15), (pad + w / 2 + 10, pad + h)],
            fill=(90, 96, 110, 160), width=2)
    db.ellipse([pad + w - 22, pad + 10, pad + w - 10, pad + 22], fill=(255, 196, 60, 255))
    db.text((pad + 20, pad + 10), title, font=f_t, fill=(40, 44, 52))
    if message:
        db.text((pad + 20, pad + 38), message, font=f_m, fill=(90, 96, 110))
    sh = Image.new("RGBA", bubble.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([pad, pad, pad + w, pad + h], 16, fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    base.alpha_composite(sh, (x - pad, y - pad + 6))
    base.alpha_composite(bubble, (x - pad, y - pad))


def crack_decals(base, cx, cy, seed=1):
    rng = np.random.default_rng(seed)
    d = ImageDraw.Draw(base, "RGBA")
    # spiderweb shatter
    for i in range(14):
        ang = rng.uniform(0, 2 * np.pi)
        L = rng.uniform(90, 240)
        x2, y2 = cx + np.cos(ang) * L, cy + np.sin(ang) * L * 0.9
        # jagged polyline
        pts = [(cx, cy)]
        for t in np.linspace(0.15, 1.0, 5):
            jx = x2 * t + cx * (1 - t) + rng.uniform(-14, 14)
            jy = y2 * t + cy * (1 - t) + rng.uniform(-14, 14)
            pts.append((jx, jy))
        d.line(pts, fill=(235, 245, 255, 200), width=2)
        d.line(pts, fill=(160, 190, 230, 90), width=4)
    # concentric fracture rings
    for r in (60, 120, 190):
        d.ellipse([cx - r, cy - r * 0.85, cx + r, cy + r * 0.85],
                  outline=(225, 240, 255, 130), width=2)
    # impact glow
    glow = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.ellipse([90, 90, 210, 210], fill=(190, 215, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(30))
    base.alpha_composite(glow, (int(cx - 150), int(cy - 150)))
    # claw gouges (3 parallel curved scratches)
    for k in (-1, 0, 1):
        pts = []
        for t in np.linspace(0, 1, 24):
            gx = cx + 150 + t * 210
            gy = cy - 60 + k * 34 + np.sin(t * 2.4 + k) * 12 + t * 30
            pts.append((gx, gy))
        d.line(pts, fill=(245, 250, 255, 235), width=4)
        d.line(pts, fill=(140, 170, 220, 110), width=8)


def label(base, text):
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([16, 16, 16 + d.textlength(text, font=font(22)) + 30, 58], 12,
                        fill=(10, 10, 18, 190))
    d.text((32, 24), text, font=font(22), fill=(240, 242, 250))


def desktop_icons(base, pts):
    ic = folder_icon(72)
    d = ImageDraw.Draw(base)
    for (x, y, name) in pts:
        base.alpha_composite(ic, (x, y))
        d.text((x + 36 - d.textlength(name, font=font(12, False)) / 2, y + 76), name,
               font=font(12, bold=False), fill=(240, 240, 245))


# ---------------------------------------------------------------- shots
wp = wallpaper().convert("RGBA")

# === shot 1: hero — cat walking along the top of a browser window
s1 = wp.copy()
window_mockup(s1, 250, 190, 640, 430, "GitHub — mythos0/meow")
window_mockup(s1, 980, 240, 480, 360, "Docs — MeowCat")
taskbar(s1)
paste_cat(s1, f"{SPR}/grey_tabby/walk/frame_01.png", 570, 192, height=200)
paste_cat(s1, f"{SPR}/grey_tabby/sit/frame_00.png", 1220, 242, height=170)
label(s1, "Walks and jumps across your windows")
s1.convert("RGB").save(f"{OUT}/01_hero_walk.png")

# === shot 2: angry mode — glass cracks
s2 = wp.copy()
window_mockup(s2, 260, 180, 1080, 520, "Important work — do not lose")
taskbar(s2)
crack_decals(s2, 800, 380, seed=7)
paste_cat(s2, f"{SPR}/grey_tabby/scratch/frame_02.png", 700, 700, height=230)
paste_cat(s2, f"{SPR}/grey_tabby/angry/frame_00.png", 1180, 700, height=190)
label(s2, "Angry mode: claw marks your screen (click the cat!)")
s2.convert("RGB").save(f"{OUT}/02_angry_scratch.png")

# === shot 3: desktop stroll with folders
s3 = wp.copy()
taskbar(s3)
desktop_icons(s3, [(60, 60, "Projects"), (60, 190, "MeowCat"), (60, 320, "Games"),
                   (180, 60, "Reports"), (180, 190, "Invoices"), (180, 320, "Ideas")])
paste_cat(s3, f"{SPR}/grey_tabby/walk/frame_03.png", 330, 700, height=185)
paste_cat(s3, f"{SPR}/grey_tabby/scratch/frame_05.png", 150, 480, height=170)
label(s3, "Explores your desktop folders when windows are minimized")
s3.convert("RGB").save(f"{OUT}/03_desktop_stroll.png")

# === shot 4: reminder notification
s4 = wp.copy()
window_mockup(s4, 300, 200, 1000, 500, "Spotify — Deep Focus")
taskbar(s4)
paste_cat(s4, f"{SPR}/grey_tabby/dance/frame_02.png", 800, 702, height=240)
speech_bubble(s4, 800, 180, "Tea time!", "Your reminder: take a break")
label(s4, "Reminders: the cat announces them with the movement you pick")
s4.convert("RGB").save(f"{OUT}/04_reminder.png")

# === shot 5: store preview
s5 = wp.copy()
window_mockup(s5, 220, 150, 1160, 640, "Cat Store — MeowCat")
taskbar(s5)
d = ImageDraw.Draw(s5)
d.rounded_rectangle([260, 220, 620, 640], 14, fill=(247, 240, 229, 255))
for i, breed in enumerate(["grey_tabby", "orange_tabby", "siamese", "tuxedo"]):
    bx = 260 + (i % 2) * 185
    by = 240 + (i // 2) * 200
    d.rounded_rectangle([bx, by, bx + 165, by + 180], 12, fill=(255, 255, 255, 255),
                        outline=(220, 210, 190, 255))
    cat = Image.open(f"{SPR}/{breed}/sit/frame_00.png").convert("RGBA")
    r = 120 / cat.height
    cat = cat.resize((int(cat.width * r), 120), Image.LANCZOS)
    s5.alpha_composite(cat, (bx + 82 - cat.width // 2, by + 30))
paste_cat(s5, f"{SPR}/calico/walk/frame_00.png", 900, 640, height=210)
paste_cat(s5, f"{SPR}/persian/walk/frame_01.png", 1150, 640, height=200)
label(s5, "Cat Store: 6 breeds, accessories, emote packs — with live preview")
s5.convert("RGB").save(f"{OUT}/05_store.png")

print("screenshots done:", os.listdir(OUT))
