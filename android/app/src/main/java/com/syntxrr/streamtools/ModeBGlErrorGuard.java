package com.syntxrr.streamtools;

/** Bounded, explicit GLES error inspection for critical compositor operations. */
final class ModeBGlErrorGuard {
    static final int GL_NO_ERROR = 0;
    static final int MAX_ERROR_CODES_PER_CHECK = 16;

    interface ErrorSource {
        int getError();
    }

    private ModeBGlErrorGuard() { }

    static void requireNoError(String operation, ErrorSource source) {
        if (operation == null || operation.trim().isEmpty()) {
            throw new IllegalArgumentException("Nama operasi GL wajib diisi.");
        }
        if (source == null) {
            throw new IllegalArgumentException("Sumber pemeriksaan GL wajib diisi.");
        }

        StringBuilder errors = new StringBuilder();
        int count = 0;
        for (int i = 0; i < MAX_ERROR_CODES_PER_CHECK; i++) {
            int error = source.getError();
            if (error == GL_NO_ERROR) break;
            if (count > 0) errors.append(", ");
            errors.append("0x").append(Integer.toHexString(error).toUpperCase());
            count++;
        }
        if (count == 0) return;

        String message = "Operasi GL '" + operation + "' menghasilkan " + count
                + " error GLES: " + errors;
        if (count == MAX_ERROR_CODES_PER_CHECK) {
            message += " (pemeriksaan dibatasi sampai " + MAX_ERROR_CODES_PER_CHECK + " kode)";
        }
        throw new IllegalStateException(message);
    }
}
