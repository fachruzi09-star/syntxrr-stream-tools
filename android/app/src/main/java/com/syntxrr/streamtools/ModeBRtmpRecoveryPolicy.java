package com.syntxrr.streamtools;

/** Applies RTMP-specific liveness settings through a small testable adapter. */
final class ModeBRtmpRecoveryPolicy {
    static final int MAX_RETRIES = 3;

    interface ClientSettings {
        void setRetries(int count);
        void setFailOnRead(boolean enabled);
        void setSendPings(boolean enabled);
    }

    private ModeBRtmpRecoveryPolicy() { }

    static void configure(ClientSettings client) {
        if (client == null) throw new IllegalArgumentException("RTMP client settings are required.");
        client.setRetries(MAX_RETRIES);
        client.setFailOnRead(true);
        client.setSendPings(true);
    }
}
