"""Native two-client checks on newly created disposable verification canvases.
Never writes the user's existing main canvas. Cleanup uses exact recorded IDs.
"""
import json,re,urllib.request,urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='https://never-map.never-map-0411yiang0411.workers.dev'
owner=(root/'.cache/access-key.txt').read_text().strip()
shared=(root/'.cache/share-key.txt').read_text().strip()
created=[]
def call(path,method='GET',data=None,token=owner):
    request=urllib.request.Request(base+path,method=method,data=json.dumps(data).encode() if data is not None else None,
        headers={'User-Agent':'Mozilla/5.0 never-map-multi-check','Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response:
        if response.status==204:return {'unchanged':True}
        content=response.read()
        return json.loads(content) if 'application/json' in response.headers.get('Content-Type','') else content.decode()
initial=call('/api/scene')
main=call('/api/canvases/main/scene')
if main['revision']==initial['revision']:assert main['scene']==initial['scene']
print('PASS: existing main canvas and legacy API preserved',flush=True)
listing=call('/api/canvases')
assert any(c['id']=='main' for c in listing['canvases'])
for name in ['临时同步核验 A','临时同步核验 B']:
    new=call('/api/canvases','POST',{'name':name});created.append({'id':new['id'],'name':name})
    (root/'.cache/multi-verification-created.json').write_text(json.dumps(created,ensure_ascii=False),encoding='utf8')
a,b=created
call('/api/canvases/'+a['id'],'PATCH',{'name':'临时同步核验 A（已重命名）'})
a['name']='临时同步核验 A（已重命名）'
(root/'.cache/multi-verification-created.json').write_text(json.dumps(created,ensure_ascii=False),encoding='utf8')
print('PASS: canvas creation and rename with stable IDs',flush=True)
path='/api/canvases/'+a['id']+'/scene'
scene={'elements':[{'id':'verification','type':'rectangle','version':1,'x':0,'y':0,'width':80,'height':50}],'files':{},'appState':{'viewBackgroundColor':'#ffffff'}}
result=call(path,'PUT',{'revision':0,'scene':scene})
assert call(path,token=shared)['scene']==scene
assert call('/api/canvases/'+b['id']+'/scene',token=shared)['scene'] is None
assert call(path+'?after='+str(result['revision']),token=shared)['unchanged']
print('PASS: other authenticated client receives changes; canvases isolated',flush=True)
empty={'elements':[],'files':{},'appState':{'viewBackgroundColor':'#ffffff'}}
latest=call(path,'PUT',{'revision':result['revision'],'scene':empty})
assert call(path,token=shared)['scene']==empty
try:
    call(path,'PUT',{'revision':result['revision'],'scene':scene},shared)
    raise AssertionError('stale client overwrote newer canvas')
except urllib.error.HTTPError as error:assert error.code==409
print('PASS: deletion replicated; stale-device overwrite rejected',flush=True)
share=call('/api/share?canvas='+a['id'])
assert share['url'].endswith('&canvas='+a['id'])
main=call('/api/canvases/main/scene');legacy=call('/api/scene')
if main['revision']==legacy['revision']:assert main['scene']==legacy['scene']
print('PASS: per-canvas share link and main canvas compatibility',flush=True)
page=call('/')
asset=re.search(r'src="([^"]+\.js)"',page).group(1)
bundle=call(asset)
assert '新建画布' in bundle and '重命名' in bundle
(root/'.cache/multi-canvas-verification.json').write_text(json.dumps({'create_rename':True,'isolation':True,'two_client_changes_deletions':True,'stale_conflict':True,'share_target':True,'published_controls':True},indent=2),encoding='utf8')
print('PASS: deployed canvas-management assets',flush=True)
