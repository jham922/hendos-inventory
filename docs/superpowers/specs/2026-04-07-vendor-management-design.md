# Vendor Management — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Summary

Add vendor management to the Admin tab. Admins can add new vendors and rename existing ones. Vendors are persisted in Supabase and sync across all devices.

---

## Data Layer

### New Supabase table: `vendors`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() |
| `name` | text | NOT NULL, UNIQUE |
| `created_at` | timestamptz | default now() |

### Vendor references on items

- `inventory_items.vendor` remains a plain text field (no foreign key).
- On rename, run `UPDATE inventory_items SET vendor = $new WHERE vendor = $old` in the same Supabase call.
- Seed the `vendors` table with the three existing vendors: Southern, Gate City, Chef Orders.

---

## UI

### Admin tab — Vendor section

- Appears below the existing items table.
- Section header label ("Vendors") matching the existing admin style.
- "+ Add Vendor" button above the list (same style as "+ Add Item").
  - Clicking it renders an inline input + Save / Cancel below the button.
  - No new modal.
- Vendor list: one row per vendor, showing name + "Rename" button.
  - Clicking "Rename" turns that row into an inline editable input + Save / Cancel.

### Dynamic vendor references

- The vendor `<select>` in the item add/edit modal populates from the loaded vendor list (not hardcoded).
- The vendor filter chips on the Inventory tab render dynamically from the vendor list.
- `setVendor()` iterates the dynamic list instead of the hardcoded array `['Southern', 'Gate City', 'Chef Orders']`.

### Vendor badge styling

The current per-vendor CSS classes (`.vendor-southern`, `.vendor-gate`, `.vendor-chef`) are replaced with a single generic `.vendor-badge` style (amber tint, matching `.vendor-southern`). All vendor badges use this style regardless of name. The three existing hardcoded badge classes are removed.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Duplicate name on add or rename | Inline error: "A vendor with that name already exists" |
| Empty name | Save button disabled client-side |
| Rename cascade | `inventory_items` updated in same Supabase call; in-memory `items` array patched immediately |
| Vendors fetch fails on init | Fall back to hardcoded `['Southern', 'Gate City', 'Chef Orders']` so app remains functional |

---

## Access Control

- The Vendor section is only visible when `userRole === 'admin'` (same gate as the rest of the Admin tab).
- No changes needed to auth logic.

---

## Out of Scope

- Deleting vendors (deferred — requires decision on what to do with assigned items).
- Vendor color/badge customization.
