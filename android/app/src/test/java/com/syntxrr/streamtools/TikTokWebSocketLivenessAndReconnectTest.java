package com.syntxrr.streamtools;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * Offline unit tests for Mode A Batch 2:
 * - WebSocket write failure handling, socket teardown, lock freedom, single callback guarantee
 * - RFC 6455 Ping/Pong liveness watchdog, matching vs mismatched Pong, RTT measurement, timeout
 * - Direct vs Euler retry caps, budget isolation, stable connection reset, and waiting_for_live offline resilience
 */
public class TikTokWebSocketLivenessAndReconnectTest {

    // -------------------------------------------------------------------------
    // Task 1: WebSocket Write Failure & Single-Callback Guarantee
    // -------------------------------------------------------------------------

    @Test
    public void writeSuccessReturnsTrueAndNeverTriggersOnError() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        AtomicInteger errors = new AtomicInteger(0);
        AtomicInteger closes = new AtomicInteger(0);
        TikTokWebSocketTransport transport = new TikTokWebSocketTransport();
        transport.attachOpenTransportForTesting(out, null, "7712345678901234567", new RecordingListener(errors, closes));

        assertTrue(transport.sendBinary(new byte[]{1, 2, 3, 4}));
        assertTrue(out.size() > 0);
        assertEquals(0, errors.get());
        assertEquals(0, closes.get());
        assertTrue(transport.isOpen());
    }

    @Test
    public void sendBinaryWriteFailureClosesSocketStopsHeartbeatFiresOnErrorOnceOutsideWriteLock() {
        AtomicBoolean socketClosed = new AtomicBoolean(false);
        Closeable closeable = () -> socketClosed.set(true);
        OutputStream failingOut = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("Broken pipe");
            }

            @Override
            public void write(byte[] b, int off, int len) throws IOException {
                throw new IOException("Broken pipe");
            }
        };

        AtomicInteger errorCount = new AtomicInteger(0);
        AtomicInteger closeCount = new AtomicInteger(0);
        AtomicBoolean lockHeldDuringCallback = new AtomicBoolean(true);
        AtomicReference<String> errorMsg = new AtomicReference<>("");
        TikTokWebSocketTransport transport = new TikTokWebSocketTransport();

        TikTokWebSocketTransport.Listener listener = new TikTokWebSocketTransport.Listener() {
            @Override
            public void onConnected(int httpStatus) {}

            @Override
            public void onBinaryFrame(byte[] payload) {}

            @Override
            public void onTextFrame(String text) {}

            @Override
            public void onHandshakeRejected(int httpStatus, String reason) {}

            @Override
            public void onClosed(int code, String reason, boolean byRemote) {
                closeCount.incrementAndGet();
            }

            @Override
            public void onError(String reason) {
                lockHeldDuringCallback.set(transport.isWriteLockHeldByCurrentThreadForTesting());
                errorMsg.set(reason);
                errorCount.incrementAndGet();
            }
        };

        transport.attachOpenTransportForTesting(failingOut, closeable, "7712345678901234567", listener);
        transport.startHeartbeatWithCustomIntervalForTesting(10_000L, true);
        assertTrue(transport.isHeartbeatRunningForTesting());

        boolean ok = transport.sendBinary(new byte[]{10, 20, 30});
        assertFalse(ok);
        assertTrue("Socket must be closed on write failure", socketClosed.get());
        assertFalse("Transport must be marked closed", transport.isOpen());
        assertFalse("Heartbeat scheduler must stop on write failure", transport.isHeartbeatRunningForTesting());
        assertEquals("onError must fire once", 1, errorCount.get());
        assertEquals("onClosed must not fire alongside onError", 0, closeCount.get());
        assertFalse("mWriteLock must NOT be held during onError callback", lockHeldDuringCallback.get());
        assertTrue(errorMsg.get().contains("Broken pipe"));

        // Subsequent send attempts must fail fast without double-firing onError.
        assertFalse(transport.sendBinary(new byte[]{40, 50}));
        assertEquals(1, errorCount.get());
    }

    @Test
    public void pingAndHeartbeatWriteFailuresTriggerOnErrorExactlyOnce() {
        AtomicInteger errorCount = new AtomicInteger(0);
        AtomicInteger closeCount = new AtomicInteger(0);
        AtomicBoolean socketClosed = new AtomicBoolean(false);
        OutputStream failingOut = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("ECONNRESET");
            }
        };
        TikTokWebSocketTransport pingFailTransport = new TikTokWebSocketTransport();
        pingFailTransport.attachOpenTransportForTesting(
                failingOut,
                () -> socketClosed.set(true),
                "7712345678901234567",
                new RecordingListener(errorCount, closeCount)
        );
        pingFailTransport.performKeepaliveTickForTesting(true);
        assertEquals(1, errorCount.get());
        assertEquals(0, closeCount.get());
        assertTrue(socketClosed.get());

        // Succeed on Ping (first write) then fail on TikTok protobuf heartbeat (second write).
        AtomicInteger writeCalls = new AtomicInteger(0);
        AtomicInteger hbErrors = new AtomicInteger(0);
        AtomicInteger hbCloses = new AtomicInteger(0);
        AtomicBoolean hbSocketClosed = new AtomicBoolean(false);
        OutputStream secondWriteFails = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                if (writeCalls.incrementAndGet() > 1) {
                    throw new IOException("HB write reset");
                }
            }

            @Override
            public void write(byte[] b, int off, int len) throws IOException {
                if (writeCalls.incrementAndGet() > 1) {
                    throw new IOException("HB write reset");
                }
            }
        };
        TikTokWebSocketTransport hbFailTransport = new TikTokWebSocketTransport();
        hbFailTransport.attachOpenTransportForTesting(
                secondWriteFails,
                () -> hbSocketClosed.set(true),
                "7712345678901234567",
                new RecordingListener(hbErrors, hbCloses)
        );
        hbFailTransport.performKeepaliveTickForTesting(true);
        assertEquals(1, hbErrors.get());
        assertEquals(0, hbCloses.get());
        assertTrue(hbSocketClosed.get());
        assertFalse(hbFailTransport.isOpen());
    }

    @Test
    public void serverPingPongReplyWriteFailureFailsTransportOnce() {
        byte[] incomingPing = encodeUnmaskedFrame(0x9, "srv".getBytes(StandardCharsets.UTF_8));
        AtomicInteger errors = new AtomicInteger(0);
        AtomicInteger closes = new AtomicInteger(0);
        AtomicBoolean socketClosed = new AtomicBoolean(false);
        OutputStream failingOut = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("Pong reply write failed");
            }
        };
        TikTokWebSocketTransport transport = new TikTokWebSocketTransport();
        transport.attachOpenTransportForTesting(
                failingOut,
                () -> socketClosed.set(true),
                null,
                new RecordingListener(errors, closes)
        );

        transport.runReadLoopForTesting(new ByteArrayInputStream(incomingPing), new RecordingListener(errors, closes));
        assertEquals(1, errors.get());
        assertEquals(0, closes.get());
        assertTrue(socketClosed.get());
        assertFalse(transport.isOpen());
    }

    @Test
    public void concurrentWriteFailureUnblocksReaderThreadAndFiresOnErrorOnlyOnce() throws Exception {
        PipedInputStream readerIn = new PipedInputStream();
        PipedOutputStream peerOut = new PipedOutputStream(readerIn);

        AtomicInteger errors = new AtomicInteger(0);
        AtomicInteger closes = new AtomicInteger(0);
        RecordingListener listener = new RecordingListener(errors, closes);
        TikTokWebSocketTransport transport = new TikTokWebSocketTransport();

        Closeable closeResource = () -> {
            try {
                peerOut.close();
            } finally {
                readerIn.close();
            }
        };
        OutputStream failingOut = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("Concurrent write pipe broken");
            }
        };
        transport.attachOpenTransportForTesting(failingOut, closeResource, "7712345678901234567", listener);

        CountDownLatch readerFinished = new CountDownLatch(1);
        Thread reader = new Thread(() -> {
            try {
                transport.runReadLoopForTesting(readerIn, listener);
            } finally {
                readerFinished.countDown();
            }
        }, "TestWsReader");
        reader.start();

        assertFalse(transport.sendBinary(new byte[]{7, 8, 9}));
        assertTrue("Reader loop must unblock once socket resource is closed",
                readerFinished.await(2, TimeUnit.SECONDS));
        assertEquals("Concurrent write + reader teardown must emit onError strictly once",
                1, errors.get());
        assertEquals(0, closes.get());
    }

    @Test
    public void normalCloseNeverFiresOnErrorEvenIfCloseFrameFails() {
        AtomicInteger errors = new AtomicInteger(0);
        AtomicInteger closes = new AtomicInteger(0);
        AtomicBoolean socketClosed = new AtomicBoolean(false);
        OutputStream failingCloseOut = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("Close write ignored");
            }
        };
        TikTokWebSocketTransport transport = new TikTokWebSocketTransport();
        transport.attachOpenTransportForTesting(
                failingCloseOut,
                () -> socketClosed.set(true),
                null,
                new RecordingListener(errors, closes)
        );
        transport.startHeartbeatWithCustomIntervalForTesting(10_000L, false);

        transport.close();
        assertTrue(socketClosed.get());
        assertFalse(transport.isOpen());
        assertFalse(transport.isHeartbeatRunningForTesting());
        assertEquals("Normal close() must never trigger onError", 0, errors.get());
        assertEquals("Normal close() must never trigger onClosed", 0, closes.get());
    }

    // -------------------------------------------------------------------------
    // Task 2: RFC 6455 Ping/Pong Watchdog & Direct vs Euler Keepalive
    // -------------------------------------------------------------------------

    @Test
    public void watchdogConstantsLeaveSafeMarginAboveMaxHeartbeatPlusPongDeadline() {
        assertEquals(20_000L, TikTokWebSocketTransport.DEFAULT_PONG_TIMEOUT_MS);
        assertTrue("READ_TIMEOUT_MS must exceed 30s heartbeat + 20s pong deadline",
                TikTokWebSocketTransport.READ_TIMEOUT_MS >= 60_000);
        assertEquals(65_000, TikTokWebSocketTransport.READ_TIMEOUT_MS);
    }

    @Test
    public void matchingPongResolvesPendingPingAndUpdatesRttWhileMismatchedPongIsIgnored() throws Exception {
        AtomicLong clock = new AtomicLong(1_000L);
        ByteArrayOutputStream capturedOut = new ByteArrayOutputStream();
        AtomicInteger errors = new AtomicInteger(0);
        AtomicInteger closes = new AtomicInteger(0);

        TikTokWebSocketTransport transport = new TikTokWebSocketTransport(20_000L, clock::get);
        transport.attachOpenTransportForTesting(
                capturedOut, null, null, new RecordingListener(errors, closes));

        // Euler mode (sendTikTokHeartbeat=false): sends exactly 1 RFC Ping frame.
        transport.performKeepaliveTickForTesting(false);
        byte[] ping1 = transport.getPendingPingPayloadForTesting();
        assertNotNull(ping1);
        assertEquals(12, ping1.length);

        List<CapturedFrame> frames = decodeClientFrames(capturedOut.toByteArray());
        assertEquals("Euler mode keepalive must send only RFC Ping (no TikTok protobuf hb)", 1, frames.size());
        assertEquals(0x9, frames.get(0).opcode);
        assertArrayEquals(ping1, frames.get(0).payload);

        // Next keepalive tick before deadline must NOT send a second Ping while ping1 is pending.
        clock.set(10_000L);
        transport.performKeepaliveTickForTesting(false);
        assertEquals(1, decodeClientFrames(capturedOut.toByteArray()).size());
        assertArrayEquals(ping1, transport.getPendingPingPayloadForTesting());

        // Mismatched Pong must NOT clear pending ping or update RTT.
        clock.set(10_250L);
        assertFalse(transport.handleIncomingPongForTesting(new byte[]{1, 2, 3, 4}));
        assertNotNull(transport.getPendingPingPayloadForTesting());
        assertEquals(0L, transport.getLastRttMs());

        // Matching Pong resolves pending ping and updates RTT cleanly (10_385 - 1_000 = 9_385 ms).
        clock.set(10_385L);
        assertTrue(transport.handleIncomingPongForTesting(ping1));
        assertNull(transport.getPendingPingPayloadForTesting());
        assertEquals(9_385L, transport.getLastRttMs());

        clock.set(20_000L);
        transport.performKeepaliveTickForTesting(false);
        byte[] ping2 = transport.getPendingPingPayloadForTesting();
        assertNotNull(ping2);
        assertFalse("Subsequent Ping payload must be unique", Arrays.equals(ping1, ping2));
        clock.set(20_088L);
        byte[] incomingPong2 = encodeUnmaskedFrame(0xA, ping2);
        byte[] incomingClose = encodeUnmaskedFrame(0x8, new byte[]{0x03, (byte) 0xE8});
        byte[] streamBytes = new byte[incomingPong2.length + incomingClose.length];
        System.arraycopy(incomingPong2, 0, streamBytes, 0, incomingPong2.length);
        System.arraycopy(incomingClose, 0, streamBytes, incomingPong2.length, incomingClose.length);

        transport.readFrameLoopForTesting(new ByteArrayInputStream(streamBytes), new RecordingListener(errors, closes));
        assertNull(transport.getPendingPingPayloadForTesting());
        assertEquals(88L, transport.getLastRttMs());
        assertEquals(0, errors.get());
        assertEquals(1, closes.get());
    }

    @Test
    public void pongTimeoutDisconnectsTransportStopsSchedulerAndFiresOnErrorOnce() throws Exception {
        AtomicInteger errors = new AtomicInteger(0);
        AtomicInteger closes = new AtomicInteger(0);
        AtomicBoolean socketClosed = new AtomicBoolean(false);
        AtomicReference<String> timeoutReason = new AtomicReference<>("");
        CountDownLatch errorLatch = new CountDownLatch(1);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        TikTokWebSocketTransport transport = new TikTokWebSocketTransport(45L);
        transport.attachOpenTransportForTesting(
                out,
                () -> socketClosed.set(true),
                "7712345678901234567",
                new TikTokWebSocketTransport.Listener() {
                    @Override
                    public void onConnected(int httpStatus) {}

                    @Override
                    public void onBinaryFrame(byte[] payload) {}

                    @Override
                    public void onTextFrame(String text) {}

                    @Override
                    public void onHandshakeRejected(int httpStatus, String reason) {}

                    @Override
                    public void onClosed(int code, String reason, boolean byRemote) {
                        closes.incrementAndGet();
                    }

                    @Override
                    public void onError(String reason) {
                        timeoutReason.set(reason);
                        errors.incrementAndGet();
                        errorLatch.countDown();
                    }
                }
        );

        transport.startHeartbeatWithCustomIntervalForTesting(15L, true);
        assertTrue("Scheduled Pong timeout must trigger onError", errorLatch.await(3, TimeUnit.SECONDS));
        assertEquals(1, errors.get());
        assertEquals(0, closes.get());
        assertTrue(socketClosed.get());
        assertFalse(transport.isOpen());
        assertFalse(transport.isHeartbeatRunningForTesting());
        assertTrue(timeoutReason.get().contains("Pong timeout"));
        // Verify Direct mode sent both Ping (0x9) and TikTok protobuf heartbeat (0x2).
        List<CapturedFrame> frames = decodeClientFrames(out.toByteArray());
        assertTrue(frames.stream().anyMatch(f -> f.opcode == 0x9));
        assertTrue(frames.stream().anyMatch(f -> f.opcode == 0x2));
    }

    // -------------------------------------------------------------------------
    // Task 4 & Task 5 & Task 6: Euler Retry Cap, Direct Isolation & waiting_for_live Network Resilience
    // -------------------------------------------------------------------------

    @Test
    public void eulerRetryLimitIsCappedAtSixWithExponentialBackoffAndIsolatedFromDirectBudget() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 4; // Existing Direct retry state must remain untouched.

        long[] expectedDelays = {2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L};
        for (int i = 0; i < TikTokLiveConnector.MAX_EULER_RECONNECT_ATTEMPTS; i++) {
            TikTokLiveConnector.RetryDecision d = policy.nextTransportRetryDecision(
                    true, true, true, true);
            assertEquals(TikTokLiveConnector.RetryAction.RETRY_EULER, d.action);
            assertEquals(i + 1, d.attemptNumber);
            assertEquals(6, d.maxAttempts);
            assertEquals(expectedDelays[i], d.delayMs);
            assertEquals("Euler retries must not mutate Direct budget", 4, policy.directReconnectAttempt);
        }

        TikTokLiveConnector.RetryDecision primaryExhausted = policy.nextTransportRetryDecision(
                true, true, true, true);
        assertEquals(TikTokLiveConnector.RetryAction.FAIL_EULER_EXHAUSTED, primaryExhausted.action);
        assertFalse(policy.eulerFallbackUnavailable);

        // When Euler is optional fallback on Direct, exhaustion marks eulerFallbackUnavailable for session
        // and hands back cleanly without altering directReconnectAttempt.
        TikTokLiveConnector.RetryDecision fallbackExhausted = policy.nextTransportRetryDecision(
                true, true, true, false);
        assertEquals(TikTokLiveConnector.RetryAction.EULER_FALLBACK_UNAVAILABLE, fallbackExhausted.action);
        assertTrue(policy.eulerFallbackUnavailable);
        assertEquals(4, policy.directReconnectAttempt);

        // Next Direct retry check when Direct budget is exhausted must NOT re-enter unavailable Euler fallback.
        policy.directReconnectAttempt = TikTokLiveConnector.MAX_RECONNECT_ATTEMPTS;
        TikTokLiveConnector.RetryDecision directExhausted = policy.nextTransportRetryDecision(
                false, true, true, false);
        assertEquals(TikTokLiveConnector.RetryAction.FAIL_DIRECT_EXHAUSTED, directExhausted.action);
    }

    @Test
    public void eulerStableConnectionResetsRetryCounterOnlyAfterStableThreshold() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.nextTransportRetryDecision(true, true, true, true);
        policy.nextTransportRetryDecision(true, true, true, true);
        assertEquals(2, policy.eulerReconnectAttempt);

        // Short drop (< 60s) preserves retry count.
        policy.onEulerConnected(10_000L);
        policy.onEulerTransportEnded(40_000L);
        assertEquals(2, policy.eulerReconnectAttempt);

        // Long stable session (>= 60s) resets retry count to 0.
        policy.onEulerConnected(100_000L);
        policy.onEulerTransportEnded(165_000L);
        assertEquals(0, policy.eulerReconnectAttempt);
    }

    @Test
    public void directAndEulerRetryBudgetsNeverInterfere() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        for (int i = 0; i < TikTokLiveConnector.MAX_RECONNECT_ATTEMPTS; i++) {
            TikTokLiveConnector.RetryDecision d = policy.nextTransportRetryDecision(
                    false, true, true, false);
            assertEquals(TikTokLiveConnector.RetryAction.RETRY_DIRECT, d.action);
            assertEquals(0, policy.eulerReconnectAttempt);
        }

        TikTokLiveConnector.RetryDecision switchEuler = policy.nextTransportRetryDecision(
                false, true, true, false);
        assertEquals(TikTokLiveConnector.RetryAction.SWITCH_TO_EULER_FALLBACK, switchEuler.action);
        assertEquals(0, policy.eulerReconnectAttempt);
        assertEquals(10, policy.directReconnectAttempt);
    }

    @Test
    public void waitingForLiveNetworkErrorDoesNotConsumeRetryBudgetAndCapsExponentialBackoff() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        assertFalse(policy.shouldRouteNetworkErrorToWaitingForLive());

        // Enter waiting_for_live monitoring.
        assertEquals(15_000L, policy.nextWaitingForLiveDelayMs());
        assertTrue(policy.shouldRouteNetworkErrorToWaitingForLive());

        // Simulate 15 consecutive network drops while offline in waiting_for_live.
        long[] expected = {15_000L, 30_000L, 60_000L, 120_000L, 120_000L, 120_000L};
        for (int i = 0; i < expected.length; i++) {
            assertEquals(expected[i], policy.nextWaitingForLiveNetworkDelayMs());
            assertEquals(0, policy.directReconnectAttempt);
            assertEquals(0, policy.eulerReconnectAttempt);
            assertTrue(policy.shouldRouteNetworkErrorToWaitingForLive());
        }
        for (int i = 0; i < 10; i++) {
            assertEquals(120_000L, policy.nextWaitingForLiveNetworkDelayMs());
        }
        assertEquals(0, policy.directReconnectAttempt);
        assertEquals(0, policy.eulerReconnectAttempt);

        // When network recovers and room resolves LIVE, waiting counters reset cleanly.
        policy.onRoomResolvedLive();
        assertFalse(policy.shouldRouteNetworkErrorToWaitingForLive());
        assertEquals(0, policy.waitingLiveAttempt);
        assertEquals(0, policy.waitingNetworkAttempt);

        // A live-session drop uses the normal transport reconnect budget, NOT waiting_for_live.
        TikTokLiveConnector.RetryDecision d = policy.nextTransportRetryDecision(
                false, false, false, false);
        assertEquals(TikTokLiveConnector.RetryAction.RETRY_DIRECT, d.action);
        assertEquals(1, policy.directReconnectAttempt);
    }

    @Test
    public void roomChangedResetsTransportRetryBudgetWithoutTouchingWaitingStatePrematurely() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 5;
        policy.eulerReconnectAttempt = 3;
        policy.deterministicRejectCount = 1;
        policy.transportConnectedAtMs = 50_000L;

        policy.onRoomChanged();
        assertEquals(0, policy.directReconnectAttempt);
        assertEquals(0, policy.eulerReconnectAttempt);
        assertEquals(0, policy.deterministicRejectCount);
        assertEquals(0L, policy.transportConnectedAtMs);
    }

    // -------------------------------------------------------------------------
    // Batch 2.1 Fix A & Fix B: Direct 60s Stability & Per-WebSocket One-Shot Guard
    // -------------------------------------------------------------------------

    @Test
    public void directConnectionEndingBeforeSixtySecondsDoesNotResetRetryCounter() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.deterministicRejectCount = 1;
        policy.monitoringWaitingForLive = true;
        policy.waitingNetworkAttempt = 2;

        TikTokLiveConnector.RetryDecision d1 = policy.nextTransportRetryDecision(
                false, false, false, false);
        assertEquals(1, d1.attemptNumber);
        assertEquals(1, policy.directReconnectAttempt);

        // Room-entry ACK succeeds: records timestamp & clears waiting/deterministic reject state,
        // without prematurely clearing directReconnectAttempt.
        policy.onDirectConnected(10_000L);
        assertEquals(10_000L, policy.transportConnectedAtMs);
        assertEquals(0, policy.deterministicRejectCount);
        assertFalse(policy.monitoringWaitingForLive);
        assertEquals(0, policy.waitingNetworkAttempt);
        assertEquals(1, policy.directReconnectAttempt);

        // Disconnect at 59,999 ms (< 60,000 ms): must preserve accumulated Direct retry count.
        policy.onDirectTransportEnded(69_999L);
        assertEquals(0L, policy.transportConnectedAtMs);
        assertEquals(1, policy.directReconnectAttempt);

        TikTokLiveConnector.RetryDecision d2 = policy.nextTransportRetryDecision(
                false, false, false, false);
        assertEquals(2, d2.attemptNumber);
        assertEquals(2_000L, d2.delayMs);
        assertEquals(2, policy.directReconnectAttempt);
    }

    @Test
    public void multipleShortLivedDirectSessionsAccumulateRetriesAndResetAfterSixtySeconds() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.eulerReconnectAttempt = 3; // Must remain completely isolated.

        // Three consecutive short-lived sessions (< 60s) must accumulate attempts 1 -> 2 -> 3.
        long now = 100_000L;
        for (int expectedAttempt = 1; expectedAttempt <= 3; expectedAttempt++) {
            policy.onDirectConnected(now);
            assertEquals(expectedAttempt - 1, policy.directReconnectAttempt);

            now += expectedAttempt * 15_000L; // 15s, 30s, 45s (all < 60,000ms)
            policy.onDirectTransportEnded(now);
            assertEquals(expectedAttempt - 1, policy.directReconnectAttempt);

            TikTokLiveConnector.RetryDecision decision = policy.nextTransportRetryDecision(
                    false, false, false, false);
            assertEquals(expectedAttempt, decision.attemptNumber);
            assertEquals(expectedAttempt, policy.directReconnectAttempt);
        }
        assertEquals(3, policy.eulerReconnectAttempt);

        // Fourth session stays connected exactly >= 60,000 ms -> ending it resets Direct budget.
        policy.onDirectConnected(500_000L);
        assertEquals(3, policy.directReconnectAttempt);
        policy.onDirectTransportEnded(560_000L);
        assertEquals(0, policy.directReconnectAttempt);
        assertEquals(3, policy.eulerReconnectAttempt);

        TikTokLiveConnector.RetryDecision afterStable = policy.nextTransportRetryDecision(
                false, false, false, false);
        assertEquals(1, afterStable.attemptNumber);
        assertEquals(1_000L, afterStable.delayMs);
    }

    @Test
    public void perWebSocketRecoveryGuardAllowsOnlyOneClaimAcrossTerminalErrorAndSendBinaryFailure() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        TikTokLiveConnector.OneShotRecoveryGuard guard1 = new TikTokLiveConnector.OneShotRecoveryGuard();
        AtomicInteger claims = new AtomicInteger(0);
        AtomicInteger onErrorCalls = new AtomicInteger(0);

        OutputStream failingOut = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("Broken pipe on im_enter_room");
            }
        };
        TikTokWebSocketTransport ws1 = new TikTokWebSocketTransport();
        TikTokWebSocketTransport.Listener listener = new TikTokWebSocketTransport.Listener() {
            @Override
            public void onConnected(int httpStatus) {}

            @Override
            public void onBinaryFrame(byte[] payload) {}

            @Override
            public void onTextFrame(String text) {}

            @Override
            public void onHandshakeRejected(int httpStatus, String reason) {}

            @Override
            public void onClosed(int code, String reason, boolean byRemote) {
                if (byRemote && guard1.tryClaim()) {
                    claims.incrementAndGet();
                    policy.nextTransportRetryDecision(false, false, false, false);
                }
            }

            @Override
            public void onError(String reason) {
                onErrorCalls.incrementAndGet();
                if (guard1.tryClaim()) {
                    claims.incrementAndGet();
                    policy.nextTransportRetryDecision(false, false, false, false);
                }
            }
        };
        ws1.attachOpenTransportForTesting(failingOut, null, "7712345678901234567", listener);

        // Simulate Direct onConnected() calling sendBinary(enterFrame) where writeFrame() fails
        // and synchronously invokes listener.onError() before sendBinary() returns false.
        boolean sent = ws1.sendBinary(new byte[]{1, 2, 3});
        assertFalse(sent);
        if (!sent && guard1.tryClaim()) {
            claims.incrementAndGet();
            policy.nextTransportRetryDecision(false, false, false, false);
        }
        // Even if remote onClosed tried to compete afterwards, guard1 rejects it.
        listener.onClosed(1006, "late close", true);

        assertEquals(1, onErrorCalls.get());
        assertEquals("Only one recovery path may claim guard1", 1, claims.get());
        assertEquals("Only one retry decision may be consumed", 1, policy.directReconnectAttempt);
        assertTrue(guard1.isClaimed());

        // Reverse order: explicit sendBinary(false) fallback claims first, competing callbacks become no-ops.
        TikTokLiveConnector.OneShotRecoveryGuard guard2 = new TikTokLiveConnector.OneShotRecoveryGuard();
        AtomicInteger reverseClaims = new AtomicInteger(0);
        if (guard2.tryClaim()) {
            reverseClaims.incrementAndGet();
            policy.nextTransportRetryDecision(false, false, false, false);
        }
        assertFalse("Competing onError must not claim guard2", guard2.tryClaim());
        assertFalse("Competing onClosed must not claim guard2", guard2.tryClaim());
        assertEquals(1, reverseClaims.get());
        assertEquals(2, policy.directReconnectAttempt);

        // New WebSocket attempt gets a fresh guard that can be claimed normally.
        TikTokLiveConnector.OneShotRecoveryGuard freshGuardForNextWs = new TikTokLiveConnector.OneShotRecoveryGuard();
        assertFalse(freshGuardForNextWs.isClaimed());
        assertTrue(freshGuardForNextWs.tryClaim());
        assertEquals(3, policy.nextTransportRetryDecision(false, false, false, false).attemptNumber);
    }

    // -------------------------------------------------------------------------
    // Batch 2.2: Natural LIVE End & Stable Transport Retry Reset
    // -------------------------------------------------------------------------

    @Test
    public void naturalDirectLiveEndAfterSixtySecondsResetsOnlyDirectRetryCounter() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 4;
        policy.eulerReconnectAttempt = 2;

        policy.onDirectConnected(100_000L);
        policy.onNaturalLiveEnded(true, "direct_ws", true, 160_000L);

        assertEquals(0, policy.directReconnectAttempt);
        assertEquals(2, policy.eulerReconnectAttempt);
        assertEquals(0L, policy.transportConnectedAtMs);
    }

    @Test
    public void naturalDirectLiveEndBeforeSixtySecondsPreservesDirectRetryCounter() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 4;
        policy.eulerReconnectAttempt = 2;

        policy.onDirectConnected(100_000L);
        policy.onNaturalLiveEnded(true, "direct_ws", true, 159_999L);

        assertEquals(4, policy.directReconnectAttempt);
        assertEquals(2, policy.eulerReconnectAttempt);
        assertEquals(0L, policy.transportConnectedAtMs);
    }

    @Test
    public void naturalEulerLiveEndAfterSixtySecondsResetsOnlyEulerRetryCounter() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 5;
        policy.eulerReconnectAttempt = 3;

        policy.onEulerConnected(200_000L);
        policy.onNaturalLiveEnded(true, "euler", true, 260_000L);

        assertEquals(0, policy.eulerReconnectAttempt);
        assertEquals(5, policy.directReconnectAttempt);
        assertEquals(0L, policy.transportConnectedAtMs);
    }

    @Test
    public void naturalEulerLiveEndBeforeSixtySecondsPreservesEulerRetryCounter() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 5;
        policy.eulerReconnectAttempt = 3;

        policy.onEulerConnected(200_000L);
        policy.onNaturalLiveEnded(true, "euler", true, 259_999L);

        assertEquals(3, policy.eulerReconnectAttempt);
        assertEquals(5, policy.directReconnectAttempt);
        assertEquals(0L, policy.transportConnectedAtMs);
    }

    @Test
    public void repeatedOrStaleNaturalLiveEndDoesNotDoubleResetOrTouchOtherTransportBudget() {
        TikTokLiveConnector.ReconnectPolicy policy = new TikTokLiveConnector.ReconnectPolicy();
        policy.directReconnectAttempt = 4;
        policy.eulerReconnectAttempt = 2;

        // Stale generation and inactive transport must be complete no-ops.
        policy.onDirectConnected(100_000L);
        policy.onNaturalLiveEnded(false, "direct_ws", true, 200_000L);
        policy.onNaturalLiveEnded(true, "direct_ws", false, 200_000L);
        policy.onNaturalLiveEnded(true, "none", true, 200_000L);
        assertEquals(4, policy.directReconnectAttempt);
        assertEquals(2, policy.eulerReconnectAttempt);
        assertEquals(100_000L, policy.transportConnectedAtMs);

        // First valid natural end (< 60s) preserves count and clears timestamp.
        policy.onNaturalLiveEnded(true, "direct_ws", true, 120_000L);
        assertEquals(4, policy.directReconnectAttempt);
        assertEquals(0L, policy.transportConnectedAtMs);

        // Repeated call later (>= 60s from original start) must NOT reset because session already ended.
        policy.onNaturalLiveEnded(true, "direct_ws", true, 500_000L);
        assertEquals(4, policy.directReconnectAttempt);
        assertEquals(2, policy.eulerReconnectAttempt);
        assertEquals(0L, policy.transportConnectedAtMs);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static final class RecordingListener implements TikTokWebSocketTransport.Listener {
        private final AtomicInteger mErrors;
        private final AtomicInteger mCloses;

        RecordingListener(AtomicInteger errors, AtomicInteger closes) {
            this.mErrors = errors;
            this.mCloses = closes;
        }

        @Override
        public void onConnected(int httpStatus) {}

        @Override
        public void onBinaryFrame(byte[] payload) {}

        @Override
        public void onTextFrame(String text) {}

        @Override
        public void onHandshakeRejected(int httpStatus, String reason) {}

        @Override
        public void onClosed(int code, String reason, boolean byRemote) {
            mCloses.incrementAndGet();
        }

        @Override
        public void onError(String reason) {
            mErrors.incrementAndGet();
        }
    }

    private static final class CapturedFrame {
        final int opcode;
        final byte[] payload;

        CapturedFrame(int opcode, byte[] payload) {
            this.opcode = opcode;
            this.payload = payload;
        }
    }

    private static byte[] encodeUnmaskedFrame(int opcode, byte[] payload) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0x80 | (opcode & 0x0F));
        if (payload.length <= 125) {
            out.write(payload.length);
        } else {
            out.write(126);
            out.write((payload.length >>> 8) & 0xFF);
            out.write(payload.length & 0xFF);
        }
        out.write(payload, 0, payload.length);
        return out.toByteArray();
    }

    private static List<CapturedFrame> decodeClientFrames(byte[] raw) {
        List<CapturedFrame> frames = new ArrayList<>();
        int pos = 0;
        while (pos + 2 <= raw.length) {
            int b1 = raw[pos++] & 0xFF;
            int b2 = raw[pos++] & 0xFF;
            int opcode = b1 & 0x0F;
            boolean masked = (b2 & 0x80) != 0;
            int len = b2 & 0x7F;
            if (len == 126) {
                len = ((raw[pos++] & 0xFF) << 8) | (raw[pos++] & 0xFF);
            } else if (len == 127) {
                pos += 4;
                len = ((raw[pos++] & 0xFF) << 24)
                        | ((raw[pos++] & 0xFF) << 16)
                        | ((raw[pos++] & 0xFF) << 8)
                        | (raw[pos++] & 0xFF);
            }
            byte[] mask = null;
            if (masked) {
                mask = new byte[4];
                System.arraycopy(raw, pos, mask, 0, 4);
                pos += 4;
            }
            byte[] payload = new byte[len];
            System.arraycopy(raw, pos, payload, 0, len);
            pos += len;
            if (masked && mask != null) {
                for (int i = 0; i < len; i++) {
                    payload[i] = (byte) (payload[i] ^ mask[i & 3]);
                }
            }
            frames.add(new CapturedFrame(opcode, payload));
        }
        return frames;
    }
}
