#!/usr/bin/env node
/**
 * Weekly variance report — prints a short WhatsApp-friendly summary of the most
 * recent count period, or nothing at all when there's nothing new to say.
 *
 * Same maths as the Variance tab:
 *   usage    = start count + received − end count      (item's counting unit)
 *   variance = theoretical − usage                     (NEGATIVE = product missing)
 *
 * Silent when: fewer than two counts exist, the period was already reported,
 * or a nudge for this period has already been sent.
 * State: /root/.hermes/state/variance-report.json
 */
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const STATE = '/root/.hermes/state/variance-report.json';
const OZ_PER_BOTTLE = 25.36, OZ_PER_KEG = 1984, OZ_PER_GLASS = 5, DEFAULT_CASE = 24;

const fmt = (n, d = 2) => Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => '$' + fmt(Math.abs(n), 2);
// Postgres returns `date` columns as Date objects — normalise everything to YYYY-MM-DD
const day = v => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v == null ? '' : v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

// The app's item list = hardcoded items in index.html + inventory_items in Supabase
// (Supabase wins). The report has to mirror that or it misses whole categories.
function hardcodedItems() {
  const out = {};
  try {
    const html = fs.readFileSync('/root/code/hendos-inventory/index.html', 'utf8');
    const re = /\{id:"([^"]+)",name:"([^"]*)",par:"([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) out[m[1]] = { id: m[1], name: m[2], par: m[3], bottle_size_oz: null };
  } catch (e) { /* app clone not present — Supabase items only */ }
  return out;
}

function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } }
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
}

function unitFromPar(par) {
  const p = String(par || '').toLowerCase();
  if (p.includes('keg')) return 'kegs';
  if (p.includes('case')) return 'cases';
  if (p.includes('can')) return 'cans';
  if (p.includes('bottle') || /\bbtl\b/.test(p)) return 'bottles';
  return null;
}

function mergeSessions(rows) {
  const byDate = {};
  rows.forEach(r => {
    if (!r.session_date || !r.item_id) return;
    (byDate[day(r.session_date)] = byDate[day(r.session_date)] || []).push(r);
  });
  const sessions = [];
  Object.keys(byDate).sort().forEach(d => {
    const prev = sessions[sessions.length - 1];
    if (!prev || (new Date(d) - new Date(prev.end)) / 86400000 > 2) sessions.push({ start: d, end: d, rows: byDate[d].slice() });
    else { prev.end = d; prev.rows = prev.rows.concat(byDate[d]); }
  });
  sessions.forEach(s => {
    s.last = {};
    s.rows.sort((a, b) => String(a.counted_at).localeCompare(String(b.counted_at)));
    s.rows.forEach(r => { if (r.on_hand !== null && r.on_hand !== '') s.last[r.item_id] = Number(r.on_hand); });
  });
  return sessions;
}

(async () => {
  const state = loadState();
  const history = await sql`select item_id, on_hand, counted_at, session_date from public.count_history order by counted_at asc`;
  const sessions = mergeSessions(history);

  if (sessions.length < 2) {
    // gentle reminder only if a count hasn't happened in a long time
    const last = sessions.length ? sessions[sessions.length - 1].end : null;
    const ageDays = last ? (Date.now() - new Date(last)) / 86400000 : 999;
    if (ageDays > 10 && state.lastNudge !== 'no-count') {
      state.lastNudge = 'no-count';
      saveState(state);
      console.log('📉 *Variance* — no count on record for ' + Math.floor(ageDays) + ' days.\nOnce you count (back stock, Sunday/Monday), the variance report starts comparing periods automatically.');
    }
    await sql.end();
    return;
  }

  const start = sessions[sessions.length - 2];
  const end = sessions[sessions.length - 1];
  const key = start.end + '→' + end.end;

  const uploads = await sql`select date_range_start, date_range_end, usage from public.toast_uploads order by uploaded_at desc limit 12`;
  let best = null, bestOverlap = 0;
  uploads.forEach(u => {
    const s = day(u.date_range_start), e = day(u.date_range_end);
    const lo = s > start.end ? s : start.end, hi = e < end.end ? e : end.end;
    const days = (new Date(hi) - new Date(lo)) / 86400000;
    if (days > bestOverlap) { bestOverlap = days; best = u; }
  });
  const periodDays = Math.max(1, (new Date(end.end) - new Date(start.end)) / 86400000);

  if (!best || bestOverlap < periodDays * 0.5) {
    if (state.lastNudge !== key) {
      state.lastNudge = key; saveState(state);
      console.log('📉 *Variance ' + key + '* — your counts are in, but I don\'t have the Toast sales report covering that week yet.\nUpload it on the Toast POS tab (' + start.end + ' → ' + end.end + ') and the variance computes itself.');
    }
    await sql.end();
    return;
  }
  if (state.lastReported === key) { await sql.end(); return; }

  const itemMap = hardcodedItems();
  const supaItems = await sql`select id, name, par, bottle_size_oz from public.inventory_items`;
  supaItems.forEach(r => { itemMap[r.id] = { id: r.id, name: r.name, par: r.par, bottle_size_oz: r.bottle_size_oz }; });
  const items = Object.values(itemMap);
  const mapRows = await sql`select inventory_item_id, unit_factor from public.vendor_item_map where inventory_item_id is not null`;
  const received = await sql`select item_id, qty_units, net_cost, delivery_date from public.received_items where status = 'confirmed'`;

  const packFor = {};
  mapRows.forEach(m => {
    const f = Number(m.unit_factor);
    if (f > 1 && f > (packFor[m.inventory_item_id] || 0)) packFor[m.inventory_item_id] = f;
  });
  const costFor = {};
  received.forEach(r => {
    const q = Number(r.qty_units), net = Number(r.net_cost);
    if (!q || !net) return;
    const d = day(r.delivery_date);
    if (!costFor[r.item_id] || d >= costFor[r.item_id].d) costFor[r.item_id] = { d, c: net / q };
  });

  const theo = {};
  (best.usage || []).forEach(u => { if (u && u.item && u.item.id) theo[u.item.id] = u; });
  const recv = {};
  received.forEach(r => {
    const d = day(r.delivery_date);
    if (d > start.end && d <= end.end) recv[r.item_id] = (recv[r.item_id] || 0) + Number(r.qty_units || 0);
  });

  const rows = [];
  items.forEach(item => {
    const s = start.last[item.id], e = end.last[item.id];
    if (s === undefined || e === undefined) return;
    const entry = theo[item.id];
    if (!entry) return;
    const unit = unitFromPar(item.par);
    const perBottle = Number(item.bottle_size_oz) > 1 ? Number(item.bottle_size_oz) : OZ_PER_BOTTLE;
    const pack = packFor[item.id] || DEFAULT_CASE;
    let theoretical = null;
    if (entry.kind === 'spirit') theoretical = (entry.oz || 0) / perBottle;
    else if (entry.kind === 'wine') theoretical = ((entry.glasses || 0) * OZ_PER_GLASS) / perBottle;
    else if (entry.kind === 'wine_keg' || entry.kind === 'draft_beer') theoretical = (entry.oz || 0) / OZ_PER_KEG;
    else if (entry.kind === 'bottled_beer') theoretical = (entry.units || 0) / (unit === 'cases' ? pack : 1);
    if (theoretical === null) return;
    if (unit === 'cases' && entry.kind === 'spirit') theoretical = theoretical / pack;

    const usage = s + (recv[item.id] || 0) - e;
    const variance = theoretical - usage;
    const threshold = Math.max(0.5, Math.abs(theoretical) * 0.10);
    const flagged = variance < -threshold;
    const cost = costFor[item.id] ? costFor[item.id].c : null;
    rows.push({ name: item.name, unit: unit || '', variance, theoretical, flagged,
                dollars: cost !== null ? variance * cost : null });
  });

  const flagged = rows.filter(r => r.flagged).sort((a, b) => {
    const av = a.dollars !== null ? Math.abs(a.dollars) : Math.abs(a.variance);
    const bv = b.dollars !== null ? Math.abs(b.dollars) : Math.abs(b.variance);
    return bv - av;
  });
  const totalUsd = flagged.reduce((a, r) => a + (r.dollars || 0), 0);

  if (!flagged.length) {
    state.lastReported = key; saveState(state);
    console.log('📉 *Variance ' + key + '* — ' + rows.length + ' items measured, nothing short. Clean week. ✅');
    await sql.end();
    return;
  }

  let out = '📉 *Variance ' + key + '*\n';
  out += rows.length + ' items measured · *' + flagged.length + ' short*';
  out += totalUsd ? ' · about *' + money(totalUsd) + '* missing\n' : '\n';
  out += '\n*Biggest shortfalls (negative = missing):*\n';
  flagged.slice(0, 6).forEach(r => {
    const u = r.unit ? ' ' + r.unit : '';
    out += '• ' + r.name + ' — *' + fmt(r.variance) + u + '*' + (r.dollars !== null ? ' (' + money(r.dollars) + ')' : '') + '\n';
  });
  if (flagged.length > 6) out += '…and ' + (flagged.length - 6) + ' more on the Variance tab.\n';
  out += '\nNegative = product missing (red on the tab). Positive = less gone than sales explain, usually an over-count or an unrecorded delivery.';
  if (bestOverlap < periodDays * 0.9) out += '\n⚠ The Toast report covers only part of this period — the numbers will sharpen once the full week is uploaded.';

  state.lastReported = key; saveState(state);
  console.log(out);
  await sql.end();
})();
