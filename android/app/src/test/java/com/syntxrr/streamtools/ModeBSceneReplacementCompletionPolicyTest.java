package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBSceneReplacementCompletionPolicyTest {
    @Test public void stoppedSessionDoesNotPublishSceneCompletion() {
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.STOPPED,
                ModeBSceneReplacementCompletionPolicy.resolve(true, false, false, false, false));
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.STOPPED,
                ModeBSceneReplacementCompletionPolicy.resolve(false, true, true, false, false));
    }

    @Test public void projectionWaitingStateSurvivesLateSceneCommit() {
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.RESHARE_WAITING,
                ModeBSceneReplacementCompletionPolicy.resolve(false, false, true, false, false));
    }

    @Test public void activeReshareStateSurvivesLateSceneCommit() {
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.RESHARING,
                ModeBSceneReplacementCompletionPolicy.resolve(false, false, false, true, false));
    }

    @Test public void hostWaitStateSurvivesLateSceneCommit() {
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.HOST_WAIT,
                ModeBSceneReplacementCompletionPolicy.resolve(false, false, false, false, true));
    }

    @Test public void normalLiveCommitRemainsLive() {
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.LIVE,
                ModeBSceneReplacementCompletionPolicy.resolve(false, false, false, false, false));
    }

    @Test public void recoveryStateTakesPriorityOverStaleHostWaitFlag() {
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.RESHARE_WAITING,
                ModeBSceneReplacementCompletionPolicy.resolve(false, false, true, false, true));
        assertEquals(ModeBSceneReplacementCompletionPolicy.State.RESHARING,
                ModeBSceneReplacementCompletionPolicy.resolve(false, false, false, true, true));
    }
}
