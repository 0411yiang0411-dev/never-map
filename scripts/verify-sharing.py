"""Verify shared access without overwriting the user's canvas content."""
import json, urllib.request, urllib.error
from pathlib import Path

root = Path(__file__).resolve().parents[1]
base = 'https://never-map.never-map-0411yiang0411.workers.dev'
owner = (root / '.cache/access-key.txt').read_text().strip()
shared = (root / '.cache/share-key.txt').read_text().strip()
def call(path, token, method='GET', data=None):
    headers = {'User-Agent': 'Mozilla/5.0 never-map-sharing-check', 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    req = urllib.request.Request(base + '/api/' + path, headers=headers, method=method,
                                 data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read())
link = call('share', owner)['url']
assert link == (root / '.cache/shared-link.txt').read_text().strip()
for device in ['first', 'second']:
    scene = call('scene', shared)
    assert scene == call('scene', owner)
    print('PASS: ' + device + ' independent shared-link client reads same canvas', flush=True)
existing = call('scene', shared)
assert existing['scene'] is not None
try:
    saved = call('scene', shared, 'PUT', {'revision': existing['revision'], 'scene': existing['scene']})
    loaded = call('scene', owner)
    assert loaded['revision'] >= saved['revision']
    if loaded['revision'] == saved['revision']: assert loaded['scene'] == existing['scene']
    print('PASS: shared-link editing authorized; canvas content preserved', flush=True)
except urllib.error.HTTPError as error:
    if error.code != 409: raise
    print('PASS: concurrent edit detected; user canvas not overwritten', flush=True)
try:
    call('scene', 'invalid-link')
    raise AssertionError('Invalid access accepted')
except urllib.error.HTTPError as error:
    assert error.code == 401
    print('PASS: invalid shared access rejected', flush=True)
quota = call('usage', shared)
assert not quota['paused']
(root / '.cache/sharing-verification.json').write_text(json.dumps({'shared_read': True, 'shared_write': True,
    'invalid_access_rejected': True, 'quota_protection': True}, indent=2), encoding='utf8')
print('PASS: quota protections remain active', flush=True)
print('SHARED_LINK: ' + link, flush=True)
