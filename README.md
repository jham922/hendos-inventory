# Hendo's Barrel House — FOH Inventory

A mobile-first inventory management app for front-of-house bar staff. Used during physical inventory walks to count stock, track par levels, and generate vendor order lists.

## Features

- **Inventory counting** — Count stock across all categories with real-time OK / Low / Out status; uncounted items show N/A (entering 0 means zero bottles on hand); Reset Counts clears all items back to N/A
- **Order dashboard** — Auto-generates order lists for items below par, grouped by vendor; order quantity = par minus on-hand count
- **Cocktail recipes** — Quick reference for ingredients and quantities
- **Toast POS integration** — Upload a CSV export from Toast to cross-reference sales data
- **Admin panel** — Password-protected item management: add/edit items, set par levels, assign vendors

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

## Usage

Open `index.html` directly in a browser — no server or build step required. Works best on mobile (Chrome/Safari). Add it to your home screen for a full-screen app experience.

## Tech

Single-file HTML app — all HTML, CSS, and JavaScript in `index.html`. Live counts sync via Supabase (Postgres); localStorage provides offline fallback. No build step required.
