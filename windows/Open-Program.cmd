@echo off
cd /d "%~dp0"
if not exist "network-info.txt" (
 echo Run Setup.cmd first.
 pause
 exit /b 1
)
for /f "usebackq delims=" %%U in ("local-url.txt") do start "" "%%U"
