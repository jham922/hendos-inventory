# Project status — hendos-inventory

_Maintained jointly. Last updated 2026-09-16 by the Hermes assistant._
_Read `docs/CHANGES.md` for the running log; append a line there after any session._

## 1. Hendo's Inventory (the ops app) — *in weekly use*

**What it is:** the inventory system your managers use every week. Counts, receiving, variance against Toast, ordering rules.

**Where:** repo `jham922/hendos-inventory` · live at `jham922.github.io/hendos-inventory` · Supabase `codzcyqavknpddhumtgx` · GitHub Pages, push = deploy

**Done**
- Counting in the item's **par unit** everywhere (bottles, cases — whatever the par says)
- Receiving tab: automated vendor-invoice pull, plus multi-line manual receipts for small vendors, with a "show" window (4 weeks default)
- **Variance tab**: usage = start + received − end vs Toast theoretical; negative = missing, flagged red
- `count_history` snapshots so each count becomes a comparison point
- `Received (7d)` column beside stock
- Toast product-mix report loaded automatically every Monday
- Ordering rulebook: 126 items classified, plus spec v3 and decision worksheets in `docs/`
- Server jobs running: invoice pull Thursday, Toast pull Monday, variance alert Tuesday

**Next**
1. **Fill the variance dollar column** using costs already stored in the cost calculator — most rows currently show `—` because only parsed invoices have costs.
2. Parse Southern invoice line costs (quantities are already parsed; costs aren't).
3. Invoice intake that needs neither of us — email-forward is the natural path.
4. Resolve the remaining 13 auto-match corrections and the kitchen/ignored items.
5. **Voice counting — WANTED, NOT STARTED.** A push-to-talk mic button on the Count screen: speak *"eight buffalo trace"* and the app matches the item, checks the unit against its par (bottles, not cases), and shows it for confirmation before saving. Misreads are fixed by repeating or editing; out-of-range values (e.g. "200 bottles" against a par of 12) get queried, never silently accepted — the same "AI proposes, human confirms" pattern as the bottle scanner's editable fill %.
   - **Build it the cheap way first:** browser speech recognition (Chrome/Safari, built in, no API cost, no server) with fuzzy matching against the existing item list. Fallback if that struggles with liquor names or noise: server-side transcription at cents per minute.
   - **The go/no-go test is noise.** A bar at count time has music, glass and people. Build it as push-to-talk, one item at a time, phone held close — test in the real room on a busy night, not at a desk.
   - **Why it matters beyond the app:** counting is the task staff hate most, and every competitor makes them tap or type. "Your team speaks the count and the system writes it down" is a one-sentence consulting pitch.


---

_Security-related notes were withheld from this copy (they stay on the Hermes host)._

---

Source: full cross-project survey kept on the Hermes host (`~/business-reports/project-status-2026-09-16.md`).
