package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBSessionReadinessPolicyTest {
    @Test public void coldProcessIsReadyForFirstSession() {
        ModeBSessionReadinessPolicy.Tracker tracker = new ModeBSessionReadinessPolicy.Tracker();
        assertTrue(tracker.canStartNewSession());
        assertEquals("", tracker.getBlockedReason());
    }

    @Test public void activeSessionBlocksNewSessionUntilStopAndCleanupFinish() {
        ModeBSessionReadinessPolicy.Tracker tracker = new ModeBSessionReadinessPolicy.Tracker();
        assertTrue(tracker.tryBeginSession() > 0L);
        assertFalse(tracker.canStartNewSession());
        assertEquals(-1L, tracker.tryBeginSession());

        long cleanupEpoch = tracker.beginCleanup();
        assertFalse("Cleanup pending must still block new session", tracker.canStartNewSession());

        tracker.recordStreamTeardownResult(cleanupEpoch, true, "");
        assertFalse("Asset deletion still pending must still block new session", tracker.canStartNewSession());

        assertTrue(tracker.markAssetCleanupSucceeded(cleanupEpoch));
        assertTrue(tracker.canStartNewSession());
    }

    @Test public void teardownFailureKeepsReadinessFalseEvenAfterAssetDeletionSucceeds() {
        ModeBSessionReadinessPolicy.Tracker tracker = new ModeBSessionReadinessPolicy.Tracker();
        assertTrue(tracker.tryBeginSession() > 0L);
        long cleanupEpoch = tracker.beginCleanup();
        tracker.recordStreamTeardownResult(cleanupEpoch, false, "GL worker did not terminate");
        assertFalse(tracker.markAssetCleanupSucceeded(cleanupEpoch));
        assertFalse(tracker.canStartNewSession());
        assertTrue(tracker.getBlockedReason().contains("GL worker did not terminate"));
    }

    @Test public void exhaustedAssetCleanupFailureKeepsReadinessFalseEvenAfterTeardownSucceeded() {
        ModeBSessionReadinessPolicy.Tracker tracker = new ModeBSessionReadinessPolicy.Tracker();
        assertTrue(tracker.tryBeginSession() > 0L);
        long cleanupEpoch = tracker.beginCleanup();
        tracker.recordStreamTeardownResult(cleanupEpoch, true, "");
        tracker.markAssetCleanupFailed(cleanupEpoch, "Cache delete retry exhausted");
        assertFalse(tracker.canStartNewSession());
        assertTrue(tracker.getBlockedReason().contains("Cache delete retry exhausted"));
    }

    @Test public void staleCleanupEpochCannotOverrideNewerSession() {
        ModeBSessionReadinessPolicy.Tracker tracker = new ModeBSessionReadinessPolicy.Tracker();
        assertTrue(tracker.tryBeginSession() > 0L);
        long firstCleanup = tracker.beginCleanup();
        tracker.recordStreamTeardownResult(firstCleanup, true, "");
        assertTrue(tracker.markAssetCleanupSucceeded(firstCleanup));

        assertTrue(tracker.tryBeginSession() > 0L);
        assertFalse("Stale cleanup completion must be ignored",
                tracker.markAssetCleanupSucceeded(firstCleanup));
        assertFalse("Active second session must stay blocked", tracker.canStartNewSession());
    }

    @Test public void pureRuleRequiresAllConditions() {
        assertTrue(ModeBSessionReadinessPolicy.canStartNewSession(false, false, true, true));
        assertFalse(ModeBSessionReadinessPolicy.canStartNewSession(true, false, true, true));
        assertFalse(ModeBSessionReadinessPolicy.canStartNewSession(false, true, true, true));
        assertFalse(ModeBSessionReadinessPolicy.canStartNewSession(false, false, false, true));
        assertFalse(ModeBSessionReadinessPolicy.canStartNewSession(false, false, true, false));
    }
}
