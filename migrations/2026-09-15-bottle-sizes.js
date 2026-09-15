#!/usr/bin/env node
/**
 * Derive each inventory item's bottle size from the RAW vendor invoices we already
 * downloaded (the pack field carries it: "1.0L • 6 Case", or "... B12 1L").
 * Writes inventory_items.bottle_size_oz (null = unknown, app falls back to 750 ml).
 */
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const SIZES = [
  [/\b1\.75\s?L|1\.75L|1750\s?ML|HALF\s?GAL/i, 59.17, '1.75 L'],
  [/\b1\.0\s?L|\b1\s?L\b|\b1L\b|1000\s?ML|1\s?LITER/i, 33.81, '1 L'],
  [/\b750\s?ML|\b75\s?CL/i, 25.36, '750 ml'],
  [/\b375\s?ML/i, 12.68, '375 ml'],
  [/\b200\s?ML/i, 6.76, '200 ml'],
  [/\b50\s?ML/i, 1.69, '50 ml'],
];

function sizeOf(text) {
  for (const [re, oz, label] of SIZES) if (re.test(text)) return { oz, label };
  return null;
}

const items = {};   // vendor_item_number -> size

// ---- Southern (Proof): "  <DESCRIPTION>\n<NUM> • <PACK>\n" ----
for (const f of fs.readdirSync('/root/business-reports/invoices/proof').filter(x => x.endsWith('.txt'))) {
  const txt = fs.readFileSync(path.join('/root/business-reports/invoices/proof', f), 'utf8');
  const body = txt.split('Associated Items')[1] || '';
  const re = /\n([^\n]{3,90})\n(\d{4,7})\s*•\s*([^\n]*)\n/g;
  let m;
  while ((m = re.exec('\n' + body)) !== null) {
    const num = m[2].trim();
    const s = sizeOf(m[1] + ' ' + m[3]);
    if (s && !items[num]) items[num] = s;
  }
}

// ---- Gate City (SipMarket): size usually in the description line ----
for (const f of fs.readdirSync('/root/business-reports/invoices/sipmarket').filter(x => x.endsWith('.txt'))) {
  const txt = fs.readFileSync(path.join('/root/business-reports/invoices/sipmarket', f), 'utf8');
  const re = /\n([^\n]{3,90}?)\s-\s([A-Z0-9]{3,12})\n([^\n]+)\n/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const num = m[2].trim();
    const s = sizeOf(m[1] + ' ' + m[3]);
    if (s && !items[num]) items[num] = s;
  }
}

(async () => {
  console.log('1) adding inventory_items.bottle_size_oz …');
  await sql`alter table public.inventory_items add column if not exists bottle_size_oz numeric`;
  console.log('   ✓ column present');

  const map = await sql`
    select distinct vendor_item_number as num, inventory_item_id as id, inventory_item_name as item
    from public.vendor_item_map
    where inventory_item_name is not null and inventory_item_name <> 'IGNORE' and inventory_item_id is not null`;

  const perItem = {};   // id -> {oz,label,hits}
  map.forEach(r => {
    const s = items[r.num];
    if (!s || !r.id) return;
    perItem[r.id] = perItem[r.id] || {};
    perItem[r.id][s.label] = (perItem[r.id][s.label] || 0) + 1;
  });

  console.log('\n2) applying inferred sizes …');
  let applied = 0;
  for (const [id, labels] of Object.entries(perItem)) {
    const best = Object.entries(labels).sort((a, b) => b[1] - a[1])[0][0];
    const oz = SIZES.find(s => s[2] === best)[1];
    await sql`update public.inventory_items set bottle_size_oz = ${oz} where id = ${id}`;
    applied++;
  }
  console.log(`   ✓ ${applied} items set from invoice data`);

  console.log('\n3) resulting sizes …');
  const out = await sql`
    select name, category, par, bottle_size_oz from public.inventory_items
    where category in ('Spirits','Beer/Wine') order by category, name`;
  out.forEach(r => {
    const oz = r.bottle_size_oz === null ? null : Number(r.bottle_size_oz);
    const label = oz === null ? '⚠ none (750 ml assumed)'
      : oz === 25.36 ? '750 ml' : oz === 33.81 ? '1 L' : oz === 59.17 ? '1.75 L'
      : oz === 12.68 ? '375 ml' : oz === 6.76 ? '200 ml' : String(oz);
    console.log(`  ${String(r.name).slice(0,32).padEnd(33)} par=${String(r.par).padEnd(12)} → ${label}`);
  });
  await sql.end();
})();
