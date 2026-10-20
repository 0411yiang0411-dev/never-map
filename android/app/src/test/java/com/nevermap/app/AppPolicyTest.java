package com.nevermap.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class AppPolicyTest {
    @Test public void permitsOnlyExactHttpsOriginForAppAndSharedLinks() {
        assertTrue(AppPolicy.isAppUrl(AppPolicy.HOME));
        assertTrue(AppPolicy.isAppUrl(AppPolicy.ORIGIN + "/#share=example&canvas=main"));
        assertFalse(AppPolicy.isAppUrl("http://never-map.never-map-0411yiang0411.workers.dev"));
        assertFalse(AppPolicy.isAppUrl(AppPolicy.ORIGIN + ".evil.example"));
        assertFalse(AppPolicy.isAppUrl("https://user@never-map.never-map-0411yiang0411.workers.dev"));
        assertFalse(AppPolicy.isAppUrl(AppPolicy.ORIGIN + ":444"));
        assertFalse(AppPolicy.isAppUrl("javascript:alert(1)"));
        assertFalse(AppPolicy.isAppUrl("file:///data/data/com.nevermap.app"));
    }
    @Test public void stripsExportPathsAndControlCharacters() {
        assertEquals("drawing.excalidraw", AppPolicy.fileName("../../drawing.excalidraw"));
        assertEquals("drawing.png", AppPolicy.fileName("C:\\fakepath\\drawing.png"));
        assertEquals("never-map.excalidraw", AppPolicy.fileName(".."));
        assertEquals("a_b.png", AppPolicy.fileName("a\nb.png"));
    }
}
