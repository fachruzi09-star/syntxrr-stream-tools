package com.syntxrr.streamtools;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;

/** Hosts Android's fresh screen-capture consent flow when the floating reshare control is tapped. */
public final class ModeBReshareActivity extends Activity {
    private static final int REQUEST_SCREEN_RESHARE = 7403;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!ModeBStreamService.canRequestScreenReshare()) {
            ModeBStreamService.restoreReshareFloatingControl(
                    "Sesi sedang menyambung ulang atau pemulihan layar sedang berjalan. LIVE tetap dipertahankan; coba lagi setelah status siap.");
            finish();
            return;
        }
        MediaProjectionManager manager = (MediaProjectionManager)
                getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            notifyCancelled("Layanan berbagi layar Android tidak tersedia.");
            finish();
            return;
        }
        // Hide the floating control before Android captures the consent flow/screen again.
        ModeBStreamService.hideReshareFloatingControl();
        try {
            startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_SCREEN_RESHARE);
        } catch (RuntimeException exception) {
            notifyCancelled("Tidak dapat membuka izin berbagi layar Android.");
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SCREEN_RESHARE) return;
        Intent serviceIntent = new Intent(this, ModeBStreamService.class);
        if (resultCode == RESULT_OK && data != null) {
            serviceIntent.setAction(ModeBStreamService.ACTION_RESHARE);
            serviceIntent.putExtra(ModeBStreamService.EXTRA_RESULT_CODE, resultCode);
            serviceIntent.putExtra(ModeBStreamService.EXTRA_RESULT_DATA, data);
        } else {
            serviceIntent.setAction(ModeBStreamService.ACTION_RESHARE_CANCELLED);
        }
        try {
            startService(serviceIntent);
        } catch (RuntimeException startFailure) {
            ModeBStreamService.restoreReshareFloatingControl(
                    "Izin baru belum dapat diteruskan ke encoder. LIVE tetap menunggu; coba Bagikan Layar Lagi.");
        }
        finish();
    }

    private void notifyCancelled(String message) {
        Intent intent = new Intent(this, ModeBStreamService.class);
        intent.setAction(ModeBStreamService.ACTION_RESHARE_CANCELLED);
        intent.putExtra(ModeBStreamService.EXTRA_RESHARE_MESSAGE, message);
        try { startService(intent); }
        catch (RuntimeException startFailure) { ModeBStreamService.restoreReshareFloatingControl(message); }
    }
}
