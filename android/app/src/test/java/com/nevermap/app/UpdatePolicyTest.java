package com.nevermap.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class UpdatePolicyTest {
    private static final String APK="https://github.com/0411yiang0411-dev/never-map/releases/download/android-v1.0.6/never-map.apk";
    @Test public void rejectsOtherRepositoriesSchemesCredentialsAndRedirects(){
        assertTrue(UpdatePolicy.isAllowedTransferUrl(UpdatePolicy.MANIFEST_URL));
        assertTrue(UpdatePolicy.isRepositoryAsset(APK,"never-map.apk"));
        assertTrue(UpdatePolicy.isAllowedTransferUrl("https://release-assets.githubusercontent.com/github-production-release-asset/abc?token=example"));
        assertFalse(UpdatePolicy.isAllowedTransferUrl(APK.replace("https:","http:")));
        assertFalse(UpdatePolicy.isAllowedTransferUrl(APK.replace("never-map/","other/")));
        assertFalse(UpdatePolicy.isAllowedTransferUrl(APK.replace("github.com/","github.com.evil.example/")));
        assertFalse(UpdatePolicy.isAllowedTransferUrl(APK.replace("github.com/","user@github.com/")));
        assertFalse(UpdatePolicy.isAllowedTransferUrl("https://evil.example/update.apk"));
        assertFalse(UpdatePolicy.isRepositoryAsset(APK+"?other=package","never-map.apk"));
        assertFalse(UpdatePolicy.isRepositoryAsset(APK.replace("/never-map.apk","/never-mapXapk"),"never-map.apk"));
    }
    @Test public void validatesManifestIdentitySizeChecksumAndMatchingVersion(){
        String sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";UpdatePolicy.validateRelease(6,"1.0.6",26,1000000,sha,APK,"com.nevermap.app");
        assertThrows(IllegalArgumentException.class,()->UpdatePolicy.validateRelease(7,"1.0.7",26,1000000,sha,APK,"com.nevermap.app"));
        assertThrows(IllegalArgumentException.class,()->UpdatePolicy.validateRelease(6,"1.0.6",26,UpdatePolicy.MAX_APK_BYTES+1,sha,APK,"com.nevermap.app"));
        assertThrows(IllegalArgumentException.class,()->UpdatePolicy.validateRelease(6,"1.0.6",26,1000000,"invalid",APK,"com.nevermap.app"));
    }
    @Test public void rejectsWrongPackageVersionAndSigningIdentity(){
        assertTrue(UpdatePolicy.acceptsArchive("com.nevermap.app",6,"com.nevermap.app",6,true));
        assertFalse(UpdatePolicy.acceptsArchive("com.nevermap.app",6,"other.app",6,true));
        assertFalse(UpdatePolicy.acceptsArchive("com.nevermap.app",6,"com.nevermap.app",5,true));
        assertFalse(UpdatePolicy.acceptsArchive("com.nevermap.app",6,"com.nevermap.app",6,false));
    }
}
