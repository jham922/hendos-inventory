# Change log — hendos-inventory

Newest last. One line per session, prefixed with who did it.

- 2026-09-16 — Hermes: published `docs/PROJECT-STATUS.md`; no application changes.
- 2026-09-16 — Hermes: published `docs/PROJECT-STATUS.md`; no application changes.
- 2026-09-19 — Claude Code: added Toast POS theoretical usage (liquor/wine/draft-beer pour math), a Toast upload History tab, and cabinet-based grouping on the Inventory tab (Group by: Category/Cabinet toggle; Order Dashboard still groups by vendor, unchanged). Wasn't aware of this handoff doc when the session started, so hadn't read PROJECT-STATUS.md first — merged cleanly against Hermes's Receiving/Variance work with one trivial field-level conflict in `loadCustomItems()` (kept both `cabinet` and `bottleSizeOz`).
- 2026-10-06 — Hermes: the weekly Toast Product-mix pull now works unattended end to end (signs itself back into Toast, sets the report date range in the report URL instead of clicking the drifting "Last week" control, loads the item list before parsing, saves the week to History) and the weekly receiving pull is harness-free. Both verified against the live app. Details in `docs/PROJECT-STATUS.md`.
- 2026-10-07 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-08 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-09 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-10 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-11 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-12 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-13 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-14 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-10-06 — Claude Code: Variance tab now shows past periods, not just the latest. Added a period dropdown that lists every count-to-count comparison derivable from `count_history`; picking one re-renders the same start/received/end/theoretical/variance table for that period. No new storage — periods are recomputed on demand from existing `count_history`/`received_items`/`toast_uploads` data, so dollar figures for older periods keep improving as more vendor costs get backfilled. Also bumped the `toast_uploads` fetch limit from 12 to 60 so older periods can still find a matching Toast report.
- 2026-10-20 — Claude Code: Admin can now add/edit/remove cocktail recipes for the Cocktail Builds tab (new "Cocktail Builds" section in Admin, same add/edit/remove pattern as items). Added a `cocktail_builds` table in the shared Supabase project to persist them — deliberately *not* named `cocktails`, since that project already has an unrelated `cocktails`/`ingredients`/`recipe_lines` schema belonging to a separate "Cocktail calculator" tool; reusing the name would have collided. The 23 hardcoded default recipes get stable `default-N` ids at load so editing one for the first time inserts a tracked override row, same override pattern as `inventory_items`. Not yet verified in a live logged-in session — please add a test cocktail via Admin and confirm it appears on the Cocktails tab.
- 2026-11-03 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-04 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-05 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-06 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-07 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-08 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-09 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-10 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-11 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-12 — Hermes: updated `docs/PROJECT-STATUS.md`.
- 2026-11-13 — Hermes: updated `docs/PROJECT-STATUS.md`.
