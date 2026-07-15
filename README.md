# Relatum

Relatum 是一个本地优先的画布、学习与笔记工作台。核心界面使用原生 HTML、CSS 和 JavaScript，
本地服务使用 Python 标准库；Windows 桌面版通过 WebView2 提供独立窗口。

项目默认把画布、偏好设置和 AI 凭据保存在应用目录，不需要账号，也不会把用户内容放进源码仓库。

## 主要功能

- 基于节点与连线的自由画布，兼容 Obsidian Canvas 的基础 `nodes + edges` 结构。
- 卡片、长文阅读、Markdown、公式、Mermaid 图表、PDF 与图片附件。
- 脑图排版、关系图谱、搜索、小地图和多种画布背景。
- 最近画布、分组、回收站、学习任务、日历、速记、复习和专注计时。
- 可选的 AI 对话与“生成到画布”；API Key 仅保存在本机。
- Markdown 文件夹导入与画布内容导出。

<img width="2559" height="1599" alt="Relatum 画布界面" src="https://github.com/user-attachments/assets/47993904-ec89-415d-8ad8-c068c91935de" />
<img width="2559" height="1599" alt="Relatum 活跃统计界面" src="https://github.com/user-attachments/assets/87723537-06ac-40d8-8086-a987d15657eb" />
<img width="2559" height="1599" alt="Relatum 日历界面" src="https://github.com/user-attachments/assets/2397162c-2db8-45ac-932b-5f6381ff49a7" />

## 快速开始

推荐下载右侧的 Release，每个 Release 都是一个完整的客户端。直接下载本项目的 ZIP 也可以，不过默认只能启动网页端。

### 源码模式

要求：Windows 10/11、Python 3.9 或更高版本。

源码模式只依赖 Python 标准库：

```powershell
python app.py
```

也可以双击 `打开画布.bat`，或运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

应用首次启动时会自动创建：

- `canvases/`：用户的 `.canvas` 文件及附件。
- `data/`：最近列表、窗口状态、学习记录、日历、AI 配置等本地数据。

这两个目录已被 `.gitignore` 排除，请不要提交到 Git。

桌面外壳的 WebView2 配置和前端 `localStorage` 位于 `%LOCALAPPDATA%\Canvas\WebView2`，同样不在仓库内。

### 构建 Windows 桌面版

桌面构建要求 Python 3.9–3.12。构建脚本会在临时目录创建虚拟环境并安装固定版本的
PyWebView、PyInstaller 和 Pillow：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-desktop.ps1
```

输出位于项目同级的 `Relatum-release/`。构建脚本不会把 `data/` 或 `canvases/` 打进发布包。
目标电脑需要 Microsoft Edge WebView2 Runtime；Windows 10/11 通常已经安装。

## AI 与隐私

AI 是可选功能。API 地址、模型和 Key 由用户在界面中配置，并写入本机的 `data/ai.json`。
仓库不提供任何默认 Key。公开 Issue、日志或截图前，请先确认其中没有凭据或私人内容。

更完整的数据边界见 [docs/PRIVACY.md](docs/PRIVACY.md)。

## 项目结构

```text
Relatum/
├─ app.py                    本地 HTTP 服务与数据 API
├─ desktop.py                Windows 桌面外壳
├─ assets/                   HTML、CSS、JavaScript 与运行资源
├─ packaging/                图标、字体和桌面构建辅助工具
├─ build-desktop.ps1         干净的桌面发布包构建入口
├─ start.ps1                 源码模式启动入口
├─ AI笔记创作指南.md          AI 生成画布时使用的提示指南
└─ AGENTS.md                 架构约束与维护说明
```

`data/`、`canvases/`、构建产物和本机开发配置不属于源码仓库。

## 开发与验证

项目不需要 npm，也没有前端构建步骤。提交修改前至少运行：

```powershell
python -m py_compile app.py desktop.py packaging\make_icon.py packaging\make_font_subset.py

Get-ChildItem assets -Recurse -Filter *.js |
  Where-Object { $_.FullName -notmatch '\\vendor\\' } |
  ForEach-Object { node --check $_.FullName }

powershell -ExecutionPolicy Bypass -File .\scripts\check-public.ps1
```

默认模式只检查 Git 会提交的文件，因此可以在正常开发目录运行。制作 ZIP 或正式上传前，再执行一次完整物理扫描：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-public.ps1 -Physical
```

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [AGENTS.md](AGENTS.md)。

## 第三方组件与媒体资源

仓库内置了 Mermaid、MathJax、PDF.js 和若干字体，以便离线运行。许可证和归属见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，各组件的原始许可证也保留在相应目录。

内置背景图、雨声音频和应用图标不自动适用项目的代码许可证。在公开发布前，维护者应确认自己拥有这些素材的再分发权，
或将其替换为许可清晰的素材。

## 许可证

Relatum 的原创源代码和文档采用 [MIT License](LICENSE)，Copyright © 2026 yamibk。
第三方组件和字体继续适用各自许可证；媒体素材的范围说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
