#!/usr/bin/env node
/**
 * Phase 3 setup: count history.
 *
 * The variance maths needs two points in time (start count, end count). Until now the
 * app kept ONE row per item (the current value), so there was nothing to diff. This:
 *   1. creates count_history (append-only snapshots)
 *   2. mirrors the permissive RLS policies the other tables use
 *   3. seeds the CURRENT counts as the baseline session (so this week's count is the
 *      starting point, and next week's produces the first real variance)
 *
 * Idempotent: safe to re-run (won't double-seed).
 */
const fs = require('fs');
const postgres = require('postgres');
const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

(async () => {
  console.log('1) creating count_history…');
  await sql`
    create table if not exists public.count_history (
      id            uuid primary key default gen_random_uuid(),
      item_id       text not null,
      on_hand       text,
      counted_at    timestamptz not null default now(),
      counted_by    text,
      session_date  date not null default current_date,
      note          text
    )`;
  await sql`create index if not exists count_history_item_idx on public.count_history (item_id, counted_at desc)`;
  await sql`create index if not exists count_history_session_idx on public.count_history (session_date)`;
  console.log('   ✓ table + indexes');

  console.log('2) RLS policies (matching inventory_counts)…');
  await sql`alter table public.count_history enable row level security`;
  for (const [name, cmd, expr] of [
    ['allow_all_reads', 'select', 'using (true)'],
    ['allow_all_inserts', 'insert', 'with check (true)'],
    ['allow_all_updates', 'update', 'using (true)'],
    ['allow_all_deletes', 'delete', 'using (true)'],
  ]) {
    const exists = await sql`select 1 from pg_policies where schemaname='public' and tablename='count_history' and policyname=${name}`;
    if (!exists.length) {
      await sql.unsafe(`create policy ${name} on public.count_history for ${cmd} to public ${expr}`);
      console.log(`   ✓ policy ${name}`);
    } else {
      console.log(`   · policy ${name} already present`);
    }
  }

  console.log('3) seeding the baseline (current counts)…');
  const existing = await sql`select count(*)::int as n from public.count_history`;
  if (existing[0].n > 0) {
    console.log(`   · already has ${existing[0].n} rows — not seeding again`);
  } else {
    const inserted = await sql`
      insert into public.count_history (item_id, on_hand, counted_at, counted_by, session_date, note)
      select id, on_hand,
             coalesce(updated_at, now()),
             coalesce(updated_by, 'unknown'),
             coalesce(updated_at::date, current_date),
             'baseline — first snapshot (variance starts here)'
      from public.inventory_counts
      where on_hand is not null
      returning id`;
    console.log(`   ✓ seeded ${inserted.length} items as the baseline session`);
  }

  const summary = await sql`
    select session_date, count(*)::int as items, count(distinct counted_by)::int as counters
    from public.count_history group by 1 order by 1`;
  console.log('\nsessions on record:');
  summary.forEach(r => console.log(`   ${r.session_date} — ${r.items} items (by ${r.counters} user)`));
  await sql.end();
})();
