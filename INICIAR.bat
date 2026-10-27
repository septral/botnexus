@echo off
setlocal
cd /d "%~dp0"
if not exist .env (
  echo Execute INSTALAR.bat e preencha o .env primeiro.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Execute INSTALAR.bat primeiro.
  pause
  exit /b 1
)
call npm start
pause
