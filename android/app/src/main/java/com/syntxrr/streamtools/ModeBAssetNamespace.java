package com.syntxrr.streamtools;

import android.content.Context;

import java.io.File;

/** Safe app-private directory routing for one immutable Mode B scene's media assets. */
final class ModeBAssetNamespace {
    private static final String ROOT_DIRECTORY = "modeb-overlay-assets";
    private static final String SCENES_DIRECTORY = "scenes";
    private static final String NAMESPACE_PATTERN = "[A-Za-z0-9_-]{8,80}";

    private ModeBAssetNamespace() { }

    static boolean isValid(String namespace) {
        return namespace != null && namespace.matches(NAMESPACE_PATTERN);
    }

    static File getRootDirectory(Context context) {
        return new File(context.getCacheDir(), ROOT_DIRECTORY);
    }

    static File getNamespaceDirectory(Context context, String namespace) {
        if (!isValid(namespace)) throw new IllegalArgumentException("Namespace aset Mode B tidak valid.");
        return new File(new File(getRootDirectory(context), SCENES_DIRECTORY), namespace);
    }

    static File getAssetFile(Context context, String namespace, String assetId, String extension) {
        if (!ModeBStreamPolicy.isValidOverlayAssetId(assetId)) {
            throw new IllegalArgumentException("ID aset overlay tidak valid.");
        }
        if (extension == null || !(".img".equals(extension) || ".mp4".equals(extension))) {
            throw new IllegalArgumentException("Ekstensi aset overlay tidak didukung.");
        }
        File directory = isValid(namespace) ? getNamespaceDirectory(context, namespace) : getRootDirectory(context);
        return new File(directory, assetId + extension);
    }

    static boolean deleteNamespace(Context context, String namespace) {
        if (!isValid(namespace)) return false;
        return deleteRecursively(getNamespaceDirectory(context, namespace));
    }

    static boolean deleteAll(Context context) {
        return deleteRecursively(getRootDirectory(context));
    }

    /** Deletes the complete asset root and recreates it only after deletion is confirmed. */
    static boolean clearAll(Context context) {
        return clearDirectory(getRootDirectory(context));
    }

    /** File-based core keeps the delete-before-recreate contract directly testable on the JVM. */
    static boolean clearDirectory(File rootDirectory) {
        if (rootDirectory == null || !deleteRecursively(rootDirectory)) return false;
        return rootDirectory.mkdirs() || rootDirectory.isDirectory();
    }

    static boolean deleteRecursively(File file) {
        if (file == null || !file.exists()) return true;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!deleteRecursively(child)) return false;
                }
            }
        }
        return file.delete() || !file.exists();
    }
}
