package com.syntxrr.streamtools;

import org.junit.Test;

public final class ModeBGlShaderInterfaceGuardTest {
    @Test
    public void acceptsZeroAndPositiveLocations() {
        ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                "SYNTXRR ViewFilter ES 2.0",
                new String[] { "aPosition", "uSceneOpacity", "uSamplerView" },
                new int[] { 0, 3, 8 });
    }

    @Test
    public void rejectsMissingSceneOpacityUniformWithActionableMessage() {
        IllegalStateException failure = expectIllegalState(() ->
                ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                        "SYNTXRR ViewFilter ES 2.0",
                        new String[] { "aPosition", "uSceneOpacity" },
                        new int[] { 0, -1 }));
        assertContains(failure.getMessage(), "SYNTXRR ViewFilter ES 2.0");
        assertContains(failure.getMessage(), "uSceneOpacity");
        assertContains(failure.getMessage(), "location=-1");
    }

    @Test
    public void rejectsMissingTextureSampler() {
        IllegalStateException failure = expectIllegalState(() ->
                ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                        "SYNTXRR ViewFilter ES 2.0",
                        new String[] { "uSampler", "uSamplerView" },
                        new int[] { 1, -1 }));
        assertContains(failure.getMessage(), "uSamplerView");
    }

    @Test
    public void rejectsMismatchedSymbolAndLocationArrays() {
        expectIllegalArgument(() ->
                ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                        "SYNTXRR ViewFilter ES 2.0",
                        new String[] { "aPosition", "uSceneOpacity" },
                        new int[] { 0 }));
    }

    @Test
    public void rejectsBlankProgramOrSymbolNames() {
        expectIllegalArgument(() -> ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                " ", new String[] { "uSceneOpacity" }, new int[] { 0 }));
        expectIllegalArgument(() -> ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                "SYNTXRR ViewFilter ES 2.0", new String[] { " " }, new int[] { 0 }));
    }

    private static IllegalStateException expectIllegalState(Runnable action) {
        try {
            action.run();
        } catch (IllegalStateException expected) {
            return expected;
        }
        throw new AssertionError("Expected IllegalStateException.");
    }

    private static void expectIllegalArgument(Runnable action) {
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError("Expected IllegalArgumentException.");
    }

    private static void assertContains(String text, String expected) {
        if (text == null || !text.contains(expected)) {
            throw new AssertionError("Expected message to contain '" + expected + "' but was '" + text + "'.");
        }
    }
}
