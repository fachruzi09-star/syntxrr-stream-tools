package com.syntxrr.streamtools;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure-Java live resolution logic for Mode B native "dynamic_text" and "username" overlays.
 * Mirrors WebView studioElementRenderModel semantics without Android framework dependencies
 * so behavior can be unit-tested on the JVM.
 */
public final class ModeBDynamicOverlayResolver {
    public static final int MAX_DONOR_ENTRIES = 200;
    public static final String DEFAULT_DYNAMIC_FALLBACK = "Menunggu data siaran...";
    public static final String DEFAULT_USERNAME_WAITING = "Menunggu interaksi penonton...";

    private static final Set<String> AUDIENCE_USER_EVENT_TYPES = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList("chat", "gift", "like", "follow", "share", "join", "donation")));

    private static final Pattern TOKEN_PATTERN = Pattern.compile("\\{([a-zA-Z0-9_]+)\\}");
    private static final Pattern ANY_BRACE_TOKEN_PATTERN = Pattern.compile("\\{[^}]+\\}");
    private static final Pattern CURRENCY_PREFIX_PATTERN = Pattern.compile("^(?:rp|idr|\\$|€|£)\\s*", Pattern.CASE_INSENSITIVE);
    private static final Pattern DOT_THOUSANDS_PATTERN = Pattern.compile("^-?\\d{1,3}(?:\\.\\d{3})+$");
    private static final Pattern COMMA_THOUSANDS_PATTERN = Pattern.compile("^-?\\d{1,3}(?:,\\d{3})+$");
    private static final Pattern PLAIN_DECIMAL_PATTERN = Pattern.compile("^-?\\d+(?:\\.\\d+)?$");

    private ModeBDynamicOverlayResolver() {
    }

    public static final class AudienceEventRecord {
        public final String id;
        public final String type;
        public final String username;
        public final long timestamp;

        public AudienceEventRecord(String id, String type, String username, long timestamp) {
            this.id = id == null ? "" : id;
            this.type = type == null ? "" : type.trim().toLowerCase(Locale.ROOT);
            this.username = username == null ? "" : username;
            this.timestamp = timestamp;
        }
    }

    public static final class DonorAggregate {
        public String username;
        public int supportCount;
        public long lastTimestamp;

        public DonorAggregate(String username, int supportCount, long lastTimestamp) {
            this.username = username;
            this.supportCount = supportCount;
            this.lastTimestamp = lastTimestamp;
        }

        public DonorAggregate copy() {
            return new DonorAggregate(username, supportCount, lastTimestamp);
        }
    }

    public static final class TargetSource {
        public final String elementType;
        public final Object targetGoalRaw;
        public final Object targetAmountRaw;
        public final Object targetRaw;
        public final String currencyRaw;

        public TargetSource(String elementType, Object targetGoalRaw, Object targetAmountRaw,
                Object targetRaw, String currencyRaw) {
            this.elementType = elementType == null ? "" : elementType;
            this.targetGoalRaw = targetGoalRaw;
            this.targetAmountRaw = targetAmountRaw;
            this.targetRaw = targetRaw;
            this.currencyRaw = currencyRaw == null ? "" : currencyRaw;
        }
    }

    public static final class DynamicTextResolution {
        public final String text;
        public final boolean usedFallback;

        public DynamicTextResolution(String text, boolean usedFallback) {
            this.text = text;
            this.usedFallback = usedFallback;
        }
    }

    public static final class UsernameResolution {
        public final boolean hasEvent;
        public final String displayText;
        public final String username;
        public final String prefix;
        public final String badge;
        public final String eventType;

        public UsernameResolution(boolean hasEvent, String displayText, String username,
                String prefix, String badge, String eventType) {
            this.hasEvent = hasEvent;
            this.displayText = displayText;
            this.username = username;
            this.prefix = prefix;
            this.badge = badge;
            this.eventType = eventType;
        }
    }

    public static boolean isAudienceUserEventType(String type) {
        if (type == null) return false;
        return AUDIENCE_USER_EVENT_TYPES.contains(type.trim().toLowerCase(Locale.ROOT));
    }

    /**
     * Resolves the latest non-empty username from valid audience interaction events
     * (events ordered newest-first, matching StudioOverlayView.liveEvents).
     */
    public static String resolveLatestAudienceUsername(List<AudienceEventRecord> events) {
        if (events == null || events.isEmpty()) return null;
        for (AudienceEventRecord event : events) {
            if (event == null || !isAudienceUserEventType(event.type)) continue;
            String clean = trimToNull(event.username);
            if (clean != null) return clean;
        }
        return null;
    }

    /**
     * Records a gift or donation event into a bounded donor aggregate map (maxEntries = 200).
     * Ranks donors by support count, breaking ties by latest event timestamp, and groups usernames
     * case-insensitively while preserving the latest display casing.
     */
    public static void recordDonorEvent(Map<String, DonorAggregate> aggregates, String eventType,
            String username, long timestamp, int maxEntries) {
        if (aggregates == null || eventType == null) return;
        String normalizedType = eventType.trim().toLowerCase(Locale.ROOT);
        if (!"gift".equals(normalizedType) && !"donation".equals(normalizedType)) return;
        String cleanUsername = trimToNull(username);
        if (cleanUsername == null) return;

        int safeMax = Math.max(1, maxEntries);
        String key = cleanUsername.toLowerCase(Locale.ROOT);
        DonorAggregate existing = aggregates.get(key);
        if (existing != null) {
            existing.supportCount += 1;
            if (timestamp >= existing.lastTimestamp) {
                existing.username = cleanUsername;
                existing.lastTimestamp = timestamp;
            }
            return;
        }

        if (aggregates.size() >= safeMax) {
            String lowestKey = null;
            DonorAggregate lowestValue = null;
            for (Map.Entry<String, DonorAggregate> entry : aggregates.entrySet()) {
                DonorAggregate candidate = entry.getValue();
                if (candidate == null) {
                    lowestKey = entry.getKey();
                    break;
                }
                if (lowestValue == null
                        || candidate.supportCount < lowestValue.supportCount
                        || (candidate.supportCount == lowestValue.supportCount
                                && candidate.lastTimestamp < lowestValue.lastTimestamp)) {
                    lowestKey = entry.getKey();
                    lowestValue = candidate;
                }
            }
            if (lowestKey != null) {
                aggregates.remove(lowestKey);
            }
        }

        aggregates.put(key, new DonorAggregate(cleanUsername, 1, timestamp));
    }

    public static String resolveTopDonorName(Map<String, DonorAggregate> aggregates) {
        if (aggregates == null || aggregates.isEmpty()) return null;
        DonorAggregate best = null;
        for (DonorAggregate candidate : aggregates.values()) {
            if (candidate == null || trimToNull(candidate.username) == null) continue;
            if (best == null
                    || candidate.supportCount > best.supportCount
                    || (candidate.supportCount == best.supportCount
                            && candidate.lastTimestamp > best.lastTimestamp)) {
                best = candidate;
            }
        }
        return best == null ? null : best.username;
    }

    /**
     * Convenience helper for resolving top donor directly from a newest-first list of events.
     */
    public static String resolveTopDonorNameFromEvents(List<AudienceEventRecord> events) {
        if (events == null || events.isEmpty()) return null;
        Map<String, DonorAggregate> map = new LinkedHashMap<>();
        for (int i = events.size() - 1; i >= 0; i--) {
            AudienceEventRecord event = events.get(i);
            if (event == null) continue;
            recordDonorEvent(map, event.type, event.username, event.timestamp, MAX_DONOR_ENTRIES);
        }
        return resolveTopDonorName(map);
    }

    /**
     * Mirrors parseSafeNumericNominal() from studioElementCatalog.ts.
     */
    public static Double parseSafeNumericNominal(Object raw) {
        if (raw instanceof Number) {
            double num = ((Number) raw).doubleValue();
            return Double.isNaN(num) || Double.isInfinite(num) ? null : num;
        }
        if (!(raw instanceof String)) return null;
        String trimmed = ((String) raw).trim();
        if (trimmed.isEmpty()) return null;

        String withoutCurrency = CURRENCY_PREFIX_PATTERN.matcher(trimmed).replaceFirst("").trim();
        if (withoutCurrency.isEmpty()) return null;

        try {
            if (DOT_THOUSANDS_PATTERN.matcher(withoutCurrency).matches()) {
                double parsed = Double.parseDouble(withoutCurrency.replace(".", ""));
                return Double.isNaN(parsed) || Double.isInfinite(parsed) ? null : parsed;
            }
            if (COMMA_THOUSANDS_PATTERN.matcher(withoutCurrency).matches()) {
                double parsed = Double.parseDouble(withoutCurrency.replace(",", ""));
                return Double.isNaN(parsed) || Double.isInfinite(parsed) ? null : parsed;
            }
            if (PLAIN_DECIMAL_PATTERN.matcher(withoutCurrency).matches()) {
                double parsed = Double.parseDouble(withoutCurrency);
                return Double.isNaN(parsed) || Double.isInfinite(parsed) ? null : parsed;
            }
        } catch (NumberFormatException ignored) {
            return null;
        }
        return null;
    }

    public static String formatIndonesianNumber(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return "0";
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(Locale.US);
        symbols.setGroupingSeparator('.');
        symbols.setDecimalSeparator(',');
        DecimalFormat format = new DecimalFormat("#,##0.###", symbols);
        format.setGroupingUsed(true);
        return format.format(value);
    }

    /**
     * Mirrors getActiveTargetTextFromElements() in studioElementRenderModel.ts.
     */
    public static String resolveActiveTargetText(Object ownTargetRaw, List<TargetSource> otherElements) {
        if (ownTargetRaw instanceof String) {
            String trimmed = ((String) ownTargetRaw).trim();
            if (!trimmed.isEmpty()) return trimmed;
        } else if (ownTargetRaw instanceof Number) {
            double val = ((Number) ownTargetRaw).doubleValue();
            if (!Double.isNaN(val) && !Double.isInfinite(val) && val > 0d) {
                return formatIndonesianNumber(val);
            }
        }

        if (otherElements != null) {
            for (TargetSource source : otherElements) {
                if (source == null || !"counter".equals(source.elementType)) continue;
                Object raw = source.targetGoalRaw != null ? source.targetGoalRaw : source.targetRaw;
                Double parsed = parseSafeNumericNominal(raw);
                if (parsed != null && !Double.isNaN(parsed) && !Double.isInfinite(parsed) && parsed > 0d) {
                    return formatIndonesianNumber(parsed);
                }
                break;
            }

            for (TargetSource source : otherElements) {
                if (source == null || !"progress_bar".equals(source.elementType)) continue;
                Object raw = source.targetAmountRaw != null ? source.targetAmountRaw : source.targetRaw;
                Double parsed = parseSafeNumericNominal(raw);
                if (parsed != null && !Double.isNaN(parsed) && !Double.isInfinite(parsed) && parsed > 0d) {
                    String formatted = formatIndonesianNumber(Math.max(0d, parsed));
                    String currency = source.currencyRaw == null ? "" : source.currencyRaw.trim();
                    return currency.isEmpty() ? formatted : currency + " " + formatted;
                }
                break;
            }
        }

        return null;
    }

    public static String formatCurrentTimeHHmm(Date date) {
        Date effective = date == null ? new Date() : date;
        return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(effective);
    }

    /**
     * Mirrors resolveDynamicTextOutput() in studioElementRenderModel.ts.
     * Supports tokens {username}, {target}, {waktu}, {durasi}, {top_donor_name}.
     * Unknown or null/empty tokens trigger the cleaned fallback without exposing raw {token}.
     */
    public static DynamicTextResolution resolveDynamicTextOutput(
            String template,
            String fallback,
            String latestUsername,
            String targetText,
            String currentTimeText,
            String durationText,
            String topDonorName) {
        String rawTemplate = template == null ? "" : template;
        String trimmedFallback = trimToNull(fallback);
        String rawFallback = trimmedFallback != null ? trimmedFallback : DEFAULT_DYNAMIC_FALLBACK;
        String cleanFallback = ANY_BRACE_TOKEN_PATTERN.matcher(rawFallback).replaceAll("—").trim();
        if (cleanFallback.isEmpty()) {
            cleanFallback = DEFAULT_DYNAMIC_FALLBACK;
        }

        if (rawTemplate.trim().isEmpty()) {
            return new DynamicTextResolution(cleanFallback, true);
        }

        String cleanUsername = trimToNull(latestUsername);
        String cleanTarget = trimToNull(targetText);
        String cleanTime = trimToNull(currentTimeText);
        String cleanDuration = trimToNull(durationText);
        String cleanTopDonor = trimToNull(topDonorName);

        Matcher matcher = TOKEN_PATTERN.matcher(rawTemplate);
        StringBuffer buffer = new StringBuffer();
        boolean missingToken = false;

        while (matcher.find()) {
            String tokenName = matcher.group(1);
            String replacement = null;
            if ("username".equals(tokenName)) replacement = cleanUsername;
            else if ("target".equals(tokenName)) replacement = cleanTarget;
            else if ("waktu".equals(tokenName)) replacement = cleanTime;
            else if ("durasi".equals(tokenName)) replacement = cleanDuration;
            else if ("top_donor_name".equals(tokenName)) replacement = cleanTopDonor;

            if (replacement != null && !replacement.isEmpty()) {
                matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
            } else {
                missingToken = true;
                matcher.appendReplacement(buffer, "");
            }
        }
        matcher.appendTail(buffer);

        if (missingToken) {
            return new DynamicTextResolution(cleanFallback, true);
        }

        String finalClean = ANY_BRACE_TOKEN_PATTERN.matcher(buffer.toString()).replaceAll("—").trim();
        if (finalClean.isEmpty()) {
            return new DynamicTextResolution(cleanFallback, true);
        }

        return new DynamicTextResolution(finalClean, false);
    }

    /**
     * Mirrors resolveActiveUsernameModel() in studioElementRenderModel.ts.
     */
    public static UsernameResolution resolveActiveUsername(
            List<AudienceEventRecord> events,
            String prefixRaw,
            String badgeRaw) {
        String prefix = prefixRaw == null ? "" : prefixRaw;
        String badge = trimToNull(badgeRaw);

        AudienceEventRecord latest = null;
        if (events != null) {
            for (AudienceEventRecord event : events) {
                if (event == null || !isAudienceUserEventType(event.type)) continue;
                if (trimToNull(event.username) != null) {
                    latest = event;
                    break;
                }
            }
        }

        if (latest == null) {
            return new UsernameResolution(
                    false,
                    DEFAULT_USERNAME_WAITING,
                    null,
                    prefix,
                    badge,
                    null);
        }

        String cleanUsername = latest.username.trim();
        return new UsernameResolution(
                true,
                prefix + cleanUsername,
                cleanUsername,
                prefix,
                badge,
                latest.type);
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
