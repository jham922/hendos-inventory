#!/usr/bin/env python3
"""One-shot secret capture form (reachable only over the tailnet).

Usage: secret-capture.py <url-token> [timeout-minutes]

Serves a small form at /<token>. On submit it writes the credentials to
/root/.hermes/secrets/vendor-logins.env (mode 600) and shuts itself down.
Nothing is logged; values never appear in chat or in this process's stdout.
"""
import http.server
import os
import re
import socketserver
import sys
import threading
import time
import urllib.parse

SECRETS_DIR = "/root/.hermes/secrets"
OUT = os.environ.get("SECRET_OUT", os.path.join(SECRETS_DIR, "vendor-logins.env"))
TOKEN = sys.argv[1]
TIMEOUT_MIN = int(sys.argv[2]) if len(sys.argv) > 2 else 45
PORT = int(os.environ.get("SECRET_PORT", "8080"))
PROFILE = (sys.argv[3] if len(sys.argv) > 3 else os.environ.get("SECRET_PROFILE", "vendors")).lower()

PROFILES = {
    "vendors": [
        ("proof_user", "Proof (Southern Glazer's) — username / email"),
        ("proof_pass", "Proof — password"),
        ("sip_user", "SipMarket (Gate City) — username / email"),
        ("sip_pass", "SipMarket — password"),
    ],
    "toast": [
        ("toast_user", "Toast — username / email"),
        ("toast_pass", "Toast — password"),
    ],
}

ENV_KEYS = {
    "proof_user": "PROOF_USERNAME",
    "proof_pass": "PROOF_PASSWORD",
    "sip_user": "SIPMARKET_USERNAME",
    "sip_pass": "SIPMARKET_PASSWORD",
    "toast_user": "TOAST_USERNAME",
    "toast_pass": "TOAST_PASSWORD",
}
KEY_ORDER = ["PROOF_USERNAME", "PROOF_PASSWORD", "SIPMARKET_USERNAME", "SIPMARKET_PASSWORD",
             "TOAST_USERNAME", "TOAST_PASSWORD"]
FIELDS = PROFILES[PROFILE]

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vendor logins</title>
<style>
 body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#12141a;color:#e8eaf0;
      display:flex;justify-content:center;padding:40px 16px;margin:0}}
 .card{{background:#1c1f28;border:1px solid #2c3040;border-radius:14px;padding:28px;max-width:520px;width:100%}}
 h1{{font-size:19px;margin:0 0 6px}} p{{color:#9aa3b8;font-size:14px;line-height:1.5;margin:0 0 20px}}
 label{{display:block;font-size:13px;margin:14px 0 5px;color:#c3c9d8}}
 input{{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:9px;border:1px solid #333850;
        background:#14161d;color:#fff;font-size:15px}}
 button{{margin-top:22px;width:100%;padding:13px;border:0;border-radius:9px;background:#3b6ef5;color:#fff;
         font-size:15px;font-weight:600;cursor:pointer}}
 .note{{font-size:12px;color:#6f7789;margin-top:16px;line-height:1.5}}
</style></head><body><div class="card">
<h1>Vendor portal logins</h1>
<p>These are stored in a locked file on the server (owner-only), used only by the Thursday
invoice job. They are never displayed back to you or sent anywhere else.</p>
<form method="post" action="/{token}">
{fields}
<button type="submit">Save securely</button>
</form>
<p class="note">After saving, this page shuts itself down and the link stops working.</p>
</div></body></html>"""

DONE = """<!doctype html><html><head><meta charset="utf-8"><title>Saved</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#12141a;color:#e8eaf0;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
h1{font-size:20px}p{color:#9aa3b8;font-size:14px}</style></head><body><div>
<h1>&#10003; Saved</h1><p>Stored securely. You can close this tab.</p></div></body></html>"""


def render_form():
    parts = []
    for name, label in FIELDS:
        ptype = "password" if "pass" in name else "text"
        parts.append(f'<label for="{name}">{label}</label>')
        parts.append(f'<input id="{name}" name="{name}" type="{ptype}" autocomplete="off" required>')
    return PAGE.format(token=TOKEN, fields="\n".join(parts))


def write_secrets(data):
    """Merge submitted fields into the env file, preserving keys from earlier runs."""
    existing = {}
    if os.path.exists(OUT):
        with open(OUT) as fh:
            for line in fh:
                m = re.match(r"^([A-Z_]+)='(.*)'$", line.rstrip("\n"))
                if m:
                    existing[m.group(1)] = m.group(2)
    for field, raw in data.items():
        key = ENV_KEYS.get(field)
        value = (raw or "").strip()
        if key and value:
            existing[key] = value
    ordered = [k for k in KEY_ORDER if k in existing] + [k for k in existing if k not in KEY_ORDER]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.chmod(os.path.dirname(OUT), 0o700)
    lines = [
        "# Portal logins for automation (Toast reports, vendor invoice pulls).",
        "# Owner-only (600). Written by secret-capture.py; values are never echoed back.",
        "# Last updated {}.".format(time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())),
        "",
    ]
    for key in ordered:
        lines.append("{}={}".format(key, "'" + existing[key].replace("'", "'\\''") + "'"))
    tmp = OUT + ".tmp"
    with open(tmp, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, OUT)
    os.chmod(OUT, 0o600)
    return sorted(existing.keys())


class Handler(http.server.BaseHTTPRequestHandler):
    saved = False

    def log_message(self, *args):
        pass  # stay quiet — no request logging

    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.rstrip("/") == "/" + TOKEN:
            self._send(200, render_form())
        else:
            self._send(404, "<h1>Not found</h1>")

    def do_POST(self):
        if self.path.rstrip("/") != "/" + TOKEN:
            self._send(404, "<h1>Not found</h1>")
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode()
        data = {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}
        filled = write_secrets(data)
        Handler.saved = True
        self._send(200, DONE)
        print("saved fields: {}".format(", ".join(filled)), flush=True)
        threading.Thread(target=self._shutdown_soon, daemon=True).start()

    def _shutdown_soon(self):
        time.sleep(1.0)
        os._exit(0)


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("capture form live on 127.0.0.1:{} (token path hidden), auto-exit in {} min".format(
            PORT, TIMEOUT_MIN), flush=True)
        watchdog = threading.Timer(TIMEOUT_MIN * 60, lambda: os._exit(0))
        watchdog.daemon = True
        watchdog.start()
        httpd.serve_forever()


if __name__ == "__main__":
    main()
