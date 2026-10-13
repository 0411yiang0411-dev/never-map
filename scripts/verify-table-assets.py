"""Read-only production checks; never edits user canvases or clipboard."""
import json,re,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='https://never-map.never-map-0411yiang0411.workers.dev'
def get(path):
    request=urllib.request.Request(base+path,headers={'User-Agent':'Mozilla/5.0 never-map-table-check','Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=30) as response:return response.read().decode()
page=get('/')
bundle=get(re.search(r'src="([^"]+\.js)"',page).group(1))
css=get(re.search(r'href="([^"]+\.css)"',page).group(1))
for label in ['插入表格','编辑表格','添加行','删除行','添加列','删除列','合并单元格','取消合并','完成编辑']:assert label in bundle
assert 'richTable' in bundle and '.nm-table-inline' in css and '.nm-table-properties' in css
assert '.nm-table-col-resize' in css and '.nm-table-row-resize' in css
assert '框选到边缘自动滚动' in bundle and '中键拖动平移' in bundle
assert '自动对齐：' in bundle and 'never-map-auto-align' in bundle and 'objectsSnapModeEnabled' in bundle
assert 'neverMapPen' in bundle and 'getCoalescedEvents' in bundle and 'touch-action:none' in css
status=json.loads(get('/api/status'));assert not status['paused']
(root/'.cache/table-verification.json').write_text(json.dumps({'published_table_controls':True,'structured_model':True,'quota_healthy':True,'browser_paste_visual_verification':False},indent=2),encoding='utf8')
print('PASS: live inline table/sidebar/resize assets, structured table metadata and quota status; browser interaction not visually verified')
