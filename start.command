#!/bin/bash
# ===================================================================
# GESTURE SYMPHONY — one-click launcher
# Double-click this file in Finder to start the local web server and
# open the app in your browser. Keep the Terminal window open while
# you play; press Ctrl+C (or just close the window) to stop.
# ===================================================================

# Always serve from the folder this file lives in, no matter where
# it's launched from.
cd "$(dirname "$0")" || exit 1

PORT=8080
URL="http://localhost:$PORT"

# If a server is already running on this port, just open the page.
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "✅ Server already running — opening $URL"
  open "$URL"
  exit 0
fi

# Open the browser after a short delay so the server is up first.
( sleep 1 && open "$URL" ) &

echo "🎵 Gesture Symphony serving at $URL"
echo "   Press Ctrl+C to stop."
python3 -m http.server $PORT
