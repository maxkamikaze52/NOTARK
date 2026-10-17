#!/usr/bin/env python3
"""Turn a PNG into a macOS .icns.

    python3 make_icns.py logo.png build/Munch.icns

The PNG is squared (padded, never cropped) and downsampled into the sizes
iconutil expects. Used by set_icon.sh; you normally don't run it by hand.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

SIZES = (16, 32, 64, 128, 256, 512, 1024)


def build(src: Path, dst: Path) -> Path:
    img = Image.open(src).convert("RGBA")

    # Square it by padding with transparency, so nothing gets cut off.
    side = max(img.size)
    if img.size != (side, side):
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
        img = square

    dst.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for px in SIZES:
            img.resize((px, px), Image.LANCZOS).save(iconset / f"icon_{px}x{px}.png")
            if px <= 512:
                img.resize((px * 2, px * 2), Image.LANCZOS).save(
                    iconset / f"icon_{px}x{px}@2x.png"
                )
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(dst)], check=True)

    print(f"Wrote {dst}")
    return dst


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: make_icns.py <logo.png> <out.icns>")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
