#!/usr/bin/env python3
"""
Session keep-alive + automatic re-login.

Run through the browser harness:
    /root/.hermes/bin/browser-use < /root/.hermes/scripts/session-keepalive.py

For each portal it (a) checks whether the session is still alive by loading a
page that requires login, and (b) if the session is dead, signs back in using
the credentials in /root/.hermes/secrets/vendor-logins.env (owner-only, 600).

Silent when everything is healthy. Prints one line per session that needs the
owner's manual intervention (e.g. a 2FA prompt) so the wrapper can alert.
"""
import json
import os
import re
import time

SECRETS_FILE = '/root/.hermes/secrets/vendor-logins.env'
RELOGIN_LOG = '/root/.hermes/logs/session-relogin.log'

SITES = [
    dict(name='Toast',
         url='https://pos.toasttab.com/',
         login='https://auth.toasttab.com/u/login',
         host='toasttab.com',
         dead=['login', 'signin', 'sign in'],
         user_key='TOAST_USERNAME', pass_key='TOAST_PASSWORD'),
    dict(name='Proof',
         url='https://shop.sgproof.com/InvoicesList',
         login='https://shop.sgproof.com/auth/login',
         host='sgproof.com',
         dead=['auth/login', 'sign in'],
         user_key='PROOF_USERNAME', pass_key='PROOF_PASSWORD'),
    dict(name='SipMarket',
         url='https://www.sipmarket.com/en/orders/orders/',
         login='https://www.sipmarket.com/en/login/',
         host='sipmarket.com',
         dead=['/login', '/signin', 'sign in'],
         user_key='SIPMARKET_USERNAME', pass_key='SIPMARKET_PASSWORD'),
]

USER_SELECTORS = ("input[type=email],input[type=text],input[name*=user i],input[name*=email i],"
                  "input[id*=user i],input[id*=email i],input[autocomplete=username]")
PASS_SELECTORS = "input[type=password],input[name*=pass i],input[id*=pass i]"

FILL_JS = """(() => {
  const sel = %s, val = %s;
  const vis = el => el && el.offsetParent !== null;
  const el = [...document.querySelectorAll(sel)].filter(vis)[0];
  if (!el) return 'notfound';
  const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
  d.set.call(el, val);
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
  el.focus();
  return 'filled';
})()"""

SUBMIT_JS = """(() => {
  const vis = el => el && el.offsetParent !== null;
  const btns = [...document.querySelectorAll('button,input[type=submit],a[role=button]')].filter(vis);
  const b = btns.find(x => /sign ?in|log ?in|continue|next|submit/i.test((x.innerText || x.value || '')))
         || btns[0];
  if (!b) return 'nobutton';
  b.click();
  return 'clicked:' + ((b.innerText || b.value || '').trim().slice(0, 24));
})()"""


def log(msg):
    try:
        os.makedirs(os.path.dirname(RELOGIN_LOG), exist_ok=True)
        with open(RELOGIN_LOG, 'a') as fh:
            fh.write("{}  {}\n".format(time.strftime('%Y-%m-%d %H:%M:%S'), msg))
    except Exception:
        pass


def load_secrets():
    out = {}
    try:
        with open(SECRETS_FILE) as fh:
            for line in fh:
                m = re.match(r"^([A-Z_]+)='(.*)'$", line.rstrip('\n'))
                if m:
                    out[m.group(1)] = m.group(2)
    except FileNotFoundError:
        pass
    return out


def attach(url_part):
    ts = [t for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'page']
    t = next((x for x in ts if url_part in x['url']), None)
    tid = t['targetId'] if t else cdp('Target.createTarget', url='about:blank')['targetId']
    try:
        cdp('Target.activateTarget', targetId=tid)
    except Exception:
        pass
    time.sleep(1.2)
    return cdp('Target.attachToTarget', targetId=tid, flatten=True)['sessionId']


def ev(s, expr, tries=3):
    for _ in range(tries):
        try:
            r = cdp('Runtime.evaluate', session_id=s, expression=expr,
                    returnByValue=True, awaitPromise=True)
            return r.get('result', {}).get('value')
        except Exception:
            time.sleep(3)
    return None


def on_login_page(s):
    """A rendered password field, or a login-ish URL, means we're signed out."""
    URL_JS = "location.href"
    PW_JS = "document.querySelectorAll('input[type=password]').length"
    url = (ev(s, URL_JS) or '').lower()
    pw = ev(s, PW_JS)
    return url, (bool(pw) if pw is not None else None)


def try_relogin(s, site, secrets):
    """Fill the login form generically: first visible user field, then password."""
    user = secrets.get(site['user_key'], '')
    pw = secrets.get(site['pass_key'], '')
    if not user or not pw:
        return False, 'no stored credentials'

    cdp('Page.navigate', session_id=s, url=site['login'])
    time.sleep(9)

    filled = ev(s, FILL_JS % (json.dumps(USER_SELECTORS), json.dumps(user)))
    if filled != 'filled':
        return False, 'username field not found'

    # two-step logins (Auth0/Toast) show the password field only after "Continue"
    has_pw = ev(s, "document.querySelectorAll('input[type=password]').length")
    if not has_pw:
        ev(s, SUBMIT_JS)
        time.sleep(7)
    filled = ev(s, FILL_JS % (json.dumps(PASS_SELECTORS), json.dumps(pw)))
    if filled != 'filled':
        return False, 'password field not found'

    clicked = ev(s, SUBMIT_JS)
    time.sleep(10)

    url_after, pw_after = on_login_page(s)
    if pw_after:                      # still a password box on screen -> not signed in
        return False, 'still on the sign-in page (2FA prompt or rejected password?)'
    if any(m in url_after for m in site['dead']) and 'toasttab.com/restaurants' not in url_after:
        return False, 'redirected back to sign-in ({})'.format(url_after[:60])
    return True, 'signed in ({})'.format(str(clicked))


secrets = load_secrets()
problems = []
relogged = []

for site in SITES:
    try:
        pats = site['dead']
        tabs = [t for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'page']
        parked = any(site['host'] in (t['url'] or '').lower()
                     and any(p in (t['url'] or '').lower() for p in pats) for t in tabs)

        s = attach(site['host'] if not parked else site['host'])
        cdp('Page.navigate', session_id=s, url=site['url'])
        time.sleep(11)

        final, pw = on_login_page(s)
        title = (ev(s, 'document.title') or '').lower()
        body = (ev(s, "document.body ? document.body.innerText.slice(0,1200).toLowerCase() : ''") or '')

        dead = bool(pw) or any(m in final or m in title for m in pats) or 'sign in to' in body
        if not dead:
            continue

        # session is gone — try to repair it with the stored credentials
        ok, detail = try_relogin(s, site, secrets)
        if ok:
            relogged.append("{}: {}".format(site['name'], detail))
            log("AUTO-RELOGIN {} — {}".format(site['name'], detail))
        else:
            log("RELOGIN FAILED {} — {}".format(site['name'], detail))
            problems.append("{}: session expired, auto re-login failed ({}) — needs a manual login".format(
                site['name'], detail))
    except Exception as e:
        problems.append("{}: could not check ({})".format(site['name'], str(e)[:60]))

if problems:
    print("BROWSER SESSIONS NEED ATTENTION")
    for p in problems:
        print("  •", p)
    if relogged:
        print("\n(Also re-signed in automatically: {})".format("; ".join(relogged)))
    print("\nLog in once on the shared screen and the jobs will pick the session back up.")
