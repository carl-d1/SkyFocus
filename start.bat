@echo off
setlocal EnableDelayedExpansion
title SkyFocus launcher
cd /d "%~dp0"

rem ---- Find Python (the "py" launcher first, then python on PATH) ----
set "PY="
py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY (
  python --version >nul 2>&1 && set "PY=python"
)

if not defined PY (
  echo.
  echo  Python was not found, so SkyFocus will open directly from the file.
  echo  Everything works, but data is stored separately from the server version
  echo  and browser notifications are unavailable.
  echo.
  start "" "%~dp0index.html"
  goto :eof
)

rem ---- Pick the first free port ----
rem Python on Windows can bind a port that is already in use, so ask whether anything answers on it first.
set "PORT="
for %%P in (8080 8081 8090) do (
  if not defined PORT (
    %PY% -c "import socket,sys; s=socket.socket(); s.settimeout(0.4); sys.exit(1 if s.connect_ex(('127.0.0.1',%%P))==0 else 0)"
    if not errorlevel 1 set "PORT=%%P"
  )
)

if not defined PORT (
  echo.
  echo  Ports 8080, 8081 and 8090 are all in use.
  echo  Opening SkyFocus directly from the file instead.
  echo.
  start "" "%~dp0index.html"
  pause
  goto :eof
)

set "URL=http://localhost:%PORT%/"

rem ---- Start the server in its own window ----
start "SkyFocus server - close to stop" cmd /k "title SkyFocus server - close to stop & echo. & echo   SkyFocus is running at %URL% & echo   Close this window to stop the server. & echo. & %PY% -m http.server %PORT% --bind 127.0.0.1"

rem Give the server a moment to start, then open the browser.
ping -n 3 127.0.0.1 >nul
start "" "%URL%"

echo.
echo  SkyFocus is running at %URL%
echo  To stop it, close the window titled "SkyFocus server - close to stop".
echo.
echo  This launcher window will close in 10 seconds.
ping -n 11 127.0.0.1 >nul
endlocal
