@echo off
cd /d "%~dp0"
if not exist "config.local.json" (
  echo.
  echo  Grok AI not set up yet - run setup-grok.bat to add your API key.
  echo.
)
echo Starting SpendWise Expense Tracker...
echo Open http://localhost:8080 in your browser
echo Press Ctrl+C to stop
python server.py