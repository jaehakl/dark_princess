@echo off
REM 백엔드 실행 (새 창)
cd ./api
start cmd /k "call run.bat"
cd ..

REM 프론트엔드 실행 (새 창)
cd ./ui   
start cmd /k "call run.bat"
cd ..






