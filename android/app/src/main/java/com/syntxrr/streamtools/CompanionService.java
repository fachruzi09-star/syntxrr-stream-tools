package com.syntxrr.streamtools;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * CompanionService
 * Defensive Lifecycle & Status Controller for SYNTXRR STREAM Mode A (TikTok LIVE Companion).
 * 
 * Architecture Note (Phase 4.2E):
 * Operates as a lightweight background lifecycle and status tracker.
 * Defers claiming FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK until native audio playback / MediaSession
 * is compiled into native Java. Status is safely reflected via Android NotificationManager.
 */
public class CompanionService extends Service {

    private static final String TAG = "CompanionService";
    public static final String ACTION_START = "com.syntxrr.streamtools.action.START";
    public static final String ACTION_STOP = "com.syntxrr.streamtools.action.STOP";
    public static final String CHANNEL_ID = "syntxrr_companion_channel";
    public static final int NOTIFICATION_ID = 9021;

    private static volatile boolean sIsRunning = false;

    public static boolean isRunning() {
        return sIsRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        Log.i(TAG, "CompanionService created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Defensive check: handle null intent safely if OS restarts the service
        if (intent == null) {
            Log.w(TAG, "onStartCommand received null intent. Stopping service safely.");
            sIsRunning = false;
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
                Log.i(TAG, "CompanionService is already active. Ignoring redundant START.");
                return START_NOT_STICKY;
            }

            Log.i(TAG, "Received START action. Displaying companion status notification.");
            showStatusNotification();
            sIsRunning = true;
            return START_NOT_STICKY;
        }

        // Unknown action fallback
        Log.w(TAG, "Received unknown action: " + action + ". Stopping service.");
        stopSelf();
        return START_NOT_STICKY;
    }

    private void showStatusNotification() {
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
                .setContentText("Mode A TikTok LIVE Companion sedang berjalan di latar belakang")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);

            Notification notification = builder.build();

            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Gagal memunculkan notifikasi companion: " + e.getMessage());
        }
    }

    private void stopCompanionService() {
        sIsRunning = false;
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
