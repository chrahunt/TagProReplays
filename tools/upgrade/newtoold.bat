:: Go from new version to old public version of extension.
@set root=%~dp0..\..
@pushd %root%
git checkout public-release
move %root%\build\dev %root%\build\dev-new
mklink /D /J %root%\build\dev %root%
popd
