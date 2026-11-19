package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBScreensaverPolicyTest {
    @Test public void disabledByDefault() {
        assertFalse(ModeBScreensaverPolicy.fromJson(null).enabled);
    }
    @Test public void parsesTextAndFadeTransitions() {
        ModeBScreensaverPolicy policy = ModeBScreensaverPolicy.fromJson(
                "{\"on\":true,\"text\":\"Menunggu host\",\"enter\":{\"type\":\"fade\",\"duration\":450},\"exit\":\"cut\"}");
        assertTrue(policy.enabled);
        assertEquals("Menunggu host", policy.text);
        assertEquals(450, policy.enterDurationMs);
        assertEquals(0, policy.exitDurationMs);
    }
    @Test public void unsupportedMediaIsReportedButTextRemainsUsable() {
        ModeBScreensaverPolicy policy = ModeBScreensaverPolicy.fromJson(
                "{\"on\":true,\"media\":\"content://local/video\",\"mediaSound\":true}");
        assertTrue(policy.mediaRequested);
        assertTrue(policy.mediaSound);
        assertTrue(policy.runtimeNotice().contains("belum didukung"));
    }
    @Test public void parsesLocalScreensaverImageReference() {
        ModeBScreensaverPolicy policy = ModeBScreensaverPolicy.fromJson(
                "{\"on\":true,\"media\":\"studio-media://media_saver_123\"}");
        assertTrue(policy.mediaRequested);
        assertEquals("media_saver_123", policy.mediaAssetId);
        assertEquals("", policy.runtimeNotice());
    }

    @Test public void parsesLocalMp4ScreensaverMediaType() {
        ModeBScreensaverPolicy policy = ModeBScreensaverPolicy.fromJson(
                "{\"on\":true,\"media\":\"studio-media://media_wait_mp4_123\",\"mediaType\":\"video\"}");
        assertTrue(policy.mediaRequested);
        assertEquals("video", policy.mediaType);
        assertEquals("media_wait_mp4_123", policy.mediaAssetId);
        assertEquals("", policy.runtimeNotice());
    }

    @Test public void rejectsRemoteMediaForNativeImagePlaybackButKeepsTextFallback() {
        ModeBScreensaverPolicy policy = ModeBScreensaverPolicy.fromJson(
                "{\"on\":true,\"media\":\"https://example.invalid/wait.png\"}");
        assertTrue(policy.mediaRequested);
        assertEquals("", policy.mediaAssetId);
        assertTrue(policy.runtimeNotice().contains("tidak valid"));
    }
    @Test public void nullOptionalFieldsUseSafeDefaults() {
        ModeBScreensaverPolicy policy = ModeBScreensaverPolicy.fromJson(
                "{\"on\":true,\"text\":null,\"media\":null}");
        assertEquals(ModeBScreensaverPolicy.DEFAULT_TEXT, policy.text);
        assertFalse(policy.mediaRequested);
    }
    @Test(expected = IllegalArgumentException.class)
    public void rejectsUnboundedFade() {
        ModeBScreensaverPolicy.fromJson("{\"on\":true,\"enter\":{\"type\":\"fade\",\"duration\":9000}}");
    }
}
