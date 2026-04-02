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
- Stock bar visually represents how full stock is relative to par
- All data lives in the single HTML file (no backend, no external API)
