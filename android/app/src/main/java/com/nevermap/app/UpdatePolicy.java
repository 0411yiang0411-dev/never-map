package com.nevermap.app;

import java.net.URI;
import java.util.Locale;

/** Update requests never carry website passwords or GitHub credentials. */
public final class UpdatePolicy {
    public static final String REPOSITORY = "0411yiang0411-dev/never-map";
    public static final String MANIFEST_URL = "https://github.com/" + REPOSITORY + "/releases/latest/download/update.json";
    public static final long MAX_APK_BYTES = 32L * 1024 * 1024;
    private UpdatePolicy() {}

    public static boolean isRepositoryAsset(String value, String asset) {
        try {
            URI uri = new URI(value);
            return secure(uri) && "github.com".equalsIgnoreCase(uri.getHost())
                && uri.getRawQuery() == null && uri.getRawFragment() == null
                && uri.getRawPath().matches("/" + REPOSITORY + "/releases/download/android-v1\\.0\\.[1-9][0-9]*/" + asset.replace(".", "\\."));
        } catch (Exception ignored) { return false; }
    }
    public static boolean isAllowedTransferUrl(String value) {
        try {
            URI uri = new URI(value);
            if (!secure(uri)) return false;
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            if (host.equals("release-assets.githubusercontent.com") || host.equals("objects.githubusercontent.com")) return true;
            return value.equals(MANIFEST_URL) || isRepositoryAsset(value,"never-map.apk") || isRepositoryAsset(value,"update.json");
        } catch (Exception ignored) { return false; }
    }
    private static boolean secure(URI uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost()!=null && uri.getRawUserInfo()==null
            && (uri.getPort()==-1 || uri.getPort()==443) && uri.getRawFragment()==null;
    }
    public static void validateRelease(int code,String name,int minSdk,long size,String sha,String apkUrl,String packageName) {
        if (code<1 || !name.equals("1.0."+code) || minSdk<26 || size<1 || size>MAX_APK_BYTES
            || !sha.matches("[a-f0-9]{64}") || !packageName.equals("com.nevermap.app")
            || !isRepositoryAsset(apkUrl,"never-map.apk") || !apkUrl.contains("/android-v"+name+"/"))
            throw new IllegalArgumentException("更新信息格式或来源不正确");
    }
    public static boolean acceptsArchive(String expectedPackage,long expectedVersion,String installedPackage,long archiveVersion,boolean sameSigners) {
        return expectedPackage.equals(installedPackage) && expectedVersion==archiveVersion && sameSigners;
    }
}
