@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-demo.ps1"
echo.
echo 展示包已生成到上一级目录。
pause
