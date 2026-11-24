@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nahi mila. https://nodejs.org se LTS install karke is file ko dubara chalayein.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Pehli baar packages install ho rahe hain...
  call npm install
  if errorlevel 1 (
    echo npm install fail ho gaya.
    pause
    exit /b 1
  )
)
node server.js
pause
