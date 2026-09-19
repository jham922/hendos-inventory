#!/bin/bash
# Session keep-alive wrapper.
#
# 1. Makes sure the display stack + automation Chrome are alive (self-heals).
# 2. Checks each portal session; re-signs in automatically where credentials
#    are stored (see /root/.hermes/secrets/vendor-logins.env).
#
# Silent unless something needs the owner's attention.
set -u
cd /root/.hermes/scripts || exit 1

CDP=http://127.0.0.1:9222
LAUNCH=/root/.hermes/skills/web/browser-session-automation/scripts/launch-server-chrome.sh
VNC_PASS=/root/.hermes/vnc/passwd.txt

cname=""
notes=""

# --- display stack -----------------------------------------------------------
if ! pgrep -f "Xvfb :99" >/dev/null 2>&1; then
  notes="${notes}Xvfb was down — restarted it\n"
  Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >/dev/null 2>&1 &
  sleep 3
fi
if ! pgrep -f "x11vnc -display :99" >/dev/null 2>&1; then
  notes="${notes}VNC was down — restarted it (screen sharing to the login page)\n"
  x11vnc -display :99 -rfbauth "$VNC_PASS" -rfbport 5900 -forever -shared -noxdamage \
        -o /root/.hermes/vnc/x11vnc.log >/dev/null 2>&1 &
  sleep 2
fi

# --- automation chrome -------------------------------------------------------
if ! curl -s --max-time 6 "$CDP/json/version" >/dev/null 2>&1; then
  notes="${notes}Automation Chrome was down — restarted it (logins restored from the saved profile)\n"
  DISPLAY=:99 nohup bash "$LAUNCH" --headed >/dev/null 2>&1 &
  for _ in $(seq 1 12); do
    sleep 3
    curl -s --max-time 6 "$CDP/json/version" >/dev/null 2>&1 && break
  done
  if ! curl -s --max-time 6 "$CDP/json/version" >/dev/null 2>&1; then
    notes="${notes}…but Chrome did NOT come back up. Browser automation is offline.\n"
  fi
  sleep 5
fi

# --- session check -----------------------------------------------------------
OUT=$(/root/.hermes/bin/browser-use < session-keepalive.py 2>&1)
RC=$?

if [ $RC -ne 0 ]; then
  printf "SESSION KEEP-ALIVE FAILED (exit %s)\n" "$RC"
  echo "$OUT" | tail -5
  [ -n "$notes" ] && printf "%b" "$notes"
  exit 0
fi

if echo "$OUT" | grep -q "NEED ATTENTION"; then
  [ -n "$notes" ] && printf "%b\n" "$notes"
  echo "$OUT"
elif [ -n "$notes" ]; then
  printf "%b" "$notes"
  echo "Sessions are healthy."
fi

exit 0
