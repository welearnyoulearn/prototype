#!/usr/bin/env python3
"""Generic Google Play uploader (Android Publisher API v3).

  play-upload.py --pkg PKG --status                      # show tracks / versionCodes
  play-upload.py --pkg PKG --aab FILE [--track production] [--name 1.0.6]
                 [--notes "en-US=text" ...] [--rollout draft|completed|inProgress --fraction 0.2]
                 [--quota-project wlyl-512003] [--commit]

Without --commit: validates the edit, then deletes it (dry run).
Auth: `gcloud auth application-default print-access-token` (needs the androidpublisher scope).
"""
import argparse, json, subprocess, sys, urllib.request, urllib.error

ap = argparse.ArgumentParser()
ap.add_argument('--pkg', required=True)
ap.add_argument('--aab')
ap.add_argument('--track', default='production')
ap.add_argument('--name')
ap.add_argument('--notes', action='append', default=[], help='lang=text, repeatable')
ap.add_argument('--rollout', default='draft', choices=['draft', 'completed', 'inProgress', 'halted'])
ap.add_argument('--fraction', type=float)
ap.add_argument('--quota-project', default='wlyl-512003')
ap.add_argument('--status', action='store_true')
ap.add_argument('--commit', action='store_true')
a = ap.parse_args()

API = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{a.pkg}'
UP = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{a.pkg}'
TOKEN = subprocess.check_output(['gcloud', 'auth', 'application-default', 'print-access-token'], text=True).strip()


def call(method, url, body=None, data=None, ctype=None):
    h = {'Authorization': f'Bearer {TOKEN}', 'x-goog-user-project': a.quota_project}
    if body is not None:
        data, ctype = json.dumps(body).encode(), 'application/json'
    if ctype:
        h['Content-Type'] = ctype
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=900) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {url}\n-> {e.code} {e.read().decode()[:2000]}')


edit = call('POST', f'{API}/edits', {})['id']
E, U = f'{API}/edits/{edit}', f'{UP}/edits/{edit}'

if a.status:
    for t in call('GET', f'{E}/tracks').get('tracks', []):
        for r in t.get('releases', []):
            print(f"{t['track']:12} {r.get('status',''):11} {r.get('name','')!s:20} codes={r.get('versionCodes')}")
    call('DELETE', E)
    sys.exit(0)

if not a.aab:
    sys.exit('--aab required (or --status)')
with open(a.aab, 'rb') as f:
    b = call('POST', f'{U}/bundles?uploadType=media', data=f.read(), ctype='application/octet-stream')
code = str(b['versionCode'])
print('uploaded bundle versionCode', code)

rel = {'name': a.name or code, 'versionCodes': [code], 'status': a.rollout}
if a.fraction:
    rel['userFraction'] = a.fraction
notes = [dict(zip(('language', 'text'), n.split('=', 1))) for n in a.notes]
if notes:
    for n in notes:
        n['text'] = n['text'][:500]
    rel['releaseNotes'] = notes
call('PUT', f'{E}/tracks/{a.track}', {'track': a.track, 'releases': [rel]})
print(f'track {a.track}: {rel["name"]} ({a.rollout})')

if a.commit:
    print('committed edit', call('POST', f'{E}:commit').get('id'))
else:
    call('POST', f'{E}:validate'); call('DELETE', E)
    print('dry run OK: edit validated and deleted (add --commit)')
