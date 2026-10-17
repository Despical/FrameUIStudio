"""Prepare aligned Minecraft F2 captures as static preview layers."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

hands_path, hud_path, clean_path = map(Path, sys.argv[1:4])
target = Path(__file__).resolve().parents[1] / "dist/assets/player-view"
target.mkdir(parents=True, exist_ok=True)
hands, hud, clean = [Image.open(p).convert("RGB") for p in (hands_path, hud_path, clean_path)]
if hands.size != hud.size or hands.size != clean.size or hands.size != (1920, 1080):
    raise ValueError("Captures must share the same 1920 x 1080 camera framing")

def save(image, name):
    image.resize((1280, 720), Image.Resampling.LANCZOS).save(target / name, optimize=True)

save(clean, "world.png")

# Only the stationary first-person arm is extracted; the scene remains beneath effects.
hand_difference = np.max(np.abs(np.asarray(hands, dtype=float) - np.asarray(hud, dtype=float)), axis=2)
candidate = np.zeros((1080, 1920), dtype=np.uint8)
candidate[700:, 1300:1800] = (hand_difference[700:, 1300:1800] > 15) * 255
hand_mask = Image.fromarray(candidate).filter(ImageFilter.MaxFilter(3))
ImageDraw.floodfill(hand_mask, (1500, 900), 128, thresh=0)
component = (np.asarray(hand_mask) == 128).astype(np.uint8) * 255
hand_mask = Image.fromarray(component)
# Fill any holes where a skin pixel happened to match the underlying dirt.
outside = hand_mask.copy()
ImageDraw.floodfill(outside, (0, 0), 128, thresh=0)
hand_mask = Image.fromarray(np.where(np.asarray(outside) == 128, 0, 255).astype(np.uint8))
hand = hands.convert("RGBA")
hand.putalpha(hand_mask.filter(ImageFilter.MinFilter(3)))
save(hand, "hands.png")

# The empty vanilla hotbar is gray over a translucent world background. Recover
# its alpha from the aligned clean capture so effects still show through slots.
background = np.asarray(clean, dtype=float)
foreground = np.asarray(hud, dtype=float)
result = np.zeros((1080, 1920, 4), dtype=np.uint8)
for y in range(1034, 1080):
    for x in range(776, 1144):
        b, f = background[y, x], foreground[y, x]
        if max(abs(b - f)) < 3:
            continue
        centered = b - b.mean()
        variance = np.dot(centered, centered)
        slope = np.clip(np.dot(centered, f - f.mean()) / max(variance, 1), 0, 1)
        alpha = 1 - slope
        if alpha < .04:
            continue
        gray = np.clip((f.mean() - slope * b.mean()) / alpha, 0, 255)
        result[y, x] = [round(gray), round(gray), round(gray), round(alpha * 255)]
save(Image.fromarray(result), "hud.png")

# Crosshair uses difference blending in Minecraft, so retain its observed shape
# as a white mask and apply the same blend mode above the preview canvas.
crosshair = np.zeros_like(result)
delta = np.max(np.abs(foreground - background), axis=2)
for y in range(529, 551):
    for x in range(949, 971):
        if delta[y, x] > 30:
            crosshair[y, x] = [255, 255, 255, 255]
save(Image.fromarray(crosshair), "crosshair.png")
