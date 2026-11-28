package com.syntxrr.streamtools;

import org.json.JSONObject;
import org.junit.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Deterministic unit tests for Mode A Batch 4:
 * - ConnectivityManager.NetworkCallback registration once & idempotent cleanup
 * - Bounded PARTIAL_WAKE_LOCK & WifiLock acquisition/release/expiry
 * - Debounced network loss / restoration / rapid transition storm prevention
 * - Service & session generation guards against stale callbacks
 * - Preservation of NativeTikTokEventBuffer sessionId, nativeSequence, and epoch gate across network reconnect
 * - Preservation of Direct/Euler retry-budget isolation
 */
public class CompanionServiceResilienceTest {

    // -------------------------------------------------------------------------
    // 1 & 2. Network callback single registration & cleanup on destruction
    // -------------------------------------------------------------------------

    @Test
    public void networkCallbackRegistersOncePerServiceLifecycleAndUnregistersIdempotentlyOnDestroy() {
        CompanionService.NetworkCallbackCoordinator coordinator =
                new CompanionService.NetworkCallbackCoordinator();
        AtomicInteger registerCalls = new AtomicInteger(0);
        AtomicInteger unregisterCalls = new AtomicInteger(0);

        CompanionService.NetworkCallbackRegistrar registrar = new CompanionService.NetworkCallbackRegistrar() {
            @Override
            public boolean register() {
                registerCalls.incrementAndGet();
                return true;
            }

            @Override
            public void unregister() {
                unregisterCalls.incrementAndGet();
            }
        };

        assertTrue(coordinator.registerOnce(1L, registrar));
        assertFalse("Duplicate registerOnce in same lifecycle must be ignored",
                coordinator.registerOnce(1L, registrar));
        assertEquals(1, registerCalls.get());
        assertTrue(coordinator.isRegistered());
        assertTrue(coordinator.canDispatchCallback(1L));

        assertTrue(coordinator.unregisterOnce(1L, registrar));
        assertFalse("Repeated cleanup/onDestroy must not double-unregister",
                coordinator.unregisterOnce(1L, registrar));
        assertEquals(1, unregisterCalls.get());
        assertFalse(coordinator.isRegistered());
        assertFalse(coordinator.canDispatchCallback(1L));
    }

    // -------------------------------------------------------------------------
    // 3 & 4. Network loss & restoration coordination with existing reconnect policy
    // -------------------------------------------------------------------------

    @Test
    public void networkLossPausesWithoutDuplicateAttemptsAndRestorationCoordinatesOnceWithExistingBudget() {
        TikTokLiveConnector.NetworkCoordinator netCoord = new TikTokLiveConnector.NetworkCoordinator();
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 3; // Existing attempts prior to network drop

        long sessionGen = 10L;
        netCoord.initializeBaseline(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 100L));

        // Simulate network loss
        long lossEpoch = netCoord.submitSnapshot(
                new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L),
                sessionGen
        );
        assertTrue(lossEpoch > 0L);

        TikTokLiveConnector.NetworkTransitionAction lossAction = netCoord.evaluateSettledIfCurrent(
                sessionGen,
                lossEpoch,
                true,
                "connected_direct",
                false,
                ""
        );
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.PAUSE_FOR_NETWORK_LOSS, lossAction);
        assertFalse(netCoord.isNetworkAvailable());

        // Redundant offline updates while already paused must NOT trigger duplicate actions or consume retry budget
        long redundantOffline = netCoord.submitSnapshot(
                new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L),
                sessionGen
        );
        assertEquals(-1L, redundantOffline);
        assertEquals("Offline pause must not consume or reset Direct retry budget",
                3, policy.directReconnectAttempt);

        // Network returns on cellular (handle 200) -> coordinates single reconnect keeping retry budget intact
        long restoreEpoch = netCoord.submitSnapshot(
                new TikTokLiveConnector.NetworkSnapshot(true, false, true, 200L),
                sessionGen
        );
        assertTrue(restoreEpoch > lossEpoch);
        TikTokLiveConnector.NetworkTransitionAction restoreAction = netCoord.evaluateSettledIfCurrent(
                sessionGen,
                restoreEpoch,
                true,
                "reconnecting",
                true,
                "NETWORK_UNAVAILABLE"
        );
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.TRIGGER_COORDINATED_RECONNECT, restoreAction);
        assertEquals("Network restoration must NOT reset Direct retry budget",
                3, policy.directReconnectAttempt);

        // Redundant onCapabilitiesChanged on the same cellular handle must be a complete NO-OP
        long sameNetEpoch = netCoord.submitSnapshot(
                new TikTokLiveConnector.NetworkSnapshot(true, false, true, 200L),
                sessionGen
        );
        assertEquals(-1L, sameNetEpoch);
    }

    // -------------------------------------------------------------------------
    // 5. Rapid Wi-Fi / mobile transitions do not create reconnect storms
    // -------------------------------------------------------------------------

    @Test
    public void rapidNetworkTransitionsCollapseIntoSingleSettledHandoffAction() {
        TikTokLiveConnector.NetworkCoordinator netCoord = new TikTokLiveConnector.NetworkCoordinator();
        long sessionGen = 4L;
        netCoord.initializeBaseline(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 100L));

        // Burst: Wi-Fi drop -> Cellular up -> Cellular drop -> Wi-Fi 2 up
        long e1 = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L), sessionGen);
        long e2 = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(true, false, true, 200L), sessionGen);
        long e3 = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L), sessionGen);
        long e4 = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 300L), sessionGen);

        // All superseded debounce tasks (e1, e2, e3) must become NO-OP
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.NONE,
                netCoord.evaluateSettledIfCurrent(sessionGen, e1, true, "connected_direct", false, ""));
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.NONE,
                netCoord.evaluateSettledIfCurrent(sessionGen, e2, true, "connected_direct", false, ""));
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.NONE,
                netCoord.evaluateSettledIfCurrent(sessionGen, e3, true, "connected_direct", false, ""));

        // Only the final settled snapshot (Wi-Fi handle 100 -> Wi-Fi handle 300) triggers ONE handoff reconnect
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.TRIGGER_HANDOFF_RECONNECT,
                netCoord.evaluateSettledIfCurrent(sessionGen, e4, true, "connected_direct", false, ""));

        // Further callback on the same handle 300 after settling is NONE
        assertEquals(-1L, netCoord.submitSnapshot(
                new TikTokLiveConnector.NetworkSnapshot(true, true, false, 300L), sessionGen));
    }

    // -------------------------------------------------------------------------
    // 6, 7 & 8. Screen lock/background, WakeLock/WifiLock bounds, disconnect & destruction
    // -------------------------------------------------------------------------

    @Test
    public void screenLockAndBackgroundDoNotTerminateActiveSessionOrResetNativeState() throws Exception {
        FakeLockHardware hardware = new FakeLockHardware();
        CompanionService.BoundedLockManager locks = new CompanionService.BoundedLockManager(hardware);
        CompanionService.NetworkCallbackCoordinator cbCoord = new CompanionService.NetworkCallbackCoordinator();
        TikTokLiveConnector.NetworkCoordinator netCoord = new TikTokLiveConnector.NetworkCoordinator();
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();

        long serviceGen = 3L;
        locks.bindGeneration(serviceGen);
        cbCoord.registerOnce(serviceGen, new CompanionService.NetworkCallbackRegistrar() {
            @Override
            public boolean register() {
                return true;
            }

            @Override
            public void unregister() {}
        });
        netCoord.initializeBaseline(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 77L));
        policy.onDirectConnected(10_000L);
        long initialSessionId = buffer.getCurrentSessionId();
        JSONObject preLockEvent = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("content", "pre_lock"));

        // Screen locks & UI moves to background: CompanionService keeps NetworkCallback & locks active,
        // and redundant network capability pings on same Wi-Fi handle 77 are ignored (no reconnect, no reset).
        locks.sync(15_000L, serviceGen, true, true, true);
        long epoch = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 77L), 1L);
        assertEquals(-1L, epoch);
        assertTrue(cbCoord.isRegistered());
        assertTrue(locks.isWakeHeld());
        assertTrue(locks.isWifiHeld());
        assertEquals(initialSessionId, buffer.getCurrentSessionId());
        assertEquals(1L, preLockEvent.getLong("nativeSequence"));
        assertTrue("Active transport start timestamp remains valid across background/screen lock",
                policy.transportConnectedAtMs > 0L);

        // Chat event arriving while screen locked / backgrounded stays on same nativeSessionId & sequence
        JSONObject lockedEvent = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("content", "while_locked"));
        assertEquals(initialSessionId, lockedEvent.getLong("nativeSessionId"));
        assertEquals(2L, lockedEvent.getLong("nativeSequence"));
    }

    @Test
    public void activeSessionAcquiresBoundedLocksWithoutDuplicatesAndReleasesOnDisconnectOrWifiLoss() {
        FakeLockHardware hardware = new FakeLockHardware();
        CompanionService.BoundedLockManager locks = new CompanionService.BoundedLockManager(hardware);
        long gen = 1L;
        locks.bindGeneration(gen);

        // Inactive or disconnected session must NEVER acquire locks
        locks.sync(1_000L, gen, true, false, true);
        assertFalse(locks.isWakeHeld());
        assertFalse(locks.isWifiHeld());
        assertEquals(0, hardware.wakeAcquireCount);
        assertEquals(0, hardware.wifiAcquireCount);

        // Active session on Wi-Fi (e.g., screen locked / app backgrounded) acquires PARTIAL_WAKE_LOCK + WifiLock
        locks.sync(2_000L, gen, true, true, true);
        assertTrue(locks.isWakeHeld());
        assertTrue(locks.isWifiHeld());
        assertEquals(1, hardware.wakeAcquireCount);
        assertEquals(1, hardware.wifiAcquireCount);
        assertEquals(CompanionService.LOCK_LEASE_MS, hardware.lastWakeTimeoutMs);
        assertEquals(2_000L + CompanionService.LOCK_LEASE_MS, locks.getWakeExpiresAtMs());

        // Repeated sync within active window must NOT duplicate-acquire either lock
        locks.sync(30_000L, gen, true, true, true);
        assertEquals(1, hardware.wakeAcquireCount);
        assertEquals(1, hardware.wifiAcquireCount);

        // Switching from Wi-Fi to cellular releases WifiLock while retaining bounded WakeLock
        locks.sync(40_000L, gen, true, true, false);
        assertTrue(locks.isWakeHeld());
        assertFalse(locks.isWifiHeld());
        assertEquals(1, hardware.wifiReleaseCount);
        assertEquals(0, hardware.wakeReleaseCount);

        // Explicit disconnect (sessionRequiresLocks = false) releases remaining WakeLock immediately
        locks.sync(50_000L, gen, true, false, false);
        assertFalse(locks.isWakeHeld());
        assertFalse(locks.isWifiHeld());
        assertEquals(1, hardware.wakeReleaseCount);
    }

    @Test
    public void serviceDestructionAndLeaseExpiryReleaseAllLocksWithoutIndefiniteHold() {
        FakeLockHardware hardware = new FakeLockHardware();
        CompanionService.BoundedLockManager locks = new CompanionService.BoundedLockManager(hardware);
        long gen = 5L;
        locks.bindGeneration(gen);

        locks.sync(10_000L, gen, true, true, true);
        assertTrue(locks.isWakeHeld());
        assertTrue(locks.isWifiHeld());

        // If no activity renews lease before LOCK_LEASE_MS, expireIfNeeded releases both locks
        locks.expireIfNeeded(10_000L + CompanionService.LOCK_LEASE_MS, gen);
        assertFalse("WakeLock must never be held indefinitely", locks.isWakeHeld());
        assertFalse("WifiLock must never be held indefinitely", locks.isWifiHeld());
        assertEquals(1, hardware.wakeReleaseCount);
        assertEquals(1, hardware.wifiReleaseCount);

        // Re-acquire and verify service destruction cleanup (releaseAll)
        locks.sync(20_000L, gen, true, true, true);
        assertTrue(locks.isWakeHeld());
        assertTrue(locks.isWifiHeld());
        locks.releaseAll(gen);
        assertFalse(locks.isWakeHeld());
        assertFalse(locks.isWifiHeld());
        assertEquals(2, hardware.wakeReleaseCount);
        assertEquals(2, hardware.wifiReleaseCount);
    }

    // -------------------------------------------------------------------------
    // 9 & 10. Network reconnect preserves nativeSessionId, nativeSequence & replay cursor
    // -------------------------------------------------------------------------

    @Test
    public void networkReconnectPreservesNativeEventBufferSessionSequenceAndEpochGate() throws Exception {
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();
        NativeTikTokEventBatchEpochGate epochGate = new NativeTikTokEventBatchEpochGate();
        TikTokLiveConnector.NetworkCoordinator netCoord = new TikTokLiveConnector.NetworkCoordinator();

        long initialSessionId = buffer.getCurrentSessionId();
        long initialEpoch = epochGate.getCurrentEpoch();
        long sessionGen = 1L;
        netCoord.initializeBaseline(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 11L));

        // Events 1..3 recorded before temporary network drop
        JSONObject e1 = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("content", "hi1"));
        JSONObject e2 = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("content", "hi2"));
        JSONObject e3 = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("content", "hi3"));
        assertEquals(initialSessionId, e1.getLong("nativeSessionId"));
        assertEquals(1L, e1.getLong("nativeSequence"));
        assertEquals(3L, e3.getLong("nativeSequence"));

        // Temporary network loss + restoration inside same TikTok session
        long lossEpoch = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L), sessionGen);
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.PAUSE_FOR_NETWORK_LOSS,
                netCoord.evaluateSettledIfCurrent(sessionGen, lossEpoch, true, "connected_direct", false, ""));
        long restoreEpoch = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(true, false, true, 22L), sessionGen);
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.TRIGGER_COORDINATED_RECONNECT,
                netCoord.evaluateSettledIfCurrent(sessionGen, restoreEpoch, true, "reconnecting", true, "NETWORK_UNAVAILABLE"));

        // Event 4 arrives after network reconnect; buffer was NOT reset via beginSession() and epochGate did NOT advance
        JSONObject e4 = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("content", "after_net"));
        assertEquals("Network reconnect must NOT change nativeSessionId",
                initialSessionId, buffer.getCurrentSessionId());
        assertEquals(initialSessionId, e4.getLong("nativeSessionId"));
        assertEquals("Network reconnect must NOT reset nativeSequence",
                4L, e4.getLong("nativeSequence"));
        assertEquals("Network reconnect must NOT invalidate Batch 3A.1 epoch gate",
                initialEpoch, epochGate.getCurrentEpoch());

        // TypeScript replay query using cursor afterSequence=2 returns remaining same-session events with sessionChanged=false
        NativeTikTokEventBuffer.Snapshot replay = buffer.getEventsSince(initialSessionId, 2L, 256);
        assertFalse("Replay cursor must NOT observe sessionChanged on network reconnect", replay.sessionChanged);
        assertEquals(initialSessionId, replay.sessionId);
        assertEquals(2, replay.events.size());
        assertEquals(3L, replay.events.get(0).getLong("nativeSequence"));
        assertEquals(4L, replay.events.get(1).getLong("nativeSequence"));
    }

    // -------------------------------------------------------------------------
    // 11. Stale callbacks from an older service/session generation are ignored
    // -------------------------------------------------------------------------

    @Test
    public void staleCallbacksFromOlderServiceOrSessionGenerationAreIgnored() {
        CompanionService.NetworkCallbackCoordinator cbCoord = new CompanionService.NetworkCallbackCoordinator();
        AtomicInteger unregisters = new AtomicInteger(0);
        CompanionService.NetworkCallbackRegistrar registrar = new CompanionService.NetworkCallbackRegistrar() {
            @Override
            public boolean register() {
                return true;
            }

            @Override
            public void unregister() {
                unregisters.incrementAndGet();
            }
        };

        assertTrue(cbCoord.registerOnce(1L, registrar));
        // Unregister old gen then start gen 2
        assertTrue(cbCoord.unregisterOnce(1L, registrar));
        assertTrue(cbCoord.registerOnce(2L, registrar));
        assertFalse("Old service generation callback must be ignored", cbCoord.canDispatchCallback(1L));
        assertTrue(cbCoord.canDispatchCallback(2L));
        assertFalse("Stale unregister for gen 1 must not unregister gen 2", cbCoord.unregisterOnce(1L, registrar));
        assertEquals(1, unregisters.get());

        // Stale session generation in NetworkCoordinator must be ignored
        TikTokLiveConnector.NetworkCoordinator netCoord = new TikTokLiveConnector.NetworkCoordinator();
        netCoord.initializeBaseline(new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L));
        long epochGen1 = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 100L), 1L);
        netCoord.onSessionGenerationChanged(2L);
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.NONE,
                netCoord.evaluateSettledIfCurrent(1L, epochGen1, true, "reconnecting", true, "NETWORK_UNAVAILABLE"));

        // Stale service generation in BoundedLockManager must be ignored
        FakeLockHardware hardware = new FakeLockHardware();
        CompanionService.BoundedLockManager lockManager = new CompanionService.BoundedLockManager(hardware);
        lockManager.bindGeneration(2L);
        lockManager.sync(5_000L, 1L, true, true, true);
        assertFalse("Stale generation must not acquire locks", lockManager.isWakeHeld());
        assertFalse("Stale generation must not acquire WifiLock", lockManager.isWifiHeld());
    }

    // -------------------------------------------------------------------------
    // 12. Existing Direct/Euler retry-budget behavior remains intact
    // -------------------------------------------------------------------------

    @Test
    public void directAndEulerRetryBudgetsRemainIsolatedAcrossNetworkRecoveryAndStabilityRules() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        TikTokLiveConnector.NetworkCoordinator netCoord = new TikTokLiveConnector.NetworkCoordinator();
        netCoord.initializeBaseline(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 10L));

        // Burn 2 Direct retries, leave Euler untouched
        assertEquals(1, policy.nextTransportRetryDecision(false, true, true, false).attemptNumber);
        assertEquals(2, policy.nextTransportRetryDecision(false, true, true, false).attemptNumber);
        assertEquals(0, policy.eulerReconnectAttempt);

        // Network loss & restore does NOT reset Direct budget or advance Euler budget
        long lossEpoch = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L), 1L);
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.PAUSE_FOR_NETWORK_LOSS,
                netCoord.evaluateSettledIfCurrent(1L, lossEpoch, true, "reconnecting", false, ""));
        long restoreEpoch = netCoord.submitSnapshot(new TikTokLiveConnector.NetworkSnapshot(true, true, false, 11L), 1L);
        assertEquals(TikTokLiveConnector.NetworkTransitionAction.TRIGGER_COORDINATED_RECONNECT,
                netCoord.evaluateSettledIfCurrent(1L, restoreEpoch, true, "reconnecting", true, "NETWORK_UNAVAILABLE"));
        assertEquals(2, policy.directReconnectAttempt);
        assertEquals(0, policy.eulerReconnectAttempt);

        // Next Direct retry continues sequentially at attempt 3
        assertEquals(3, policy.nextTransportRetryDecision(false, true, true, false).attemptNumber);
        assertEquals(0, policy.eulerReconnectAttempt);

        // Short connection (<60s) preserves Direct attempt 3; >=60s resets only Direct budget
        policy.eulerReconnectAttempt = 2;
        policy.onDirectConnected(10_000L);
        policy.onDirectTransportEnded(40_000L);
        assertEquals(3, policy.directReconnectAttempt);
        assertEquals(2, policy.eulerReconnectAttempt);

        policy.onDirectConnected(100_000L);
        policy.onDirectTransportEnded(160_000L);
        assertEquals(0, policy.directReconnectAttempt);
        assertEquals(2, policy.eulerReconnectAttempt);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static final class FakeLockHardware implements CompanionService.LockHardwareAdapter {
        int wakeAcquireCount = 0;
        int wakeReleaseCount = 0;
        int wifiAcquireCount = 0;
        int wifiReleaseCount = 0;
        long lastWakeTimeoutMs = 0L;

        @Override
        public boolean acquireWakeLock(long timeoutMs) {
            wakeAcquireCount++;
            lastWakeTimeoutMs = timeoutMs;
            return true;
        }

        @Override
        public void releaseWakeLock() {
            wakeReleaseCount++;
        }

        @Override
        public boolean acquireWifiLock() {
            wifiAcquireCount++;
            return true;
        }

        @Override
        public void releaseWifiLock() {
            wifiReleaseCount++;
        }
    }
}
