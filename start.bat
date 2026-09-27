@echo off
cd /d "%~dp0"
if not exist node_modules\vite\bin\vite.js (
  echo Run npm ci first. See README.md.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser.
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173
pause
