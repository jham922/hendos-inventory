#!/usr/bin/env node
/**
 * Build the ordering decision worksheet.
 *
 * One row per item you'd actually order, with the facts I already know filled in
 * (par, bottle size, case pack, vendor, vendor item number) and three columns for you:
 *   Volume  — high volume or slow mover
 *   Buy     — bottle, case, or the rule for when to switch
 *   Notes   — anything that overrides the maths
 */
const fs = require('fs');
const postgres = require('postgres');
const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const OUT = '/root/business-reports/invoices/order-decision-worksheet.csv';

function hardcoded() {
  const out = {};
  for (const f of ['/root/code/hendos-inventory/index.html']) {
    try {
      const html = fs.readFileSync(f, 'utf8');
      const re = /\{id:"([^"]+)",name:"([^"]*)",par:"([^"]*)",category:"([^"]*)"(?:,vendor:"([^"]*)")?/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        out[m[1]] = { id: m[1], name: m[2], par: m[3], category: m[4], vendor: m[5] || '', bottle_size_oz: null };
      }
    } catch (e) { /* app clone missing */ }
  }
  return out;
}

const sizeLabel = oz => {
  const v = Number(oz);
  if (!v) return '';
  if (Math.abs(v - 59.17) < 0.5) return '1.75 L';
  if (Math.abs(v - 33.81) < 0.5) return '1 L';
  if (Math.abs(v - 25.36) < 0.5) return '750 ml';
  if (Math.abs(v - 12.68) < 0.5) return '375 ml';
  if (Math.abs(v - 6.76) < 0.5) return '200 ml';
  return v + ' oz';
};

(async () => {
  const itemMap = hardcoded();
  const supa = await sql`select id, name, par, category, vendor, bottle_size_oz from public.inventory_items where active is not false`;
  supa.forEach(r => {
    itemMap[r.id] = { id: r.id, name: r.name, par: r.par, category: r.category, vendor: r.vendor || '', bottle_size_oz: r.bottle_size_oz };
  });

  const maps = await sql`select vendor, vendor_item_number, inventory_item_id, unit_factor from public.vendor_item_map
                         where inventory_item_id is not null and inventory_item_name <> 'IGNORE'`;
  const byItem = {};
  maps.forEach(m => {
    byItem[m.inventory_item_id] = byItem[m.inventory_item_id] || [];
    byItem[m.inventory_item_id].push(m);
  });

  const cats = ['Spirits', 'Beer/Wine', 'Mixers/Garnishes'];
  const rows = Object.values(itemMap)
    .filter(i => cats.includes(i.category) && (i.par || '').toLowerCase().indexOf('keg') === -1)
    .sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category) || a.name.localeCompare(b.name));

  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const header = ['Item', 'Category', 'Vendor', 'Par', 'Bottle size', 'Case pack',
                  'Vendor item #', 'VOLUME (high volume / slow mover)', 'BUY (bottle / case / rule)', 'NOTES'];
  const lines = [header.map(esc).join(',')];

  rows.forEach(i => {
    const links = byItem[i.id] || [];
    const best = links.sort((a, b) => Number(b.unit_factor) - Number(a.unit_factor))[0];
    const pack = links.map(l => Number(l.unit_factor)).filter(n => n > 1).sort((a, b) => b - a)[0];
    lines.push([
      i.name,
      i.category,
      (best ? best.vendor.replace(/ \(.*\)/, '') : (i.vendor || '')),
      i.par,
      sizeLabel(i.bottle_size_oz),
      pack ? pack + '/case' : (i.category === 'Beer/Wine' ? '24/case?' : ''),
      best ? best.vendor_item_number : '',
      '',
      '',
      '',
    ].map(esc).join(','));
  });

  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`worksheet written: ${OUT}`);
  console.log(`rows: ${rows.length - 0} items`);
  ['Spirits', 'Beer/Wine', 'Mixers/Garnishes'].forEach(c => {
    console.log(`  ${c}: ${rows.filter(r => r.category === c).length}`);
  });
  console.log('\nfirst few rows:');
  lines.slice(0, 4).forEach(l => console.log('  ' + l.slice(0, 150)));
  await sql.end();
})();
