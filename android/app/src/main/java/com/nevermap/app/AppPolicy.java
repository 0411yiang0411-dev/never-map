package com.nevermap.app;

import java.net.URI;

public final class AppPolicy {
    public static final String ORIGIN = "https://never-map.never-map-0411yiang0411.workers.dev";
    public static final String HOME = ORIGIN + "/?app=android";
    public static final String REPOSITORY = "https://github.com/0411yiang0411-dev/never-map";
    public static final int MAX_EXPORT_BYTES = 32 * 1024 * 1024;
    private AppPolicy() {}
    public static boolean isAppUrl(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && "never-map.never-map-0411yiang0411.workers.dev".equalsIgnoreCase(uri.getHost()) && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
    public static boolean isExternalHttps(String value) {
        try { URI uri = new URI(value); return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null; } catch (Exception ignored) { return false; }
    }
    public static String fileName(String input) {
        String safe = input == null ? "never-map.excalidraw" : input.replace('\\','/');
        safe = safe.substring(safe.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "_");
        if (safe.trim().isEmpty() || safe.equals(".") || safe.equals("..")) safe = "never-map.excalidraw";
        return safe.length() > 120 ? safe.substring(safe.length() - 120) : safe;
    }
}
