#!/usr/bin/env python3
"""Draws the launcher icon (white medical cross on teal) into a Capacitor android project. usage: make_icons.py <android dir>"""
import os, sys
from PIL import Image, ImageDraw
TEAL = (15, 118, 110, 255)
res = os.path.join(sys.argv[1], "app/src/main/res")

def cross(size, scale, bg):
    im = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, arm, th = size / 2, size * scale / 2, size * scale / 6.4
    r = th / 2.4
    d.rounded_rectangle((c - arm, c - th, c + arm, c + th), radius=r, fill=(255, 255, 255, 255))
    d.rounded_rectangle((c - th, c - arm, c + th, c + arm), radius=r, fill=(255, 255, 255, 255))
    return im

dens = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
for k, (legacy, fg) in dens.items():
    d = os.path.join(res, "mipmap-" + k)
    os.makedirs(d, exist_ok=True)
    big = cross(legacy * 4, 0.56, TEAL)
    mask = Image.new("L", big.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big.width - 1, big.height - 1), radius=big.width // 5, fill=255)
    sq = Image.new("RGBA", big.size, (0, 0, 0, 0)); sq.paste(big, (0, 0), mask)
    sq.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
    rnd = Image.new("L", big.size, 0); ImageDraw.Draw(rnd).ellipse((0, 0, big.width - 1, big.height - 1), fill=255)
    rr = Image.new("RGBA", big.size, (0, 0, 0, 0)); rr.paste(big, (0, 0), rnd)
    rr.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher_round.png"))
    cross(fg * 4, 0.40, None).resize((fg, fg), Image.LANCZOS).save(os.path.join(d, "ic_launcher_foreground.png"))
v = os.path.join(res, "values"); os.makedirs(v, exist_ok=True)
open(os.path.join(v, "ic_launcher_background.xml"), "w").write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F766E</color>\n</resources>\n')
print("icons written to", res)
