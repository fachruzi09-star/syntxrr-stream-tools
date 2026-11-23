package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class ModeBDynamicOverlayResolverTest {

    @Test
    public void replacesSupportedTokensWhenDataAvailable() {
        ModeBDynamicOverlayResolver.DynamicTextResolution result =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Halo {username} | Target: {target} | Jam {waktu} | Top: {top_donor_name}",
                        "Fallback",
                        "  @budi  ",
                        "Rp 1.000.000",
                        "21:45",
                        null,
                        "Siska");

        assertFalse(result.usedFallback);
        assertEquals("Halo @budi | Target: Rp 1.000.000 | Jam 21:45 | Top: Siska", result.text);
    }

    @Test
    public void triggersFallbackWhenDurationIsNullAndTemplateRequestsDurasi() {
        ModeBDynamicOverlayResolver.DynamicTextResolution result =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "LIVE {durasi} | {username}",
                        "Siaran sedang berlangsung",
                        "Rani",
                        null,
                        "20:10",
                        null,
                        null);

        assertTrue(result.usedFallback);
        assertEquals("Siaran sedang berlangsung", result.text);
    }

    @Test
    public void triggersFallbackWhenUsernameMissingOrViewerOnly() {
        List<ModeBDynamicOverlayResolver.AudienceEventRecord> events = Arrays.asList(
                new ModeBDynamicOverlayResolver.AudienceEventRecord("v1", "viewer", "system_viewer", 3000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord("c1", "custom", "custom_user", 2000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord("b1", "chat", "   ", 1000L));

        assertNull(ModeBDynamicOverlayResolver.resolveLatestAudienceUsername(events));

        ModeBDynamicOverlayResolver.DynamicTextResolution result =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Terima kasih {username}!",
                        "Belum ada penonton aktif",
                        ModeBDynamicOverlayResolver.resolveLatestAudienceUsername(events),
                        null,
                        "20:10",
                        null,
                        null);

        assertTrue(result.usedFallback);
        assertEquals("Belum ada penonton aktif", result.text);
    }

    @Test
    public void resolvesTargetAcrossOwnPropCounterAndProgressBar() {
        ModeBDynamicOverlayResolver.TargetSource counter =
                new ModeBDynamicOverlayResolver.TargetSource("counter", 500, null, null, "");
        ModeBDynamicOverlayResolver.TargetSource progress =
                new ModeBDynamicOverlayResolver.TargetSource("progress_bar", null, 1000000, null, "Rp");

        assertEquals(
                "Target Khusus",
                ModeBDynamicOverlayResolver.resolveActiveTargetText("Target Khusus", Arrays.asList(counter, progress)));
        assertEquals(
                "500",
                ModeBDynamicOverlayResolver.resolveActiveTargetText(null, Arrays.asList(counter, progress)));
        assertEquals(
                "Rp 1.000.000",
                ModeBDynamicOverlayResolver.resolveActiveTargetText(null, Collections.singletonList(progress)));
        assertNull(ModeBDynamicOverlayResolver.resolveActiveTargetText(null, Collections.<ModeBDynamicOverlayResolver.TargetSource>emptyList()));

        ModeBDynamicOverlayResolver.DynamicTextResolution missingTargetResult =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Target: {target}",
                        "Target belum diatur",
                        "Andi",
                        ModeBDynamicOverlayResolver.resolveActiveTargetText(null, Collections.<ModeBDynamicOverlayResolver.TargetSource>emptyList()),
                        "20:10",
                        null,
                        null);
        assertTrue(missingTargetResult.usedFallback);
        assertEquals("Target belum diatur", missingTargetResult.text);
    }

    @Test
    public void topDonorRanksBySupportCountAndBreaksTiesByNewestTimestamp() {
        Map<String, ModeBDynamicOverlayResolver.DonorAggregate> map = new LinkedHashMap<>();
        // Ignored non-support events
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "chat", "chatter", 5000L, 200);
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "like", "liker", 6000L, 200);
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "viewer", "viewer_bot", 7000L, 200);
        assertNull(ModeBDynamicOverlayResolver.resolveTopDonorName(map));

        // Donor A: 2 supports (case-insensitive grouping preserves newest casing)
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "alya", 1000L, 200);
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "donation", "Alya", 2000L, 200);
        // Donor B: 2 supports, newer timestamp -> wins tie-break
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "Bima", 1500L, 200);
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "BIMA", 3500L, 200);

        assertEquals("BIMA", ModeBDynamicOverlayResolver.resolveTopDonorName(map));

        // Donor A gets 3rd support -> beats Donor B even with older/newer tie rule
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "AlyaVIP", 4000L, 200);
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "Alya", 4100L, 200);
        assertEquals("Alya", ModeBDynamicOverlayResolver.resolveTopDonorName(map));
    }

    @Test
    public void donorAggregationRemainsBoundedAndKeepsTopDonor() {
        Map<String, ModeBDynamicOverlayResolver.DonorAggregate> map = new LinkedHashMap<>();
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "SultanUtama", 1000L, 5);
        ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "SultanUtama", 1100L, 5);

        for (int i = 0; i < 12; i++) {
            ModeBDynamicOverlayResolver.recordDonorEvent(map, "gift", "Donor_" + i, 2000L + i, 5);
        }

        assertEquals(5, map.size());
        assertEquals("SultanUtama", ModeBDynamicOverlayResolver.resolveTopDonorName(map));
    }

    @Test
    public void unknownTokensFallbackCleaningEmptyFallbackAndPlainTemplates() {
        // Unknown token triggers fallback
        ModeBDynamicOverlayResolver.DynamicTextResolution unknownRes =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Halo {unknown_token}",
                        "Teks aman {juga_token}",
                        "Budi",
                        null,
                        "12:00",
                        null,
                        null);
        assertTrue(unknownRes.usedFallback);
        assertEquals("Teks aman —", unknownRes.text);

        // Empty fallback uses safe default Indonesian string
        ModeBDynamicOverlayResolver.DynamicTextResolution emptyFallbackRes =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Halo {username}",
                        "   ",
                        null,
                        null,
                        "12:00",
                        null,
                        null);
        assertTrue(emptyFallbackRes.usedFallback);
        assertEquals("Menunggu data siaran...", emptyFallbackRes.text);

        // Empty template uses cleaned fallback
        ModeBDynamicOverlayResolver.DynamicTextResolution emptyTemplateRes =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "  ",
                        "Selamat datang di stream!",
                        "Budi",
                        null,
                        "12:00",
                        null,
                        null);
        assertTrue(emptyTemplateRes.usedFallback);
        assertEquals("Selamat datang di stream!", emptyTemplateRes.text);

        // Plain template without tokens renders normally
        ModeBDynamicOverlayResolver.DynamicTextResolution plainRes =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Judul Siaran Malam Ini",
                        "Fallback",
                        null,
                        null,
                        null,
                        null,
                        null);
        assertFalse(plainRes.usedFallback);
        assertEquals("Judul Siaran Malam Ini", plainRes.text);

        // Unclosed/weird brace syntax is sanitized
        ModeBDynamicOverlayResolver.DynamicTextResolution weirdBraceRes =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        "Halo {bad token}",
                        "Fallback",
                        "Budi",
                        null,
                        null,
                        null,
                        null);
        assertFalse(weirdBraceRes.usedFallback);
        assertEquals("Halo —", weirdBraceRes.text);
    }

    @Test
    public void resolvesUsernameFromValidAudienceEventsAndHandlesPrefixAndBadge() {
        // Empty history -> safe waiting message, hasEvent=false
        ModeBDynamicOverlayResolver.UsernameResolution emptyRes =
                ModeBDynamicOverlayResolver.resolveActiveUsername(
                        Collections.<ModeBDynamicOverlayResolver.AudienceEventRecord>emptyList(),
                        "⭐ ",
                        "VIP Supporter");
        assertFalse(emptyRes.hasEvent);
        assertEquals("Menunggu interaksi penonton...", emptyRes.displayText);
        assertNull(emptyRes.username);
        assertEquals("VIP Supporter", emptyRes.badge);

        // Viewer/custom/blank ignored, picks newest valid audience event
        List<ModeBDynamicOverlayResolver.AudienceEventRecord> events = new ArrayList<>();
        events.add(new ModeBDynamicOverlayResolver.AudienceEventRecord("e1", "viewer", "system", 5000L));
        events.add(new ModeBDynamicOverlayResolver.AudienceEventRecord("e2", "custom", "custom_ev", 4500L));
        events.add(new ModeBDynamicOverlayResolver.AudienceEventRecord("e3", "follow", "  @nadia_live  ", 4000L));
        events.add(new ModeBDynamicOverlayResolver.AudienceEventRecord("e4", "chat", "lama", 3000L));

        ModeBDynamicOverlayResolver.UsernameResolution activeRes =
                ModeBDynamicOverlayResolver.resolveActiveUsername(events, "⭐ ", "  VIP  ");
        assertTrue(activeRes.hasEvent);
        assertEquals("⭐ @nadia_live", activeRes.displayText);
        assertEquals("@nadia_live", activeRes.username);
        assertEquals("VIP", activeRes.badge);
        assertEquals("follow", activeRes.eventType);

        // Blank badge becomes null
        ModeBDynamicOverlayResolver.UsernameResolution noBadgeRes =
                ModeBDynamicOverlayResolver.resolveActiveUsername(events, "@", "   ");
        assertTrue(noBadgeRes.hasEvent);
        assertEquals("@@nadia_live", noBadgeRes.displayText);
        assertNull(noBadgeRes.badge);
    }

    @Test
    public void timeFormatIsHHmm() {
        String formatted = ModeBDynamicOverlayResolver.formatCurrentTimeHHmm(new Date(1700000000000L));
        assertTrue(formatted.matches("\\d{2}:\\d{2}"));
    }
}
