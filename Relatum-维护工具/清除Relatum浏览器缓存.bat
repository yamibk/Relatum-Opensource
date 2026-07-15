@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title Relatum - 清除浏览器缓存

echo.
echo ============================================================
echo   Relatum：清除桌面客户端的 WebView2 浏览器缓存
echo ============================================================
echo.
echo 本工具只清理 Relatum 桌面客户端可自动重建的缓存：
echo   Cache、Code Cache、GPUCache、着色器缓存等。
echo.
echo 不会删除：
echo   画布、学习记录、AI 配置、窗口状态；
echo   主题、语言、新手引导状态等 localStorage 界面偏好；
echo   Microsoft Edge、Chrome 等独立浏览器的缓存。
echo.

if not defined LOCALAPPDATA (
    echo [错误] Windows 没有提供 LOCALAPPDATA 路径，无法安全定位缓存。
    goto :failed
)

set "CACHE_ROOT=%LOCALAPPDATA%\Canvas\WebView2\EBWebView"
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

if not exist "%CACHE_ROOT%\" (
    echo [无需清理] 没有找到 Relatum WebView2 缓存目录。
    goto :success
)

choice /C YN /N /M "确认开始清理？[Y/N] "
if errorlevel 2 goto :cancelled

echo.
call :remove_cache "component_crx_cache"
call :remove_cache "extensions_crx_cache"
call :remove_cache "GPUPersistentCache"
call :remove_cache "GrShaderCache"
call :remove_cache "ShaderCache"
call :remove_cache "Default\AutofillAiModelCache"
call :remove_cache "Default\Cache"
call :remove_cache "Default\Code Cache"
call :remove_cache "Default\DawnGraphiteCache"
call :remove_cache "Default\DawnWebGPUCache"
call :remove_cache "Default\GPUCache"
call :remove_cache "Default\Media Cache"
call :remove_cache "Default\optimization_guide_hint_cache_store"
call :remove_cache "Default\Shared Dictionary\cache"
call :remove_cache "Default\Service Worker\CacheStorage"

echo.
if not "%FAILED%"=="0" (
    echo [未完全清理] 已清理 %REMOVED% 个缓存目录，另有 %FAILED% 个目录被占用或无权删除。
    echo 请确认 Relatum 已完全关闭，然后再运行一次。
    goto :failed
)

echo [完成] 已清理 %REMOVED% 个缓存目录。
echo 下次打开 Relatum 时，WebView2 会按需重新生成这些缓存。
goto :success

:remove_cache
set "TARGET=%CACHE_ROOT%\%~1"
if not exist "%TARGET%\" exit /b 0
rd /s /q "%TARGET%" 2>nul
if exist "%TARGET%\" (
    set /a FAILED+=1 >nul
    echo [失败] %~1
) else (
    set /a REMOVED+=1 >nul
    echo [已清理] %~1
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
