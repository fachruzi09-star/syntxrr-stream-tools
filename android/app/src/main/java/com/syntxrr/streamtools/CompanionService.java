package com.syntxrr.streamtools;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * CompanionService
 * Lightweight Foreground Service for SYNTXRR STREAM Mode A (TikTok LIVE Companion).
 * Maintains background process execution, notification bar presence, and readiness
 * for companion operations while TikTok is active in the foreground.
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
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            Log.i(TAG, "Received STOP action. Terminating CompanionService.");
            stopForegroundService();
            return START_NOT_STICKY;
        }

        Log.i(TAG, "Received START action. Starting foreground notification.");
        startAsForeground();
        sIsRunning = true;
        return START_NOT_STICKY;
    }

    private void startAsForeground() {
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

        // Handle Android 14+ (API 34+) and Android 10+ (API 29+) foreground service type requirement
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34+
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // API 29-33
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void stopForegroundService() {
        sIsRunning = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "SYNTXRR Companion Service";
            String description = "Notifikasi status foreground service untuk Mode A TikTok LIVE Companion";
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
        Log.i(TAG, "CompanionService destroyed");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
