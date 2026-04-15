@echo off
echo Switching to SUPABASE...
copy /Y ".env.local.supabase_backup" ".env.local"
echo.
echo Done! .env.local now points to Supabase.
echo.
echo Run: npm run dev
pause
