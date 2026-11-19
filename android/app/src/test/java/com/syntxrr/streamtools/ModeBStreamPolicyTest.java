package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBStreamPolicyTest {
    @Test
    public void allRootEncoderAudioRoutesRequestRecordAudioPermission() {
        assertTrue(ModeBStreamPolicy.isSupportedAudioSource("mix"));
        assertTrue(ModeBStreamPolicy.isSupportedAudioSource("internal"));
        assertTrue(ModeBStreamPolicy.isSupportedAudioSource("microphone"));
        assertFalse(ModeBStreamPolicy.isSupportedAudioSource("unknown"));
        assertFalse(ModeBStreamPolicy.isSupportedAudioSource(null));
        assertTrue(ModeBStreamPolicy.requiresRecordAudioPermission("mix"));
        assertTrue(ModeBStreamPolicy.requiresRecordAudioPermission("internal"));
        assertTrue(ModeBStreamPolicy.requiresRecordAudioPermission("microphone"));
        assertTrue(ModeBStreamPolicy.shouldEnableMicrophoneEffects("mix"));
        assertFalse(ModeBStreamPolicy.shouldEnableMicrophoneEffects("internal"));
        assertTrue(ModeBStreamPolicy.shouldEnableMicrophoneEffects("microphone"));
    }

    @Test
    public void audioFallbackMatchesOnlyPlaybackCaptureFailures() {
        assertTrue(ModeBStreamPolicy.isAudioStartFailure(
                new IllegalStateException("Failed to create playback capture audio source")));
        assertTrue(ModeBStreamPolicy.isAudioStartFailure(
                new IllegalStateException("Failed to start playback capture audio source")));
        assertFalse(ModeBStreamPolicy.isAudioStartFailure(
                new IllegalStateException("Failed to create microphone audio source")));
        assertFalse(ModeBStreamPolicy.isAudioStartFailure(
                new IllegalStateException("Failed to start microphone audio source")));
        assertTrue(ModeBStreamPolicy.isAudioStartFailure(
                new RuntimeException("outer", new SecurityException("AudioPlaybackCapture permission denied"))));
        assertTrue(ModeBStreamPolicy.isAudioStartFailure(
                new IllegalArgumentException("Requires RECORD_AUDIO permission for playback capture")));

        assertFalse(ModeBStreamPolicy.isAudioStartFailure(new IllegalStateException("RTMP connection failed")));
        assertFalse(ModeBStreamPolicy.isAudioStartFailure(new IllegalStateException("Failed to create internal virtual display")));
        assertFalse(ModeBStreamPolicy.isAudioStartFailure(new IllegalStateException("Video encoder bitrate unsupported")));
    }

    @Test
    public void overlayImageAssetsAreBoundedAndPathSafe() {
        assertTrue(ModeBStreamPolicy.isValidOverlayAssetId("media_1763212345_a1b2c3"));
        assertFalse(ModeBStreamPolicy.isValidOverlayAssetId("../private"));
        assertFalse(ModeBStreamPolicy.isValidOverlayAssetId(""));
        assertTrue(ModeBStreamPolicy.isSupportedOverlayImageMimeType("image/png"));
        assertTrue(ModeBStreamPolicy.isSupportedOverlayImageMimeType("image/jpeg"));
        assertTrue(ModeBStreamPolicy.isSupportedOverlayImageMimeType("image/webp"));
        assertTrue(ModeBStreamPolicy.isSupportedOverlayImageMimeType("image/gif"));
        assertFalse(ModeBStreamPolicy.isSupportedOverlayImageMimeType("image/svg+xml"));
        assertTrue(ModeBStreamPolicy.isValidOverlayImageSize(5L * 1024L * 1024L));
        assertFalse(ModeBStreamPolicy.isValidOverlayImageSize(5L * 1024L * 1024L + 1L));
        assertTrue(ModeBStreamPolicy.isValidOverlayImageTotal(12L * 1024L * 1024L));
        assertFalse(ModeBStreamPolicy.isValidOverlayImageTotal(12L * 1024L * 1024L + 1L));
    }

    @Test
    public void bitmapDecodeIsDownsampledBeforeAllocation() {
        int sample = ModeBStreamPolicy.calculateBitmapSampleSize(16384, 16384, 2_000_000L);
        assertTrue(sample > 0 && (sample & (sample - 1)) == 0);
        long decodedPixels = ((16384L + sample - 1L) / sample) * ((16384L + sample - 1L) / sample);
        assertTrue(decodedPixels <= 2_000_000L);
        assertEquals(1, ModeBStreamPolicy.calculateBitmapSampleSize(100, 100, 10_000L));
        assertEquals(0, ModeBStreamPolicy.calculateBitmapSampleSize(0, 100, 10_000L));
        assertEquals(0, ModeBStreamPolicy.calculateBitmapSampleSize(100, 100, 0L));
    }

    @Test
    public void imageMimeMustMatchPayloadSignature() {
        assertTrue(ModeBStreamPolicy.matchesImageSignature(new byte[] {
                (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
        }, "image/png"));
        assertTrue(ModeBStreamPolicy.matchesImageSignature(new byte[] {
                (byte) 0xFF, (byte) 0xD8, (byte) 0xFF
        }, "image/jpeg"));
        assertTrue(ModeBStreamPolicy.matchesImageSignature("RIFF0000WEBP".getBytes(), "image/webp"));
        assertTrue(ModeBStreamPolicy.matchesImageSignature("GIF89a".getBytes(), "image/gif"));
        assertFalse(ModeBStreamPolicy.matchesImageSignature("GIF89a".getBytes(), "image/png"));
        assertFalse(ModeBStreamPolicy.matchesImageSignature(new byte[0], "image/jpeg"));
    }


    @Test
    public void rtmpReadHealthChecksAreConfiguredTogetherWithBoundedRetries() {
        final int[] retries = {0};
        final boolean[] failOnRead = {false};
        final boolean[] sendPings = {false};
        ModeBRtmpRecoveryPolicy.configure(new ModeBRtmpRecoveryPolicy.ClientSettings() {
            @Override public void setRetries(int count) { retries[0] = count; }
            @Override public void setFailOnRead(boolean enabled) { failOnRead[0] = enabled; }
            @Override public void setSendPings(boolean enabled) { sendPings[0] = enabled; }
        });
        assertEquals(3, retries[0]);
        assertTrue(failOnRead[0]);
        assertTrue(sendPings[0]);
    }

    @Test
    public void onlyPermanentRtmpFailuresSkipRetries() {
        assertTrue(ModeBStreamPolicy.isPermanentRtmpFailure("Endpoint malformed"));
        assertTrue(ModeBStreamPolicy.isPermanentRtmpFailure("onStatus: NetStream.Publish.BadName"));
        assertTrue(ModeBStreamPolicy.isPermanentRtmpFailure("NetConnection.Connect.Rejected"));
        assertTrue(ModeBStreamPolicy.isPermanentRtmpFailure("unauthorized"));

        assertFalse(ModeBStreamPolicy.isPermanentRtmpFailure("Handshake failed"));
        assertFalse(ModeBStreamPolicy.isPermanentRtmpFailure("No response from server"));
        assertFalse(ModeBStreamPolicy.isPermanentRtmpFailure("Socket closed during temporary network handoff"));
        assertFalse(ModeBStreamPolicy.isPermanentRtmpFailure(null));
    }


    @Test
    public void supportsTwoDistinctVideoAssetsAndAllowsReplacingAnExistingAsset() {
        assertEquals(2, ModeBStreamPolicy.MAX_OVERLAY_VIDEO_ASSETS);
        assertTrue(ModeBStreamPolicy.canStoreOverlayVideoAsset(0, false));
        assertTrue(ModeBStreamPolicy.canStoreOverlayVideoAsset(1, false));
        assertFalse(ModeBStreamPolicy.canStoreOverlayVideoAsset(2, false));
        assertTrue(ModeBStreamPolicy.canStoreOverlayVideoAsset(2, true));
        assertFalse(ModeBStreamPolicy.canStoreOverlayVideoAsset(-1, true));
        assertTrue(ModeBStreamPolicy.isValidOverlayVideoTotal(12L * 1024L * 1024L));
        assertFalse(ModeBStreamPolicy.isValidOverlayVideoTotal(12L * 1024L * 1024L + 1L));
    }

    @Test
    public void localMp4OverlayAssetsAreBoundedAndSignatureChecked() {
        assertTrue(ModeBStreamPolicy.isSupportedOverlayVideoMimeType("video/mp4"));
        assertFalse(ModeBStreamPolicy.isSupportedOverlayVideoMimeType("video/webm"));
        assertFalse(ModeBStreamPolicy.isSupportedOverlayVideoMimeType("video/quicktime"));
        assertTrue(ModeBStreamPolicy.isValidOverlayVideoSize(12L * 1024L * 1024L));
        assertFalse(ModeBStreamPolicy.isValidOverlayVideoSize(12L * 1024L * 1024L + 1L));
        assertTrue(ModeBStreamPolicy.isValidOverlayVideoTotal(12L * 1024L * 1024L));
        assertFalse(ModeBStreamPolicy.isValidOverlayVideoTotal(12L * 1024L * 1024L + 1L));
        assertTrue(ModeBStreamPolicy.isValidOverlayVideoDuration(500L));
        assertTrue(ModeBStreamPolicy.isValidOverlayVideoDuration(30_000L));
        assertFalse(ModeBStreamPolicy.isValidOverlayVideoDuration(499L));
        assertFalse(ModeBStreamPolicy.isValidOverlayVideoDuration(30_001L));

        byte[] mp4 = new byte[] { 0, 0, 0, 20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm',
                0, 0, 0, 0, 'i', 's', 'o', '2' };
        assertTrue(ModeBStreamPolicy.matchesMp4Signature(mp4));
        assertFalse(ModeBStreamPolicy.matchesMp4Signature("not-a-video".getBytes()));
        assertFalse(ModeBStreamPolicy.matchesMp4Signature(new byte[] { 0, 0, 0, 99, 'f', 't', 'y', 'p', 1, 2, 3, 4 }));
    }

}
