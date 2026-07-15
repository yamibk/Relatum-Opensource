@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title Relatum - 重置界面偏好

echo.
echo ============================================================
echo   Relatum：重置桌面客户端的界面偏好
echo ============================================================
echo.
echo 本工具会清除 Relatum 桌面客户端保存在 WebView2 中的：
echo   新手引导状态、主题、语言、面板开关、交互速度等界面偏好；
echo   当前 WebView2 临时会话状态。
echo.
echo 不会删除：
echo   画布、附件、学习记录、日记、AI 配置和窗口状态；
echo   WebView2 Cookies；
echo   Microsoft Edge、Chrome 等独立浏览器的数据。
echo.

if not defined LOCALAPPDATA (
    echo [错误] Windows 没有提供 LOCALAPPDATA 路径，无法安全定位界面偏好。
    goto :failed
)

set "PROFILE_ROOT=%LOCALAPPDATA%\Canvas\WebView2\EBWebView\Default"
set "REMOVED=0"
set "FAILED=0"
set "EXIT_CODE=0"

tasklist /FI "IMAGENAME eq Relatum.exe" 2>nul | findstr /I /C:"Relatum.exe" >nul
if not errorlevel 1 (
    echo [停止] 检测到 Relatum.exe 正在运行。
    echo 请先正常关闭 Relatum，再重新双击本工具。
    echo 本工具不会强制结束应用，以免丢失尚未保存的内容。
    goto :failed
)

if not exist "%PROFILE_ROOT%\" (
    echo [无需重置] 没有找到 Relatum WebView2 配置目录。
    goto :success
)

choice /C YN /N /M "确认重置全部界面偏好？[Y/N] "
if errorlevel 2 goto :cancelled

echo.
call :remove_state "Local Storage"
call :remove_state "Session Storage"

echo.
if not "%FAILED%"=="0" (
    echo [未完全重置] 已清理 %REMOVED% 个偏好目录，另有 %FAILED% 个目录被占用或无权删除。
    echo 请确认 Relatum 已完全关闭，然后再运行一次。
    goto :failed
)

echo [完成] 已重置 Relatum 桌面客户端的界面偏好。
echo 下次打开时会使用出厂默认偏好，并重新显示新手引导。
goto :success

:remove_state
set "TARGET=%PROFILE_ROOT%\%~1"
if not exist "%TARGET%\" exit /b 0
rd /s /q "%TARGET%" 2>nul
if exist "%TARGET%\" (
    set /a FAILED+=1 >nul
    echo [失败] %~1
) else (
    set /a REMOVED+=1 >nul
    echo [已重置] %~1
)
set "TARGET="
exit /b 0

:cancelled
echo.
echo 已取消，没有删除任何内容。
goto :end

:success
echo.
echo 画布和个人数据没有被修改。
goto :end

:failed
set "EXIT_CODE=1"
echo.
echo 操作已停止或未完全完成；画布和个人数据没有被修改。

:end
echo.
pause
endlocal & exit /b %EXIT_CODE%
