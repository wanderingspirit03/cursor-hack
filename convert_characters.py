"""Convert original pixel-agents character PNGs to Phaser sprite sheet format.

Original format: 112x96 (7 frames × 3 directions, each 16×32)
  Rows: down, up, right
  Cols: walk0(idle), walk1, walk2, type0, type1, read0, read1

Target format: 64x128 (4 frames × 4 directions, each 16×32)
  Rows: down, up, right, left (left = flipped right)
  Cols: idle, walk1, walk2, work
"""
from PIL import Image, ImageOps
import os

SRC_DIR = "/tmp/pixel-agents-original/webview-ui/public/assets/characters"
DST_DIR = "frontend/public/characters"
FRAME_W, FRAME_H = 16, 32
SRC_COLS, SRC_ROWS = 7, 3
DST_COLS, DST_ROWS = 4, 4

# Frame mapping: dst_col -> src_col
# idle=0, walk1=1, walk2=2, work=3(typing frame)
FRAME_MAP = [0, 1, 2, 3]

os.makedirs(DST_DIR, exist_ok=True)

for ci in range(6):
    src_path = os.path.join(SRC_DIR, f"char_{ci}.png")
    src = Image.open(src_path).convert("RGBA")

    dst = Image.new("RGBA", (FRAME_W * DST_COLS, FRAME_H * DST_ROWS), (0, 0, 0, 0))

    for dst_row in range(DST_ROWS):
        if dst_row < 3:
            src_row = dst_row
        else:
            src_row = 2  # left = will flip right

        for dst_col in range(DST_COLS):
            src_col = FRAME_MAP[dst_col]
            # Crop frame from source
            sx = src_col * FRAME_W
            sy = src_row * FRAME_H
            frame = src.crop((sx, sy, sx + FRAME_W, sy + FRAME_H))

            if dst_row == 3:
                frame = ImageOps.mirror(frame)

            dx = dst_col * FRAME_W
            dy = dst_row * FRAME_H
            dst.paste(frame, (dx, dy))

    dst_path = os.path.join(DST_DIR, f"char_{ci}.png")
    dst.save(dst_path)
    print(f"  Converted char_{ci}.png -> {dst_path} ({dst.size[0]}x{dst.size[1]})")

print(f"Done! Converted 6 character sprite sheets to {DST_DIR}")
