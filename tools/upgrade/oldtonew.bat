:: Go from old public version to new version of extension
:: required argument, name of branch.
@if "%~1"=="" goto :usage
@set branch=%1
@set root=%~dp0\..\..
pushd %root%

rmdir %root%\build\dev

move %root%\build\dev-new %root%\build\dev

git checkout %branch%
::start /d %root% gulp watch
popd
@goto :eof

:usage
@echo Usage: %0 ^<branch^>
@exit /B 1

:eof
