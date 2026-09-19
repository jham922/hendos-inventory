#!/bin/bash
# Weekly variance report. Delivers nothing when there's nothing to say.
set -u
cd /root/.hermes/scripts || exit 1

OUT=$(node variance-report.js 2>&1)
RC=$?

if [ $RC -ne 0 ]; then
  echo "⚠ Could not build the variance report:"
  echo "$OUT" | tail -3
  exit 0
fi

[ -n "$OUT" ] && echo "$OUT"
exit 0
