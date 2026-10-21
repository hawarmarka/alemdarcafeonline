@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js kurulu degil. Node.js 22 veya daha yenisini yukleyin.
 pause
 exit /b 1
)
if not exist node_modules\express\package.json (
 echo Paketler kuruluyor, lutfen bekleyin...
 call npm ci --no-audit --no-fund
 if errorlevel 1 (
   echo Bagimliliklar yuklenemedi. Internet baglantinizi kontrol edin.
   pause
   exit /b 1
 )
)
echo.
echo Oyun adresi: http://localhost:3000
start "" http://localhost:3000
call npm start
pause
