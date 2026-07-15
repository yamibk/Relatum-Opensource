# 如何构建和测试 EXE 客户端

只记住两件事：

> BAT 只负责生成干净的 `Relatum-release`；测试时运行它的复制副本，不运行原始成品。

## 构建

1. 双击 `构建Relatum-release.bat`。
2. 等待窗口显示“构建完成”。如果出现“停止”或“错误”，把完整提示交给 AI。
3. 构建结果位于源码仓库的上一级：`Relatum-release`。

BAT 会自动寻找仓库路径，因此换电脑或改变克隆位置后仍可使用。新电脑第一次构建需要：

- Git；
- Python 3.9–3.12；
- 网络连接，用于安装桌面构建依赖。

第一次成功构建后，BAT 会检查临时构建环境中的 Python 和依赖版本。只要它们仍与当前 `build-desktop.ps1` 的要求一致，后续构建会自动使用 `-SkipInstall`，通常不再联网，并且速度更快。依赖缺失、损坏或版本要求变化时，BAT 会自动恢复为完整安装模式，此时才需要联网。

当前源码不必先 commit 或 push。网页端测试产生的 `data/`、`canvases/` 会继续留在源码目录，不会进入构建成品。

## 测试 EXE

1. 不要直接运行原始 `Relatum-release\Relatum.exe`。
2. 在资源管理器中复制整个 `Relatum-release` 文件夹。
3. 把复制出来的文件夹放到桌面，并改名为 `Relatum-EXE测试副本`。
4. 运行测试副本里的 `Relatum.exe`。
5. 只使用虚构数据测试新建、节点、连线、保存和本次修改的功能，然后关闭客户端。
6. 再次运行同一个测试副本里的 `Relatum.exe`，确认刚才的虚构画布能够重新打开。

测试副本产生 `data/`、`canvases/` 是正常的。它不在 Git 仓库中，不会被自动上传；但不要把这个测试副本当作发布成品。

准备 GitHub Release 时，只处理始终没有运行过的原始 `Relatum-release`。版本号、压缩文件名和 Release 说明由你自己填写。

`构建Relatum-release.bat` 不会压缩 ZIP，也不会执行 Git commit、push 或 GitHub Release 发布。
