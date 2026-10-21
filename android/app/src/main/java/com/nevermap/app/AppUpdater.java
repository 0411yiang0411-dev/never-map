package com.nevermap.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class AppUpdater {
    private final Activity activity;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private volatile boolean busy,cancelled,closed;
    private volatile HttpURLConnection connection;
    private AlertDialog dialog;
    private File readyApk;
    private Release readyRelease;
    private boolean waitingPermission;
    private static final long DAY=24L*60*60*1000;

    private static final class Release {
        int code,minSdk;long size;String name,sha,url,notes;
        static Release parse(byte[] bytes) throws Exception {
            JSONObject json=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
            if(json.getInt("schema")!=1)throw new IOException("不支持的更新信息版本");
            Release r=new Release();r.code=json.getInt("versionCode");r.name=json.getString("versionName");r.minSdk=json.getInt("minSdk");
            r.size=json.getLong("size");r.sha=json.getString("sha256");r.url=json.getString("apkUrl");r.notes=json.optString("notes","");
            UpdatePolicy.validateRelease(r.code,r.name,r.minSdk,r.size,r.sha,r.url,json.getString("applicationId"));return r;
        }
    }
    AppUpdater(Activity activity){this.activity=activity;}
    private void ui(Runnable action){activity.runOnUiThread(()->{if(!closed&&!activity.isFinishing()&&!activity.isDestroyed())action.run();});}
    private void toast(String text){ui(()->Toast.makeText(activity,text,Toast.LENGTH_LONG).show());}

    void onResume(){
        if(waitingPermission){waitingPermission=false;if(activity.getPackageManager().canRequestPackageInstalls())install();else showReady();return;}
        long last=activity.getPreferences(Activity.MODE_PRIVATE).getLong("updateLastAttempt",0),now=System.currentTimeMillis();
        if(!busy && (last==0||now-last>DAY||now<last))check(false);
    }
    void check(boolean manual){
        if(busy){if(manual)toast("正在检查或下载更新，请稍候");return;}
        busy=true;cancelled=false;activity.getPreferences(Activity.MODE_PRIVATE).edit().putLong("updateLastAttempt",System.currentTimeMillis()).apply();
        if(manual)toast("正在检查更新…");
        network.execute(()->{
            try{
                Release release=Release.parse(readSmall(UpdatePolicy.MANIFEST_URL));
                if(release.code<=BuildConfig.VERSION_CODE){if(manual)toast("已是最新版（"+BuildConfig.VERSION_NAME+"）");return;}
                if(release.minSdk>Build.VERSION.SDK_INT){if(manual)toast("发现新版，但此设备的安卓版本暂不支持");return;}
                ui(()->offer(release));
            }catch(Exception error){if(manual)toast("检查更新失败："+reason(error)+"。可以稍后重试，画布不受影响。");}
            finally{busy=false;disconnect();}
        });
    }
    private void offer(Release release){
        if(dialog!=null&&dialog.isShowing())return;
        if(readyRelease!=null&&readyApk!=null&&readyApk.isFile()&&readyRelease.code==release.code&&readyRelease.sha.equals(release.sha)){showReady();return;}
        dialog=new AlertDialog.Builder(activity).setTitle("发现新版 "+release.name)
            .setMessage("当前版本 "+BuildConfig.VERSION_NAME+"\n安装包约 "+String.format(java.util.Locale.ROOT,"%.1f",release.size/1048576.0)+" MB\n\n"+release.notes+"\n\n下载后由安卓系统确认覆盖安装，保留应用数据。")
            .setNegativeButton("稍后",null).setPositiveButton("下载更新",(d,w)->download(release)).show();
    }
    private void download(Release release){
        if(busy)return;busy=true;cancelled=false;
        LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);int padding=Math.round(24*activity.getResources().getDisplayMetrics().density);box.setPadding(padding,padding,padding,padding);
        TextView text=new TextView(activity);text.setText("正在连接下载…");box.addView(text);
        ProgressBar progress=new ProgressBar(activity,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);box.addView(progress,new LinearLayout.LayoutParams(-1,-2));
        dialog=new AlertDialog.Builder(activity).setTitle("下载 never-map "+release.name).setView(box).setNegativeButton("取消下载",(d,w)->cancelDownload()).setOnCancelListener(d->cancelDownload()).show();
        network.execute(()->{
            File part=null;
            try{
                File folder=new File(activity.getCacheDir(),"updates");if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("无法创建更新缓存");
                // Only update-cache files are removed; WebView/IndexedDB directories are untouched.
                File[] stale=folder.listFiles();if(stale!=null)for(File file:stale)if(file.isFile())file.delete();
                File apk=new File(folder,"never-map-"+release.code+".apk");part=new File(folder,"download.part");
                HttpURLConnection request=open(release.url);long received=0;int shown=-1;MessageDigest digest=MessageDigest.getInstance("SHA-256");
                try(InputStream input=request.getInputStream();FileOutputStream output=new FileOutputStream(part)){
                    byte[] buffer=new byte[65536];int count;
                    while((count=input.read(buffer))!=-1){
                        if(cancelled||closed)throw new IOException("下载已取消");received+=count;
                        if(received>release.size||received>UpdatePolicy.MAX_APK_BYTES)throw new IOException("安装包大小不符合更新信息");
                        output.write(buffer,0,count);digest.update(buffer,0,count);int percent=(int)(received*100/release.size);
                        if(percent!=shown){shown=percent;ui(()->{progress.setProgress(percent);text.setText("正在下载："+percent+"%");});}
                    }
                }
                if(cancelled||closed)throw new IOException("下载已取消");
                if(received!=release.size||!hex(digest.digest()).equals(release.sha))throw new IOException("安装包校验失败，请重新检查更新");
                ui(()->text.setText("正在核验版本与签名…"));validateApk(part,release);
                if(!part.renameTo(apk))throw new IOException("无法保存已核验的安装包");
                readyApk=apk;readyRelease=release;ui(()->{dismiss();showReady();});
            }catch(Exception error){if(part!=null)part.delete();if(!cancelled&&!closed)toast("更新下载失败："+reason(error)+"。可在菜单重新检查。");ui(this::dismiss);}
            finally{busy=false;disconnect();}
        });
    }
    private void showReady(){
        if(readyApk==null||!readyApk.isFile()||readyRelease==null)return;
        dismiss();dialog=new AlertDialog.Builder(activity).setTitle("更新已准备好 · "+readyRelease.name)
            .setMessage("安装会重启应用。请先完成正在编辑的文字或表格，确认画布已保存或导出，再继续。\n\n将覆盖安装并保留本机画布与登录数据，无需卸载旧版。")
            .setNegativeButton("稍后安装",null).setPositiveButton("继续安装",(d,w)->install()).show();
    }
    private void install(){
        if(readyApk==null||!readyApk.isFile())return;
        if(!activity.getPackageManager().canRequestPackageInstalls()){
            dialog=new AlertDialog.Builder(activity).setTitle("允许此 App 安装更新")
                .setMessage("首次更新需要在系统设置中开启“允许来自此来源的应用”。开启后返回 never-map，即可进入系统安装界面。")
                .setNegativeButton("稍后",null).setPositiveButton("打开系统设置",(d,w)->{
                    try{waitingPermission=true;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}catch(Exception error){waitingPermission=false;toast("无法打开安装权限设置，请在系统应用设置中开启");}
                }).show();return;
        }
        try{
            Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",readyApk);
            Intent installer=new Intent(Intent.ACTION_VIEW);installer.setDataAndType(uri,"application/vnd.android.package-archive");installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installer.setClipData(android.content.ClipData.newRawUri("never-map update",uri));activity.startActivity(installer);
        }catch(Exception error){toast("无法打开系统安装器，可在应用菜单中重试更新");}
    }
    @SuppressWarnings("deprecation")
    private void validateApk(File apk,Release release) throws Exception{
        PackageManager manager=activity.getPackageManager();PackageInfo installed=manager.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
        PackageInfo candidate=manager.getPackageArchiveInfo(apk.getAbsolutePath(),PackageManager.GET_SIGNATURES);
        long version=candidate==null?-1:Build.VERSION.SDK_INT>=28?candidate.getLongVersionCode():candidate.versionCode;
        boolean signatures=candidate!=null && !signers(installed.signatures).isEmpty() && signers(installed.signatures).equals(signers(candidate.signatures));
        if(candidate==null||!UpdatePolicy.acceptsArchive(activity.getPackageName(),release.code,candidate.packageName,version,signatures)||version<=BuildConfig.VERSION_CODE)
            throw new IOException("安装包的应用标识、版本或签名不匹配");
    }
    private static Set<String> signers(Signature[] signatures) throws Exception{
        Set<String> result=new HashSet<>();if(signatures!=null)for(Signature signature:signatures)result.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));return result;
    }
    private byte[] readSmall(String url) throws Exception{
        HttpURLConnection request=open(url);
        try(InputStream input=request.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] bytes=new byte[4096];int size;while((size=input.read(bytes))!=-1){if(closed||output.size()+size>16384)throw new IOException("更新信息过大或请求已结束");output.write(bytes,0,size);}return output.toByteArray();
        }
    }
    private HttpURLConnection open(String value) throws IOException{
        for(int redirect=0;redirect<6;redirect++){
            if(!UpdatePolicy.isAllowedTransferUrl(value))throw new IOException("更新下载来源未通过验证");
            HttpURLConnection request=(HttpURLConnection)new URL(value).openConnection();connection=request;
            request.setInstanceFollowRedirects(false);request.setConnectTimeout(15000);request.setReadTimeout(30000);request.setUseCaches(false);
            request.setRequestProperty("User-Agent","Mozilla/5.0 never-map-Android/"+BuildConfig.VERSION_NAME);request.setRequestProperty("Cache-Control","no-cache");request.setRequestProperty("Accept-Encoding","identity");
            int code=request.getResponseCode();
            if(code>=300&&code<=399){String next=request.getHeaderField("Location");if(next==null)throw new IOException("下载重定向缺少地址");value=new URL(new URL(value),next).toString();request.disconnect();continue;}
            if(code!=200)throw new IOException(code==404?"暂未找到可用更新":"服务器返回 HTTP "+code);return request;
        }
        throw new IOException("下载重定向次数过多");
    }
    private static String reason(Exception error){String message=error.getMessage();return message==null?"网络连接未完成":message.length()>160?"网络连接未完成":message;}
    private static String hex(byte[] bytes){StringBuilder result=new StringBuilder();for(byte value:bytes)result.append(String.format(java.util.Locale.ROOT,"%02x",value&255));return result.toString();}
    private void cancelDownload(){cancelled=true;disconnect();}
    private void disconnect(){HttpURLConnection current=connection;connection=null;if(current!=null)current.disconnect();}
    private void dismiss(){if(dialog!=null){dialog.dismiss();dialog=null;}}
    void close(){closed=true;cancelDownload();dismiss();network.shutdownNow();}
}
