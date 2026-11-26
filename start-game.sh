#!/bin/sh
# 메탈펀치 뱀돌이 실행 (macOS/Linux): 로컬 웹 서버 + 브라우저
cd "$(dirname "$0")/static/game" || exit 1
( sleep 1; (xdg-open http://localhost:8000 || open http://localhost:8000) >/dev/null 2>&1 ) &
python3 -m http.server 8000
