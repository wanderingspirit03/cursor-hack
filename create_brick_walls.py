"""Generate tall isometric brick wall tiles (64x128).

Diamond base at bottom (CY=96). Walls extend upward.
East face slope: +11/22 = +0.5 (going right = going down).
South face slope: -11/22 = -0.5 (going right = going up).

Windows and doors are isometric parallelograms matching the face slope.
"""
from PIL import Image
import os

TILES_DIR = "frontend/public/tiles"
IMG_W, IMG_H = 64, 128
CX, CY = 31, 96

WALL_H_TALL = 80
WALL_H_MED = 55
WALL_H_SHORT = 30

BRICK = (140, 62, 45)
BRICK_HI = (160, 78, 55)
BRICK_DK = (110, 48, 36)
BRICK_VDK = (85, 38, 28)
BRICK_S = (108, 50, 40)
BRICK_S_HI = (125, 60, 46)
BRICK_S_DK = (88, 40, 32)
MORTAR = (82, 66, 58)
MORTAR_S = (70, 56, 48)
CAP = (170, 95, 68)
CAP_EDGE = (145, 78, 58)

WIN_FRAME = (48, 40, 36, 255)
WIN_SILL = (135, 110, 88, 255)
WIN_SILL_DK = (105, 82, 68, 255)
WIN_RECESS = (32, 28, 26, 255)
WIN_GLASS_TL = (150, 180, 215, 255)
WIN_GLASS_TR = (125, 158, 198, 255)
WIN_GLASS_BL = (85, 120, 160, 255)
WIN_GLASS_BR = (65, 100, 140, 255)
WIN_MULLION = (58, 50, 45, 255)

DOOR_METAL = (55, 58, 65, 255)
DOOR_LINE = (72, 76, 82, 255)
DOOR_FRAME = (45, 38, 34, 255)
DOOR_HANDLE = (180, 160, 80, 255)

# Isometric slope: 11 pixels down per 22 pixels right = 0.5
SLOPE = 11.0 / 22.0


def brick_color(x, y, base, hi, dk):
    h = (x * 7 + y * 13) % 19
    if h < 3: return dk
    if h < 6: return hi
    return base


def east_edge_y(x):
    return 85 + (x - 31) * 11 // 22


def south_edge_y(x):
    return 96 - (x - 9) * 11 // 22


def draw_east_face(img, wall_h):
    for x in range(31, 54):
        ey = east_edge_y(x)
        col_top = max(0, ey - wall_h)
        for y in range(col_top, min(IMG_H, ey + 1)):
            ry = y - (ey - wall_h)
            row_i = ry // 5
            offset = 4 if row_i % 2 == 1 else 0
            is_mortar = ry % 5 == 0 or (x + offset) % 8 == 0
            c = MORTAR if is_mortar else brick_color(x, y, BRICK, BRICK_HI, BRICK_DK)
            img.putpixel((x, y), (*c, 255))


def draw_south_face(img, wall_h):
    for x in range(9, 32):
        ey = south_edge_y(x)
        col_top = max(0, ey - wall_h)
        for y in range(col_top, min(IMG_H, ey + 1)):
            ry = y - (ey - wall_h)
            row_i = ry // 5
            offset = 4 if row_i % 2 == 1 else 0
            is_mortar = ry % 5 == 0 or (x + offset) % 8 == 0
            c = MORTAR_S if is_mortar else brick_color(x, y, BRICK_S, BRICK_S_HI, BRICK_S_DK)
            img.putpixel((x, y), (*c, 255))


def add_cap(img, wall_h, x_start, x_end, edge_fn):
    for x in range(x_start, x_end):
        ey = edge_fn(x)
        cap_y = ey - wall_h
        for dy in range(4):
            py = cap_y + dy
            if 0 <= py < IMG_H:
                if dy == 0:
                    img.putpixel((x, py), (*CAP, 255))
                elif dy == 1:
                    img.putpixel((x, py), (*CAP_EDGE, 255))
                elif dy == 2:
                    px = img.getpixel((x, py))
                    if px[3] > 0:
                        r, g, b = px[:3]
                        img.putpixel((x, py), (min(255, r+20), min(255, g+12), min(255, b+8), 255))


def add_bottom_edge(img, x_start, x_end, edge_fn):
    for x in range(x_start, x_end):
        ey = edge_fn(x)
        if 0 <= ey < IMG_H:
            img.putpixel((x, ey), (*BRICK_VDK, 255))
        if 0 <= ey - 1 < IMG_H:
            px = img.getpixel((x, ey - 1))
            if px[3] > 0:
                r, g, b = px[:3]
                img.putpixel((x, ey - 1), (max(0,r-15), max(0,g-10), max(0,b-8), 255))


def _iso_window(img, wall_h, edge_fn, face_cx, face_xl, face_xr, slope_sign, w_half=4, wh_ratio=0.35):
    """Draw an isometric parallelogram window.
    
    slope_sign: +1 for east face (going right = down), -1 for south face (going right = up).
    The top/bottom edges of the window follow the wall slope.
    The left/right edges are vertical.
    """
    edge_at_cx = edge_fn(face_cx)
    wh = max(12, int(wall_h * wh_ratio))
    # Window center y (relative to wall) at face_cx
    win_center_y = edge_at_cx - wall_h + wall_h // 3 + wh // 2
    win_top_at_cx = win_center_y - wh // 2
    wl = face_cx - w_half
    wr = face_cx + w_half

    # For each column x in [wl..wr], the window top/bottom shift by slope
    # top_y(x) = win_top_at_cx + slope_sign * SLOPE * (x - face_cx)
    # bot_y(x) = top_y(x) + wh

    for wx in range(max(0, wl - 1), min(IMG_W, wr + 2)):
        dx = wx - face_cx
        y_shift = int(slope_sign * SLOPE * dx)
        local_top = win_top_at_cx + y_shift
        local_bot = local_top + wh

        for wy in range(max(0, local_top - 2), min(IMG_H, local_bot + 4)):
            if img.getpixel((wx, wy))[3] == 0:
                continue

            # Relative position inside window
            at_left = (wx == wl)
            at_right = (wx == wr)
            at_top = (wy == local_top)
            at_bot = (wy == local_bot)
            inside = (wl < wx < wr and local_top < wy < local_bot)
            # Recess (depth shadow on top edge and one side)
            at_recess_top = (wy == local_top + 1 and wl < wx < wr)
            if slope_sign > 0:
                at_recess_side = (wx == wl + 1 and local_top < wy < local_bot)
            else:
                at_recess_side = (wx == wr - 1 and local_top < wy < local_bot)
            # Sill
            at_sill = (wy == local_bot + 1 and wl - 1 <= wx <= wr + 1)
            at_sill2 = (wy == local_bot + 2 and wl <= wx <= wr)
            # Mullions
            at_mullion_v = (wx == face_cx and local_top + 2 < wy < local_bot)
            mid_y = local_top + wh // 2
            at_mullion_h = (wy == mid_y and wl < wx < wr)

            if at_sill:
                img.putpixel((wx, wy), WIN_SILL if slope_sign > 0 else WIN_SILL_DK)
            elif at_sill2:
                img.putpixel((wx, wy), WIN_SILL_DK if slope_sign > 0 else WIN_SILL)
            elif at_left or at_right or at_top or at_bot:
                img.putpixel((wx, wy), WIN_FRAME)
            elif at_recess_top or at_recess_side:
                img.putpixel((wx, wy), WIN_RECESS)
            elif at_mullion_v or at_mullion_h:
                img.putpixel((wx, wy), WIN_MULLION)
            elif inside:
                # Glass with gradient
                fx = (wx - wl) / max(1, wr - wl)
                fy = (wy - local_top) / max(1, local_bot - local_top)
                r = int(WIN_GLASS_TL[0]*(1-fx)*(1-fy) + WIN_GLASS_TR[0]*fx*(1-fy) +
                        WIN_GLASS_BL[0]*(1-fx)*fy + WIN_GLASS_BR[0]*fx*fy)
                g = int(WIN_GLASS_TL[1]*(1-fx)*(1-fy) + WIN_GLASS_TR[1]*fx*(1-fy) +
                        WIN_GLASS_BL[1]*(1-fx)*fy + WIN_GLASS_BR[1]*fx*fy)
                b = int(WIN_GLASS_TL[2]*(1-fx)*(1-fy) + WIN_GLASS_TR[2]*fx*(1-fy) +
                        WIN_GLASS_BL[2]*(1-fx)*fy + WIN_GLASS_BR[2]*fx*fy)
                img.putpixel((wx, wy), (r, g, b, 255))


def _iso_door(img, wall_h, edge_fn, face_cx, slope_sign, d_half=5):
    """Isometric parallelogram door."""
    edge_at_cx = edge_fn(face_cx)
    dh = wall_h * 2 // 3
    door_bot_at_cx = edge_at_cx
    door_top_at_cx = door_bot_at_cx - dh
    dl = face_cx - d_half
    dr = face_cx + d_half

    for dx_val in range(max(0, dl - 1), min(IMG_W, dr + 2)):
        ddx = dx_val - face_cx
        y_shift = int(slope_sign * SLOPE * ddx)
        local_top = door_top_at_cx + y_shift
        local_bot = door_bot_at_cx + y_shift

        for dy_val in range(max(0, local_top - 1), min(IMG_H, local_bot + 2)):
            if img.getpixel((dx_val, dy_val))[3] == 0:
                continue

            at_left = (dx_val == dl)
            at_right = (dx_val == dr)
            at_top = (dy_val == local_top)
            inside = (dl < dx_val < dr and local_top < dy_val <= local_bot)

            if slope_sign > 0:
                at_recess = (dx_val == dl + 1 and local_top < dy_val <= local_bot) or (dy_val == local_top + 1 and dl < dx_val < dr)
            else:
                at_recess = (dx_val == dr - 1 and local_top < dy_val <= local_bot) or (dy_val == local_top + 1 and dl < dx_val < dr)

            ry = dy_val - local_top

            if at_left or at_right or at_top:
                img.putpixel((dx_val, dy_val), DOOR_FRAME)
            elif at_recess:
                img.putpixel((dx_val, dy_val), WIN_RECESS)
            elif inside:
                if ry % 8 == 0:
                    img.putpixel((dx_val, dy_val), DOOR_LINE)
                elif dx_val == face_cx + (2 if slope_sign > 0 else -2) and dy_val == local_top + dh // 2:
                    img.putpixel((dx_val, dy_val), DOOR_HANDLE)
                else:
                    img.putpixel((dx_val, dy_val), DOOR_METAL)


def add_3d_window_east(img, wall_h):
    _iso_window(img, wall_h, east_edge_y, face_cx=42, face_xl=31, face_xr=53, slope_sign=+1)

def add_3d_window_south(img, wall_h):
    _iso_window(img, wall_h, south_edge_y, face_cx=20, face_xl=9, face_xr=31, slope_sign=-1)

def add_door_east(img, wall_h):
    _iso_door(img, wall_h, east_edge_y, face_cx=42, slope_sign=+1)

def add_door_south(img, wall_h):
    _iso_door(img, wall_h, south_edge_y, face_cx=20, slope_sign=-1)


def make_east_wall(filename, wall_h, window=False, door=False):
    img = Image.new("RGBA", (IMG_W, IMG_H), (0, 0, 0, 0))
    draw_east_face(img, wall_h)
    add_cap(img, wall_h, 31, 54, east_edge_y)
    add_bottom_edge(img, 31, 54, east_edge_y)
    for y in range(max(0, 85 - wall_h), 86):
        if img.getpixel((31, y))[3] > 0:
            img.putpixel((31, y), (*BRICK_HI, 255))
    if window:
        add_3d_window_east(img, wall_h)
    if door:
        add_door_east(img, wall_h)
    img.save(os.path.join(TILES_DIR, filename))
    print(f"  {filename} h={wall_h}")


def make_south_wall(filename, wall_h, window=False, door=False):
    img = Image.new("RGBA", (IMG_W, IMG_H), (0, 0, 0, 0))
    draw_south_face(img, wall_h)
    add_cap(img, wall_h, 9, 32, south_edge_y)
    add_bottom_edge(img, 9, 32, south_edge_y)
    for y in range(max(0, 85 - wall_h), 86):
        if img.getpixel((31, y))[3] > 0:
            img.putpixel((31, y), (*BRICK_S_HI, 255))
    if window:
        add_3d_window_south(img, wall_h)
    if door:
        add_door_south(img, wall_h)
    img.save(os.path.join(TILES_DIR, filename))
    print(f"  {filename} h={wall_h}")


def make_corner(filename, wall_h, window=False):
    img = Image.new("RGBA", (IMG_W, IMG_H), (0, 0, 0, 0))
    draw_south_face(img, wall_h)
    draw_east_face(img, wall_h)
    add_cap(img, wall_h, 9, 32, south_edge_y)
    add_cap(img, wall_h, 31, 54, east_edge_y)
    add_bottom_edge(img, 9, 32, south_edge_y)
    add_bottom_edge(img, 31, 54, east_edge_y)
    for y in range(max(0, 85 - wall_h), 86):
        img.putpixel((31, y), (*BRICK_HI, 255))
    if window:
        add_3d_window_east(img, wall_h)
        add_3d_window_south(img, wall_h)
    img.save(os.path.join(TILES_DIR, filename))
    print(f"  {filename} h={wall_h}")


if __name__ == "__main__":
    print("Generating isometric brick walls with slanted windows...")
    make_east_wall("brick-tall-east.png", WALL_H_TALL)
    make_east_wall("brick-window-east.png", WALL_H_TALL, window=True)
    make_east_wall("brick-door-east.png", WALL_H_TALL, door=True)
    make_south_wall("brick-tall-south.png", WALL_H_TALL)
    make_south_wall("brick-window-south.png", WALL_H_TALL, window=True)
    make_south_wall("brick-door-south.png", WALL_H_TALL, door=True)
    make_east_wall("brick-wall-east.png", WALL_H_MED)
    make_south_wall("brick-wall-south.png", WALL_H_MED)
    make_east_wall("brick-short-east.png", WALL_H_SHORT)
    make_south_wall("brick-short-south.png", WALL_H_SHORT)
    make_corner("brick-corner.png", WALL_H_TALL)
    make_corner("brick-corner-window.png", WALL_H_TALL, window=True)
    make_corner("brick-corner-inner.png", WALL_H_TALL)
    print("Done!")
