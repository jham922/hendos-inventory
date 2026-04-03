# Hendo's Barrel House — FOH Inventory

## What This Is

A single-file HTML inventory management app for the front-of-house at Hendo's Barrel House (a bar/restaurant). Staff use it on their phones during a physical inventory walk to count stock, check par levels, and generate order lists.

## File Structure

- `index.html` — the entire app (HTML, CSS, and JS in one file)

## App Sections (Tabs)

- **Inventory** — Count current stock per item; shows OK/Low/Out status vs. par level; search/filter by category; export to CSV
- **Order Dashboard** — Auto-generates order list for items below par, grouped by vendor; exportable/printable
- **Cocktails** — Cocktail recipes with ingredients and quantities
- **Toast** — Upload a CSV export from Toast POS to cross-reference sales data
- **Admin** — Password-protected; add/edit items, set par levels, assign vendors

## Categories

- Spirits
- Beer/Wine
- Mixers/Garnishes
- Paper Goods
- FOH Supplies

## Vendors

- Southern
- Gate City
- Chef Orders

## Design

- Dark amber/gold theme (`#0f0d0b` background, `#d4822a` amber accent)
- Fonts: Bebas Neue (headings), DM Sans (body), DM Mono (numbers)
- Mobile-first: bottom nav on mobile, tab bar on desktop
- Font size 16px on inputs to prevent iOS zoom
- Touch-optimized (large tap targets, `-webkit-tap-highlight-color: transparent`)

## Key Behaviors

- Items have a par level; status is derived by comparing current count to par
- Status states: OK (green), Low (amber), Out (red), N/A (gray)
- Uncounted items default to N/A — 0 means zero bottles explicitly counted, not a default
- On-hand input shows "N/A" placeholder when uncounted; clears on tap for entry
- Order quantity = par − on-hand; only items with Low or Out status appear on Order Dashboard
- Stock bar visually represents how full stock is relative to par
- "Reset Counts" patches all on-hand values to null (N/A) in Supabase and localStorage

## Backend

- Supabase (Postgres) stores live counts in the `inventory_counts` table (`id`, `on_hand`, `updated_by`, `updated_at`)
- Supabase stores custom/admin-created items in the `inventory_items` table
- localStorage is used as an offline fallback
- The app polls Supabase every 15 seconds to sync counts from other users
