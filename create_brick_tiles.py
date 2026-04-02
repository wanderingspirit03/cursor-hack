"""Generate custom isometric brick wall tiles matching Kenney Conveyor Kit geometry.

Replaces gray metal structure tiles with dark red-brown brick to match factpj.png reference.
Uses exact same pixel shapes as originals but recolors to brick palette.
"""
from PIL import Image
import os

TILES_DIR = "frontend/public/tiles"

# Brick color palette (from factpj.png reference)
BRICK_DARK = (100, 45, 35)      # darkest brick shadow
BRICK_MID = (130, 60, 45)       # main brick body  
BRICK_LIGHT = (155, 75, 55)     # brick highlight
MORTAR = (80, 70, 65)           # mortar lines between bricks
TRIM_DARK = (65, 55, 50)        # dark trim/base
TRIM_MID = (90, 80, 70)         # medium trim
WINDOW_DARK = (100, 130, 155)   # window glass dark
WINDOW_LIGHT = (140, 170, 195)  # window glass light
WINDOW_FRAME = (55, 50, 48)     # window frame
YELLOW_MAIN = (200, 170, 50)    # yellow accent pillar
YELLOW_SHADOW = (160, 135, 40)  # yellow shadow
YELLOW_HI = (220, 195, 70)      # yellow highlight
DOOR_METAL = (70, 70, 80)       # door/gate metal
DOOR_DARK = (50, 50, 60)        # door shadow


def recolor_tile(src_path, color_map, dst_path):
    """Recolor a tile by mapping gray luminance ranges to new colors."""
    src = Image.open(src_path).convert("RGBA")
    dst = Image.new("RGBA", src.size, (0, 0, 0, 0))
    
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = src.getpixel((x, y))
            if a == 0:
                continue
            lum = (r + g + b) // 3
            # Map luminance to brick colors
            new_color = None
            for (lo, hi), color in color_map:
                if lo <= lum <= hi:
                    new_color = color
                    break
            if new_color is None:
                new_color = BRICK_MID
            dst.putpixel((x, y), (*new_color, a))
    
    dst.save(dst_path)


# Color maps for different tile types
BRICK_MAP = [
    ((0, 60), TRIM_DARK),
    ((61, 85), BRICK_DARK),
    ((86, 110), MORTAR),
    ((111, 130), BRICK_MID),
    ((131, 155), BRICK_MID),
    ((156, 180), BRICK_LIGHT),
    ((181, 255), BRICK_LIGHT),
]

BRICK_MAP_WITH_WINDOW = [
    ((0, 60), TRIM_DARK),
    ((61, 85), BRICK_DARK),
    ((86, 110), MORTAR),
    ((111, 130), BRICK_MID),
    ((131, 155), BRICK_MID),
    ((156, 180), BRICK_LIGHT),
    ((181, 255), BRICK_LIGHT),
]

YELLOW_MAP = [
    ((0, 60), YELLOW_SHADOW),
    ((61, 100), YELLOW_SHADOW),
    ((101, 140), YELLOW_MAIN),
    ((141, 180), YELLOW_MAIN),
    ((181, 255), YELLOW_HI),
]

DOOR_MAP = [
    ((0, 60), DOOR_DARK),
    ((61, 100), DOOR_METAL),
    ((101, 140), DOOR_METAL),
    ((141, 180), (90, 90, 100)),
    ((181, 255), (110, 110, 120)),
]


def add_brick_texture(img, x_range, y_range):
    """Add subtle brick pattern lines to an area."""
    bh = 3  # brick height
    bw = 5  # brick width
    for y in range(y_range[0], y_range[1]):
        for x in range(x_range[0], x_range[1]):
            if 0 <= x < img.width and 0 <= y < img.height:
                px = img.getpixel((x, y))
                if px[3] == 0:
                    continue
                r, g, b, a = px
                row_i = (y - y_range[0]) // bh
                offset = (bw // 2) if row_i % 2 == 1 else 0
                # Mortar lines
                if (y - y_range[0]) % bh == 0:
                    r = max(0, r - 20)
                    g = max(0, g - 15)
                    b = max(0, b - 10)
                elif (x - x_range[0] + offset) % bw == 0:
                    r = max(0, r - 15)
                    g = max(0, g - 10)
                    b = max(0, b - 8)
                img.putpixel((x, y), (r, g, b, a))


def make_brick_wall():
    """Brick version of structure-wall."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-wall.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-wall.png"),
    )
    # Add brick texture
    img = Image.open(os.path.join(TILES_DIR, "brick-wall.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-wall.png"))
    print("  Created brick-wall.png")


def make_brick_tall():
    """Brick version of structure-tall."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-tall.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-tall.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-tall.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-tall.png"))
    print("  Created brick-tall.png")


def make_brick_high():
    """Brick version of structure-high."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-high.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-high.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-high.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-high.png"))
    print("  Created brick-high.png")


def make_brick_medium():
    """Brick version of structure-medium."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-medium.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-medium.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-medium.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-medium.png"))
    print("  Created brick-medium.png")


def make_brick_short():
    """Brick version of structure-short."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-short.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-short.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-short.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-short.png"))
    print("  Created brick-short.png")


def make_brick_corner():
    """Brick version of structure-corner-outer."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-corner-outer.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-corner.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-corner.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-corner.png"))
    print("  Created brick-corner.png")


def make_brick_window():
    """Brick wall with window (recolor structure-window keeping glass blue)."""
    src = Image.open(os.path.join(TILES_DIR, "structure-window.png")).convert("RGBA")
    dst = Image.new("RGBA", src.size, (0, 0, 0, 0))
    
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = src.getpixel((x, y))
            if a == 0:
                continue
            lum = (r + g + b) // 3
            # Detect blue-ish glass pixels (b > r and b > g)
            if b > r + 10 and b > g + 5:
                # Keep as window glass but adjust
                nr = int(r * 0.7 + WINDOW_DARK[0] * 0.3)
                ng = int(g * 0.7 + WINDOW_DARK[1] * 0.3)
                nb = int(b * 0.7 + WINDOW_DARK[2] * 0.3)
                dst.putpixel((x, y), (nr, ng, nb, a))
            else:
                # Brick recolor
                new_color = BRICK_MID
                for (lo, hi), color in BRICK_MAP:
                    if lo <= lum <= hi:
                        new_color = color
                        break
                dst.putpixel((x, y), (*new_color, a))
    
    add_brick_texture(dst, (0, 64), (0, 64))
    dst.save(os.path.join(TILES_DIR, "brick-window.png"))
    print("  Created brick-window.png")


def make_brick_window_wide():
    """Brick wall with wide window."""
    src = Image.open(os.path.join(TILES_DIR, "structure-window-wide.png")).convert("RGBA")
    dst = Image.new("RGBA", src.size, (0, 0, 0, 0))
    
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = src.getpixel((x, y))
            if a == 0:
                continue
            lum = (r + g + b) // 3
            if b > r + 10 and b > g + 5:
                nr = int(r * 0.7 + WINDOW_DARK[0] * 0.3)
                ng = int(g * 0.7 + WINDOW_DARK[1] * 0.3)
                nb = int(b * 0.7 + WINDOW_DARK[2] * 0.3)
                dst.putpixel((x, y), (nr, ng, nb, a))
            else:
                new_color = BRICK_MID
                for (lo, hi), color in BRICK_MAP:
                    if lo <= lum <= hi:
                        new_color = color
                        break
                dst.putpixel((x, y), (*new_color, a))
    
    add_brick_texture(dst, (0, 64), (0, 64))
    dst.save(os.path.join(TILES_DIR, "brick-window-wide.png"))
    print("  Created brick-window-wide.png")


def make_brick_doorway():
    """Brick doorway."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-doorway.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-doorway.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-doorway.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-doorway.png"))
    print("  Created brick-doorway.png")


def make_brick_doorway_wide():
    """Brick wide doorway."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-doorway-wide.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-doorway-wide.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-doorway-wide.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-doorway-wide.png"))
    print("  Created brick-doorway-wide.png")


def make_brick_corner_inner():
    """Brick inner corner."""
    recolor_tile(
        os.path.join(TILES_DIR, "structure-corner-inner.png"),
        BRICK_MAP,
        os.path.join(TILES_DIR, "brick-corner-inner.png"),
    )
    img = Image.open(os.path.join(TILES_DIR, "brick-corner-inner.png"))
    add_brick_texture(img, (0, 64), (0, 64))
    img.save(os.path.join(TILES_DIR, "brick-corner-inner.png"))
    print("  Created brick-corner-inner.png")


if __name__ == "__main__":
    print("Generating brick wall tiles...")
    make_brick_wall()
    make_brick_tall()
    make_brick_high()
    make_brick_medium()
    make_brick_short()
    make_brick_corner()
    make_brick_corner_inner()
    make_brick_window()
    make_brick_window_wide()
    make_brick_doorway()
    make_brick_doorway_wide()
    print("Done! Generated 11 brick tiles.")
