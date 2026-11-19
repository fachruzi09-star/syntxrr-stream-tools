package com.syntxrr.streamtools;

/**
 * Tracks partial Mode B audio capture acquisition separately from AudioSource.isRunning().
 * Mix and microphone-only sources can acquire AudioRecord/thread resources before start() reports
 * running. A failed start must therefore remain cleanup-eligible until stop() fully succeeds.
 */
final class ModeBMixAudioCaptureLifecycle {
    interface Action {
        void run();
    }

    private boolean starting;
    private boolean stopping;
    private boolean running;
    private boolean resourcesMayExist;

    synchronized void start(Action startAction) {
        if (startAction == null) throw new IllegalArgumentException("Aksi start audio tidak tersedia.");
        if (running) return;
        if (resourcesMayExist || starting || stopping) {
            throw new IllegalStateException("Siklus sumber audio campuran masih berlangsung.");
        }
        starting = true;
        resourcesMayExist = true;
        try {
            startAction.run();
            running = true;
        } finally {
            starting = false;
        }
    }

    synchronized void stop(Action stopAction) {
        running = false;
        if (!resourcesMayExist) return;
        if (stopAction == null) throw new IllegalArgumentException("Aksi cleanup audio tidak tersedia.");
        if (starting || stopping) {
            throw new IllegalStateException("Siklus sumber audio campuran belum aman untuk cleanup.");
        }
        stopping = true;
        try {
            stopAction.run();
            resourcesMayExist = false;
        } finally {
            stopping = false;
        }
    }

    synchronized boolean isRunning() {
        return running;
    }

    synchronized boolean mayOwnResources() {
        return resourcesMayExist;
    }
}
