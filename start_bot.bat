@echo off
:: =============================
:: Telegram Media Bot Windows 10
:: Avvalgi jarayonni o'chirib, qayta ishga tushirish
:: =============================

:: Bot papkasi
set BOT_DIR=%~dp0

:: Node.js mavjudligini tekshirish
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js topilmadi. Iltimos Node.js ni o‘rnating va PATH ga qo‘shing.
    pause
    exit /b
)

:: Avvalgi node jarayonlarini to‘xtatish
echo ⏹ Avvalgi bot jarayonlari to‘xtatilmoqda...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

:: Avvalgi faylni o'chirish (masalan, eski download fayllari)
echo 🗑 Downloads papkasini tozalayapmiz...
if exist "%BOT_DIR%downloads\*" del /q "%BOT_DIR%downloads\*"

:: Botni ishga tushirish
echo 🚀 Bot ishga tushmoqda...
cd /d "%BOT_DIR%"
start "" cmd /k "node bot.js"

echo ✅ Bot qayta ishga tushirildi.
pause