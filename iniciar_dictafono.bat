@echo off
title Dictafono AI - EDUC.AI
cls
echo ===================================================
echo   🎙️ Dictafono AI (EDUC.AI) - Ejecutor Local
echo ===================================================
echo.
echo Iniciando el servidor local...
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3000
npm run dev
pause
