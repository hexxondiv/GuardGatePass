#!/usr/bin/env python3
"""Generate distinct Guard Gate Pass icon/splash PNGs (vs resident GPERA app)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_ICON = ROOT / "src" / "assets" / "guard_icon.png"
OUT_ADAPTIVE = ROOT / "src" / "assets" / "guard_adaptive_foreground.png"

W = 1024
BG = "#0d1117"
AMBER = "#f0b429"
BLUE = "#58a6ff"
TEXT = "#f0f6fc"


def draw_guard_mark(d: ImageDraw.ImageDraw, cx: float, cy: float, scale: float) -> None:
    """Simple shield + vertical bar readable at app-icon size."""
    s = scale
    # Shield outline
    shield = [
        (cx, cy - 220 * s),
        (cx + 160 * s, cy - 120 * s),
        (cx + 160 * s, cy + 80 * s),
        (cx, cy + 200 * s),
        (cx - 160 * s, cy + 80 * s),
        (cx - 160 * s, cy - 120 * s),
    ]
    d.polygon(shield, outline=AMBER, width=int(22 * s))
    d.line([(cx, cy - 140 * s), (cx, cy + 140 * s)], fill=BLUE, width=int(36 * s))
    d.line([(cx - 55 * s, cy - 40 * s), (cx + 55 * s, cy - 40 * s)], fill=BLUE, width=int(28 * s))


def render(path: Path, *, with_title: bool) -> None:
    img = Image.new("RGB", (W, W), BG)
    d = ImageDraw.Draw(img)
    draw_guard_mark(d, W / 2, W / 2 - (60 if with_title else 0), 1.0)
    if with_title:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 96)
        except OSError:
            font = ImageFont.load_default()
        d.text((W / 2, W - 140), "GUARD GATE", fill=TEXT, font=font, anchor="mm")
        d.arc([80, 80, W - 80, W - 80], start=200, end=340, fill=AMBER, width=18)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print("wrote", path)


def main() -> None:
    render(OUT_ICON, with_title=True)
    # Adaptive foreground: keep mark inside center 66% safe zone; no bottom caption.
    render(OUT_ADAPTIVE, with_title=False)


if __name__ == "__main__":
    main()
