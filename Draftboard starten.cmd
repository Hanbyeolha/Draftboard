@echo off
rem Doppelklicken: startet das Draftboard und oeffnet es im Browser.
rem Dieses Fenster offen lassen, solange du damit arbeitest.
cd /d "%~dp0"
python serve.py
if errorlevel 1 (
  echo.
  echo Start fehlgeschlagen. Ist Python installiert? Pruefe mit: python --version
  pause
)
