# -*- coding: utf-8 -*-
"""
生成界面中文字体子集。

源字体：Noto Sans SC（思源黑体的 Google 版，字形同源，SIL OFL 1.1），
        google/fonts 仓库里的可变字体 NotoSansSC[wght].ttf（wght 100-900 连续轴）。
处理：  子集化到 GB2312 全字集（一二级汉字约 6763 + 符号区）+ 基本拉丁兜底
        + 常用标点补充，保留 wght 可变轴，输出 woff2。
        保留可变轴意味着 CSS 里任意 font-weight（400/500/650/700…）都能精确命中，
        中文不会出现浏览器伪粗体。
产物：  assets/fonts/noto-sans-sc.woff2
        assets/fonts/OFL.txt（许可文件，随字体分发，合规）

用法：  python packaging/make_font_subset.py
依赖：  fonttools + brotli（已在本机确认可用）

注：本脚本是一次性/可复现的构建辅助脚本，不参与运行时，也不进打包产物。
"""
import os
import sys
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # 画布/
FONTS = os.path.join(ROOT, "assets", "fonts")
WORK = os.path.join(os.environ.get("TEMP", HERE), "notofont")
os.makedirs(WORK, exist_ok=True)
os.makedirs(FONTS, exist_ok=True)

TTF_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
OFL_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt"
SRC_TTF = os.path.join(WORK, "NotoSansSC-VF.ttf")
OUT = os.path.join(FONTS, "noto-sans-sc.woff2")


def fetch(url, dest, min_bytes):
    """用 curl 下载（本机已验证 curl 有网络）；已存在且足够大则跳过。"""
    if os.path.exists(dest) and os.path.getsize(dest) >= min_bytes:
        print("  cached:", os.path.basename(dest))
        return
    subprocess.run(["curl", "-sL", "--fail", "-m", "180", "-o", dest, url], check=True)


def build_charset():
    """GB2312 全双字节区 + ASCII + 常用补充标点。"""
    chars = set()
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    chars.update(chr(c) for c in range(0x20, 0x7F))   # 基本拉丁/数字兜底
    chars.update(
        "　、。·—～‖…“”‘’（）〔〕〈〉《》「」『』【】"
        "±×÷＂＇￥℃№←→↑↓■□●○◆◇▲△▶◀※§¶"
    )
    return "".join(sorted(chars))


def main():
    print("1) 下载源字体 ...")
    fetch(TTF_URL, SRC_TTF, 1_000_000)
    print("   source:", round(os.path.getsize(SRC_TTF) / 1048576, 2), "MB")
    fetch(OFL_URL, os.path.join(FONTS, "OFL.txt"), 1000)

    print("2) 生成字符集 ...")
    text = build_charset()
    charset_file = os.path.join(WORK, "charset.txt")
    with open(charset_file, "w", encoding="utf-8") as f:
        f.write(text)
    print("   字符数:", len(text))

    print("3) 子集化 + 转 woff2（保留 wght 可变轴）...")
    from fontTools import subset
    subset.main([
        SRC_TTF,
        "--text-file=" + charset_file,
        "--flavor=woff2",
        "--output-file=" + OUT,
        "--layout-features=*",
        "--no-hinting",
        "--drop-tables+=DSIG",
    ])
    print("OUTPUT:", OUT)
    print("   =>", round(os.path.getsize(OUT) / 1048576, 2), "MB")


if __name__ == "__main__":
    sys.exit(main())
