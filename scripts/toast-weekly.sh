#!/bin/bash
# Weekly Toast Product-mix pull → inventory app.
# Silent when it works (the Tuesday variance report is the thing she reads);
# speaks up only when a human is needed.
set -u
cd /root/.hermes/scripts || exit 1

OUT=$(/root/.hermes/bin/browser-use < toast-weekly.py 2>&1)
RC=$?

if [ $RC -ne 0 ]; then
  echo "⚠ Toast weekly pull crashed:"
  echo "$OUT" | tail -5
  exit 0
fi

# surface anything that isn't a clean success line
if ! echo "$OUT" | grep -q "^✓ Toast "; then
  echo "$OUT" | grep -vE "^\s*$" | tail -6
fi
exit 0
