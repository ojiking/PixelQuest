@echo off
rem 메탈펀치 뱀돌이 실행: 로컬 웹 서버를 켜고 브라우저를 엽니다 (Python 필요)
cd /d "%~dp0static\game"
start "" http://localhost:8000
python -m http.server 8000
if errorlevel 1 py -m http.server 8000
pause
