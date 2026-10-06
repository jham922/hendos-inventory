# Project status — hendos-inventory

_Maintained jointly. Last updated 2026-10-06 by the Hermes assistant._
_Read `docs/CHANGES.md` for the running log; append a line there after any session._

## 1. hendos-inventory — FOH inventory app

**State:** in daily use by managers. Inventory counts, pars, order dashboard, vendor
list, cocktails, Toast tab, receiving tab.

**Changed since the last published status:**
- The weekly Toast Product-mix pull now works end to end, unattended: it signs itself
  back into Toast, sets the report date range directly in the report URL (the on-screen
  "Last week" control drifts, and a stale range used to re-export the *previous* week
  and then report "already uploaded"), loads the app's item list the way the app does,
  and saves the week to History. Verified against the live app, not just the job log.
- The app only builds its item list inside `startApp()`, which requires a signed-in
  session. With no session, `items` is empty, every Toast row comes back "unmatched",
  and the save silently does nothing. The automation works around this by calling the
  app's own `DEFAULT_ITEMS` / `loadCustomItems()` before parsing. **Worth fixing in the
  app itself** so unattended jobs don't need the workaround.
- Receiving pull (Southern + Gate City invoices) is reliable again; the earlier silent
  zero-invoice failures came from a browser-harness false negative that is now removed.

**Awaiting action:** none.

---

Source: full cross-project survey kept on the Hermes host (`~/business-reports/project-status.md`).
