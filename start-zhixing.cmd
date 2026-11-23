@echo off
title ZhiXing Launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-zhixing.ps1"
echo.
echo Server stopped. Press any key to close.
pause >nul
