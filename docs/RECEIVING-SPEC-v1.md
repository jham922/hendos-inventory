# Receiving — Automatic Vendor Invoice Intake
**Spec v1 · 2026-09-15 · for Jennifer's approval**

## What this does (plain language)

Every Wednesday your two big vendors deliver. Their portals already know exactly what shipped — Southern (Proof) and Gate City (SipMarket) both keep invoice history with line items, item numbers, pack sizes and quantities.

This feature pulls those invoices into the inventory app automatically, matches each line to your inventory items, and records what arrived. From then on:

> **usage = last count + received − this count**, compared against the Toast theoretical usage.

You keep counting back stock Sunday/Monday. Everything else is taken care of.

---

## The weekly flow (what you actually do)

1. **Sunday/Monday — count back stock** (unchanged, ~20 min). The bar stays topped to par, so it cancels out of the math.
2. **Monday — place orders** from the Order Dashboard. The list now accounts for anything already on the way.
3. **Wednesday — delivery arrives.** You do nothing. The portals update; the app pulls the invoices that afternoon.
4. **Wednesday evening — a short summary lands in WhatsApp**: "Southern invoice 2703493 · 14 lines · 12 matched, 2 need mapping." You tap through the new lines only.
5. **Following Sunday — count again.** The app computes usage, variance, and a 4-week rolling view.

The only recurring work: counting, ordering, and glancing at a summary.

---

## Screens

### 1. Receiving (new tab)
A list of recent deliveries, newest first:

```
Wed Sep 9 · Southern (Proof) · Invoice 2703493 · $1,451.76 net
  ✓ Absolut Vodka        1 case (12 btls)  → Absolut
  ✓ Kim Crawford SB      1 case (12 btls)  → Kim Crawford Sauvignon Blanc
  ⚠ BRIOTTET BANANE      1 Btl             → [ map to an item ▾ ]
  ⊘ EMERALD BURGUNDY     4 btls            → kitchen (ignored)
  [ Confirm receipt ]
```

- **Matched lines** are recorded silently.
- **⚠ needs mapping** — one dropdown, remembered forever after.
- **⊘ ignored** — kitchen, one-time event purchases, allocated bottles.
- Lines can be corrected before confirming (wrong quantity, short delivery).

### 2. Inventory tab (small change)
Each item shows received stock as a separate figure — never folded into the count:

```
Grey Goose      On hand 4     +12 received (Wed 9/9)
```

Plus a filter: **"show only what arrived this week."**

### 3. Order Dashboard (small change)
Shows what's already coming, so par is measured against on-hand **plus** on-order:

```
Well Vodka   On hand 2 · On order 1 case (arriving Wed 9/16) · Par 1 case → don't order
```

### 4. Received History (new, mirrors the Toast history tab)
Every week's delivery saved: vendor, invoice #, date, lines, cost. Reviewable forever.

### 5. Manual entry (small vendors)
Pick vendor → pick item → quantity + unit (case / bottle / keg / can). Same table, same maths. Used for Gate City paper invoices, Chef Orders, and anything the automation misses.

---

## Data model (Supabase)

**`received_items`** — one row per invoice line
`id, vendor, invoice_number, delivery_date, vendor_item_number, vendor_description, item_id, qty, unit, qty_in_units, unit_cost, net_cost, source (proof|sipmarket|manual), status (confirmed|needs_mapping|ignored), confirmed_by, created_at`

**`vendor_item_map`** — the join key, built once
`vendor, vendor_item_number, inventory_item_id, unit_factor, notes`
e.g. `Southern / 14580 → Kim Crawford Sauvignon Blanc / ×12`

**`receiving_runs`** — audit of each pull
`id, vendor, invoice_number, delivery_date, pulled_at, lines_found, lines_matched, status`

**`inventory_items`** — three new fields
- `track`: `bar` | `kitchen` | `ignore` (default `bar`)
- `keg_size_oz`: per item, e.g. `1984` (½ barrel) or `1690` (50 L). Replaces the global assumption.
- `vendor_item_numbers`: JSON of `{vendor: item_number}` for quick lookup

`inventory_counts` is unchanged — captures stay untouched.

---

## Integrations

| Source | Method | Frequency |
|---|---|---|
| Southern (Proof) | Read logged-in portal: invoice list → per-invoice detail. Item numbers, pack, qty. | Weekly, Wednesday PM |
| Gate City (SipMarket) | Same, from the Orders & Invoices tab. Adds UPC + unit price. | Weekly, Wednesday PM |
| Small vendors | Manual entry screen | As needed |
| Fallback | Email parsing of the confirmations (already structured) if a portal session breaks | Weekly |

Both portals are behind your logins; the browser session persists, so no credentials are ever handled by the assistant. If a session expires, the app raises an alert and falls back to manual entry — it never silently drops an invoice.

---

## Matching logic (in order)

1. **Vendor item number →** exact match via `vendor_item_map` (this will handle the vast majority once built)
2. **Exact normalised name →** inventory item
3. **Fuzzy name →** ranked suggestions for you to pick (never auto-applied above a strict threshold)
4. **Nothing →** flagged for mapping or ignore. Never a silent drop.

Built from your existing invoices: **144 distinct vendor items**, of which **87 already auto-match cleanly**, **35 need one look**, and **22 aren't in the app at all**.

---

## Unit conversion (per mapping row, not global)

- Case of 12 × 750 ml → 12 bottles
- 24 × 12 oz cans, 12 pack → 24 units
- ½ barrel keg → **1,984 oz**
- 50 L keg (13.2 gal) → **1,690 oz**
- 1/6 barrel keg → **661 oz**
- Bottle / 1 L / 1.75 L → counted as 1 container unless you say otherwise

Conversions live in `vendor_item_map.unit_factor`, so a new pack size is a one-line fix.

---

## The maths it enables

- **Weekly usage** = last count + received this week − this count
- **Variance** = usage − theoretical usage (from the Toast tab)
- **4-week rolling variance** smooths delivery timing and partial bottles
- **Credits/returns** arrive as negative quantities (both portals issue credit memos) and reduce received automatically
- **Kitchen and ignored items** are excluded from the bar variance entirely

---

## Phase plan

**Phase 1 — proof of concept (no app changes, ~now)**
I pull the invoices weekly and send you the summary + recorded quantities over WhatsApp. Validates accuracy on real deliveries before anything is built.

**Phase 2 — Receiving tab + mapping** (the main build)
`received_items`, `vendor_item_map`, the Receiving screen, manual entry, and the WhatsApp summary.

**Phase 3 — variance view + order intelligence**
4-week rolling variance, the "on order" column on the Order Dashboard, per-item keg sizes, and the shrink report.

---

## What I need from you to build

1. **The 22 unmatched items** — which to add (I'd argue: Angry Orchard keg, Moët, Cliquot, Jack Daniel's RTD, Ole Smoky, Jim Beam, Hornitos, High Noon packs, Sam Adams seasonal kegs) and which to mark ignore (allocated bottles, one-time events, kitchen).
2. **Kitchen list** — anything else besides Emerald Glen that's kitchen/food, so it never enters the bar variance.
3. **Keg sizes** — confirm which of your draft lines are ½ barrel vs 50 L vs 1/6 barrel. (Firestone 805 ships as both 50 L and 1/6.)
4. **Approval of this spec**, or changes.

Nothing gets built until you say go.
