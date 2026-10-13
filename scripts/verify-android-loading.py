import json,re,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='https://never-map.never-map-0411yiang0411.workers.dev'
def get(path):
 request=urllib.request.Request(base+path,headers={'User-Agent':'Mozilla/5.0 (Linux; Android 10; Redmi Pad) AppleWebKit/537.36 Chrome/79.0 Mobile Safari/537.36','Cache-Control':'no-cache'})
 with urllib.request.urlopen(request,timeout=30) as response:return response.read().decode(),response.headers.get('Content-Type','')
html,_=get('/?release=compat20261013');entry=re.search(r'src="([^"]+\.js)"',html).group(1);bundle,mime=get(entry)
assert 'javascript' in mime and 'pressurePenV2' in bundle
diagnostic,mime=get('/connection-check.html');assert 'text/html' in mime and 'XMLHttpRequest' in diagnostic
old,oldmime=get('/assets/index-Cy9WxT56.js');assert 'javascript' in oldmime and 'pressurePenV2' in old
recovery,mime=get('/assets/index-B9Bxy0Ju.js');assert 'javascript' in mime and 'location.replace' in recovery
status=json.loads(get('/api/status')[0]);assert not status['paused']
(root/'.cache/android-loading-verification.json').write_text(json.dumps({'android_ua_http':True,'entry':entry,'previous_release_retained':True,'removed_entry_recovery':True,'diagnostic_page':True,'quota_healthy':True,'physical_redmi_verified':False},indent=2))
print('PASS: Android UA homepage/main JS, previous JS MIME, stale-entry recovery, diagnostic page and quota; physical tablet not verified')
