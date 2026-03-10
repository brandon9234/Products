@echo off
setlocal

set "NODE_BIN=%npm_node_execpath%"

if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"

if not defined NODE_BIN (
  echo Unable to locate node.exe.
  exit /b 1
)

"%NODE_BIN%" %*
