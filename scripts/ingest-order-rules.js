#!/usr/bin/env node
/**
 * Ingest Jennifer's filled ordering worksheet into Supabase (order_rules),
 * and list anything ambiguous for review.
 */
const fs = require('fs');
const postgres = require('postgres');
const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const SRC = '/root/.hermes/cache/documents/doc_751dd3e545bf_order-decision-worksheet.csv';

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

function hardcodedItems() {
  const out = {};
  try {
    const html = fs.readFileSync('/root/code/hendos-inventory/index.html', 'utf8');
    const re = /\{id:"([^"]+)",name:"([^"]*)",par:"([^"]*)",category:"([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) out[m[1]] = m[2];
  } catch (e) {}
  return out;
}

const norm = s => String(s || '').toLowerCase().replace(/[\u2019']/g, "'").replace(/\s+/g, ' ').trim();

(async () => {
  const rows = parseCSV(fs.readFileSync(SRC, 'utf8'));
  const header = rows[0].map(h => h.replace(/^\uFEFF/, '').trim());
  console.log('columns:', header.join(' | '));

  const data = rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
  console.log('rows read:', data.length);

  // build a name -> id index across hardcoded + Supabase items
  const byName = {};
  const hard = hardcodedItems();
  Object.entries(hard).forEach(([id, name]) => { byName[norm(name)] = id; });
  const supa = await sql`select id, name from public.inventory_items`;
  supa.forEach(r => { byName[norm(r.name)] = r.id; });

  // table
  await sql`
    create table if not exists public.order_rules (
      item_id      text primary key,
      item_name    text,
      category     text,
      vendor       text,
      volume       text,          -- high | medium | slow
      buy_rule     text,
      notes        text,
      par_snapshot text,
      updated_at   timestamptz not null default now()
    )`;
  for (const [name, cmd, expr] of [
    ['allow_all_reads', 'select', 'using (true)'],
    ['allow_all_inserts', 'insert', 'with check (true)'],
    ['allow_all_updates', 'update', 'using (true)'],
    ['allow_all_deletes', 'delete', 'using (true)'],
  ]) {
    const exists = await sql`select 1 from pg_policies where schemaname='public' and tablename='order_rules' and policyname=${name}`;
    if (!exists.length) await sql.unsafe(`create policy ${name} on public.order_rules for ${cmd} to public ${expr}`);
  }

  let stored = 0;
  const unmatched = [];
  for (const d of data) {
    const name = d['Item'];
    const id = byName[norm(name)];
    if (!id) { unmatched.push(name); continue; }
    const volRaw = (d['VOLUME (high volume / slow mover)'] || '').toLowerCase();
    const volume = volRaw.startsWith('high') ? 'high' : volRaw.startsWith('slow') ? 'slow'
                 : volRaw.startsWith('med') ? 'medium' : null;
    await sql`
      insert into public.order_rules (item_id, item_name, category, vendor, volume, buy_rule, notes, par_snapshot, updated_at)
      values (${id}, ${name}, ${d['Category'] || null}, ${d['Vendor'] || null}, ${volume},
              ${d['BUY (bottle / case / rule)'] || null}, ${d['NOTES'] || null}, ${d['Par'] || null}, now())
      on conflict (item_id) do update set
        item_name = excluded.item_name, category = excluded.category, vendor = excluded.vendor,
        volume = excluded.volume, buy_rule = excluded.buy_rule, notes = excluded.notes,
        par_snapshot = excluded.par_snapshot, updated_at = now()`;
    stored++;
  }

  console.log(`\nstored ${stored} rules; ${unmatched.length} rows could not be matched to an item`);
  unmatched.slice(0, 12).forEach(n => console.log('   unmatched:', n));

  const s = await sql`select volume, count(*)::int n from public.order_rules group by 1 order by n desc`;
  console.log('\nvolume split:');
  s.forEach(r => console.log(`   ${r.volume || '(blank → medium)'}: ${r.n}`));

  const d = await sql`select count(*)::int n from public.order_rules where notes ilike '%deviate%'`;
  const no = await sql`select item_name, buy_rule, notes from public.order_rules where notes ilike '%don%order%' or buy_rule ilike '%don%order%'`;
  console.log(`\n"never deviate" items: ${d[0].n}`);
  console.log('marked don\'t order:');
  no.forEach(r => console.log(`   ${r.item_name} — ${r.buy_rule || ''} ${r.notes || ''}`));
  await sql.end();
})();
