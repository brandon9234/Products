@echo off
setlocal

set "LOCAL_NODE_MODULES=C:\LocalBuild\Products\node_modules"
if defined TAM_LOCAL_NODE_MODULES set "LOCAL_NODE_MODULES=%TAM_LOCAL_NODE_MODULES%"

set "TSX_CLI=%~dp0..\node_modules\tsx\dist\cli.mjs"
set "NODE_MODULE_ROOT=%~dp0..\node_modules"
if exist "%TSX_CLI%" goto run

if defined TAM_LOCAL_NODE_MODULES (
  set "TSX_CLI=%TAM_LOCAL_NODE_MODULES%\tsx\dist\cli.mjs"
  set "NODE_MODULE_ROOT=%TAM_LOCAL_NODE_MODULES%"
  if exist "%TSX_CLI%" goto run
)

set "TSX_CLI=C:\LocalBuild\Products\node_modules\tsx\dist\cli.mjs"
set "NODE_MODULE_ROOT=C:\LocalBuild\Products\node_modules"
if exist "%TSX_CLI%" goto run

goto broken

:run
if /I "%NODE_MODULE_ROOT%"=="%LOCAL_NODE_MODULES%" (
  set "RESOLVER_PATHS=%NODE_MODULE_ROOT%"
) else (
  set "RESOLVER_PATHS=%NODE_MODULE_ROOT%;%LOCAL_NODE_MODULES%"
)

if defined NODE_PATH (
  set "NODE_PATH=%RESOLVER_PATHS%;%NODE_PATH%"
) else (
  set "NODE_PATH=%RESOLVER_PATHS%"
)
call "%~dp0run-node.cmd" "%TSX_CLI%" %*
exit /b %errorlevel%

:broken
echo tsx is unavailable because dependencies are missing from both:
echo   1^) %~dp0..\node_modules
echo   2^) %%TAM_LOCAL_NODE_MODULES%% or C:\LocalBuild\Products\node_modules
echo Install dependencies in a local non-synced folder and rerun the command.
exit /b 1
