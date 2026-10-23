"""Small Meta Graph helper. Reads the token from School-OS/.env; never prints it.
usage: python graph.py list            -> templates on the WhatsApp account (name, category, status, language)
       python graph.py create file.json -> create one template from a JSON body
       python graph.py phone            -> phone number's display name and quality
"""
import json, sys, urllib.request, urllib.error

ENV = r"C:\Users\chala\Desktop\School-OS\.env"
vals = {}
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip().strip('"').strip("'")
TOKEN = vals["WHATSAPP_ACCESS_TOKEN"]
WABA = vals["WHATSAPP_BUSINESS_ACCOUNT_ID"]
VER = vals.get("WHATSAPP_GRAPH_API_VERSION") or "v21.0"
if not VER.startswith("v"):
    VER = "v" + VER
BASE = f"https://graph.facebook.com/{VER}"


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


cmd = sys.argv[1]
if cmd == "list":
    st, d = call("GET", f"/{WABA}/message_templates?fields=name,category,status,language,rejected_reason&limit=100")
    print(st)
    for t in d.get("data", []):
        print(t.get("name"), t.get("category"), t.get("status"), t.get("language"), t.get("rejected_reason", ""))
    if "error" in d:
        print(d["error"].get("message"), d["error"].get("code"))
elif cmd == "phone":
    st, d = call("GET", f"/{vals['WHATSAPP_PHONE_NUMBER_ID']}?fields=display_phone_number,verified_name,quality_rating")
    print(st, {k: v for k, v in d.items() if k != "id"})
elif cmd == "create":
    body = json.load(open(sys.argv[2], encoding="utf-8"))
    st, d = call("POST", f"/{WABA}/message_templates", body)
    print(st, d)
