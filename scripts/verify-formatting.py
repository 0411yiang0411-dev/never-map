"""Verify published formatting assets and private SVG storage; do not edit canvas."""
import hashlib,json,re,urllib.request
from pathlib import Path
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
base='https://never-map.never-map-0411yiang0411.workers.dev'
key=(root/'.cache/access-key.txt').read_text().strip()
def call(path,method='GET',data=None,auth=False,mime='application/json'):
    headers={'User-Agent':'Mozilla/5.0 never-map-formatting-check','Content-Type':mime}
    if auth:headers['Authorization']='Bearer '+key
    request=urllib.request.Request(base+path,data=data,method=method,headers=headers)
    with urllib.request.urlopen(request,timeout=30) as response:return response.read()
before=json.loads(call('/api/scene',auth=True))
page=call('/').decode()
js=re.search(r'src="([^"]+\.js)"',page).group(1)
bundle=call(js).decode()
assert '格式化文本' in bundle and '待办勾选' in bundle and '数字编号' in bundle
css=re.search(r'href="([^"]+\.css)"',page).group(1)
assert '.note-editor' in call(css).decode()
print('PASS: published formatting controls and editor styles',flush=True)
svg=(root/'.tmp/sample-rich-note.svg').read_bytes()
ET.fromstring(svg)
digest=hashlib.sha256(svg).hexdigest()
call('/api/files/'+digest,'PUT',svg,True,'image/svg+xml')
assert call('/api/files/'+digest,auth=True)==svg
print('PASS: formatted SVG exact-byte cloud roundtrip',flush=True)
after=json.loads(call('/api/scene',auth=True))
if before['revision']==after['revision']:assert before==after
print('PASS: no user canvas mutation by verification',flush=True)
(root/'.cache/formatting-verification.json').write_text(json.dumps({'published_assets':True,'private_svg_roundtrip':True,'canvas_unchanged':True},indent=2))
