#!/usr/bin/env node
/**
 * Keg supplement worksheet — the draft beer items that were missing from the first sheet.
 * Keg sizes are mined from the archived vendor invoices where known.
 */
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const OUT = '/root/business-reports/invoices/order-decision-worksheet-KEGS.csv';

function hardcodedItems() {
  const out = {};
  const html = fs.readFileSync('/root/code/hendos-inventory/index.html', 'utf8');
  const re = /\{id:"([^"]+)",name:"([^"]*)",par:"([^"]*)",category:"([^"]*)"(?:,vendor:"([^"]*)")?/g;
  let m;
  while ((m = re.exec(html)) !== null) out[m[1]] = { id: m[1], name: m[2], par: m[3], category: m[4], vendor: m[5] || '' };
  return out;
}

function kegSizesFromInvoices() {
  // description -> keg size token, e.g. "FIRESTONE 805 K 50L (13.2G)" -> 50 L
  const found = {};
  const dirs = ['/root/business-reports/invoices/proof', '/root/business-reports/invoices/sipmarket',
                '/root/business-reports/invoices/archive/old-invoices/proof',
                '/root/business-reports/invoices/archive/old-invoices/sipmarket'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.txt'))) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      const re = /\n([^\n]{3,90}?)\s*[-–—]?\s*([A-Z0-9]{3,12})\n([^\n]*)\n/g;
      let m;
      while ((m = re.exec(txt)) !== null) {
        const desc = (m[1] + ' ' + m[3]).toUpperCase();
        if (!/\bK\b|KEG|BBL/.test(desc)) continue;
        const num = m[2];
        const size = /50L|50 L|13\.2G/.test(desc) ? '50 L'
                   : /1\/6|SIXX|6BBL/.test(desc) ? '1/6 bbl'
                   : /1\/2|HALF|BBL/.test(desc) ? '1/2 bbl' : '';
        if (size && !found[num]) found[num] = { size, desc: m[1].trim() };
      }
    }
  }
  return found;
}

(async () => {
  const items = hardcodedItems();
  const supa = await sql`select id, name, par, category, vendor from public.inventory_items where active is not false`;
  supa.forEach(r => { items[r.id] = { id: r.id, name: r.name, par: r.par, category: r.category, vendor: r.vendor || '' }; });

  const maps = await sql`select vendor, vendor_item_number, inventory_item_id, unit_factor from public.vendor_item_map
                         where inventory_item_id is not null and inventory_item_name <> 'IGNORE'`;
  const links = {};
  maps.forEach(m => { (links[m.inventory_item_id] = links[m.inventory_item_id] || []).push(m); });

  const kegs = kegSizesFromInvoices();

  // pure draft list: whatever the par counts in kegs (the three discontinued
  // par-less items are dropped, per Jennifer)
  const rows = Object.values(items).filter(i => /keg/i.test(i.par || ''))
    .sort((a, b) => a.name.localeCompare(b.name));

  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const out = [['Item', 'Category', 'Vendor', 'Par', 'Keg size', 'Vendor item #',
                'VOLUME (high volume / slow mover)', 'BUY (bottle / case / keg / rule)', 'NOTES'].map(esc).join(',')];

  rows.forEach(i => {
    const ls = links[i.id] || [];
    const best = ls[0];
    let keg = '';
    for (const l of ls) { if (kegs[l.vendor_item_number]) { keg = kegs[l.vendor_item_number].size; break; } }
    out.push([i.name, i.category, best ? best.vendor.replace(/ \(.*\)/, '') : i.vendor, i.par, keg,
              best ? best.vendor_item_number : '', '', '', ''].map(esc).join(','));
  });

  fs.writeFileSync(OUT, out.join('\n') + '\n');
  console.log(`keg worksheet: ${OUT}`);
  console.log(`rows: ${rows.length}\n`);
  rows.forEach(i => {
    const ls = links[i.id] || [];
    let keg = '';
    for (const l of ls) { if (kegs[l.vendor_item_number]) { keg = kegs[l.vendor_item_number].size; break; } }
    console.log(`  ${i.name.padEnd(32)} par=${String(i.par).padEnd(10)} keg=${(keg || '?').padEnd(8)} vendor=${(ls[0] ? ls[0].vendor.replace(/ \(.*\)/, '') : i.vendor || '?')}`);
  });
  await sql.end();
})();
