#!/bin/zsh
# Usage (on the Mac): shot.sh <dir-with-repo-copy> <out.png> <width> <height> [query]
# Headless Chrome's virtual time does not advance CSS transitions, so screenshots are taken with
# prefers-reduced-motion forced on (the card then shows end states without fades).
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=${SCALE:-1} \
  --force-prefers-reduced-motion \
  --screenshot="$2" --window-size="$3,$4" --virtual-time-budget=${BUDGET:-3000} \
  "file://$1/test/harness.html${5:+?$5}" 2>/dev/null
