package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBAssetNamespaceTest {
    @Test public void acceptsBoundedNamespaceNames() {
        assertTrue(ModeBAssetNamespace.isValid("scene_abc12345"));
        assertTrue(ModeBAssetNamespace.isValid("background_abc12345"));
    }

    @Test public void rejectsTraversalAndMalformedNames() {
        assertFalse(ModeBAssetNamespace.isValid("../scene"));
        assertFalse(ModeBAssetNamespace.isValid("scene/abc12345"));
        assertFalse(ModeBAssetNamespace.isValid("short"));
        assertFalse(ModeBAssetNamespace.isValid(""));
        assertFalse(ModeBAssetNamespace.isValid(null));
    }
    @Test public void refusesToRecreateRootWhenDeletionFails() {
        TrackingDirectory root = new TrackingDirectory(true, false, false);
        assertFalse(ModeBAssetNamespace.clearDirectory(root));
        assertEquals(0, root.mkdirsCalls);
        assertTrue(root.exists());
    }

    @Test public void recreatesRootOnlyAfterSuccessfulDeletion() {
        TrackingDirectory root = new TrackingDirectory(true, true, true);
        assertTrue(ModeBAssetNamespace.clearDirectory(root));
        assertEquals(1, root.deleteCalls);
        assertEquals(1, root.mkdirsCalls);
        assertTrue(root.isDirectory());
    }

    @Test public void createsMissingRootWithoutTreatingAbsenceAsFailure() {
        TrackingDirectory root = new TrackingDirectory(false, true, true);
        assertTrue(ModeBAssetNamespace.clearDirectory(root));
        assertEquals(0, root.deleteCalls);
        assertEquals(1, root.mkdirsCalls);
        assertTrue(root.isDirectory());
    }

    @Test public void clearsNestedAssetsAndLeavesAnEmptyRecreatedRoot() throws java.io.IOException {
        java.io.File root = java.nio.file.Files.createTempDirectory("syntxrr-modeb-assets-").toFile();
        try {
            java.io.File nested = new java.io.File(root, "scenes/scene_12345678");
            assertTrue(nested.mkdirs());
            java.io.File asset = new java.io.File(nested, "clip.mp4");
            assertTrue(asset.createNewFile());

            assertTrue(ModeBAssetNamespace.clearDirectory(root));
            assertTrue(root.isDirectory());
            assertEquals(0, root.list().length);
        } finally {
            ModeBAssetNamespace.deleteRecursively(root);
        }
    }

    private static final class TrackingDirectory extends java.io.File {
        private boolean exists;
        private boolean directory;
        private final boolean deleteSucceeds;
        private final boolean mkdirsSucceeds;
        int deleteCalls;
        int mkdirsCalls;

        TrackingDirectory(boolean initiallyExists, boolean deleteSucceeds, boolean mkdirsSucceeds) {
            super("modeb-test-root");
            this.exists = initiallyExists;
            this.directory = initiallyExists;
            this.deleteSucceeds = deleteSucceeds;
            this.mkdirsSucceeds = mkdirsSucceeds;
        }

        @Override public boolean exists() { return exists; }
        @Override public boolean isDirectory() { return exists && directory; }
        @Override public java.io.File[] listFiles() { return new java.io.File[0]; }
        @Override public boolean delete() {
            deleteCalls++;
            if (deleteSucceeds) {
                exists = false;
                directory = false;
                return true;
            }
            return false;
        }
        @Override public boolean mkdirs() {
            mkdirsCalls++;
            if (mkdirsSucceeds) {
                exists = true;
                directory = true;
                return true;
            }
            return false;
        }
    }

}
