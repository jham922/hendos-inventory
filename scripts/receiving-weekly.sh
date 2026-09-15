#!/bin/bash
# Weekly receiving pipeline (Stage A + B).
#   1. pull the newest invoices from Proof + SipMarket using the logged-in browser
#   2. parse them, map vendor item numbers to inventory items, write received_items
# Prints a plain-text summary (silent-ish on success, loud on failure) for WhatsApp delivery.
set -u
cd /root/.hermes/scripts || exit 1

echo "RECEIVING PIPELINE — $(date -u '+%a %d %b %Y %H:%M UTC')"
echo

/root/.hermes/bin/browser-use < receiving-pull.py 2>&1
echo

SINCE=$(date -u -d '21 days ago' +%F)
node receiving-ingest.js --since "$SINCE" 2>&1

echo
echo "(source invoice text files: ~/business-reports/invoices/)"
