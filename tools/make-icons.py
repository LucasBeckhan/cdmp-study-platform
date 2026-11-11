#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LearnOS iOS/Android 图标生成器 — 纯标准库（zlib + struct），无 PIL 依赖。
生成苹果要求的 PNG：apple-touch-icon 180×180、manifest 192/512（含 maskable）。
设计：深空底色圆角矩形 + 青→紫渐变圆环 + 中心点（与 icon.svg 同构）。"""
import zlib, struct, math, os

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def clamp01(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)

def make_icon(size, out, rounded=True):
    bg = (7, 11, 20)
    c1 = (34, 211, 238)   # cyan
    c2 = (139, 92, 246)   # violet
    half = size / 2.0
    cx = cy = half
    r_out = size * 0.345
    r_in = size * 0.235
    band = (r_out - r_in) / 2.0
    mid = (r_out + r_in) / 2.0
    dot = size * 0.105
    corner = size * 0.225 if rounded else 0.0

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0
        for x in range(size):
            # 圆角矩形覆盖度（SDF + 1px 抗锯齿）
            if rounded:
                qx = abs(x + 0.5 - half) - (half - corner)
                qy = abs(y + 0.5 - half) - (half - corner)
                d_out = min(max(qx, qy), 0.0) + math.hypot(max(qx, 0.0), max(qy, 0.0))
                a_bg = clamp01(0.5 - d_out)
            else:
                a_bg = 1.0
            # 渐变色（对角线方向）
            t = clamp01((x + y) / (2.0 * size))
            col = lerp(c1, c2, t)
            # 圆环
            dr = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            a_ring = clamp01(0.5 - (abs(dr - mid) - band))
            a_dot = clamp01(0.5 - (dr - dot))
            # 合成：底色 → 环 → 点
            r, g, b = bg
            r, g, b = r + (col[0] - r) * a_ring, g + (col[1] - g) * a_ring, b + (col[2] - b) * a_ring
            r, g, b = r + (col[0] - r) * a_dot, g + (col[1] - g) * a_dot, b + (col[2] - b) * a_dot
            rows += bytes((round(r), round(g), round(b), round(255 * a_bg)))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
           + chunk(b"IEND", b""))
    with open(out, "wb") as f:
        f.write(png)
    return len(png)

if __name__ == "__main__":
    out_dir = os.path.dirname(os.path.abspath(__file__)) or "."
    targets = [(180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")]
    root = os.path.dirname(out_dir)
    for size, name in targets:
        n = make_icon(size, os.path.join(root, name))
        print(f"✓ {name} ({size}×{size}, {n} bytes)")
