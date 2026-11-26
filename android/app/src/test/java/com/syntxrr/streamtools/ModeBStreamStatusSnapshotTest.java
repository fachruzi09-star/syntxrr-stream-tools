package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBStreamStatusSnapshotTest {
    @Test public void coldHolderStartsIdleWithoutEncoderOutputConfig() {
        ModeBStreamStatusSnapshot.Holder holder = new ModeBStreamStatusSnapshot.Holder();
        ModeBStreamStatusSnapshot initial = holder.get();
        assertEquals("idle", initial.status);
        assertFalse(initial.streaming);
        assertEquals(0L, initial.bitrateKbps);
        assertFalse(initial.hasOutputDimensions());
        assertFalse(initial.hasOutputFps());
        assertEquals(0, initial.outputWidth);
        assertEquals(0, initial.outputHeight);
        assertEquals(0, initial.outputFps);
    }

    @Test public void normalizesDimensionsAndFpsWithServiceBounds() {
        assertEquals(1280, ModeBStreamStatusSnapshot.normalizeDimension(1281));
        assertEquals(320, ModeBStreamStatusSnapshot.normalizeDimension(100));
        assertEquals(2560, ModeBStreamStatusSnapshot.normalizeDimension(4000));
        assertEquals(15, ModeBStreamStatusSnapshot.normalizeFps(5));
        assertEquals(30, ModeBStreamStatusSnapshot.normalizeFps(30));
        assertEquals(60, ModeBStreamStatusSnapshot.normalizeFps(120));
    }

    @Test public void startingDoesNotExposePreviousConfigAndRetainsOnlyDuringActiveSession() {
        ModeBStreamStatusSnapshot.Holder holder = new ModeBStreamStatusSnapshot.Holder();

        holder.clearEncoderOutputConfig();
        ModeBStreamStatusSnapshot starting = holder.publish("starting", "Preparing...", false, 0);
        assertFalse(starting.hasOutputDimensions());
        assertFalse(starting.hasOutputFps());

        holder.setEncoderOutputConfig(1280, 720, 30);
        ModeBStreamStatusSnapshot connecting = holder.publish("connecting", "Connecting...", false, 0);
        assertTrue(connecting.hasOutputDimensions());
        assertTrue(connecting.hasOutputFps());
        assertEquals(1280, connecting.outputWidth);
        assertEquals(720, connecting.outputHeight);
        assertEquals(30, connecting.outputFps);

        ModeBStreamStatusSnapshot live = holder.publish("live", "Live", true, 3500);
        assertEquals(1280, live.outputWidth);
        assertEquals(720, live.outputHeight);
        assertEquals(30, live.outputFps);
        assertEquals(3500L, live.bitrateKbps);

        for (String activeState : new String[]{"host_wait", "reshare_waiting", "resharing"}) {
            ModeBStreamStatusSnapshot active = holder.publish(activeState, activeState, true, 3200);
            assertEquals(1280, active.outputWidth);
            assertEquals(720, active.outputHeight);
            assertEquals(30, active.outputFps);
        }

        holder.clearEncoderOutputConfig();
        ModeBStreamStatusSnapshot stopped = holder.publish("stopped", "Stopped", false, 0);
        assertFalse(stopped.hasOutputDimensions());
        assertFalse(stopped.hasOutputFps());
        assertEquals(0, stopped.outputWidth);
        assertEquals(0, stopped.outputHeight);
        assertEquals(0, stopped.outputFps);

        // Even if starting a subsequent session fails before encoder config is established,
        // no metrics from the previous session can appear.
        holder.clearEncoderOutputConfig();
        holder.publish("starting", "Preparing second session...", false, 0);
        ModeBStreamStatusSnapshot failed = holder.publish("error", "Prepare failed", false, 0);
        assertFalse(failed.hasOutputDimensions());
        assertFalse(failed.hasOutputFps());
    }

    @Test public void errorDisconnectedAndCaptureLostAutomaticallyClearOutputConfig() {
        for (String terminalState : new String[]{"stopped", "error", "disconnected", "capture_lost", "idle", "stopping"}) {
            ModeBStreamStatusSnapshot.Holder holder = new ModeBStreamStatusSnapshot.Holder();
            holder.setEncoderOutputConfig(1920, 1080, 60);
            holder.publish("live", "Live", true, 6000);

            ModeBStreamStatusSnapshot ended = holder.publish(terminalState, "Ended", false, 0);
            assertFalse(terminalState + " must clear dimensions", ended.hasOutputDimensions());
            assertFalse(terminalState + " must clear fps", ended.hasOutputFps());
            assertEquals(0, ended.outputWidth);
            assertEquals(0, ended.outputHeight);
            assertEquals(0, ended.outputFps);
        }
    }
}
