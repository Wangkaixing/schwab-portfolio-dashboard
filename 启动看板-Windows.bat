@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node
where npm >nul 2>nul
if errorlevel 1 goto no_node

for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 goto old_node

if not exist "node_modules" (
  echo First launch: installing required packages...
  call npm ci
  if errorlevel 1 goto install_failed
)

echo Starting Portfolio Analytics Dashboard...
echo Close this window to stop the local service.
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:3000"
call npm run dev -- --host 127.0.0.1
goto end

:no_node
echo Node.js was not found. Install Node.js 22 or later from https://nodejs.org/
pause
goto end

:old_node
echo Node.js 22 or later is required.
pause
goto end

:install_failed
echo Package installation failed. Check the network connection and try again.
pause

:end
endlocal

