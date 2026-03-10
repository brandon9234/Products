@echo off
setlocal

call "%~dp0run-node.cmd" "%~dp0agent-docs.ts" check
if errorlevel 1 exit /b %errorlevel%

call "%~dp0run-vitest.cmd" run
exit /b %errorlevel%
