package com.syntxrr.streamtools;

/**
 * Validates the linked GLES program interface before the renderer allocates producer resources.
 * GLES returns -1 for a missing or inactive attribute/uniform and silently ignores later calls
 * that use that location. Required compositor inputs must therefore be resolved explicitly.
 */
final class ModeBGlShaderInterfaceGuard {
    private ModeBGlShaderInterfaceGuard() { }

    static void requireResolvedLocations(String programName, String[] symbols, int[] locations) {
        if (programName == null || programName.trim().isEmpty()) {
            throw new IllegalArgumentException("Nama program shader wajib diisi.");
        }
        if (symbols == null || locations == null || symbols.length == 0
                || symbols.length != locations.length) {
            throw new IllegalArgumentException("Daftar simbol dan lokasi shader tidak cocok.");
        }
        for (int i = 0; i < symbols.length; i++) {
            String symbol = symbols[i];
            if (symbol == null || symbol.trim().isEmpty()) {
                throw new IllegalArgumentException("Nama simbol shader pada indeks " + i + " tidak valid.");
            }
            if (locations[i] < 0) {
                throw new IllegalStateException("Program shader " + programName
                        + " tidak memiliki lokasi GLES yang valid untuk " + symbol
                        + " (location=" + locations[i] + ").");
            }
        }
    }
}
