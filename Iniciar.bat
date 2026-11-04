@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando dependencias pela primeira vez...
  call npm install
  call node node_modules\electron\install.js
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
