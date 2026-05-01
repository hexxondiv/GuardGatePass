#!/usr/bin/env python3
"""Sync Guard Gate Pass Expo icon assets from the canonical app icon set."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/home/james/Desktop/GPS/assets/GuardGatePass/AppIcons")


def resize(source: Path, target: Path, size: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.resize((size, size), Image.Resampling.LANCZOS).save(target, "PNG")


def sync(source: Path) -> None:
    appstore = source / "appstore.png"
    playstore = source / "playstore.png"
    if not appstore.exists() or not playstore.exists():
        raise FileNotFoundError(f"Expected appstore.png and playstore.png under {source}")

    assets = ROOT / "src" / "assets"
    shutil.copyfile(appstore, assets / "guard_icon.png")
    shutil.copyfile(appstore, assets / "guard_adaptive_foreground.png")
    resize(appstore, assets / "icon.png", 500)
    resize(appstore, assets / "adaptive-icon.png", 500)
    resize(playstore, assets / "favicon.png", 500)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Directory containing appstore.png and playstore.png",
    )
    args = parser.parse_args()
    sync(args.source.expanduser().resolve())


if __name__ == "__main__":
    main()
