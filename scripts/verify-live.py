"""Verify this new personal deployment without logging any credentials."""
import base64, hashlib, json, re, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://never-map.never-map-0411yiang0411.workers.dev'
key = (ROOT / '.cache/access-key.txt').read_text().strip()
report = {'url': URL, 'checks': [], 'utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
def call(path, method='GET', data=None, content_type='application/json', auth=True):
    headers = {'Content-Type': content_type, 'User-Agent': 'Mozilla/5.0 never-map-verification'}
    if auth: headers['Authorization'] = 'Bearer ' + key
    if data is not None and not isinstance(data, bytes): data = json.dumps(data).encode()
    req = urllib.request.Request(URL + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=45) as response:
        body = response.read()
        return json.loads(body) if 'application/json' in response.headers.get('Content-Type', '') else body
def ok(name): report['checks'].append(name); print('PASS: ' + name, flush=True)

page = call('/', auth=False).decode()
assert 'never-map' in page
script = re.search(r'src="([^"]+\.js)"', page).group(1)
assert len(call(script, auth=False)) > 1000
ok('public HTML and editor JavaScript')
assert call('/api/config', auth=False)['cloudEnabled']
ok('cloud storage enabled')
state = call('/api/reconcile', 'POST', data={})
assert not state['paused'], state
ok('account-wide quota verified, below stop threshold')
existing = call('/api/scene')
assert existing['scene'] is None, 'Live canvas already contains data; do not overwrite it'
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
digest = hashlib.sha256(png).hexdigest()
call('/api/files/' + digest, 'PUT', png, 'image/png')
assert call('/api/files/' + digest) == png
ok('private R2 image upload and exact-byte reload')
scene = {'elements': [], 'appState': {'viewBackgroundColor': '#ffffff'}, 'files': {'verify-pixel': {'id': 'verify-pixel', 'key': digest, 'mimeType': 'image/png', 'created': int(time.time()*1000)}}}
saved = call('/api/scene', 'PUT', {'revision': existing['revision'], 'scene': scene})
loaded = call('/api/scene')
assert loaded['revision'] == saved['revision'] and loaded['scene'] == scene
ok('D1 scene save and reload')
blank = {'elements': [], 'appState': {'viewBackgroundColor': '#ffffff'}, 'files': {}}
call('/api/scene', 'PUT', {'revision': saved['revision'], 'scene': blank})
assert call('/api/scene')['scene'] == blank
ok('initial canvas left blank after verification')
report['quota'] = call('/api/usage')
report['status'] = call('/api/status', auth=False)
assert not report['status']['paused']
ok('public quota monitor endpoint')
(ROOT / '.cache/live-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print('Verification report saved; no secrets printed.', flush=True)
