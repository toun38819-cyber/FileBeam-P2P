@echo off
setlocal
cd /d %~dp0
echo Building FileBeam Local Server...
python -m pip install -r requirements.txt || goto :error
python -m pip install pyinstaller || goto :error
python -m PyInstaller server.spec || goto :error
echo Done! filebeam-server.exe in distgoto :eof
:error
echo Build failed.
exit /b 1
