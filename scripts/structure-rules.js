#!/usr/bin/env node
/**
 * Turn Jennifer's free-text rules into structured, executable ones.
 *
 *   rule_type        bottle_only | case_only | best_price | trigger | dont_order
 *   trigger_level    reorder point in the item's counting unit (null = use par)
 *   max_above_par    how far above par the chosen option may land (best_price only)
 *
 * Her rule for best-price items: buy whichever of bottle/case is cheapest,
 * triggered by being below par, but never land more than 4 bottles above par.
 */
const fs = require('fs');
const postgres = require('postgres');
const env = fs.readFileSync('/root/.hermes/secrets/hudson-db.env', 'utf8');
const url = (env.match(/DATABASE_URL=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

const CAP = 4;   // Jennifer 2026-09-15: never more than 4 bottles above par

// the eight she answered for ("keep at par, best price")
const BEST_PRICE = ['Appleton Estate', 'Bacardi', 'Beefeater', 'Bombay Sapphire',
                    'Bulleit Rye Whiskey', 'Captain Morgan', 'Cointreau', 'Gran Marnier'];

(async () => {
  await sql`alter table public.order_rules add column if not exists rule_type text`;
  await sql`alter table public.order_rules add column if not exists trigger_level numeric`;
  await sql`alter table public.order_rules add column if not exists max_above_par numeric`;
  await sql`alter table public.order_rules add column if not exists strict boolean default false`;

  const rows = await sql`select item_id, item_name, buy_rule, notes, volume from public.order_rules`;
  for (const r of rows) {
    const t = ((r.buy_rule || '') + ' ' + (r.notes || '')).toLowerCase();
    let type = 'bottle_only', trigger = null, cap = null, strict = /never deviate/.test(t);

    if (/don.?t order/.test(t)) type = 'dont_order';
    else if (/best pric/.test(t) || BEST_PRICE.includes(r.item_name)) { type = 'best_price'; cap = CAP; }
    else if (/only case/.test(t)) type = 'case_only';
    else if (/only bottle/.test(t)) type = 'bottle_only';

    // explicit reorder points override par
    const m = /below (\d+)\s*(bottles?|cases?|btl)/.exec(t);
    if (m) trigger = Number(m[1]);
    const mc = /below (\d+)\s*cases? or (\d+)\s*bottles?/.exec(t);
    if (mc) trigger = Number(mc[2]);            // Corazon: below 2 cases / 12 bottles

    await sql`update public.order_rules set rule_type=${type}, trigger_level=${trigger},
                     max_above_par=${cap}, strict=${strict} where item_id=${r.item_id}`;
  }

  const counts = await sql`select rule_type, count(*)::int n from public.order_rules group by 1 order by n desc`;
  console.log('=== structured rule types ===');
  counts.forEach(c => console.log(`  ${c.rule_type}: ${c.n}`));

  console.log('\n=== the eight answered items ===');
  const eight = await sql`select item_name, rule_type, max_above_par, par_snapshot from public.order_rules
                          where item_name = any(${BEST_PRICE}) order by item_name`;
  eight.forEach(r => console.log(`  ${r.item_name.padEnd(24)} par=${String(r.par_snapshot).padEnd(12)} → ${r.rule_type}, max ${r.max_above_par} above par`));

  console.log('\n=== what the cap does (illustration, real pars) ===');
  const demo = await sql`
    select item_name, par_snapshot, max_above_par
    from public.order_rules where rule_type='best_price' and par_snapshot ~ '^[0-9.]+'
    order by item_name limit 8`;
  demo.forEach(r => {
    const par = parseFloat(r.par_snapshot);
    console.log(`  ${r.item_name.padEnd(22)} par ${par} → may go up to ${par + Number(r.max_above_par)} bottles`);
  });
  await sql.end();
})();
