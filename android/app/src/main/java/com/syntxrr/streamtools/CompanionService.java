package com.syntxrr.streamtools;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.lang.ref.WeakReference;

/**
 * CompanionService
 * Defensive Lifecycle & Status Controller for SYNTXRR STREAM Mode A (TikTok LIVE Companion).
 * 
 * Architecture Note (Phase 4.5):
 * Runs as a REAL foreground service (FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK).
 *
 * Kenapa foreground wajib: Android 12+ membekukan proses aplikasi yang di-cache
 * (cached app freezer) setelah pengguna berpindah ke aplikasi lain. Overlay Floating HUD
 * tetap terlihat karena surface WindowManager masih digambar oleh sistem, dan bubble masih
 * bisa membuka panel, tetapi WebView berhenti mengeksekusi JavaScript sehingga perintah
 * HUD tidak pernah sampai ke layanan aplikasi (kontrol Music Request menjadi tidak responsif
 * dan status panel tidak pernah diperbarui). Foreground service menahan proses tetap hidup
 * selama HUD dipakai, sehingga bridge native -> JS tetap berjalan.
 *
 * Service ini hanya menandai status dan menahan proses; audio tetap diputar oleh
 * NativeAudioPlugin / SoundPool yang sudah ada, dan tidak dihentikan saat HUD ditutup.
 */
public class CompanionService extends Service {

    private static final String TAG = "CompanionService";
    public static final String ACTION_START = "com.syntxrr.streamtools.action.START";
    public static final String ACTION_STOP = "com.syntxrr.streamtools.action.STOP";
    public static final String CHANNEL_ID = "syntxrr_companion_channel";
    public static final int NOTIFICATION_ID = 9021;

    public interface OnCompanionLifecycleListener {
        void onCompanionStopped();
    }

    private static volatile boolean sIsRunning = false;
    private static volatile boolean sHasMicrophoneType = false;
    private static volatile CompanionService sInstance = null;
    @Nullable
    private static WeakReference<OnCompanionLifecycleListener> sLifecycleListenerRef = null;
    private static final Object sListenerLock = new Object();
    /** Teks status yang benar-benar diketahui native; tidak pernah mengarang status LIVE. */
    private static volatile String sStatusDetail = "Floating HUD aktif";

    public static void setLifecycleListener(@Nullable OnCompanionLifecycleListener listener) {
        synchronized (sListenerLock) {
            sLifecycleListenerRef = listener != null ? new WeakReference<>(listener) : null;
        }
    }

    public static void clearLifecycleListener(@Nullable OnCompanionLifecycleListener listener) {
        synchronized (sListenerLock) {
            if (sLifecycleListenerRef == null) {
                return;
            }
            OnCompanionLifecycleListener current = sLifecycleListenerRef.get();
            if (current == null || current == listener) {
                sLifecycleListenerRef = null;
            }
        }
    }

    private static void notifyLifecycleStopped() {
        final OnCompanionLifecycleListener listener;
        synchronized (sListenerLock) {
            listener = sLifecycleListenerRef != null ? sLifecycleListenerRef.get() : null;
        }
        if (listener != null) {
            try {
                listener.onCompanionStopped();
            } catch (Exception e) {
                Log.w(TAG, "Gagal meneruskan callback penghentian CompanionService: " + e.getMessage());
            }
        }
    }

    public static boolean isRunning() {
        return sIsRunning;
    }

    public static boolean hasMicrophoneForegroundType() {
        return sIsRunning && sHasMicrophoneType;
    }

    /**
     * Perbarui teks notifikasi foreground sesuai keadaan nyata (aplikasi aktif atau di
     * latar belakang). Notifikasi tidak lagi menampilkan teks statis yang terlihat "memuat".
     */
    public static void updateStatusDetail(String detail) {
        if (detail == null || detail.isEmpty()) {
            return;
        }
        sStatusDetail = detail;
        CompanionService instance = sInstance;
        if (instance != null) {
            instance.refreshNotification();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        createNotificationChannel();
        Log.i(TAG, "CompanionService created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Defensive check: handle null intent safely if OS restarts the service
        if (intent == null) {
            Log.w(TAG, "onStartCommand received null intent. Stopping service safely.");
            sIsRunning = false;
            sHasMicrophoneType = false;
            notifyLifecycleStopped();
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();

        // Handle STOP action
        if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "Received STOP action. Terminating CompanionService.");
            stopCompanionService();
            return START_NOT_STICKY;
        }

        // Handle START action
        if (ACTION_START.equals(action)) {
            if (sIsRunning) {
                Log.i(TAG, "CompanionService sudah aktif. Menyegarkan status foreground.");
                promoteToForeground();
                return START_STICKY;
            }

            Log.i(TAG, "Received START action. Masuk mode foreground.");
            sIsRunning = true;
            promoteToForeground();
            return START_STICKY;
        }

        // Unknown action fallback
        Log.w(TAG, "Received unknown action: " + action + ". Stopping service.");
        sIsRunning = false;
        sHasMicrophoneType = false;
        notifyLifecycleStopped();
        stopSelf();
        return START_NOT_STICKY;
    }

    private boolean hasRecordAudioPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Menahan proses tetap hidup selama Floating HUD aktif. Dipanggil pada setiap START
     * agar status foreground tetap segar walau service sempat di-restart sistem.
     *
     * Tipe MICROPHONE hanya disertakan ketika izin RECORD_AUDIO sudah granted agar
     * Android 11+/14+ tidak melempar SecurityException. Jika izin belum ada atau aktivasi
     * tipe microphone ditolak sistem, service tetap berjalan dengan MEDIA_PLAYBACK saja.
     */
    private void promoteToForeground() {
        Notification notification = buildStatusNotification();
        if (notification == null) {
            sHasMicrophoneType = false;
            Log.e(TAG, "Notifikasi companion gagal dibangun; service berjalan tanpa foreground.");
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                boolean micGranted = hasRecordAudioPermission();
                int foregroundTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                if (micGranted) {
                    foregroundTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                }
                try {
                    startForeground(NOTIFICATION_ID, notification, foregroundTypes);
                    sHasMicrophoneType = micGranted;
                } catch (SecurityException | IllegalStateException e) {
                    sHasMicrophoneType = false;
                    if (micGranted) {
                        Log.w(TAG, "Gagal mengaktifkan tipe foreground microphone; fallback ke mediaPlayback: " + e.getMessage());
                        startForeground(NOTIFICATION_ID, notification,
                                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                    } else {
                        throw e;
                    }
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                sHasMicrophoneType = false;
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                sHasMicrophoneType = false;
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.i(TAG, "CompanionService berjalan sebagai foreground service (microphoneType=" + sHasMicrophoneType + ").");
        } catch (Exception e) {
            sHasMicrophoneType = false;
            Log.e(TAG, "Gagal masuk foreground: " + e.getMessage());
        }
    }

    @Nullable
    private Notification buildStatusNotification() {
        try {
            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                pendingIntentFlags
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SYNTXRR Companion Aktif")
                .setContentText(sStatusDetail)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);

            return builder.build();
        } catch (Exception e) {
            Log.e(TAG, "Gagal membangun notifikasi companion: " + e.getMessage());
            return null;
        }
    }

    /** Kirim ulang notifikasi foreground dengan status terbaru (id sama, tanpa duplikat). */
    private void refreshNotification() {
        if (!sIsRunning) {
            return;
        }
        Notification notification = buildStatusNotification();
        if (notification == null) {
            return;
        }
        try {
            NotificationManager notificationManager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Gagal memperbarui notifikasi status: " + e.getMessage());
        }
    }

    private void stopCompanionService() {
        sIsRunning = false;
        sHasMicrophoneType = false;
        notifyLifecycleStopped();
        try {
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling notification: " + e.getMessage());
        }
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "SYNTXRR Companion Service";
            String description = "Notifikasi status kontroler Mode A TikTok LIVE Companion";
            int importance = NotificationManager.IMPORTANCE_LOW;

            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.setShowBadge(false);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        sIsRunning = false;
        sHasMicrophoneType = false;
        if (sInstance == this) {
            sInstance = null;
        }
        notifyLifecycleStopped();
        try {
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID);
            }
        } catch (Exception ignored) {
        }
        Log.i(TAG, "CompanionService destroyed");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
