(function () {
  if (window.neverMapAndroidExportInstalled || !window.NeverMapAndroid) return;
  window.neverMapAndroidExportInstalled = true;
  function send(value) { window.NeverMapAndroid.postMessage(JSON.stringify(value)); }
  async function save(url, name) {
    var id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    try {
      if (!url.startsWith('blob:') || new URL(url).origin !== location.origin) return;
      var blob = await (await fetch(url)).blob();
      if (blob.size > 33554432) throw new Error('导出文件超过 32MB，请缩小 PNG 尺寸或导出画布文件');
      send({type:'start', id:id, name:name || 'never-map.excalidraw', mime:blob.type || 'application/octet-stream', size:blob.size});
      for (var offset = 0; offset < blob.size; offset += 65536) {
        var data = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result.split(',')[1]); }; reader.onerror = reject; reader.readAsDataURL(blob.slice(offset, offset + 65536)); });
        send({type:'chunk', id:id, data:data});
      }
      send({type:'end', id:id});
    } catch (error) { send({type:'cancel', id:id}); send({type:'notice', text:String(error.message || '文件导出失败')}); }
  }
  window.neverMapAndroidSaveBlob = save;
  var original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('blob:') && this.download) { save(this.href, this.download); return; } return original.call(this); };
  document.addEventListener('click', function (event) { var anchor = event.target.closest && event.target.closest('a[download]'); if (anchor && anchor.href.startsWith('blob:')) { event.preventDefault(); save(anchor.href, anchor.download); } }, true);
  var clipboard = navigator.clipboard;
  var write = function (text) { send({type:'clipboard', text:String(text)}); return Promise.resolve(); };
  try { if (clipboard) Object.defineProperty(clipboard, 'writeText', {value:write, configurable:true}); else Object.defineProperty(navigator, 'clipboard', {value:{writeText:write}, configurable:true}); } catch (ignored) {}
})();
