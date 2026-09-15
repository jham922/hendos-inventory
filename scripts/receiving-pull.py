#!/usr/bin/env python3
"""
Receiving pull — Stage A of the weekly receiving pipeline.

Run through the browser harness (helpers pre-imported):
    /root/.hermes/bin/browser-use < /root/.hermes/scripts/receiving-pull.py

Walks the two vendor portals with the already-logged-in browser session and saves
each invoice's text to ~/business-reports/invoices/{proof,sipmarket}/<invoice>.txt.
Files that already exist are skipped, so re-runs only fetch what's new.
Stage B (receiving-ingest.js) turns those files into received_items rows.
"""
import json, os, re, time

INF = '/root/business-reports/invoices'
os.makedirs(f'{INF}/proof', exist_ok=True)
os.makedirs(f'{INF}/sipmarket', exist_ok=True)

def attach(url_part):
    ts = [t for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'page']
    t = next((x for x in ts if url_part in x['url']), None)
    if t:
        tid = t['targetId']
    else:
        tid = cdp('Target.createTarget', url='about:blank')['targetId']
    try:
        cdp('Target.activateTarget', targetId=tid)
    except Exception:
        pass
    time.sleep(1.5)
    s = cdp('Target.attachToTarget', targetId=tid, flatten=True)['sessionId']
    return s

def ev(s, expr, tries=3):
    for i in range(tries):
        try:
            r = cdp('Runtime.evaluate', session_id=s, expression=expr, returnByValue=True, awaitPromise=True)
            return r.get('result', {}).get('value')
        except Exception:
            time.sleep(4)
    print('   ! page did not respond')
    return None

errors = []

# ---------------- Southern (Proof) ----------------
try:
    s = attach('sgproof.com')
    cdp('Page.navigate', session_id=s, url='https://shop.sgproof.com/sgws/en/usd/InvoicesList')
    time.sleep(9)
    raw = ev(s, """JSON.stringify([...document.querySelectorAll('a[href*="document/details"]')]
        .map(a => ({href: a.getAttribute('href'), id: (a.innerText||'').trim()}))
        .filter(o => /^\\d+$/.test(o.id)))""") or '[]'
    docs = json.loads(raw)
    print(f"Proof: {len(docs)} documents listed")
    new = 0
    for d in docs:
        f = f"{INF}/proof/{d['id']}.txt"
        if os.path.exists(f):
            continue
        cdp('Page.navigate', session_id=s, url='https://shop.sgproof.com' + d['href'])
        time.sleep(7)
        txt = ev(s, 'document.body.innerText') or ''
        if 'Associated Items' in txt:
            open(f, 'w').write(txt)
            new += 1
        else:
            print(f"   ! {d['id']}: no line items found")
    print(f"Proof: {new} new invoices saved")
except Exception as e:
    errors.append(f"proof: {e}")
    print(f"Proof FAILED: {e}")

# ---------------- Gate City (SipMarket) ----------------
try:
    s = attach('sipmarket.com')
    cdp('Page.navigate', session_id=s, url='https://www.sipmarket.com/en/orders/orders/?tab=invoices')
    time.sleep(10)
    raw = ev(s, """JSON.stringify([...document.querySelectorAll('table tr')]
        .map(tr => [...tr.querySelectorAll('td,th')].map(td => td.innerText.trim()))
        .filter(r => r.length >= 3 && /^\\d{6,}$/.test(r[1] || ''))
        .map(r => ({no: r[1], date: r[2]})))""") or '[]'
    rows = json.loads(raw)
    print(f"SipMarket: {len(rows)} invoices listed")
    new = 0
    for i, row in enumerate(rows):
        f = f"{INF}/sipmarket/{row['no']}.txt"
        if os.path.exists(f):
            continue
        ev(s, f"""(() => {{ const b = [...document.querySelectorAll('a,button')].filter(e => (e.innerText||'').trim() === 'REVIEW' && e.getClientRects().length); if (b[{i}]) {{ b[{i}].click(); return 'ok'; }} return 'missing'; }})()""")
        time.sleep(7)
        txt = ev(s, 'document.body.innerText') or ''
        if 'TOTAL ITEMS' in txt:
            open(f, 'w').write(txt)
            new += 1
        else:
            print(f"   ! {row['no']}: no line items found")
    print(f"SipMarket: {new} new invoices saved")
except Exception as e:
    errors.append(f"sipmarket: {e}")
    print(f"SipMarket FAILED: {e}")

print('PULL ' + ('FAILED: ' + '; '.join(errors) if errors else 'OK'))
