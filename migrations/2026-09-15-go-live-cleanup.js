#!/usr/bin/env node
/**
 * Go-live cleanup: archive and clear the historical receiving data.
 *
 * The app currently carries 90 days of backfilled deliveries (May 13 → Sep 9) from the
 * unit-conversion repair. Going live this week means the Receiving tab should start with
 * the first real delivery (Wed Sep 16), so:
 *   1. everything is archived to JSON first (nothing is lost)
 *   2. the old invoice .txt files are moved aside so the weekly ingest can't re-add them
 *   3. received_items rows before 2026-09-14 are deleted
 *
 * Keeps: count_history (the variance baseline) and toast_uploads (theoretical usage).
 */
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const CUTOFF = '2026-09-14';
const ARCHIVE = '/root/business-reports/invoices/archive';
const TODAY = new Date().toISOString().slice(0, 10);

(async () => {
  fs.mkdirSync(ARCHIVE, { recursive: true });

  // 1. archive the rows
  const rows = await sql`
    select * from public.received_items where delivery_date < ${CUTOFF} order by delivery_date, vendor, item_name`;
  const backup = path.join(ARCHIVE, `received_items-backup-${TODAY}.json`);
  fs.writeFileSync(backup, JSON.stringify(rows, null, 1));
  console.log(`1) archived ${rows.length} rows → ${backup} (${(fs.statSync(backup).size / 1024).toFixed(0)} KB)`);

  // 2. move the old invoice text files aside
  let moved = 0;
  for (const vendor of ['proof', 'sipmarket']) {
    const src = `/root/business-reports/invoices/${vendor}`;
    const dst = path.join(ARCHIVE, 'old-invoices', vendor);
    fs.mkdirSync(dst, { recursive: true });
    if (!fs.existsSync(src)) continue;
    for (const f of fs.readdirSync(src).filter(x => x.endsWith('.txt'))) {
      fs.renameSync(path.join(src, f), path.join(dst, f));
      moved++;
    }
  }
  console.log(`2) moved ${moved} invoice text files → ${ARCHIVE}/old-invoices/ (the weekly pull writes fresh ones)`);

  // 3. clear the old rows
  const del = await sql`
    delete from public.received_items where delivery_date < ${CUTOFF} returning id`;
  console.log(`3) deleted ${del.length} received_items rows older than ${CUTOFF}`);

  const left = await sql`select count(*)::int n, min(delivery_date) oldest, max(delivery_date) newest from public.received_items`;
  console.log(`\nreceived_items now: ${left[0].n} rows` +
    (left[0].n ? ` (${String(left[0].oldest).slice(0, 10)} → ${String(left[0].newest).slice(0, 10)})` : ' — clean slate'));

  const keep = await sql`select
      (select count(*)::int from public.count_history) as count_history,
      (select count(*)::int from public.toast_uploads) as toast_uploads,
      (select count(*)::int from public.receiving_pulls) as receiving_pulls`;
  console.log(`kept: ${keep[0].count_history} count snapshots (variance baseline), ` +
    `${keep[0].toast_uploads} Toast uploads (theoretical usage), ${keep[0].receiving_pulls} pull audit rows`);
  await sql.end();
})();
