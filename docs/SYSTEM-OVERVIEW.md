# Hendo's Inventory — how the whole system fits together

_Last updated 2026-09-15._

Live app: **https://jham922.github.io/hendos-inventory/** (GitHub Pages — a push to `main` deploys it).
Data: Supabase project `codzcyqavknpddhumtgx`.

---

## 1. The counting unit rule (everything follows this)

Every quantity — counts, deliveries, usage, variance — is expressed in the item's
**own counting unit**, taken from its `par` field:

| par says | counted in | example |
|---|---|---|
| `8 cases` | cases | Coors Light Bottles |
| `12 bottles` | bottles | Buffalo Trace |
| `5 kegs` | kegs | El Hendo |

Vendor invoices are converted into that unit when they're ingested:

- **Southern (Proof)** invoices individual bottles (`2 Units`) or cases (`1 Cases`).
- **Gate City (SipMarket)** always invoices cases; the pack size comes from
  `vendor_item_map.unit_factor`.

Examples that this rule fixes:
- Southern `2 Units` → Crown Royal (par: bottles) = **2 bottles**
- Gate City `6 cases` → Coors Light (par: cases) = **6 cases**
- Gate City `1 case` ×12 → Buffalo Trace (par: bottles) = **12 bottles**
- Southern `2 Units` ÷12 → Angostura (par: cases) = **0.17 cases**

`par` is the single source of truth, and **Supabase wins over the hardcoded list in
`index.html`** for any item that exists in both.

---

## 2. Tabs

| Tab | What it does |
|---|---|
| Inventory | Counts (back stock). Shows `Received (7d)` next to On Hand. |
| Order Dashboard | What to order, measured against par. |
| Cocktail Builds | Recipes used to expand Toast sales into ingredient usage. |
| Toast POS | Upload the Product-mix CSV → theoretical usage (spirits in oz, draft in kegs). |
| Receiving | What the vendors actually delivered, grouped by date/vendor. |
| **Variance** | `start + received − end = usage`, vs theoretical. **Negative = missing.** |
| History | Past Toast uploads. |
| Admin | Items, vendors, pars. |

---

## 3. The weekly cycle

1. **Sunday/Monday — count back stock.** The bar is left at par so it cancels out of the maths.
2. Every count is snapshotted into `count_history` automatically, so counts are comparable over time.
3. **Monday — order** from the Order Dashboard.
4. **Wednesday — delivery.** Nobody has to do anything.
5. **Monday 6am PT — the Toast job** pulls last week's Product mix (Mon–Sun), loads it into the
   Toast tab and saves it to History. Nobody has to do anything.
6. **Thursday 16:00 UTC — the receiving job** pulls both vendor portals, matches every line
   against `vendor_item_map`, and writes `received_items`.
7. **Tuesday 7am PT — the variance report** lands in WhatsApp: how many items are short, the
   estimated value missing, and the biggest shortfalls. Open the **Variance** tab for the detail.

### The maths

```
usage    = start count + received − end count        (item's counting unit)
variance = theoretical − usage                       (NEGATIVE = product missing)
```

Flagged when the shortfall exceeds **half a unit or 10% of usage**, whichever is larger.
A count session is one session even if it spans Sunday and Monday (days ≤2 apart merge).

---

## 4. Data model (Supabase, `public`)

| Table | Purpose |
|---|---|
| `inventory_items` | Items, par, vendor, category, `bottle_size_oz` (750 ml / 1 L / 1.75 L) |
| `inventory_counts` | Current on-hand per item (one row each) |
| `count_history` | Append-only count snapshots — what makes variance possible |
| `received_items` | One row per invoice line, converted to the item's counting unit |
| `vendor_item_map` | The join key: vendor item number → inventory item, `unit_factor` = units per case |
| `receiving_pulls` | Audit of each invoice pulled |
| `toast_uploads` | Uploaded Toast reports + their computed theoretical usage (in oz) |
| `cocktails`, `recipe_lines`, `ingredients` | Recipe expansion |

---

## 5. Automation (server side, outside this repo's app code)

These run on the Hermes box and are copied into `scripts/` here for reference:

| Script | What it does | Schedule |
|---|---|---|
| `receiving-pull.py` | Drives the logged-in browser: Proof + SipMarket invoice lists → per-invoice text | Thu 16:00 UTC |
| `receiving-ingest.js` | Parses those texts → `received_items` (unit conversion happens here) | same run |
| `receiving-weekly.sh` | Wrapper for the two above | same run |
| `session-keepalive.py` / `.sh` | Keeps the browser sessions alive; **signs back in automatically** from stored credentials; restarts Chrome/Xvfb if they died | every 6 h |
| `secret-capture.py` | One-shot web form (tailnet only) to enter portal credentials without them touching chat | on demand |
| `toast-weekly.py` / `toast-weekly.sh` | Pulls last week's Toast Product-mix export (Mon–Sun), loads it into the app's Toast tab and saves it to History with the matching range. Skips weeks already uploaded. | Mon 13:00 UTC (6am PT) |
| `variance-report.js` / `variance-weekly.sh` | Weekly shrink alert to WhatsApp: items measured, how many short, estimated value missing, biggest shortfalls. Silent when there's nothing new. | Tue 14:00 UTC (7am PT) |

Portal credentials live on the server at `/root/.hermes/secrets/vendor-logins.env` (mode 600).
They are **never** in this repo and never pass through chat.

---

## 6. Maintenance cheat-sheet

| Change | Where |
|---|---|
| A vendor pack size changes (e.g. now 6/case not 12) | `vendor_item_map.unit_factor` for that vendor item number |
| A bottle size is wrong or missing | `inventory_items.bottle_size_oz` (25.36 = 750 ml, 33.81 = 1 L, 59.17 = 1.75 L) |
| New vendor item needs mapping | Receiving tab → map it once; it's remembered |
| A portal password changes | Re-run `secret-capture.py` and enter the new one |
| Re-derive the last 90 days after a rule change | `node receiving-ingest.js` |

---

## 6a. Go-live cleanup (2026-09-15)

The 90 days of backfilled deliveries used while repairing the unit conversion (May 13 → Sep 9)
were archived and cleared so the app starts with the first real delivery:

- rows → `~/business-reports/invoices/archive/received_items-backup-2026-09-15.json` (484 rows)
- invoice text files → `~/business-reports/invoices/archive/old-invoices/{proof,sipmarket}/`
  (moved aside so the weekly ingest can't re-add them; the pull writes fresh files)
- **kept**: `count_history` (the variance baseline) and `toast_uploads` (theoretical usage)

## 7. Known gaps / next candidates

- **Southern invoice line prices aren't parsed** → the variance `Est. $` column only fills in
  for Gate City items. Parsing them makes the dollar figure complete.
- **Keg sizes**: everything assumes a ½ barrel (1,984 oz). 50 L kegs (≈1,690 oz) read ~15% high.
  Deliberately deferred ("leave the kegs alone for now").
- **Wine pour** assumes 5 oz glasses when converting theoretical glasses → bottles.
- Six spirits have no bottle size on any invoice (amaro nonino, Banana Liqueur, Grapefruit
  Liqueur, Jaegermeister, Planteray OFTD, Planteray Cut & Dry) → assumed 750 ml.
- `Crown Royal` exists only in the app's hardcoded list, not in Supabase, so it can't hold a size.
