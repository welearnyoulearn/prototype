@echo off
echo Switching to LOCAL PostgreSQL...
copy /Y ".env.local.local_template" ".env.local"
echo.
echo Done! .env.local now points to localhost:5432/wlyl_local
echo Make sure PostgreSQL is running and database "wlyl_local" exists.
echo.
echo Run: npm run dev
pause
