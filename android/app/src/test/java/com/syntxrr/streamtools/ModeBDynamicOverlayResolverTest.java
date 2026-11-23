package com.syntxrr.streamtools;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

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

    // --- A1.3 Native Avatar Resolution & Security Policy Tests ---

    @Test
    public void resolvesAvatarNeutralPlaceholderWhenNoValidAudienceEvent() {
        List<ModeBDynamicOverlayResolver.AudienceEventRecord> nonAudienceEvents = Arrays.asList(
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "v1", "viewer", "system_viewer", "https://cdn.example.com/sys.png", 5000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "c1", "custom", "custom_ev", "https://cdn.example.com/custom.png", 4000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "b1", "chat", "   ", "https://cdn.example.com/blank.png", 3000L));

        ModeBDynamicOverlayResolver.AvatarResolution emptyRes =
                ModeBDynamicOverlayResolver.resolveDynamicAvatar(
                        Collections.<ModeBDynamicOverlayResolver.AudienceEventRecord>emptyList(), null, null);
        assertFalse(emptyRes.hasEvent);
        assertNull(emptyRes.avatarUrl);
        assertNull(emptyRes.username);
        assertNull(emptyRes.initial);
        assertEquals("circle", emptyRes.shape);
        assertTrue(emptyRes.borderGlow);

        ModeBDynamicOverlayResolver.AvatarResolution filteredRes =
                ModeBDynamicOverlayResolver.resolveDynamicAvatar(nonAudienceEvents, "rounded", Boolean.FALSE);
        assertFalse(filteredRes.hasEvent);
        assertNull(filteredRes.avatarUrl);
        assertNull(filteredRes.username);
        assertNull(filteredRes.initial);
        assertEquals("rounded", filteredRes.shape);
        assertFalse(filteredRes.borderGlow);
    }

    @Test
    public void avatarStrictlyPairsWithSameLatestAudienceEventNeverOldPhoto() {
        List<ModeBDynamicOverlayResolver.AudienceEventRecord> events = Arrays.asList(
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "v_top", "viewer", "ignored_viewer", "https://cdn.example.com/viewer.png", 6000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "latest_no_avatar", "gift", "  @siska_99  ", null, 5000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "older_with_avatar", "chat", "budi", "https://cdn.example.com/budi.png", 4000L));

        ModeBDynamicOverlayResolver.AvatarResolution res =
                ModeBDynamicOverlayResolver.resolveDynamicAvatar(events, "square", Boolean.TRUE);
        assertTrue(res.hasEvent);
        assertEquals("@siska_99", res.username);
        assertEquals("S", res.initial);
        assertNull(res.avatarUrl); // Must NEVER reuse budi.png for siska_99!
        assertEquals("square", res.shape);
        assertTrue(res.borderGlow);

        List<ModeBDynamicOverlayResolver.AudienceEventRecord> withHttpsAvatar = Arrays.asList(
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "e_new", "donation", "nadia", "https://p16-sign.tiktokcdn.com/avatar_100.jpeg", 7000L),
                new ModeBDynamicOverlayResolver.AudienceEventRecord(
                        "e_old", "chat", "old_user", "https://cdn.example.com/old.png", 3000L));

        ModeBDynamicOverlayResolver.AvatarResolution validRes =
                ModeBDynamicOverlayResolver.resolveDynamicAvatar(withHttpsAvatar, "unknown_shape", null);
        assertTrue(validRes.hasEvent);
        assertEquals("nadia", validRes.username);
        assertEquals("N", validRes.initial);
        assertEquals("https://p16-sign.tiktokcdn.com/avatar_100.jpeg", validRes.avatarUrl);
        assertEquals("circle", validRes.shape);
        assertTrue(validRes.borderGlow);
    }

    @Test
    public void extractsInitialSafelyWithLeadingAtStripped() {
        assertEquals("N", ModeBDynamicOverlayResolver.extractUsernameInitial("@nadia_live"));
        assertEquals("B", ModeBDynamicOverlayResolver.extractUsernameInitial("@@budi"));
        assertEquals("R", ModeBDynamicOverlayResolver.extractUsernameInitial("  rani  "));
        assertEquals("?", ModeBDynamicOverlayResolver.extractUsernameInitial("@@@"));
        assertEquals("?", ModeBDynamicOverlayResolver.extractUsernameInitial("   "));
        assertEquals("?", ModeBDynamicOverlayResolver.extractUsernameInitial(null));
    }

    @Test
    public void avatarUrlPolicyRejectsInsecureSchemesPrivateHostsAndRedirects() throws Exception {
        // Valid public HTTPS URLs
        assertNotNull(ModeBAvatarPolicy.validateAvatarUrl("https://cdn.example.com/u/avatar.webp"));
        assertNotNull(ModeBAvatarPolicy.validateAvatarUrl("https://cdn.example.com:443/u/avatar.png"));

        // Non-HTTPS & local schemes
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("http://cdn.example.com/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("file:///sdcard/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("content://media/external/images/1"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("blob:https://example.com/123"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("data:image/png;base64,iVBORw0KGgo="));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("javascript:alert(1)"));

        // Credentials / userinfo & non-443 ports & length > 300
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://user:pass@cdn.example.com/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://cdn.example.com:8443/avatar.png"));
        StringBuilder longPath = new StringBuilder("https://cdn.example.com/");
        while (longPath.length() <= 301) longPath.append('a');
        assertNull(ModeBAvatarPolicy.validateAvatarUrl(longPath.toString()));

        // Localhost & internal suffixes & private/loopback/link-local/CGNAT/multicast/IPv6 local literals
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://localhost/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://api.localhost/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://printer.local/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://metadata.internal/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://intranet/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://127.0.0.1/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://10.0.0.12/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://172.16.5.4/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://192.168.1.50/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://169.254.169.254/latest/meta-data"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://100.64.0.1/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://224.0.0.1/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://[::1]/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://[fe80::1]/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://[fc00::1]/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://[::ffff:127.0.0.1]/avatar.png"));
        assertNull(ModeBAvatarPolicy.validateAvatarUrl("https://[::ffff:192.168.1.1]/avatar.png"));

        // Redirect policy blocks downgrades & private hosts while allowing public HTTPS hops
        assertNull(ModeBAvatarPolicy.validateRedirectTarget(
                "https://cdn.example.com/start.png", "http://cdn.example.com/next.png"));
        assertNull(ModeBAvatarPolicy.validateRedirectTarget(
                "https://cdn.example.com/start.png", "https://127.0.0.1/secret.png"));
        assertNull(ModeBAvatarPolicy.validateRedirectTarget(
                "https://cdn.example.com/start.png", "https://169.254.169.254/meta"));
        assertEquals(
                "https://cdn.example.com/v2/avatar.png",
                ModeBAvatarPolicy.validateRedirectTarget(
                        "https://cdn.example.com/v1/avatar.png", "/v2/avatar.png"));

        // InetAddress DNS check helper rejects loopback/private and accepts public IP
        assertFalse(ModeBAvatarPolicy.isSafePublicAddress(InetAddress.getByName("127.0.0.1")));
        assertFalse(ModeBAvatarPolicy.isSafePublicAddress(InetAddress.getByName("169.254.169.254")));
        assertTrue(ModeBAvatarPolicy.isSafePublicAddress(InetAddress.getByName("93.184.216.34")));
    }

    @Test
    public void avatarMimeMagicBytesAndBoundedStreamValidation() throws Exception {
        assertTrue(ModeBAvatarPolicy.isSupportedResponseMime("image/jpeg"));
        assertTrue(ModeBAvatarPolicy.isSupportedResponseMime("image/jpg; charset=utf-8"));
        assertTrue(ModeBAvatarPolicy.isSupportedResponseMime("IMAGE/PNG"));
        assertTrue(ModeBAvatarPolicy.isSupportedResponseMime("image/webp"));
        assertTrue(ModeBAvatarPolicy.isSupportedResponseMime("image/gif"));

        assertFalse(ModeBAvatarPolicy.isSupportedResponseMime("image/svg+xml"));
        assertFalse(ModeBAvatarPolicy.isSupportedResponseMime("text/html"));
        assertFalse(ModeBAvatarPolicy.isSupportedResponseMime("application/octet-stream"));
        assertFalse(ModeBAvatarPolicy.isSupportedResponseMime(null));
        assertFalse(ModeBAvatarPolicy.isSupportedResponseMime(""));

        byte[] pngHeader = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00};
        byte[] jpgHeader = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};
        byte[] gifHeader = "GIF89a...".getBytes(StandardCharsets.US_ASCII);
        byte[] webpHeader = new byte[]{'R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B', 'P', 0};
        byte[] htmlBytes = "<html><body>not image</body></html>".getBytes(StandardCharsets.UTF_8);

        assertEquals("image/png", ModeBAvatarPolicy.detectImageMimeFromBytes(pngHeader, pngHeader.length));
        assertEquals("image/jpeg", ModeBAvatarPolicy.detectImageMimeFromBytes(jpgHeader, jpgHeader.length));
        assertEquals("image/gif", ModeBAvatarPolicy.detectImageMimeFromBytes(gifHeader, gifHeader.length));
        assertEquals("image/webp", ModeBAvatarPolicy.detectImageMimeFromBytes(webpHeader, webpHeader.length));
        assertNull(ModeBAvatarPolicy.detectImageMimeFromBytes(htmlBytes, htmlBytes.length));

        // Bounded stream accepts <= 512 KB and rejects 512 KB + 1 byte
        byte[] exactLimit = new byte[ModeBAvatarPolicy.MAX_AVATAR_BYTES];
        byte[] readOk = ModeBAvatarPolicy.readBoundedStream(
                new ByteArrayInputStream(exactLimit), ModeBAvatarPolicy.MAX_AVATAR_BYTES);
        assertNotNull(readOk);
        assertEquals(ModeBAvatarPolicy.MAX_AVATAR_BYTES, readOk.length);

        byte[] overLimit = new byte[ModeBAvatarPolicy.MAX_AVATAR_BYTES + 1];
        boolean threwOverLimit = false;
        try {
            ModeBAvatarPolicy.readBoundedStream(
                    new ByteArrayInputStream(overLimit), ModeBAvatarPolicy.MAX_AVATAR_BYTES);
        } catch (IOException expected) {
            threwOverLimit = true;
        }
        assertTrue("Stream > 512 KB must be rejected", threwOverLimit);
    }

    @Test
    public void boundedAvatarCacheEnforcesLimitsAndDefersBitmapDisposalUntilFrameEnd() {
        final class FakeBitmap {
            final AtomicBoolean recycled = new AtomicBoolean(false);
        }

        ModeBAvatarPolicy.BoundedAvatarCache<FakeBitmap> cache =
                new ModeBAvatarPolicy.BoundedAvatarCache<>(24, 1_572_864L, 256L * 256L);

        // Entry larger than 256x256 is rejected cleanly
        FakeBitmap tooBig = new FakeBitmap();
        assertFalse(cache.put("https://cdn.example.com/huge.png", tooBig, 257L * 257L));
        assertEquals(0, cache.size());

        // Fill max 24 entries of 256x256 (= 1,572,864 pixels total)
        List<FakeBitmap> items = new ArrayList<>();
        for (int i = 0; i < 24; i++) {
            FakeBitmap bmp = new FakeBitmap();
            items.add(bmp);
            assertTrue(cache.put("https://cdn.example.com/a" + i + ".png", bmp, 65_536L));
        }
        assertEquals(24, cache.size());
        assertEquals(1_572_864L, cache.getTotalPixels());

        // Active frame reads item 0 before background puts item 24
        FakeBitmap inUseFrameBitmap = cache.get("https://cdn.example.com/a0.png");
        assertNotNull(inUseFrameBitmap);
        // Re-touch item 0? Wait: read a1 instead so a0 isn't bumped, or verify item 1 is LRU evicted:
        // Since we called get("a0"), a0 became MRU and a1 became LRU!
        FakeBitmap lruBitmap = items.get(1);

        FakeBitmap extra = new FakeBitmap();
        assertTrue(cache.put("https://cdn.example.com/a24.png", extra, 65_536L));
        assertEquals(24, cache.size());
        assertEquals(1_572_864L, cache.getTotalPixels());
        assertFalse("LRU entry a1 evicted", cache.containsKey("https://cdn.example.com/a1.png"));
        assertTrue("Recently accessed a0 retained", cache.containsKey("https://cdn.example.com/a0.png"));

        // Non-destructive eviction: evicted bitmap MUST NOT be recycled mid-frame!
        assertFalse("Evicted bitmap must remain unrecycled until drainRetired()", lruBitmap.recycled.get());
        assertEquals(1, cache.getRetiredQueueSize());

        // After drawOverlayFrame completes, drainRetired() safely disposes retired bitmaps
        List<FakeBitmap> disposed = cache.drainRetired(bmp -> bmp.recycled.set(true));
        assertEquals(1, disposed.size());
        assertTrue(lruBitmap.recycled.get());
        assertFalse(inUseFrameBitmap.recycled.get());

        // Clear all on releaseAssets() recycles remaining 24 entries
        cache.clearAll(bmp -> bmp.recycled.set(true));
        assertEquals(0, cache.size());
        assertEquals(0L, cache.getTotalPixels());
        assertTrue(inUseFrameBitmap.recycled.get());
        assertTrue(extra.recycled.get());
    }
}
