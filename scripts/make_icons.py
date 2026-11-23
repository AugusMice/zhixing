"""生成知星的应用图标（无第三方图形依赖，使用 Pillow）。

用法：python scripts/make_icons.py
输出：public/icons/icon-192.png、icon-512.png、apple-touch-icon.png、favicon-32.png
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def radial_background() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), (5, 6, 14))
    px = img.load()
    cx = cy = SIZE / 2
    max_d = math.hypot(cx, cy)
    for y in range(SIZE):
        for x in range(SIZE):
            d = math.hypot(x - cx, y - cy) / max_d
            t = min(1.0, d)
            r = int(16 * (1 - t) + 5 * t)
            g = int(24 * (1 - t) + 7 * t)
            b = int(54 * (1 - t) + 16 * t)
            px[x, y] = (r, g, b)
    return img


def sparkle(draw: ImageDraw.ImageDraw, cx: float, cy: float, radius: float,
            inner: float, fill: tuple[int, int, int, int]) -> None:
    points = []
    for i in range(8):
        angle = -math.pi / 2 + i * math.pi / 4
        r = radius if i % 2 == 0 else radius * inner
        points.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
    draw.polygon(points, fill=fill)


def main() -> None:
    base = radial_background().convert("RGBA")

    # 星空：确定性随机
    rng = random.Random(20261103)
    stars = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stars)
    for _ in range(180):
        x = rng.uniform(0, SIZE)
        y = rng.uniform(0, SIZE)
        r = rng.uniform(0.8, 2.6)
        a = int(rng.uniform(40, 190))
        sd.ellipse((x - r, y - r, x + r, y + r), fill=(223, 230, 255, a))
    base = Image.alpha_composite(base, stars)

    # 轨道环
    orbit = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(orbit)
    od.ellipse((146, 246, 878, 778), outline=(122, 162, 255, 80), width=5)
    od.ellipse((206, 306, 818, 718), outline=(169, 139, 255, 34), width=3)
    base = Image.alpha_composite(base, orbit)

    # 主星光晕
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(9, 0, -1):
        r = 150 + i * 38
        a = int(10 + (9 - i) * 3)
        gd.ellipse((SIZE / 2 - r, SIZE / 2 - r, SIZE / 2 + r, SIZE / 2 + r),
                   fill=(122, 162, 255, a))
    glow = glow.filter(ImageFilter.GaussianBlur(44))
    base = Image.alpha_composite(base, glow)

    # 四芒星主体
    star_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(star_layer)
    sparkle(sdraw, SIZE / 2, SIZE / 2, 336, 0.17, (122, 162, 255, 90))
    sparkle(sdraw, SIZE / 2, SIZE / 2, 268, 0.16, (169, 139, 255, 170))
    sparkle(sdraw, SIZE / 2, SIZE / 2, 196, 0.15, (238, 244, 255, 255))
    core_glow = star_layer.filter(ImageFilter.GaussianBlur(26))
    base = Image.alpha_composite(base, core_glow)
    base = Image.alpha_composite(base, star_layer)

    # 中心白点
    dot = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot)
    dd.ellipse((SIZE / 2 - 46, SIZE / 2 - 46, SIZE / 2 + 46, SIZE / 2 + 46),
               fill=(255, 255, 255, 255))
    dot = dot.filter(ImageFilter.GaussianBlur(8))
    base = Image.alpha_composite(base, dot)

    # 四角小星
    deco = ImageDraw.Draw(base)
    for x, y, r, a in [
        (250, 300, 22, 150), (790, 720, 16, 120), (760, 286, 12, 100),
        (286, 748, 13, 90),
    ]:
        sparkle(deco, x, y, r, 0.2, (223, 230, 255, a))

    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-32.png": 32,
    }
    for name, size in targets.items():
        base.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
