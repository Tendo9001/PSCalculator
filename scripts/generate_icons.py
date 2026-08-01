import os
from PIL import Image, ImageDraw, ImageFont

BG_COLOR = "#0b0d0c"
FG_COLOR = "#d9a441"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/Arial Bold.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_icon(size, path):
    img = Image.new("RGB", (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)
    font = load_font(int(size * 0.55))
    text = "%"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1]
    draw.text((x, y), text, fill=FG_COLOR, font=font)
    img.save(path, "PNG")


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    make_icon(192, os.path.join(OUTPUT_DIR, "icon-192.png"))
    make_icon(512, os.path.join(OUTPUT_DIR, "icon-512.png"))
    print("Icons written to", OUTPUT_DIR)
