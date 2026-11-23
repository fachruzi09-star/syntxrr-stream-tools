package com.syntxrr.streamtools;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Pure-Java security, download-bounds, magic-byte, and bounded LRU cache policy
 * for Mode B native audience avatar rendering.
 */
public final class ModeBAvatarPolicy {
    public static final int MAX_AVATAR_URL_LENGTH = 300;
    public static final int MAX_AVATAR_REDIRECTS = 2;
    public static final int MAX_AVATAR_BYTES = 524_288; // 512 KB
    public static final int MAX_AVATAR_CACHE_ENTRIES = 24;
    public static final int MAX_AVATAR_DIMENSION_PX = 256;
    public static final long MAX_AVATAR_CACHE_PIXELS = 1_572_864L;
    public static final int CONNECT_TIMEOUT_MS = 4_000;
    public static final int READ_TIMEOUT_MS = 5_000;

    private static final Set<String> ALLOWED_MIME_TYPES = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    "image/jpeg",
                    "image/jpg",
                    "image/png",
                    "image/webp",
                    "image/gif")));

    private static final Pattern IPV4_DOTTED_PATTERN = Pattern.compile("^\\d{1,3}(?:\\.\\d{1,3}){3}$");
    private static final Pattern DIGITS_ONLY_PATTERN = Pattern.compile("^\\d+$");
    private static final Pattern HEX_OR_OCTAL_INT_PATTERN = Pattern.compile("^0[xX][0-9a-fA-F]+$");

    private ModeBAvatarPolicy() {
    }

    /**
     * Validates an audience avatar URL strictly:
     * - non-null, <= 300 chars, no embedded whitespace/control chars
     * - HTTPS only (no http, file, content, blob, data, javascript, etc.)
     * - no userinfo / credentials
     * - no non-443 explicit port
     * - rejects localhost, *.local, *.internal, *.localhost, *.arpa, single-label hosts
     * - rejects numeric loopback/private/link-local/CGNAT/multicast/reserved IPs without DNS
     *
     * Returns trimmed normalized HTTPS URL or null if rejected.
     */
    public static String validateAvatarUrl(String rawUrl) {
        if (rawUrl == null) return null;
        String trimmed = rawUrl.trim();
        if (trimmed.isEmpty() || trimmed.length() > MAX_AVATAR_URL_LENGTH) return null;

        for (int i = 0; i < trimmed.length(); i++) {
            char ch = trimmed.charAt(i);
            if (ch <= 0x20 || ch == 0x7F) return null;
        }

        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (URISyntaxException ignored) {
            return null;
        }

        String scheme = uri.getScheme();
        if (scheme == null || !"https".equalsIgnoreCase(scheme)) return null;
        if (uri.getRawUserInfo() != null) return null;

        String rawAuthority = uri.getRawAuthority();
        if (rawAuthority == null || rawAuthority.isEmpty() || rawAuthority.contains("@")) return null;

        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            // Handle bracketed IPv6 literals or host parsing edge cases cleanly
            return null;
        }

        int port = uri.getPort();
        if (port != -1 && port != 443) return null;

        String lowerHost = stripIpv6Brackets(host).toLowerCase(Locale.ROOT);
        while (lowerHost.endsWith(".")) {
            lowerHost = lowerHost.substring(0, lowerHost.length() - 1);
        }
        if (lowerHost.isEmpty()) return null;

        if ("localhost".equals(lowerHost)
                || lowerHost.endsWith(".localhost")
                || lowerHost.endsWith(".local")
                || lowerHost.endsWith(".internal")
                || lowerHost.endsWith(".arpa")
                || lowerHost.endsWith(".home")
                || lowerHost.endsWith(".lan")) {
            return null;
        }

        if (isNumericIpLiteral(lowerHost)) {
            try {
                InetAddress addr = InetAddress.getByName(lowerHost);
                if (!isSafePublicAddress(addr)) return null;
            } catch (UnknownHostException ignored) {
                return null;
            }
            return trimmed;
        }

        // Public hostnames must contain at least one dot and valid domain labels
        if (!lowerHost.contains(".")) return null;
        String[] labels = lowerHost.split("\\.");
        if (labels.length < 2) return null;
        for (String label : labels) {
            if (label.isEmpty() || label.length() > 63) return null;
            if (label.startsWith("-") || label.endsWith("-")) return null;
        }

        return trimmed;
    }

    /**
     * Resolves and validates an HTTP redirect Location header relative to currentUrl.
     */
    public static String validateRedirectTarget(String currentUrl, String locationHeader) {
        if (currentUrl == null || locationHeader == null) return null;
        String cleanLocation = locationHeader.trim();
        if (cleanLocation.isEmpty() || cleanLocation.length() > MAX_AVATAR_URL_LENGTH) return null;
        try {
            URI base = new URI(currentUrl);
            URI resolved = base.resolve(cleanLocation);
            return validateAvatarUrl(resolved.toString());
        } catch (URISyntaxException | IllegalArgumentException ignored) {
            return null;
        }
    }

    static boolean isNumericIpLiteral(String host) {
        if (host == null || host.isEmpty()) return false;
        String clean = stripIpv6Brackets(host);
        if (clean.contains(":")) return true; // IPv6 literal
        if (IPV4_DOTTED_PATTERN.matcher(clean).matches()) return true;
        if (DIGITS_ONLY_PATTERN.matcher(clean).matches()) return true;
        if (HEX_OR_OCTAL_INT_PATTERN.matcher(clean).matches()) return true;
        return false;
    }

    private static String stripIpv6Brackets(String host) {
        if (host.startsWith("[") && host.endsWith("]") && host.length() >= 2) {
            return host.substring(1, host.length() - 1);
        }
        return host;
    }

    /**
     * Verifies that an InetAddress is globally routable (never loopback, site-local,
     * link-local, multicast, CGNAT, 0.0.0.0/8, reserved, ULA, NAT64, or mapped private IPv4).
     */
    public static boolean isSafePublicAddress(InetAddress address) {
        if (address == null) return false;
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return false;
        }

        byte[] raw = address.getAddress();
        if (raw == null) return false;
        if (raw.length == 4) {
            return isSafePublicIpv4Bytes(raw, 0);
        }
        if (raw.length == 16) {
            int first = raw[0] & 0xFF;
            int second = raw[1] & 0xFF;

            // Unique local addresses fc00::/7
            if ((first & 0xFE) == 0xFC) return false;
            // Multicast ff00::/8
            if (first == 0xFF) return false;
            // Link-local fe80::/10
            if (first == 0xFE && (second & 0xC0) == 0x80) return false;

            // NAT64 well-known prefix 64:ff9b::/96
            if (first == 0x00 && second == 0x64
                    && (raw[2] & 0xFF) == 0xFF && (raw[3] & 0xFF) == 0x9B) {
                return false;
            }

            // Documentation 2001:db8::/32 or Teredo 2001:0000::/32
            if (first == 0x20 && second == 0x01) {
                int third = raw[2] & 0xFF;
                int fourth = raw[3] & 0xFF;
                if ((third == 0x0D && fourth == 0xB8) || (third == 0x00 && fourth == 0x00)) {
                    return false;
                }
            }

            // IPv4-mapped IPv6 ::ffff:a.b.c.d
            boolean isIpv4Mapped = true;
            for (int i = 0; i < 10; i++) {
                if (raw[i] != 0) {
                    isIpv4Mapped = false;
                    break;
                }
            }
            if (isIpv4Mapped && (raw[10] & 0xFF) == 0xFF && (raw[11] & 0xFF) == 0xFF) {
                return isSafePublicIpv4Bytes(raw, 12);
            }

            // IPv4-compatible IPv6 ::a.b.c.d
            boolean isIpv4Compat = true;
            for (int i = 0; i < 12; i++) {
                if (raw[i] != 0) {
                    isIpv4Compat = false;
                    break;
                }
            }
            if (isIpv4Compat) {
                return isSafePublicIpv4Bytes(raw, 12);
            }

            // 6to4 2002::/16 carrying embedded IPv4 in bytes 2..5
            if (first == 0x20 && second == 0x02) {
                return isSafePublicIpv4Bytes(raw, 2);
            }

            return true;
        }
        return false;
    }

    private static boolean isSafePublicIpv4Bytes(byte[] raw, int offset) {
        int b0 = raw[offset] & 0xFF;
        int b1 = raw[offset + 1] & 0xFF;
        int b2 = raw[offset + 2] & 0xFF;

        if (b0 == 0) return false;                                  // 0.0.0.0/8
        if (b0 == 10) return false;                                 // 10.0.0.0/8
        if (b0 == 100 && b1 >= 64 && b1 <= 127) return false;       // 100.64.0.0/10 (CGNAT)
        if (b0 == 127) return false;                                // 127.0.0.0/8
        if (b0 == 169 && b1 == 254) return false;                   // 169.254.0.0/16
        if (b0 == 172 && b1 >= 16 && b1 <= 31) return false;        // 172.16.0.0/12
        if (b0 == 192 && b1 == 0 && b2 == 0) return false;          // 192.0.0.0/24
        if (b0 == 192 && b1 == 0 && b2 == 2) return false;          // 192.0.2.0/24 (TEST-NET-1)
        if (b0 == 192 && b1 == 168) return false;                   // 192.168.0.0/16
        if (b0 == 198 && (b1 == 18 || b1 == 19)) return false;      // 198.18.0.0/15
        if (b0 == 198 && b1 == 51 && b2 == 100) return false;       // 198.51.100.0/24 (TEST-NET-2)
        if (b0 == 203 && b1 == 0 && b2 == 113) return false;        // 203.0.113.0/24 (TEST-NET-3)
        if (b0 >= 224) return false;                                // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
        return true;
    }

    public static boolean isSupportedResponseMime(String contentTypeHeader) {
        if (contentTypeHeader == null) return false;
        String baseMime = contentTypeHeader.trim().toLowerCase(Locale.ROOT);
        int semiIdx = baseMime.indexOf(';');
        if (semiIdx >= 0) {
            baseMime = baseMime.substring(0, semiIdx).trim();
        }
        return ALLOWED_MIME_TYPES.contains(baseMime);
    }

    /**
     * Inspects magic bytes of decoded download payload so HTML, SVG, or fake extensions are rejected.
     */
    public static String detectImageMimeFromBytes(byte[] bytes, int length) {
        if (bytes == null || length <= 0 || length > bytes.length) return null;

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (length >= 8
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47
                && bytes[4] == 0x0D
                && bytes[5] == 0x0A
                && bytes[6] == 0x1A
                && bytes[7] == 0x0A) {
            return "image/png";
        }

        // JPEG: FF D8 FF
        if (length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }

        // GIF: GIF87a or GIF89a
        if (length >= 6
                && bytes[0] == 'G'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == '8'
                && (bytes[4] == '7' || bytes[4] == '9')
                && bytes[5] == 'a') {
            return "image/gif";
        }

        // WebP: RIFF....WEBP
        if (length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P') {
            return "image/webp";
        }

        return null;
    }

    /**
     * Reads at most maxBytes from input stream; throws IOException if payload exceeds maxBytes.
     */
    public static byte[] readBoundedStream(InputStream input, int maxBytes) throws IOException {
        if (input == null || maxBytes <= 0) return null;
        byte[] buffer = new byte[8192];
        ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maxBytes, 16384));
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (total + read > maxBytes) {
                throw new IOException("Avatar melebihi batas ukuran maksimum.");
            }
            output.write(buffer, 0, read);
            total += read;
        }
        return total == 0 ? null : output.toByteArray();
    }

    public interface Disposer<B> {
        void dispose(B value);
    }

    /**
     * Bounded thread-safe LRU cache with pixel budget and deferred retirement queue
     * so evicted bitmaps are never destroyed while an active GL/Canvas frame might still reference them.
     */
    public static final class BoundedAvatarCache<B> {
        private static final class Entry<B> {
            final B value;
            final long pixels;

            Entry(B value, long pixels) {
                this.value = value;
                this.pixels = pixels;
            }
        }

        private final int maxEntries;
        private final long maxTotalPixels;
        private final long maxEntryPixels;
        private final LinkedHashMap<String, Entry<B>> entries;
        private final List<B> retiredQueue = new ArrayList<>();
        private long totalPixels;

        public BoundedAvatarCache() {
            this(MAX_AVATAR_CACHE_ENTRIES, MAX_AVATAR_CACHE_PIXELS,
                    (long) MAX_AVATAR_DIMENSION_PX * MAX_AVATAR_DIMENSION_PX);
        }

        public BoundedAvatarCache(int maxEntries, long maxTotalPixels, long maxEntryPixels) {
            this.maxEntries = Math.max(1, maxEntries);
            this.maxTotalPixels = Math.max(1L, maxTotalPixels);
            this.maxEntryPixels = Math.max(1L, maxEntryPixels);
            this.entries = new LinkedHashMap<>(16, 0.75f, true);
        }

        public synchronized B get(String key) {
            if (key == null) return null;
            Entry<B> entry = entries.get(key);
            return entry == null ? null : entry.value;
        }

        public synchronized boolean containsKey(String key) {
            return key != null && entries.containsKey(key);
        }

        public synchronized int size() {
            return entries.size();
        }

        public synchronized long getTotalPixels() {
            return totalPixels;
        }

        public synchronized int getRetiredQueueSize() {
            return retiredQueue.size();
        }

        /**
         * Stores value with LRU + pixel budget eviction. Evicted or replaced values are placed
         * into retiredQueue without calling Disposer immediately.
         * Returns false if pixels <= 0 or pixels exceed single-entry / total budget limit.
         */
        public synchronized boolean put(String key, B value, long pixels) {
            if (key == null || value == null || pixels <= 0L
                    || pixels > maxEntryPixels || pixels > maxTotalPixels) {
                return false;
            }

            Entry<B> previous = entries.remove(key);
            if (previous != null) {
                totalPixels = Math.max(0L, totalPixels - previous.pixels);
                if (previous.value != value) {
                    retiredQueue.add(previous.value);
                }
            }

            while (!entries.isEmpty() && (entries.size() >= maxEntries || totalPixels + pixels > maxTotalPixels)) {
                Iterator<Map.Entry<String, Entry<B>>> iterator = entries.entrySet().iterator();
                if (!iterator.hasNext()) break;
                Map.Entry<String, Entry<B>> oldest = iterator.next();
                iterator.remove();
                Entry<B> removed = oldest.getValue();
                if (removed != null) {
                    totalPixels = Math.max(0L, totalPixels - removed.pixels);
                    if (removed.value != null && removed.value != value) {
                        retiredQueue.add(removed.value);
                    }
                }
            }

            entries.put(key, new Entry<>(value, pixels));
            totalPixels += pixels;
            return true;
        }

        /**
         * Safe to invoke ONLY after drawOverlayFrame() has completed (inside renderGuard)
         * or during releaseAssets(). Never disposes any value still live in entries.
         */
        public List<B> drainRetired(Disposer<B> disposer) {
            List<B> toDispose;
            synchronized (this) {
                if (retiredQueue.isEmpty()) return Collections.emptyList();
                Set<B> liveValues = new HashSet<>();
                for (Entry<B> entry : entries.values()) {
                    if (entry != null && entry.value != null) {
                        liveValues.add(entry.value);
                    }
                }
                toDispose = new ArrayList<>(retiredQueue.size());
                for (B value : retiredQueue) {
                    if (value != null && !liveValues.contains(value)) {
                        toDispose.add(value);
                    }
                }
                retiredQueue.clear();
            }
            if (disposer != null) {
                for (B value : toDispose) {
                    try {
                        disposer.dispose(value);
                    } catch (RuntimeException ignored) {
                    }
                }
            }
            return toDispose;
        }

        public void clearAll(Disposer<B> disposer) {
            List<B> allValues;
            synchronized (this) {
                allValues = new ArrayList<>(entries.size() + retiredQueue.size());
                for (Entry<B> entry : entries.values()) {
                    if (entry != null && entry.value != null) {
                        allValues.add(entry.value);
                    }
                }
                allValues.addAll(retiredQueue);
                entries.clear();
                retiredQueue.clear();
                totalPixels = 0L;
            }
            if (disposer != null) {
                for (B value : allValues) {
                    try {
                        disposer.dispose(value);
                    } catch (RuntimeException ignored) {
                    }
                }
            }
        }
    }
}
