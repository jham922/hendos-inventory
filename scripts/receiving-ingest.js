#!/usr/bin/env node
/**
 * Receiving ingest: turn downloaded vendor-invoice text files into received_items rows.
 *
 * Stage B of the weekly receiving pipeline.
 *   Stage A (browser): pull invoice pages from Proof (Southern) + SipMarket (Gate City)
 *                      and save each invoice's body text to
 *                      ~/business-reports/invoices/{proof,sipmarket}/<invoice>.txt
 *   Stage B (this):    parse those files, join to vendor_item_map, write received_items.
 *
 * UNIT RULE (owner's rule, 2026-09):
 *   Quantities are always expressed in the item's own counting unit — the unit word in
 *   the app's `par` field ("8 cases", "12 bottles", "2 kegs"). The invoice's own unit is
 *   honoured first (Southern invoices individual bottles as "Units"; Gate City invoices
 *   cases), then converted into the par unit.
 *     - Southern "2 Units"      -> Crown Royal (par: bottles)  = 2 bottles
 *     - Gate City "6 cases"     -> Coors Light (par: cases)    = 6 cases
 *     - Gate City "1 case" x12  -> Buffalo Trace (par: bottles)= 12 bottles
 *     - Southern "2 Units" /12  -> Angostura (par: cases)      = 0.17 cases
 *   Supabase `inventory_items.par` wins over the hardcoded list in the app's index.html.
 *
 * Usage: node receiving-ingest.js [--since YYYY-MM-DD] [--quiet]
 */
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const APP_HTML = '/root/code/hendos-inventory/index.html';
const DIRS = {
  'Southern (Proof)': '/root/business-reports/invoices/proof',
  'Gate City (SipMarket)': '/root/business-reports/invoices/sipmarket'
};
const QUIET = process.argv.includes('--quiet');
const sinceArg = process.argv.indexOf('--since');
const SINCE = sinceArg > -1 ? process.argv[sinceArg + 1] : null;

// ---------- counting units (from the app's par field) ----------
function unitFromPar(par) {
  const p = String(par || '').toLowerCase();
  if (p.includes('keg')) return 'kegs';
  if (p.includes('case')) return 'cases';
  if (p.includes('can')) return 'cans';
  if (p.includes('bottle') || /\bbtl\b/.test(p)) return 'bottles';
  if (p.includes('bib')) return 'bib';
  if (p.includes('flat')) return 'flats';
  return null;                       // no unit in par -> item has no counting unit
}

function loadHardcodedPars() {
  const out = {};
  let html = '';
  try { html = fs.readFileSync(APP_HTML, 'utf8'); } catch (e) { return out; }
  const re = /\{id:"([^"]+)",name:"([^"]*)",par:"([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out[m[1]] = m[3];
  return out;
}

const round2 = n => Math.round(n * 100) / 100;

/**
 * Convert an invoiced quantity into the item's counting unit.
 *   pack = units per case (vendor_item_map.unit_factor)
 */
function toCountUnit(qty, invoiceUnit, pack, countUnit) {
  if (!countUnit) return null;                        // e.g. discontinued items
  const packN = Number(pack) > 1 ? Number(pack) : 1;
  const isCase = String(invoiceUnit || '').toLowerCase().startsWith('case');
  const baseUnits = isCase ? qty * packN : qty;       // individual bottles / cans
  if (countUnit === 'cases') return { qtyUnits: round2(baseUnits / packN), unit: 'cases' };
  if (countUnit === 'kegs') return { qtyUnits: qty, unit: 'kegs' };
  return { qtyUnits: baseUnits, unit: countUnit };    // bottles / cans / bib / flats
}

// ---------- parsers ----------
function parseProof(txt, invoiceNo) {
  const out = [];
  const dm = /Document Date\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(txt);
  const date = dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : null;
  const body = txt.split('Associated Items')[1] || '';
  const re = /\n([^\n]{3,90})\n(\d{4,7})\s*•\s*([^\n]*)\n\s*([\-\d.]+)\n(Cases|Units|Bottles|Each)\n/g;
  let m;
  while ((m = re.exec('\n' + body)) !== null) {
    out.push({ desc: m[1].trim(), num: m[2].trim(), pack: m[3].trim(), qty: parseFloat(m[4]), unit: m[5].toLowerCase() });
  }
  return { invoiceNo, date, lines: out };
}

function parseSipMarket(txt, invoiceNo) {
  const out = [];
  const dm = /DELIVERY\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(txt);
  const date = dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : null;
  const re = /\n([^\n]{3,90}?)\s-\s([A-Z0-9]{3,12})\n([^\n]+)\n\t(\d{8,14})\t(\d+)\t([A-Z0-9]+)\t\$([\-\d.,]+)\t\$([\-\d.,]+)/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    out.push({ desc: m[1].trim(), num: m[6].trim(), pack: m[3].trim(), qty: parseInt(m[5], 10), unit: 'cases', upc: m[4], unitCost: parseFloat(m[7].replace(/,/g, '')), netCost: parseFloat(m[8].replace(/,/g, '')) });
  }
  return { invoiceNo, date, lines: out };
}

(async () => {
  const maps = await sql`select vendor, vendor_item_number, inventory_item_id, inventory_item_name, unit_factor, unit_label from public.vendor_item_map`;
  const map = {};
  maps.forEach(r => { map[`${r.vendor}|${r.vendor_item_number}`] = r; });
  const ignores = await sql`select vendor, vendor_item_number from public.vendor_item_map where inventory_item_name = 'IGNORE'`;
  ignores.forEach(r => { map[`${r.vendor}|${r.vendor_item_number}`].isIgnore = true; });

  // counting unit per inventory item: Supabase par wins, hardcoded index.html as fallback
  const hardcoded = loadHardcodedPars();
  const itemPar = { ...hardcoded };
  const supaItems = await sql`select id, par from public.inventory_items`;
  supaItems.forEach(r => { itemPar[r.id] = r.par; });
  const itemUnit = {};
  Object.entries(itemPar).forEach(([id, par]) => { itemUnit[id] = unitFromPar(par); });

  const results = [];
  const noUnit = new Map();

  for (const [vendor, dir] of Object.entries(DIRS)) {
    if (!fs.existsSync(dir)) continue;
    for (const fn of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
      const invoiceNo = fn.replace('.txt', '');
      const txt = fs.readFileSync(path.join(dir, fn), 'utf8');
      const parsed = vendor.includes('Proof') ? parseProof(txt, invoiceNo) : parseSipMarket(txt, invoiceNo);
      if (!parsed.lines.length) continue;
      if (SINCE && (!parsed.date || parsed.date < SINCE)) continue;

      // re-ingest cleanly: drop this invoice's existing lines first
      await sql`delete from public.received_items where vendor = ${vendor} and invoice_number = ${invoiceNo}`;

      let matched = 0, ignored = 0, unmapped = 0;
      for (const line of parsed.lines) {
        const hit = map[`${vendor}|${line.num}`];
        const isIgnore = !hit || hit.isIgnore || hit.inventory_item_name === 'IGNORE';
        const itemId = !isIgnore && hit ? hit.inventory_item_id : null;
        const itemName = !isIgnore && hit ? hit.inventory_item_name : null;
        const factor = hit ? Number(hit.unit_factor) : 1;
        const status = isIgnore ? 'ignored' : (itemId ? 'confirmed' : 'needs_mapping');
        if (isIgnore) ignored++; else if (itemId) matched++; else unmapped++;

        const countUnit = itemId ? itemUnit[itemId] : null;
        if (itemId && !countUnit) noUnit.set(itemName, (noUnit.get(itemName) || 0) + 1);
        const conv = itemId ? toCountUnit(line.qty, line.unit, factor, countUnit) : null;

        // qty/unit = expressed in the item's counting unit; qty_units = that quantity
        await sql`
          insert into public.received_items
            (vendor, invoice_number, delivery_date, vendor_item_number, vendor_description, item_id, item_name,
             qty, unit, qty_units, unit_cost, net_cost, source, status, note)
          values (${vendor}, ${invoiceNo}, ${parsed.date}, ${line.num}, ${line.desc}, ${itemId}, ${itemName},
                  ${conv ? conv.qtyUnits : line.qty}, ${conv ? conv.unit : line.unit},
                  ${conv ? conv.qtyUnits : null}, ${line.unitCost || null}, ${line.netCost || null},
                  'portal', ${status}, ${'invoiced as ' + line.qty + ' ' + line.unit})
          on conflict (vendor, invoice_number, vendor_item_number, item_id) do update
            set qty = excluded.qty, unit = excluded.unit, qty_units = excluded.qty_units,
                unit_cost = excluded.unit_cost, net_cost = excluded.net_cost,
                status = excluded.status, note = excluded.note`;
      }
      await sql`
        insert into public.receiving_pulls (vendor, invoice_number, delivery_date, lines, matched, ignored, status)
        values (${vendor}, ${invoiceNo}, ${parsed.date}, ${parsed.lines.length}, ${matched}, ${ignored}, ${unmapped ? 'unmapped_lines' : 'ok'})
        on conflict (vendor, invoice_number) do update
          set lines = excluded.lines, matched = excluded.matched, ignored = excluded.ignored,
              status = excluded.status, pulled_at = now()`;
      results.push({ vendor, invoiceNo, date: parsed.date, lines: parsed.lines.length, matched, ignored, unmapped });
    }
  }

  await sql.end();
  if (!QUIET) {
    let tm = 0, ti = 0, tu = 0, tl = 0;
    for (const r of results) { tm += r.matched; ti += r.ignored; tu += r.unmapped; tl += r.lines; }
    console.log(`RECEIVING INGEST — ${results.length} invoices processed`);
    for (const r of results.sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
      console.log(`  ${r.date || '?'} ${r.vendor} #${r.invoiceNo}: ${r.lines} lines → ${r.matched} matched, ${r.ignored} ignored` + (r.unmapped ? `, ${r.unmapped} UNMAPPED` : ''));
    }
    console.log(`TOTAL: ${tl} lines · ${tm} matched · ${ti} ignored · ${tu} unmapped`);
    if (noUnit.size) {
      console.log(`\nItems with no unit in par (left un-converted): ${[...noUnit.keys()].join(', ')}`);
    }
  }
})();
