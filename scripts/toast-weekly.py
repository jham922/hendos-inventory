#!/usr/bin/env python3
"""
Weekly Toast Product-mix pull → inventory app.

Run through the browser harness:
    /root/.hermes/bin/browser-use < /root/.hermes/scripts/toast-weekly.py

What it does:
  1. Toast Web → Reports → Menus → Product mix, set to "Last week" (Mon–Sun)
  2. Export as CSV files + all available data → ProductMix_<start>_<end>.zip
  3. Unzip → Items.csv into ~/business-reports/toast/productmix-<start>/
  4. Upload it into the inventory app's Toast tab and save it to History with the
     matching date range (skipped when that week is already uploaded)

Prints one summary line on success, or an error line if something needs a human.
"""
import glob
import os
import re
import shutil
import time
import zipfile

APP = 'https://jham922.github.io/hendos-inventory/'
TOAST_REPORT = 'https://www.toasttab.com/restaurants/admin/reports/menu/product-mix'
DL = '/root/Downloads'
ARCHIVE = '/root/business-reports/toast'

def ev(s, expr, tries=3):
    for _ in range(tries):
        try:
            r = cdp('Runtime.evaluate', session_id=s, expression=expr, returnByValue=True, awaitPromise=True)
            return r.get('result', {}).get('value')
        except Exception:
            time.sleep(2)
    return None

def attach(url_part):
    ts = [t for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'page']
    t = next((x for x in ts if url_part in (x['url'] or '')), None)
    tid = t['targetId'] if t else cdp('Target.createTarget', url='about:blank')['targetId']
    try:
        cdp('Target.activateTarget', targetId=tid)
    except Exception:
        pass
    time.sleep(1.2)
    return cdp('Target.attachToTarget', targetId=tid, flatten=True)['sessionId']

def real_click(x, y, sess):
    # NOTE: mouse events must carry the target session, or they land on whichever
    # tab happens to be active (this bit the first version of this script).
    cdp('Input.dispatchMouseEvent', session_id=sess, type='mousePressed', x=x, y=y, button='left', clickCount=1)
    time.sleep(0.12)
    cdp('Input.dispatchMouseEvent', session_id=sess, type='mouseReleased', x=x, y=y, button='left', clickCount=1)

# ---------- 1. Toast: open the report on "Last week" ----------
s = attach('toasttab.com')
cdp('Page.navigate', session_id=s, url=TOAST_REPORT)
time.sleep(18)
ev(s, "(() => { [...document.querySelectorAll('button')].filter(x=>/got it/i.test(x.innerText||'')).forEach(x=>x.click()); return true; })()")
time.sleep(2)

range_label = ev(s, """(() => {
  const b=[...document.querySelectorAll('button')].find(e=>/last week/i.test(e.innerText||''));
  return b ? b.innerText.replace(/\\s+/g,' ').trim().slice(0,60) : '';
})()""") or ''
print('toast range: ' + (range_label or '(not read)'))

if range_label and 'last week' not in range_label.lower():
    # best effort: open the picker and choose the "Last week" preset, then Apply.
    # Any failure here is non-fatal — the export still uses whatever range is set.
    ev(s, "(() => { const b=[...document.querySelectorAll('button')].find(e=>/last week/i.test(e.innerText||'')||/\\d{4}/.test(e.innerText||'')); if (b) b.click(); return true; })()")
    time.sleep(4)
    ev(s, "(() => { const p=[...document.querySelectorAll('*')].find(e=>/^Last week$/i.test((e.innerText||'').trim())); if (p) p.click(); return true; })()")
    time.sleep(3)
    ev(s, "(() => { const a=[...document.querySelectorAll('button')].find(e=>/^apply$/i.test((e.innerText||'').trim())); if (a) a.click(); return true; })()")
    time.sleep(8)

# clear any stray dialog first, then hunt for the export icon. The download icon sits
# in the report header; the exact x drifts with the window, so try the known positions
# and verify a modal actually opened rather than assuming the click landed.
def press_escape():
    cdp('Input.dispatchKeyEvent', session_id=s, type='keyDown', key='Escape', code='Escape', windowsVirtualKeyCode=27)
    cdp('Input.dispatchKeyEvent', session_id=s, type='keyUp', key='Escape', code='Escape', windowsVirtualKeyCode=27)

started = time.time()
modal = False
for x in (1377, 1425, 1329, 1461):
    ev(s, 'window.scrollTo(0,0)')
    time.sleep(1)
    real_click(x, 117, s)
    for _ in range(12):                       # poll up to ~6s
        time.sleep(0.5)
        if ev(s, "/Export options/.test(document.body.innerText||'')"):
            modal = True
            break
    if modal:
        break
    press_escape()
    time.sleep(2)

if not modal:
    print('TOAST WEEKLY FAILED — could not open the export dialog on Toast (page may have changed or the session needs a login).')
    raise SystemExit(0)

ev(s, """(() => { const c=document.querySelector('input[type=radio][value=CSV]'), a=document.querySelector('input[type=radio][value=all]');
  if (c) { c.click(); c.dispatchEvent(new Event('change',{bubbles:true})); }
  if (a) { a.click(); a.dispatchEvent(new Event('change',{bubbles:true})); }
  return true; })()""")
time.sleep(1.5)
ev(s, """(() => { const b=[...document.querySelectorAll('button')].find(e=>/^download$/i.test((e.innerText||'').trim())); if (b) b.click(); return true; })()""")

# ---------- 3. wait for the zip ----------
zip_path = None
for _ in range(24):
    time.sleep(5)
    cands = [p for p in glob.glob(os.path.join(DL, 'ProductMix_*.zip')) if os.path.getmtime(p) >= started - 5]
    if cands:
        zip_path = max(cands, key=os.path.getmtime)
        break
if not zip_path:
    print('TOAST WEEKLY FAILED — the export never landed in ' + DL + '.')
    raise SystemExit(0)

m = re.search(r'ProductMix_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})(?:\s*\(\d+\))?\.zip',
              os.path.basename(zip_path))
if not m:
    print('TOAST WEEKLY FAILED — unexpected export filename: ' + os.path.basename(zip_path))
    raise SystemExit(0)
d_start, d_end = m.group(1), m.group(2)

dest = os.path.join(ARCHIVE, 'productmix-' + d_start)
os.makedirs(dest, exist_ok=True)
with zipfile.ZipFile(zip_path) as z:
    z.extractall(dest)
items_csv = os.path.join(dest, 'Items.csv')
rows = sum(1 for _ in open(items_csv, encoding='utf-8', errors='replace')) - 1

# keep the download folder tidy — the export is archived under business-reports
for old in glob.glob(os.path.join(DL, 'ProductMix_*.zip')):
    try:
        if os.path.getmtime(old) < started - 60:
            os.remove(old)
    except OSError:
        pass

# ---------- 4. upload into the app ----------
a = attach('hendos-inventory')
cdp('Page.navigate', session_id=a, url=APP + '?v=toastjob')
time.sleep(20)
ev(a, "(() => { const t=[...document.querySelectorAll('.tab')].find(x=>/TOAST POS/i.test(x.innerText)); if (t) t.click(); return true; })()")
time.sleep(4)

check_url = ('/rest/v1/toast_uploads?select=id&date_range_start=eq.%s&date_range_end=eq.%s'
             % (d_start, d_end))
already = ev(a, "(async () => { const r = await sbFetch('%s'); return (r && r.length) ? r.length : 0; })()" % check_url)
if already:
    print('Toast report %s → %s was already uploaded — nothing to do.' % (d_start, d_end))
    raise SystemExit(0)

doc = cdp('DOM.getDocument', depth=-1)
node = cdp('DOM.querySelector', nodeId=doc['root']['nodeId'], selector='#csvFile')
if not node.get('nodeId'):
    print('TOAST WEEKLY FAILED — could not find the upload box in the app.')
    raise SystemExit(0)
cdp('DOM.setFileInputFiles', files=[items_csv], nodeId=node['nodeId'])
time.sleep(10)
status = ev(a, "(document.getElementById('uploadSuccess')||{}).textContent") or ''
if 'Loaded' not in status:
    print('TOAST WEEKLY FAILED — the app did not accept the CSV: ' + status.strip()[:120])
    raise SystemExit(0)

ev(a, """(() => { const s=document.getElementById('historyDateStart'), e=document.getElementById('historyDateEnd');
  s.value='%s'; e.value='%s';
  s.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('input',{bubbles:true})); return true; })()""" % (d_start, d_end))
time.sleep(1)
ev(a, "(() => { const b=[...document.querySelectorAll('button')].find(x=>/Save to History/i.test(x.innerText||'')); if (b) b.click(); return true; })()")
time.sleep(12)
saved = ev(a, "(document.getElementById('saveHistoryStatus')||{}).textContent") or ''
if 'Saved' not in saved:
    print('TOAST WEEKLY FAILED — could not save the report to history: ' + saved.strip()[:120])
    raise SystemExit(0)

print('✓ Toast %s → %s pulled (%s rows) and saved to the app\'s history.' % (d_start, d_end, rows))
