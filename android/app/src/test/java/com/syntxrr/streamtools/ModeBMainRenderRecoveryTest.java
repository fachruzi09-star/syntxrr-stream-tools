package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import static org.junit.Assert.*;

public class ModeBMainRenderRecoveryTest {
    private static final class FakeAccess implements ModeBMainRenderRecovery.Access {
        boolean ready = true;
        boolean makeCurrent = true;
        boolean cameraFails;
        boolean firstFilterFails;
        boolean secondFilterFails;
        boolean cleared;
        final List<String> calls = new ArrayList<>();
        final List<Object> filters = new ArrayList<>(Arrays.asList("filter-1", "filter-2"));

        @Override public boolean isReady() { calls.add("isReady"); return ready; }
        @Override public boolean makeRootContextCurrent() { calls.add("makeCurrent"); return makeCurrent; }
        @Override public void markNotReady() { calls.add("markNotReady"); ready = false; }
        @Override public void releaseCameraRender() {
            calls.add("camera");
            if (cameraFails) throw new IllegalStateException("camera failed");
        }
        @Override public List<?> snapshotFilters() { calls.add("snapshotFilters"); return new ArrayList<>(filters); }
        @Override public void releaseFilter(Object filter) {
            calls.add(String.valueOf(filter));
            if ("filter-1".equals(filter) && firstFilterFails) throw new IllegalStateException("filter 1 failed");
            if ("filter-2".equals(filter) && secondFilterFails) throw new IllegalStateException("filter 2 failed");
        }
        @Override public void clearFilters() { calls.add("clearFilters"); cleared = true; filters.clear(); }
        @Override public void releaseScreenRender() { calls.add("screen"); }
    }

    @Test public void releasesInRootContextAndPreservesMainRenderResourceOrder() {
        FakeAccess access = new FakeAccess();

        assertTrue(ModeBMainRenderRecovery.releaseIfPending(access));

        assertEquals(Arrays.asList("isReady", "makeCurrent", "markNotReady", "camera",
                "snapshotFilters", "filter-1", "filter-2", "clearFilters", "screen"), access.calls);
        assertTrue(access.cleared);
        assertFalse(access.ready);
    }

    @Test public void skipsWhenRootEncoderHasAlreadyEnteredMainRenderRelease() {
        FakeAccess access = new FakeAccess();
        access.ready = false;
        access.filters.clear();

        assertFalse(ModeBMainRenderRecovery.releaseIfPending(access));

        assertEquals(Arrays.asList("isReady", "snapshotFilters"), access.calls);
    }

    @Test public void detectsUpstreamReleaseThatClearedReadyFlagButLeftFiltersAttached() {
        FakeAccess access = new FakeAccess();
        access.ready = false;

        try {
            ModeBMainRenderRecovery.releaseIfPending(access);
            fail("A non-empty filter list proves MainRender cleanup did not finish.");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("filter masih tersimpan"));
        }

        assertEquals(Arrays.asList("isReady", "snapshotFilters"), access.calls);
        assertEquals(2, access.filters.size());
    }

    @Test public void failsClosedBeforeAnyGlResourceWhenRootContextCannotBeMadeCurrent() {
        FakeAccess access = new FakeAccess();
        access.makeCurrent = false;

        try {
            ModeBMainRenderRecovery.releaseIfPending(access);
            fail("GL cleanup must not run without a current root context");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("tidak dapat dibuat current"));
        }

        assertEquals(Arrays.asList("isReady", "makeCurrent"), access.calls);
        assertTrue(access.ready);
    }

    @Test public void cameraFailureDoesNotSkipFiltersOrScreenAndSuccessfulFiltersAreCleared() {
        FakeAccess access = new FakeAccess();
        access.cameraFails = true;

        try {
            ModeBMainRenderRecovery.releaseIfPending(access);
            fail("camera cleanup error must be reported");
        } catch (IllegalStateException expected) {
            assertNotNull(expected.getCause());
            assertTrue(expected.getCause().getMessage().contains("camera failed"));
        }

        assertTrue(access.calls.contains("filter-1"));
        assertTrue(access.calls.contains("filter-2"));
        assertTrue(access.calls.contains("clearFilters"));
        assertTrue(access.calls.contains("screen"));
    }

    @Test public void oneFilterFailureDoesNotSkipOtherFiltersOrScreenAndRetainsFilterList() {
        FakeAccess access = new FakeAccess();
        access.firstFilterFails = true;

        try {
            ModeBMainRenderRecovery.releaseIfPending(access);
            fail("filter cleanup error must be reported");
        } catch (IllegalStateException expected) {
            assertNotNull(expected.getCause());
        }

        assertTrue(access.calls.contains("filter-2"));
        assertTrue(access.calls.contains("screen"));
        assertFalse(access.calls.contains("clearFilters"));
        assertEquals(2, access.filters.size());
    }

    @Test public void aggregatesIndependentFilterFailures() {
        FakeAccess access = new FakeAccess();
        access.firstFilterFails = true;
        access.secondFilterFails = true;

        try {
            ModeBMainRenderRecovery.releaseIfPending(access);
            fail("both filter failures must be returned");
        } catch (IllegalStateException expected) {
            assertNotNull(expected.getCause());
            assertEquals(1, expected.getCause().getSuppressed().length);
        }

        assertTrue(access.calls.contains("screen"));
    }
}
