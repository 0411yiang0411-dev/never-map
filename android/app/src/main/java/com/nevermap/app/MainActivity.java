package com.nevermap.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int OPEN_FILE = 10, SAVE_FILE = 11;
    private WebView web;
    private FrameLayout content;
    private LinearLayout errorPanel;
    private LinearLayout nativeBar;
    private TextView errorText;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private Transfer transfer;
    private volatile File pendingExport;
    private String pendingName, pendingMime;
    private boolean mainLoadFailed;
    private String bridgeScript;
    private AppUpdater updater;

    private static class Transfer {
        String id, name, mime;
        File file;
        FileOutputStream output;
        long expected, written;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(250,249,253));
        LinearLayout bar = new LinearLayout(this);nativeBar=bar;
        bar.setGravity(Gravity.CENTER_VERTICAL);
        Button back = new Button(this); back.setText("‹"); back.setContentDescription("返回");
        back.setOnClickListener(v -> onBackPressed()); bar.addView(back,new LinearLayout.LayoutParams(dp(48),dp(44)));
        TextView brand = new TextView(this); brand.setText("never-map"); brand.setTextSize(18); brand.setTextColor(Color.rgb(35,32,49)); brand.setTypeface(null,android.graphics.Typeface.BOLD);
        bar.addView(brand,new LinearLayout.LayoutParams(0,dp(44),1)); brand.setGravity(Gravity.CENTER_VERTICAL);
        Button menu = new Button(this); menu.setText("⋮"); menu.setContentDescription("应用菜单"); menu.setOnClickListener(v -> showMenu(menu));
        bar.addView(menu,new LinearLayout.LayoutParams(dp(48),dp(44))); root.addView(bar);
        progress = new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal); root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
        content = new FrameLayout(this); root.addView(content,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
        updater=new AppUpdater(this);
        try (InputStream stream = getAssets().open("native-download.js"); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) { byte[] buffer = new byte[8192]; int count; while ((count=stream.read(buffer))!=-1) bytes.write(buffer,0,count); bridgeScript = new String(bytes.toByteArray(),StandardCharsets.UTF_8); }
        catch (Exception ignored) { bridgeScript = ""; }
        createWebView();
        if (state == null || web.restoreState(state) == null) web.loadUrl(startUrl(getIntent()));
    }

    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    private String startUrl(Intent intent) { String url = intent == null ? null : intent.getDataString(); return AppPolicy.isAppUrl(url) ? url : AppPolicy.HOME; }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(false); settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true); settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100); settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        content.addView(web,new FrameLayout.LayoutParams(-1,-1));
        makeErrorPanel();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web,"NeverMapAndroid",Collections.singleton(AppPolicy.ORIGIN),(view,message,sourceOrigin,isMainFrame,replyProxy) -> {
                if (!isMainFrame || !AppPolicy.isAppUrl(sourceOrigin.toString()) || message.getType()!=WebMessageCompat.TYPE_STRING) return;
                String body = message.getData();
                if (body == null || body.length() > 120000) return;
                files.execute(() -> receiveExport(body));
            });
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) WebViewCompat.addDocumentStartJavaScript(web,bridgeScript,Collections.singleton(AppPolicy.ORIGIN));
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (AppPolicy.isAppUrl(url)) return false;
                if (AppPolicy.isExternalHttps(url)) openExternal(url);
                return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { mainLoadFailed=false;nativeBar.setVisibility(View.VISIBLE);errorPanel.setVisibility(View.GONE);progress.setVisibility(View.VISIBLE); }
            @Override public void onPageFinished(WebView view,String url) {
                progress.setVisibility(View.GONE);CookieManager.getInstance().flush();
                if (AppPolicy.isAppUrl(url) && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) view.evaluateJavascript(bridgeScript,null);
                if (!mainLoadFailed) errorPanel.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) { if (request.isForMainFrame()) showError("连接未完成（"+error.getErrorCode()+"）\n"+error.getDescription()); }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) { if (request.isForMainFrame()) showError("网站返回 HTTP "+response.getStatusCode()); }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error) { handler.cancel();showError("HTTPS 证书验证未通过，请检查设备时间。未绕过验证。"); }
            @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail) {
                content.removeView(view);view.destroy();web=null;showError("网页进程已退出，点击重新连接恢复。已保存的本机数据仍保留。");return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view,int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);picker.addCategory(Intent.CATEGORY_OPENABLE);picker.setType("*/*");picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(picker,OPEN_FILE); } catch (Exception ignored) { fileCallback.onReceiveValue(null);fileCallback=null;toast("未找到文件选择器"); }return true;
            }
            @Override public boolean onJsBeforeUnload(WebView view,String url,String message,JsResult result) { new AlertDialog.Builder(MainActivity.this).setTitle("离开画布？").setMessage("当前可能有尚未保存的修改。").setPositiveButton("继续",(dialog,which)->result.confirm()).setNegativeButton("留在此页",(dialog,which)->result.cancel()).setOnCancelListener(dialog->result.cancel()).show();return true; }
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result) { new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(dialog,which)->result.confirm()).setOnCancelListener(dialog->result.confirm()).show();return true; }
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result) { new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(dialog,which)->result.confirm()).setNegativeButton("取消",(dialog,which)->result.cancel()).setOnCancelListener(dialog->result.cancel()).show();return true; }
        });
        web.setDownloadListener((url,agent,disposition,mime,length)->{
            if (url.startsWith("blob:") && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) web.evaluateJavascript("window.neverMapAndroidSaveBlob&&window.neverMapAndroidSaveBlob("+JSONObject.quote(url)+",'never-map-export');",null);
            else if (AppPolicy.isExternalHttps(url)) openExternal(url);
            else toast("导出需要更新 Android System WebView");
        });
    }

    private void makeErrorPanel() {
        if (errorPanel != null) content.removeView(errorPanel);
        errorPanel = new LinearLayout(this);errorPanel.setOrientation(LinearLayout.VERTICAL);errorPanel.setPadding(dp(24),dp(24),dp(24),dp(24));errorPanel.setGravity(Gravity.CENTER);errorPanel.setBackgroundColor(Color.rgb(250,249,253));
        errorText=new TextView(this);errorText.setTextSize(16);errorPanel.addView(errorText);
        Button retry=new Button(this);retry.setText("重新连接");retry.setOnClickListener(v->reload());errorPanel.addView(retry);
        Button diagnostics=new Button(this);diagnostics.setText("连接检测");diagnostics.setOnClickListener(v->{if(web==null)createWebView();web.loadUrl(AppPolicy.ORIGIN+"/connection-check.html");});errorPanel.addView(diagnostics);
        errorPanel.setVisibility(View.GONE);content.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));
    }
    private void showError(String message) {
        mainLoadFailed=true;nativeBar.setVisibility(View.VISIBLE);progress.setVisibility(View.GONE);
        android.content.pm.PackageInfo provider=WebView.getCurrentWebViewPackage();
        errorText.setText(message+"\n\n页面连接未完成，本机画布缓存没有被清除。\nWebView："+(provider==null?"未知":provider.versionName));errorPanel.setVisibility(View.VISIBLE);
    }
    private void reload() { if(web==null){createWebView();web.loadUrl(AppPolicy.HOME);}else web.reload(); }
    private void showMenu(View anchor) {
        PopupMenu menu=new PopupMenu(this,anchor);String[] names={"刷新网页","连接检测","在浏览器打开","GitHub 源码","检查更新","关于应用"};for(int i=0;i<names.length;i++)menu.getMenu().add(0,i,i,names[i]);
        menu.setOnMenuItemClickListener(item->{switch(item.getItemId()){
            case 0:reload();break;
            case 1:if(web==null)createWebView();web.loadUrl(AppPolicy.ORIGIN+"/connection-check.html");break;
            case 2:openExternal(web!=null&&AppPolicy.isAppUrl(web.getUrl())?web.getUrl():AppPolicy.HOME);break;
            case 3:openExternal(AppPolicy.REPOSITORY);break;
            case 4:updater.check(true);break;
            default:new AlertDialog.Builder(this).setTitle("never-map "+BuildConfig.VERSION_NAME).setMessage("现有个人画布的独立 Android 入口。\n触控笔和手势以网页工具为准；导出通过系统文件选择器保存。\n不包含密码，首次使用请登录原有个人账户。\n共享同一云端数据；本机缓存与系统浏览器独立。").setPositiveButton("确定",null).show();
        }return true;});menu.show();
    }
    private void openExternal(String url) { if(!AppPolicy.isExternalHttps(url))return;try{Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(url));intent.addCategory(Intent.CATEGORY_BROWSABLE);startActivity(Intent.createChooser(intent,"选择浏览器"));}catch(Exception ignored){toast("未找到浏览器");} }
    private void toast(String text) { runOnUiThread(()->{if(!isFinishing())Toast.makeText(this,text,Toast.LENGTH_LONG).show();}); }

    private void receiveExport(String body) {
        try {
            JSONObject message=new JSONObject(body);String type=message.optString("type"),id=message.optString("id");
            if(type.equals("chromeReady")){runOnUiThread(()->{if(!mainLoadFailed)nativeBar.setVisibility(View.GONE);});return;}
            if(type.equals("appMenu")){runOnUiThread(()->showMenu(web!=null?web:content));return;}
            if(type.equals("clipboard")){String text=message.optString("text");if(text.length()<=200000)runOnUiThread(()->{ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);clipboard.setPrimaryClip(ClipData.newPlainText("never-map",text));});return;}
            if(type.equals("notice")){toast(message.optString("text","导出失败"));return;}
            if(type.equals("start")){
                if(transfer!=null||pendingExport!=null){toast("请先完成上一个文件的保存");return;}
                long size=message.optLong("size",-1);if(size<0||size>AppPolicy.MAX_EXPORT_BYTES)throw new IllegalArgumentException("导出文件超过限制");
                Transfer next=new Transfer();next.id=id;next.name=AppPolicy.fileName(message.optString("name"));next.mime=message.optString("mime","application/octet-stream");next.expected=size;next.file=File.createTempFile("never-map-",".export",getCacheDir());next.output=new FileOutputStream(next.file);transfer=next;return;
            }
            if(transfer==null||!transfer.id.equals(id))return;
            if(type.equals("chunk")){byte[] bytes=Base64.decode(message.getString("data"),Base64.DEFAULT);if(transfer.written+bytes.length>transfer.expected)throw new IllegalArgumentException("文件长度不一致");transfer.output.write(bytes);transfer.written+=bytes.length;return;}
            if(type.equals("cancel")){cancelTransfer();return;}
            if(type.equals("end")){
                if(transfer.written!=transfer.expected)throw new IllegalArgumentException("文件未完整传输");transfer.output.close();pendingExport=transfer.file;pendingName=transfer.name;pendingMime=transfer.mime;transfer=null;
                runOnUiThread(()->{Intent picker=new Intent(Intent.ACTION_CREATE_DOCUMENT);picker.addCategory(Intent.CATEGORY_OPENABLE);picker.setType(pendingMime.matches("[\\w.+-]+/[\\w.+-]+")?pendingMime:"application/octet-stream");picker.putExtra(Intent.EXTRA_TITLE,pendingName);try{startActivityForResult(picker,SAVE_FILE);}catch(Exception ignored){discardPending();toast("未找到文件保存器");}});
            }
        }catch(Exception ignored){cancelTransfer();toast("文件导出失败，原画布未改变");}
    }
    private void cancelTransfer() { if(transfer!=null){try{transfer.output.close();}catch(Exception ignored){}transfer.file.delete();transfer=null;} }
    private void discardPending() { File pending=pendingExport;pendingExport=null;if(pending!=null)pending.delete(); }

    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==OPEN_FILE){if(fileCallback==null)return;Uri[] selected=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){selected=new Uri[data.getClipData().getItemCount()];for(int i=0;i<selected.length;i++)selected[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)selected=new Uri[]{data.getData()};}fileCallback.onReceiveValue(selected);fileCallback=null;}
        if(request==SAVE_FILE){final Uri destination=result==RESULT_OK&&data!=null?data.getData():null;final File source=pendingExport;pendingExport=null;if(source==null)return;files.execute(()->{try{if(destination!=null){try(InputStream input=new FileInputStream(source);OutputStream output=getContentResolver().openOutputStream(destination)){if(output==null)throw new IllegalStateException();byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}toast("文件已保存");}}catch(Exception ignored){toast("文件未能保存，原画布仍保留");}finally{source.delete();}});}
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent);setIntent(intent);String url=intent.getDataString();if(AppPolicy.isAppUrl(url)){if(web==null)createWebView();web.loadUrl(url);} }
    @Override public void onBackPressed() { if(web!=null&&web.canGoBack())web.goBack();else moveTaskToBack(true); }
    @Override protected void onSaveInstanceState(Bundle state) { if(web!=null)web.saveState(state);super.onSaveInstanceState(state); }
    @Override protected void onPause() { if(web!=null){if(AppPolicy.isAppUrl(web.getUrl()))web.evaluateJavascript("window.dispatchEvent(new Event('never-map-pause'));",null);web.onPause();}CookieManager.getInstance().flush();super.onPause(); }
    @Override protected void onResume() { super.onResume();if(web!=null){web.onResume();if(AppPolicy.isAppUrl(web.getUrl()))web.evaluateJavascript("window.dispatchEvent(new Event('never-map-resume'));",null);}if(updater!=null)updater.onResume(); }
    @Override protected void onDestroy() { if(updater!=null)updater.close();if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null){content.removeView(web);web.destroy();}files.execute(()->{cancelTransfer();discardPending();});files.shutdown();super.onDestroy(); }
}
