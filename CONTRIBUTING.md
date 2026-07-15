# 参与贡献

感谢你愿意改进 Relatum。这个项目把数据安全和既有交互稳定性放在首位。

## 开始之前

1. 阅读 `AGENTS.md`，了解数据格式、文件边界和不可退化的交互约束。
2. 从源码模式启动项目，确认当前版本在你的电脑上可以正常运行。
3. 一个提交尽量只解决一个问题；涉及界面行为时，请说明人工验证过的路径。

## 数据与隐私

禁止提交以下内容：

- `data/`、`canvases/` 或任意真实 `.canvas` 内容及其 `.assets/` 附件。
- API Key、访问令牌、密码、Cookie、私人日志或聊天记录。
- 包含本机用户名的绝对路径和 IDE/代理的本地配置。
- PyInstaller 输出、虚拟环境、缓存、`__pycache__` 和 `.pyc` 文件。

需要演示数据时，请创建明确标注为虚构的最小 fixture，并放在专门的测试目录，不要从个人数据中脱敏复制。

## 技术约束

- 保持原生 HTML/CSS/JavaScript 和 Python 标准库的运行路径；不要仅为一次修改引入框架或 npm 构建链。
- 保持现有 `.canvas` 文件兼容性。新增字段必须可选，旧文件缺少该字段时应有安全默认值。
- 写入用户数据必须继续使用原子写入和现有路径授权检查。
- 新增定时器、RAF、Observer、Worker 或网络任务时，必须提供对应的停止或销毁路径。
- 第三方依赖必须记录版本、来源和许可证，并优先本地托管以保证离线可用。

## 提交前检查

```powershell
python -m py_compile app.py desktop.py packaging\make_icon.py packaging\make_font_subset.py

Get-ChildItem assets -Recurse -Filter *.js |
  Where-Object { $_.FullName -notmatch '\\vendor\\' } |
  ForEach-Object { node --check $_.FullName }

powershell -ExecutionPolicy Bypass -File .\scripts\check-public.ps1
```

该命令默认检查 Git 会提交的文件，并跳过已忽略的本地运行数据。维护者制作公开 ZIP 或正式发布前还应运行
`scripts/check-public.ps1 -Physical`，确保发布暂存目录本身也没有用户数据。

随后至少人工验证：首页、新建画布、打开与保存、重复进入修改过的页面，以及关闭应用。
