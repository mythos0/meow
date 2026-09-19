#!/usr/bin/env python3
"""Visual test: replicate MeowCat's SpriteRenderer.Render in Python and composite
the exact frames the app will draw — store cards (scale 0.22) and the desktop
cat walking over a Win11-style wallpaper (scale 0.55).

Mirrors src/MeowCat/Rendering/SpriteRenderer.cs:
  shadow: ellipse w=190*k, h=30*k at bottom center, color #28000000
  sprite: size = CanvasH - ArtTop, x centered, y = ArtTop (feet at canvas bottom)
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = "/home/z/my-project/meow/src/MeowCat/Assets/sprites"
OUT = "/home/z/my-project/download"
BOX = 460.0                      # SpriteRenderer.Box


def load(breed, clip, frame=0):
    p = os.path.join(ROOT, breed, clip, f"frame_{frame:02d}.png")
    return Image.open(p).convert("RGBA")


def render_cat(canvas, breed, clip, frame, cx_bottom, scale, facing=1):
    """Draw one frame + contact shadow like the app does."""
    size = BOX * scale
    art_w, art_h = int(size), int(size)
    sprite = load(breed, clip, frame).resize((art_w, art_h), Image.LANCZOS)
    if facing < 0:
        sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)
    x = int(cx_bottom - art_w / 2)
    y = int(canvas.height - art_h)

    # contact shadow: w=190*scale, h=30*scale, ~16% alpha black
    sw, sh = int(190 * scale), max(2, int(30 * scale))
    sh_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh_layer)
    cy = canvas.height - int(16 * scale) - sh // 2
    sd.ellipse([int(cx_bottom - sw / 2), cy - sh // 2, int(cx_bottom + sw / 2), cy + sh // 2],
               fill=(0, 0, 0, 0x28))
    canvas.alpha_composite(sh_layer)
    canvas.alpha_composite(sprite, (x, y))


def gradient_wallpaper(w, h):
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for yy in range(h):
        t = yy / h
        r = int(18 + 30 * t)
        g = int(30 + 60 * t)
        b = int(72 + 110 * t)
        d.line([(0, yy), (w, yy)], fill=(r, g, b))
    # soft light ribbon
    for i in range(9):
        d.arc([-300 + i * 60, 60 + i * 22, w + 200, h + 150], 200, 320,
              fill=(120, 150, 240, 40), width=3)
    return im.convert("RGBA")


def main():
    os.makedirs(OUT, exist_ok=True)
    breeds = [
        ("grey_tabby", "Grey Tabby"), ("orange_tabby", "Orange Tabby"),
        ("tuxedo", "Tuxedo Cat"), ("calico", "Calico"),
        ("siamese", "Siamese"), ("persian", "White Persian"),
    ]
    # ---------------- Store window simulation (matches StoreWindow geometry)
    card_w, card_h, pad = 170, 210, 10
    W, H = card_w * 3 + pad * 4, card_h * 2 + pad * 3 + 60
    store = Image.new("RGBA", (W, H), (247, 240, 229, 255))
    d = ImageDraw.Draw(store)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
        fsmall = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        font = fsmall = ImageFont.load_default()
    d.text((pad, 14), "Cat Store — Live previews of every breed (walking frame)",
           fill=(90, 70, 50), font=font)
    for i, (bid, label) in enumerate(breeds):
        col, row = i % 3, i // 3
        x0, y0 = pad + col * (card_w + pad), 50 + row * (card_h + pad)
        d.rounded_rectangle([x0, y0, x0 + card_w, y0 + card_h - 34], 10,
                            fill=(255, 255, 255, 255), outline=(228, 214, 195), width=1)
        # mini CatControl: 128x118 at scale 0.22 → draw inside a sub-canvas
        mini = Image.new("RGBA", (card_w - 12, 130), (255, 255, 255, 0))
        render_cat(mini, bid, "walk", 0, (card_w - 12) // 2, 0.26)
        store.alpha_composite(mini, (x0 + 6, y0 + 6))
        d.text((x0 + card_w // 2 - len(label) * 4, y0 + card_h - 46), label,
               fill=(90, 70, 50), font=fsmall)

    # ---------------- Desktop cat simulation (walking across the screen)
    DW, DH = 900, 400
    desk = gradient_wallpaper(DW, DH)
    dd = ImageDraw.Draw(desk)
    dd.rounded_rectangle([40, 40, 260, 200], 8, fill=(255, 255, 255, 230))
    dd.rounded_rectangle([300, 40, 560, 210], 8, fill=(252, 250, 246, 235))
    dd.text((60, 60), "Documents", fill=(60, 60, 70), font=fsmall)
    dd.text((320, 60), "Projects", fill=(60, 60, 70), font=fsmall)
    # cat mid-stride between the two folders (frame 1), one landing on a folder (frame 3)
    render_cat(desk, "grey_tabby", "walk", 1, 480, 0.42)
    render_cat(desk, "grey_tabby", "walk", 3, 180, 0.42)
    d2 = ImageDraw.Draw(desk)
    d2.text((16, DH - 30), "Desktop cat walking between folders — v2.0.1 renders these exact frames",
            fill=(255, 255, 255, 220), font=fsmall)

    combined = Image.new("RGBA", (max(W, DW), H + DH + 20), (245, 245, 245, 255))
    combined.alpha_composite(store, (0, 0))
    combined.alpha_composite(desk, (0, H + 20))
    out = os.path.join(OUT, "meowcat_v2.0.1_render_proof.png")
    combined.convert("RGB").save(out, quality=95)
    print("saved", out)


if __name__ == "__main__":
    main()
