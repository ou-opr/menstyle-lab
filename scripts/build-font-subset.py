#!/usr/bin/env python3
"""生成 style-lab 的衬线标题字体子集。

输出：
    src/assets/fonts/noto-serif-sc-subset.woff2      （wght 400）
    src/assets/fonts/noto-serif-sc-subset-700.woff2  （wght 700）

## 为什么需要这个脚本

衬线字体只用于标题/大数字（`--serif` 令牌），决定了首屏标题观感；
但它同时是单文件版里最大的一块：完整可变字体（wght 200–900）裁到
「源码里出现过的所有汉字」后仍有 **609 KB**，而 woff2 对已压缩字形几乎没有
再压缩空间，这 609 KB 会原样进 3.5 MB 的单文件版。

## 两个体积来源与处理

1. **可变轴**：项目里衬线字体只用到 400 / 700，却打包了整条 wght 轴。
   实例化（pin）成静态字重后体积直接减半。
2. **字符集过宽**：源码（含 187 条资源标题、纯数据文件、注释）出现的汉字有 1712 个，
   但**被衬线字体实际渲染的只有 200 出头**——大部分正文走无衬线。
   按「源码字符集」裁是保守做法，代价是装进了永远用不到的字。

所以默认收集**实际渲染字符**：无头 Chrome 打开页面，遍历元素，取计算样式里
font-family 命中本子集的元素，收集其直接文本节点。缺字风险由生成后的
覆盖断言兜底（页面渲染字符 ⊆ 字体 cmap，缺一个就 exit 1）。

## 依赖

- `fontTools` + `brotli`（\`pip install fonttools brotli\`）
- `C:\\Windows\\Fonts\\NotoSerifSC-VF.ttf`（或 \`--font\` 指定）
- Chrome / Edge（收集渲染字符用；找不到时回退源码字符集）

## 用法

    python scripts/build-font-subset.py                    # 重建（需先 npm run dev）
    python scripts/build-font-subset.py --check-only       # 只校验，不写文件
    python scripts/build-font-subset.py --source-charset   # 回退：按源码字符集裁

改了文案导致新字出现时重跑一次；`scripts/test-sources.mjs` 的字体断言会提醒。
"""
import argparse
import glob
import io
import json
import os
import subprocess
import sys
import unicodedata

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

DEFAULT_FONT = r"C:\Windows\Fonts\NotoSerifSC-VF.ttf"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "src", "assets", "fonts", "noto-serif-sc-subset.woff2")

SOURCE_PATTERNS = [
    "src/**/*.jsx",
    "src/**/*.js",
    "src/**/*.css",
    "src/**/*.json",
    "index.html",
]

SERIF_FAMILY = "Noto Serif SC Subset"

# 无论页面是否渲染都带上的字符：ASCII 可见区 + 常见中文标点。
# 数字/英文会随数据变化（分数、年份、件数），标点会随文案微调；
# 这类字符数量少、成本低，漏掉的代价（豆腐块）却很高。
ALWAYS_INCLUDE = set(
    "　、。，．：；！？（）「」『』【】——…·《》〈〉“”‘’±×÷≥≤￥$%&*+-=/<>[]{}#@~^_|\\'\""
) | {chr(c) for c in range(0x20, 0x7F)}

# 没有 CJK 字面的符号（应用里用内联 SVG 画，或由系统 symbol 字体兜底）。
EXPECTED_MISSING = set(
    "↺⏸⚖⚡✨❓⭐️🎲👍👎💡📌📝🔗🖱🖼🗄🧥"
    "완희"  # 韩文：只出现在引用的原标题里，不是界面文案
)

# 衬线字体实际用到的字重（`font-weight: 700` 与继承的 400）。
# 将来新增其它字重时，把它加进来并重新生成。
TARGET_WEIGHTS = [400, 700]


def is_renderable(ch):
    """控制/格式字符不是字形，不计入覆盖断言。"""
    return unicodedata.category(ch) not in ("Cc", "Cf")


def charset_from_source():
    chars = set()
    for pattern in SOURCE_PATTERNS:
        for path in glob.glob(os.path.join(REPO, pattern), recursive=True):
            with io.open(path, encoding="utf-8") as fh:
                chars |= set(fh.read())
    return "".join(sorted(chars | ALWAYS_INCLUDE))


BROWSER_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
COLLECT_SCRIPT = os.path.join(REPO, "scripts", "collect-serif-chars.mjs")


def find_browser():
    for path in BROWSER_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def charset_from_render(url):
    """用无头浏览器收集「被衬线字体实际渲染」的字符；失败返回 None（调用方回退）。"""
    browser = find_browser()
    if not browser or not os.path.exists(COLLECT_SCRIPT):
        print("[font] 未找到浏览器或收集脚本，回退源码字符集", file=sys.stderr)
        return None
    try:
        out = subprocess.run(
            ["node", COLLECT_SCRIPT, "--url", url, "--family", SERIF_FAMILY, "--browser", browser],
            cwd=REPO,
            capture_output=True,
            timeout=240,
            # 显式 UTF-8：Windows 默认按 cp936 解码子进程输出，遇到中文字符集会得到
            # None 而不是字符串（subprocess 在解码失败时把 stdout 置为 None）。
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"[font] 收集渲染字符失败（{exc}），回退源码字符集", file=sys.stderr)
        return None
    stdout = out.stdout or ""
    stderr = out.stderr or ""
    if out.returncode != 0:
        print(f"[font] 收集渲染字符失败：{stderr.strip()[:300]}", file=sys.stderr)
        return None
    try:
        payload = json.loads(stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        print("[font] 收集脚本输出无法解析，回退源码字符集", file=sys.stderr)
        return None
    chars = set(payload.get("chars", ""))
    if len(chars) < 50:
        print(f"[font] 收集到的字符过少（{len(chars)}），回退源码字符集", file=sys.stderr)
        return None
    return "".join(sorted(chars | ALWAYS_INCLUDE))


def build(text, weights, src_font):
    """裁字形并为每个字重实例化一份；返回 {weight: woff2 bytes}。"""
    results = {}
    for weight in weights:
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.hinting = False
        opts.desubroutinize = True
        opts.drop_tables += ["DSIG"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        font = subset.load_font(src_font, opts)
        ss = subset.Subsetter(options=opts)
        ss.populate(text=text)
        ss.subset(font)
        # 固定可变轴：整条 wght 轴约占一半字节，而项目只用到两档。
        font = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True)
        buf = io.BytesIO()
        subset.save_font(font, buf, opts)
        results[weight] = buf.getvalue()
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", default=DEFAULT_FONT)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--source-charset", action="store_true", help="按源码字符集裁（不启动浏览器）")
    ap.add_argument("--url", default="http://localhost:5173/", help="收集渲染字符时访问的地址")
    args = ap.parse_args()

    if args.source_charset:
        text = charset_from_source()
        mode = "源码字符集"
    else:
        text = charset_from_render(args.url)
        if text is None:
            text = charset_from_source()
            mode = "源码字符集（浏览器收集失败，已回退）"
        else:
            mode = "实际渲染字符"

    cjk = sum(1 for c in text if ord(c) > 0x2E80)
    print(f"[font] 字符来源：{mode}")
    print(f"[font] 字符集：{len(text)} 个（{cjk} CJK + {len(text) - cjk} 窄字符）")

    built = build(text, TARGET_WEIGHTS, args.font)
    total = sum(len(v) for v in built.values())
    for weight, data in built.items():
        print(f"[font]   wght {weight}: {len(data):,} B")

    # 覆盖断言：页面会渲染的每个可渲染字符都必须在 cmap 里，缺一个就失败。
    probe = TTFont(io.BytesIO(built[TARGET_WEIGHTS[0]]))
    cmap = probe.getBestCmap()
    missing = {c for c in text if ord(c) not in cmap and is_renderable(c)}
    unexpected = sorted(missing - EXPECTED_MISSING)
    print(f"[font] 缺字：{len(missing)} 个（预期 {len(missing & EXPECTED_MISSING)} 个符号/韩文）")
    if unexpected:
        print("[font] 出现未预期的缺字：" + "".join(unexpected))
        print("[font] 处理方式：把字符加入 ALWAYS_INCLUDE，或改用系统字体兜底的符号。")
        return 1

    if args.check_only:
        print(f"[font] check-only: OK（合计 {total:,} B）")
        return 0

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    regular = built[TARGET_WEIGHTS[0]]
    bold = built[TARGET_WEIGHTS[-1]]
    with open(args.out, "wb") as fh:
        fh.write(regular)
    bold_out = args.out.replace(".woff2", "-700.woff2")
    with open(bold_out, "wb") as fh:
        fh.write(bold)
    print(f"[font] 写出 {os.path.basename(args.out)}  ({len(regular):,} B)")
    print(f"[font] 写出 {os.path.basename(bold_out)}  ({len(bold):,} B)")
    print(f"[font] 合计 {total:,} B（base64 ≈ {total * 4 // 3:,} B）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
