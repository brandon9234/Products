@echo off
setlocal

if exist "%ProgramFiles%\nodejs\npm.cmd" (
  call "%ProgramFiles%\nodejs\npm.cmd" %*
  exit /b %errorlevel%
)

if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" (
  call "%ProgramFiles(x86)%\nodejs\npm.cmd" %*
  exit /b %errorlevel%
)

set "NPM_CLI=%npm_execpath%"

if defined NPM_CLI (
  call "%~dp0run-node.cmd" "%NPM_CLI%" %*
  exit /b %errorlevel%
)

echo Unable to locate npm.
exit /b 1
