#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CDMP 真题 xlsx → data/questions-real.js

用法（在仓库根目录）：
    python3 -I tools/parse_real_xlsx.py _import/*.xlsx -o data/questions-real.js

纯标准库实现（xlsx = zip + xml），自动探测表头/列布局，兼容：
  - 表头行含「题目/题干」「A/B/C/D」「答案」「解析」等列
  - 四个选项挤在同一列（"A. xxx" 换行格式）
  - 无表头的常见布局（题干 | A | B | C | D | 答案 | 解析）
答案支持：字母(A-F) / 序号(1-4) / 全文匹配 / "正确答案：B" 等。
解析失败或选项不足 2 个的题目会跳过并打印警告，不污染题库。
"""
import argparse
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
LET = "ABCDEFGH"


def col_index(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref or "A")
    n = 0
    for ch in (m.group(1) if m else "A"):
        n = n * 26 + ord(ch) - 64
    return n - 1


def load_shared(z: zipfile.ZipFile):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(f"{NS}t")) for si in root.findall(f"{NS}si")]


def sheet_paths(z: zipfile.ZipFile):
    """按 workbook.xml 顺序返回 [(工作表名, 文件路径)]"""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    names = [(s.get("name") or f"Sheet{i+1}") for i, s in enumerate(wb.iter(f"{NS}sheet"))]
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid2target = {r.get("Id"): r.get("Target") for r in rels}
    out = []
    for i, s in enumerate(wb.iter(f"{NS}sheet")):
        rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rid2target.get(rid, f"worksheets/sheet{i+1}.xml")
        if target.startswith("/"):
            path = target[1:]
        else:
            path = "xl/" + target.lstrip("./")
        if path not in z.namelist():
            path = f"xl/worksheets/sheet{i+1}.xml"
        out.append((names[i] if i < len(names) else f"Sheet{i+1}", path))
    return out


def read_rows(z: zipfile.ZipFile, shared, path):
    root = ET.fromstring(z.read(path))
    rows = []
    for row in root.iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            t = c.get("t")
            v = c.find(f"{NS}v")
            if t == "s" and v is not None and v.text is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                is_el = c.find(f"{NS}is")
                val = "".join(x.text or "" for x in is_el.iter(f"{NS}t")) if is_el is not None else ""
            else:
                val = v.text if v is not None and v.text is not None else ""
            val = str(val).strip()
            if val:
                cells[col_index(c.get("r"))] = val
        if cells:
            rows.append(cells)
    return rows


def parse_answer(raw, opts):
    """把各种格式的答案归一化为 0 基索引"""
    if raw is None:
        return None
    s = str(raw).strip()
    m = re.search(r"[正确答案|答案]*[:：]?\s*([A-Fa-f])\b", s)
    if m and not re.match(r"^\d+$", s.strip()):
        idx = LET.index(m.group(1).upper())
        if idx < len(opts):
            return idx
    d = re.match(r"^\s*([1-9])\s*$", s)
    if d:
        idx = int(d.group(1)) - 1
        if idx < len(opts):
            return idx
    norm = re.sub(r"^[A-Fa-f][.、：:．]\s*", "", s).strip()
    for i, o in enumerate(opts):
        if norm and (norm == o.strip() or o.strip().startswith(norm) or norm.startswith(o.strip()[:12])):
            return i
    m2 = re.findall(r"[A-Fa-f]", s)
    if len(m2) == 1:
        idx = LET.index(m2[0].upper())
        if idx < len(opts):
            return idx
    return None


def split_options_cell(text):
    """单列选项："A. xxx B. yyy C. zzz D. www" → [xxx, yyy, zzz, www]"""
    parts = re.split(r"(?:^|\s)([A-Fa-f])[.、：:．]\s*", text)
    opts = {}
    for i in range(1, len(parts) - 1, 2):
        opts[LET.index(parts[i].upper())] = parts[i + 1].strip()
    if opts:
        return [opts[k].strip() for k in sorted(opts)]
    return [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]


def detect_layout(rows):
    """返回 (q, o1..o4 或单选项列, ans, exp) 列索引映射；找不到表头返回 None"""
    for r in rows[:5]:
        cells = r
        header = {i: re.sub(r"\s", "", v) for i, v in cells.items()}
        if not any(re.search(r"题[目干见试]|试题|question", v, re.I) for v in header.values()):
            continue
        mapping = {}
        for i, v in header.items():
            if re.search(r"题[目干见试]|试题|question", v, re.I):
                mapping["q"] = i
            elif re.fullmatch(r"[A-Fa-f]", v):
                mapping.setdefault("opts", {})[LET.index(v.upper())] = i
            elif re.search(r"选项\s*[A-Fa-f]|^选项\s*[1-4]", v):
                m = re.search(r"([A-Fa-f1-4])", v)
                if m:
                    k = LET.index(m.group(1).upper()) if m.group(1).isalpha() else int(m.group(1)) - 1
                    mapping.setdefault("opts", {})[k] = i
            elif re.search(r"答案|answer|正确", v, re.I):
                mapping["ans"] = i
            elif re.search(r"解析|解释|说明|explanation|分析", v, re.I):
                mapping["exp"] = i
            elif re.search(r"选项", v):
                mapping["optsingle"] = i
        if "q" in mapping and ("opts" in mapping or "optsingle" in mapping):
            return mapping
    return None


def rows_to_questions(rows, layout, set_name, sheet_name, warn):
    qs = []
    if layout:
        for rn, r in enumerate(rows, 1):
            q = r.get(layout["q"], "").strip()
            if not q or re.fullmatch(r"题[目干见试]*|试题", q):
                continue
            if "opts" in layout:
                opts = [r.get(layout["opts"][k], "").strip() for k in sorted(layout["opts"])]
            else:
                opts = split_options_cell(r.get(layout["optsingle"], ""))
            opts = [re.sub(r"^[A-Fa-f][.、：:．]\s*", "", o).strip() for o in opts if o and o.strip()]
            ans = parse_answer(r.get(layout.get("ans")), opts) if layout.get("ans") is not None else None
            exp = (r.get(layout.get("exp"), "").strip() if layout.get("exp") is not None else "")
            qs.append((q, opts, ans, exp, rn))
    else:
        # 无表头启发式：先统计「答案列」（取值多为 A-F/1-4），再逐行解析
        col_total, col_letter = {}, {}
        for r in rows:
            for c, v in r.items():
                col_total[c] = col_total.get(c, 0) + 1
                if re.fullmatch(r"[A-Fa-f]|[1-4]", str(v).strip()):
                    col_letter[c] = col_letter.get(c, 0) + 1
        ans_col, best = None, 0.0
        for c, tot in col_total.items():
            ratio = col_letter.get(c, 0) / max(tot, 1)
            if ratio >= 0.4 and ratio > best:
                ans_col, best = c, ratio
        for rn, r in enumerate(rows, 1):
            cells = sorted(r.items())
            vals = [v for _, v in cells]
            if any(re.fullmatch(r"题[目干见试]|试题|选项|答案|正确答案|解析|说明", v.strip()) for v in vals):
                continue  # 疑似表头行
            if ans_col is not None:
                ans_raw = r.get(ans_col)
                others = [(c, v) for c, v in cells if c != ans_col]
            else:
                ans_raw, others = None, list(cells)
                for c, v in cells:
                    if re.fullmatch(r"[A-Fa-f]|[1-4]|正确答案[:：]\s*[A-Fa-f]|答案[:：]?\s*[A-Fa-f]", v.strip()):
                        ans_raw, others = v, [(c2, v2) for c2, v2 in cells if c2 != c]
                        break
            marker = [(c, v) for c, v in others
                      if re.search(r"(?:^|\s)A[.、：:．]", v) and re.search(r"(?:^|\s)B[.、：:．]", v)]
            plain = [(c, v) for c, v in others if (c, v) not in marker]
            q, opts, exp = "", [], ""
            if marker:
                # 单列选项（"A. xx B. yy" 挤在一格）
                opts = split_options_cell(marker[0][1])
                if plain:
                    q = plain[0][1]
                    if len(plain) > 1:
                        exp = max((v for _, v in plain[1:]), key=len)
            elif len(others) >= 5:
                q = others[0][1]
                opts = [v for _, v in others[1:5]]
                exp = " ".join(v for _, v in others[5:])
            elif len(others) >= 3:
                q = others[0][1]
                opts = [v for _, v in others[1:]]
            ans = parse_answer(ans_raw, opts) if ans_raw else None
            qs.append((q, opts, ans, exp, rn))
    out = []
    for q, opts, ans, exp, rn in qs:
        opts = [re.sub(r"\s+", " ", o) for o in opts]
        q = re.sub(r"\s+", " ", q).strip()
        rn_s = str(rn) if rn else "?"
        if len(opts) < 2:
            warn(f"[{set_name}] 第{rn_s}行选项不足 2 个，已跳过：{q[:30]}…")
            continue
        if ans is None:
            warn(f"[{set_name}] 第{rn_s}行答案无法识别（选项{len(opts)}个），已跳过：{q[:30]}…")
            continue
        if len(opts) > 6:
            opts = opts[:6]
        out.append({
            "id": f"r{set_name}-{sheet_name}-{rn_s:>03}",
            "set": set_name,
            "q": q,
            "opts": opts,
            "ans": ans,
            "exp": re.sub(r"\s+", " ", exp).strip(),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="xlsx 文件路径（可多个）")
    ap.add_argument("-o", "--out", default="data/questions-real.js")
    args = ap.parse_args()

    def warn(msg):
        print("⚠ " + msg, file=sys.stderr)

    all_q, seen = [], set()
    for fp in args.files:
        p = Path(fp)
        if not p.exists():
            warn(f"文件不存在，跳过：{p}")
            continue
        with zipfile.ZipFile(p) as z:
            shared = load_shared(z)
            for sheet_name, sheet_path in sheet_paths(z):
                rows = read_rows(z, shared, sheet_path)
                if not rows:
                    continue
                m_paper = re.search(r"试卷\s*(\d+)", p.stem)
                if m_paper:
                    base = f"试卷{m_paper.group(1)}"
                elif sheet_name.lower() not in ("sheet1", "worksheet", "工作表1"):
                    base = sheet_name
                else:
                    base = p.stem
                set_name = re.sub(r"[^\w\u4e00-\u9fff-]+", "", base) or "真题"
                layout = detect_layout(rows)
                got = rows_to_questions(rows, layout, set_name, re.sub(r"[^\w\u4e00-\u9fff-]+", "", sheet_name) or "S", warn)
                print(f"✓ {p.name} / {sheet_name}: {len(got)} 题"
                      + ("" if layout else "（未识别表头，按启发式解析）"))
                for g in got:
                    if g["id"] in seen:
                        continue
                    seen.add(g["id"])
                    all_q.append(g)

    total = len(all_q)
    sets = sorted({q["set"] for q in all_q})
    out = "// 由 tools/parse_real_xlsx.py 生成：本地导入真题题库\n"
    out += f"// 共 {total} 题 · {len(sets)} 套\n"
    out += "window.QUESTIONS_REAL = " + json.dumps(all_q, ensure_ascii=False, indent=1) + ";\n"
    Path(args.out).write_text(out, encoding="utf-8")
    print(f"\n== 完成：{total} 题 / {len(sets)} 套 → {args.out} ==")
    print("套卷：", ", ".join(sets))


if __name__ == "__main__":
    main()
