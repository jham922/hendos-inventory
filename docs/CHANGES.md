# Change log — hendos-inventory

Newest last. One line per session, prefixed with who did it.

- 2026-09-16 — Hermes: published `docs/PROJECT-STATUS.md`; no application changes.
- 2026-09-16 — Hermes: published `docs/PROJECT-STATUS.md`; no application changes.
- 2026-09-19 — Claude Code: added Toast POS theoretical usage (liquor/wine/draft-beer pour math), a Toast upload History tab, and cabinet-based grouping on the Inventory tab (Group by: Category/Cabinet toggle; Order Dashboard still groups by vendor, unchanged). Wasn't aware of this handoff doc when the session started, so hadn't read PROJECT-STATUS.md first — merged cleanly against Hermes's Receiving/Variance work with one trivial field-level conflict in `loadCustomItems()` (kept both `cabinet` and `bottleSizeOz`).
- 2026-10-06 — Claude Code: Variance tab now shows past periods, not just the latest. Added a period dropdown that lists every count-to-count comparison derivable from `count_history`; picking one re-renders the same start/received/end/theoretical/variance table for that period. No new storage — periods are recomputed on demand from existing `count_history`/`received_items`/`toast_uploads` data, so dollar figures for older periods keep improving as more vendor costs get backfilled. Also bumped the `toast_uploads` fetch limit from 12 to 60 so older periods can still find a matching Toast report.
