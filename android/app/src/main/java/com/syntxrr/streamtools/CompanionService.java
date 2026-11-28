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
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.lang.ref.WeakReference;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * CompanionService
 * Defensive Lifecycle & Status Controller for SYNTXRR STREAM Mode A (TikTok LIVE Companion).
 * 
 * Architecture Note (Phase 4.5 + Batch 4):
 * Runs as a REAL foreground service (FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK).
 * Mengelola ConnectivityManager.NetworkCallback (1x per lifecycle aktif) serta
 * PARTIAL_WAKE_LOCK dan WifiLock berbatas waktu hanya ketika sesi Mode A aktif
 * benar-benar membutuhkannya.
 */
public class CompanionService extends Service {

    private static final String TAG = "CompanionService";
    public static final String ACTION_START = "com.syntxrr.streamtools.action.START";
    public static final String ACTION_STOP = "com.syntxrr.streamtools.action.STOP";
    public static final String CHANNEL_ID = "syntxrr_companion_channel";
    public static final int NOTIFICATION_ID = 9021;

    static final long LOCK_LEASE_MS = 10L * 60_000L;
    static final long LOCK_RENEW_THRESHOLD_MS = 2L * 60_000L;

    public interface OnCompanionLifecycleListener {
        void onCompanionStopped();
    }

    interface LockHardwareAdapter {
        boolean acquireWakeLock(long timeoutMs);
        void releaseWakeLock();
        boolean acquireWifiLock();
        void releaseWifiLock();
    }

    interface NetworkCallbackRegistrar {
        boolean register();
        void unregister();
    }

    /**
     * Koordinator registrasi NetworkCallback pure-Java.
     * Menjamin registrasi hanya 1x per generasi service aktif, unregister aman saat cleanup,
     * dan callback lama dari generasi sebelumnya diabaikan.
     */
    static final class NetworkCallbackCoordinator {
        private final Object mLock = new Object();
        private long mActiveGeneration = 0L;
        private boolean mRegistered = false;

        boolean registerOnce(long generation, @NonNull NetworkCallbackRegistrar registrar) {
            synchronized (mLock) {
                if (mRegistered && mActiveGeneration == generation) {
                    return false;
                }
                if (generation < mActiveGeneration) {
                    return false;
                }
                mActiveGeneration = generation;
                boolean ok = registrar.register();
                mRegistered = ok;
                return ok;
            }
        }

        boolean canDispatchCallback(long callbackGeneration) {
            synchronized (mLock) {
                return mRegistered && callbackGeneration == mActiveGeneration;
            }
        }

        boolean isRegistered() {
            synchronized (mLock) {
                return mRegistered;
            }
        }

        boolean unregisterOnce(long generation, @NonNull NetworkCallbackRegistrar registrar) {
            synchronized (mLock) {
                if (!mRegistered || (generation >= 0L && generation != mActiveGeneration)) {
                    return false;
                }
                mRegistered = false;
            }
            registrar.unregister();
            return true;
        }
    }

    /**
     * Pengelola WakeLock (PARTIAL_WAKE_LOCK) & WifiLock berbatas waktu (pure-Java testable).
     * Menjamin:
     * - Tidak pernah memperoleh lock pada sesi tidak aktif / disconnected.
     * - Tidak ada akuisisi lock duplikat.
     * - WifiLock hanya aktif saat jaringan Wi-Fi aktif & sesi membutuhkan.
     * - Lease selalu berbatas waktu sehingga lock tidak pernah ditahan tanpa batas.
     */
    static final class BoundedLockManager {
        private final LockHardwareAdapter mAdapter;
        private final Object mLock = new Object();
        private long mBoundGeneration = 0L;
        private boolean mWakeHeld = false;
        private long mWakeExpiresAtMs = 0L;
        private boolean mWifiHeld = false;
        private long mWifiExpiresAtMs = 0L;

        BoundedLockManager(@NonNull LockHardwareAdapter adapter) {
            this.mAdapter = adapter;
        }

        void bindGeneration(long generation) {
            final boolean releaseWake;
            final boolean releaseWifi;
            synchronized (mLock) {
                if (generation == mBoundGeneration) {
                    return;
                }
                mBoundGeneration = generation;
                releaseWake = mWakeHeld;
                releaseWifi = mWifiHeld;
                mWakeHeld = false;
                mWakeExpiresAtMs = 0L;
                mWifiHeld = false;
                mWifiExpiresAtMs = 0L;
            }
            if (releaseWake) {
                safeReleaseWake();
            }
            if (releaseWifi) {
                safeReleaseWifi();
            }
        }

        void sync(
                long nowMs,
                long generation,
                boolean serviceActive,
                boolean sessionRequiresLocks,
                boolean wifiNetworkActive
        ) {
            final boolean needAcquireWake;
            final boolean needReleaseWake;
            final boolean needAcquireWifi;
            final boolean needReleaseWifi;

            synchronized (mLock) {
                if (generation != mBoundGeneration) {
                    return;
                }
                boolean shouldHoldWake = serviceActive && sessionRequiresLocks;
                boolean shouldHoldWifi = shouldHoldWake && wifiNetworkActive;

                if (!shouldHoldWake) {
                    needAcquireWake = false;
                    needReleaseWake = mWakeHeld;
                    mWakeHeld = false;
                    mWakeExpiresAtMs = 0L;
                } else if (!mWakeHeld || nowMs >= mWakeExpiresAtMs - LOCK_RENEW_THRESHOLD_MS) {
                    needAcquireWake = true;
                    needReleaseWake = false;
                    mWakeExpiresAtMs = nowMs + LOCK_LEASE_MS;
                } else {
                    needAcquireWake = false;
                    needReleaseWake = false;
                }

                if (!shouldHoldWifi) {
                    needAcquireWifi = false;
                    needReleaseWifi = mWifiHeld;
                    mWifiHeld = false;
                    mWifiExpiresAtMs = 0L;
                } else if (!mWifiHeld) {
                    needAcquireWifi = true;
                    needReleaseWifi = false;
                    mWifiExpiresAtMs = nowMs + LOCK_LEASE_MS;
                } else {
                    if (nowMs >= mWifiExpiresAtMs - LOCK_RENEW_THRESHOLD_MS) {
                        mWifiExpiresAtMs = nowMs + LOCK_LEASE_MS;
                    }
                    needAcquireWifi = false;
                    needReleaseWifi = false;
                }
            }

            if (needReleaseWifi) {
                safeReleaseWifi();
            }
            if (needReleaseWake) {
                safeReleaseWake();
            }
            if (needAcquireWake) {
                boolean acquired = safeAcquireWake(LOCK_LEASE_MS);
                synchronized (mLock) {
                    if (generation == mBoundGeneration && acquired) {
                        mWakeHeld = true;
                    } else if (!acquired) {
                        mWakeHeld = false;
                        mWakeExpiresAtMs = 0L;
                    }
                }
                if (generation != mBoundGeneration && acquired) {
                    safeReleaseWake();
                }
            }
            if (needAcquireWifi) {
                boolean acquired = safeAcquireWifi();
                synchronized (mLock) {
                    if (generation == mBoundGeneration && acquired) {
                        mWifiHeld = true;
                    } else if (!acquired) {
                        mWifiHeld = false;
                        mWifiExpiresAtMs = 0L;
                    }
                }
                if (generation != mBoundGeneration && acquired) {
                    safeReleaseWifi();
                }
            }
        }

        void expireIfNeeded(long nowMs, long generation) {
            final boolean expireWake;
            final boolean expireWifi;
            synchronized (mLock) {
                if (generation != mBoundGeneration) {
                    return;
                }
                expireWake = mWakeHeld && nowMs >= mWakeExpiresAtMs;
                expireWifi = mWifiHeld && nowMs >= mWifiExpiresAtMs;
                if (expireWake) {
                    mWakeHeld = false;
                    mWakeExpiresAtMs = 0L;
                }
                if (expireWifi) {
                    mWifiHeld = false;
                    mWifiExpiresAtMs = 0L;
                }
            }
            if (expireWifi) {
                safeReleaseWifi();
            }
            if (expireWake) {
                safeReleaseWake();
            }
        }

        void releaseAll(long expectedGeneration) {
            final boolean releaseWake;
            final boolean releaseWifi;
            synchronized (mLock) {
                if (expectedGeneration >= 0L && expectedGeneration != mBoundGeneration) {
                    return;
                }
                releaseWake = mWakeHeld;
                releaseWifi = mWifiHeld;
                mWakeHeld = false;
                mWakeExpiresAtMs = 0L;
                mWifiHeld = false;
                mWifiExpiresAtMs = 0L;
            }
            if (releaseWifi) {
                safeReleaseWifi();
            }
            if (releaseWake) {
                safeReleaseWake();
            }
        }

        boolean isWakeHeld() {
            synchronized (mLock) {
                return mWakeHeld;
            }
        }

        boolean isWifiHeld() {
            synchronized (mLock) {
                return mWifiHeld;
            }
        }

        long getWakeExpiresAtMs() {
            synchronized (mLock) {
                return mWakeExpiresAtMs;
            }
        }

        long getWifiExpiresAtMs() {
            synchronized (mLock) {
                return mWifiExpiresAtMs;
            }
        }

        private boolean safeAcquireWake(long timeoutMs) {
            try {
                return mAdapter.acquireWakeLock(timeoutMs);
            } catch (Exception ignored) {
                return false;
            }
        }

        private void safeReleaseWake() {
            try {
                mAdapter.releaseWakeLock();
            } catch (Exception ignored) {
            }
        }

        private boolean safeAcquireWifi() {
            try {
                return mAdapter.acquireWifiLock();
            } catch (Exception ignored) {
                return false;
            }
        }

        private void safeReleaseWifi() {
            try {
                mAdapter.releaseWifiLock();
            } catch (Exception ignored) {
            }
        }
    }

    private static volatile boolean sIsRunning = false;
    private static volatile boolean sHasMicrophoneType = false;
    private static volatile CompanionService sInstance = null;
    private static final AtomicLong sServiceGeneration = new AtomicLong(0L);
    @Nullable
    private static WeakReference<OnCompanionLifecycleListener> sLifecycleListenerRef = null;
    private static final Object sListenerLock = new Object();
    /** Teks status yang benar-benar diketahui native; tidak pernah mengarang status LIVE. */
    private static volatile String sStatusDetail = "Floating HUD aktif";

    private final Object mResourceLock = new Object();
    private final AtomicBoolean mCleanupExecuted = new AtomicBoolean(false);
    private final NetworkCallbackCoordinator mNetworkCoordinator = new NetworkCallbackCoordinator();
    private final ScheduledExecutorService mLockWatchdog = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "CompanionLockWatchdog");
        t.setDaemon(true);
        return t;
    });
    private long mInstanceGeneration = 0L;
    @Nullable
    private PowerManager.WakeLock mWakeLock;
    @Nullable
    private WifiManager.WifiLock mWifiLock;
    @Nullable
    private ConnectivityManager.NetworkCallback mRegisteredNetworkCallback;
    @Nullable
    private ScheduledFuture<?> mLeaseExpiryTask;
    @NonNull
    private volatile TikTokLiveConnector.NetworkSnapshot mLatestNetworkSnapshot =
            new TikTokLiveConnector.NetworkSnapshot(true, false, false, -1L);
    @Nullable
    private BoundedLockManager mLockManager;
    @Nullable
    private TikTokLiveConnector.SessionStateObserver mConnectorObserver;

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
        mInstanceGeneration = sServiceGeneration.incrementAndGet();
        mLockManager = new BoundedLockManager(createHardwareLockAdapter());
        mLockManager.bindGeneration(mInstanceGeneration);
        createNotificationChannel();
        Log.i(TAG, "CompanionService created (gen=" + mInstanceGeneration + ")");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Defensive check: jika sistem me-restart START_STICKY dengan null intent,
        // pertahankan bila ada sesi TikTok LIVE aktif; jika tidak ada, hentikan dengan aman.
        if (intent == null) {
            TikTokLiveConnector connector = TikTokLiveConnector.getInstance(getApplicationContext());
            if (connector.isSessionActive()) {
                Log.i(TAG, "onStartCommand null intent dengan sesi aktif; mempromosikan kembali foreground.");
                sIsRunning = true;
                promoteToForeground();
                ensureActiveMonitorsRegistered();
                syncLocks();
                return START_STICKY;
            }
            Log.w(TAG, "onStartCommand received null intent without active session. Stopping safely.");
            sIsRunning = false;
            sHasMicrophoneType = false;
            cleanupLocalMonitorsAndLocks();
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
                ensureActiveMonitorsRegistered();
                syncLocks();
                return START_STICKY;
            }

            Log.i(TAG, "Received START action. Masuk mode foreground.");
            mCleanupExecuted.set(false);
            mInstanceGeneration = sServiceGeneration.incrementAndGet();
            if (mLockManager != null) {
                mLockManager.bindGeneration(mInstanceGeneration);
            }
            sIsRunning = true;
            promoteToForeground();
            ensureActiveMonitorsRegistered();
            syncLocks();
            return START_STICKY;
        }

        // Unknown action fallback
        Log.w(TAG, "Received unknown action: " + action + ". Stopping service.");
        sIsRunning = false;
        sHasMicrophoneType = false;
        cleanupLocalMonitorsAndLocks();
        notifyLifecycleStopped();
        stopSelf();
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // AndroidManifest mendeklarasikan stopWithTask="false". Jangan hentikan koneksi aktif
        // atau foreground service hanya karena pengguna berpindah/membersihkan task UI.
        super.onTaskRemoved(rootIntent);
    }

    private boolean hasRecordAudioPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    @NonNull
    private LockHardwareAdapter createHardwareLockAdapter() {
        return new LockHardwareAdapter() {
            @Override
            public boolean acquireWakeLock(long timeoutMs) {
                synchronized (mResourceLock) {
                    if (mWakeLock == null) {
                        PowerManager pm = (PowerManager) getApplicationContext()
                                .getSystemService(Context.POWER_SERVICE);
                        if (pm == null) {
                            return false;
                        }
                        mWakeLock = pm.newWakeLock(
                                PowerManager.PARTIAL_WAKE_LOCK,
                                "syntxrr:companion_mode_a"
                        );
                        mWakeLock.setReferenceCounted(false);
                    }
                    mWakeLock.acquire(timeoutMs);
                    return true;
                }
            }

            @Override
            public void releaseWakeLock() {
                synchronized (mResourceLock) {
                    if (mWakeLock != null) {
                        try {
                            if (mWakeLock.isHeld()) {
                                mWakeLock.release();
                            }
                        } finally {
                            mWakeLock = null;
                        }
                    }
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean acquireWifiLock() {
                synchronized (mResourceLock) {
                    if (mWifiLock == null) {
                        WifiManager wm = (WifiManager) getApplicationContext()
                                .getSystemService(Context.WIFI_SERVICE);
                        if (wm == null) {
                            return false;
                        }
                        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                                ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                                : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                        mWifiLock = wm.createWifiLock(mode, "syntxrr:companion_wifi");
                        mWifiLock.setReferenceCounted(false);
                    }
                    if (!mWifiLock.isHeld()) {
                        mWifiLock.acquire();
                    }
                    return true;
                }
            }

            @Override
            public void releaseWifiLock() {
                synchronized (mResourceLock) {
                    if (mWifiLock != null) {
                        try {
                            if (mWifiLock.isHeld()) {
                                mWifiLock.release();
                            }
                        } finally {
                            mWifiLock = null;
                        }
                    }
                }
            }
        };
    }

    private void ensureActiveMonitorsRegistered() {
        final long gen = mInstanceGeneration;
        if (gen != sServiceGeneration.get()) {
            return;
        }
        TikTokLiveConnector connector = TikTokLiveConnector.getInstance(getApplicationContext());

        synchronized (mResourceLock) {
            if (mConnectorObserver == null) {
                mConnectorObserver = (sessionActive, state) -> {
                    if (gen != sServiceGeneration.get()) {
                        return;
                    }
                    syncLocks();
                };
                connector.addSessionStateObserver(mConnectorObserver);
            }
        }

        ConnectivityManager cm = (ConnectivityManager) getApplicationContext()
                .getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            return;
        }

        mNetworkCoordinator.registerOnce(gen, new NetworkCallbackRegistrar() {
            @Override
            public boolean register() {
                TikTokLiveConnector.NetworkSnapshot baseline = readActiveNetworkSnapshot(cm);
                mLatestNetworkSnapshot = baseline;
                connector.initializeNetworkBaseline(baseline);

                final ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(@NonNull Network network) {
                        if (!isCurrentNetworkCallback(gen)) return;
                        handleNetworkUpdate(cm, network, false);
                    }

                    @Override
                    public void onCapabilitiesChanged(@NonNull Network network, @NonNull NetworkCapabilities caps) {
                        if (!isCurrentNetworkCallback(gen)) return;
                        handleNetworkUpdate(cm, network, caps);
                    }

                    @Override
                    public void onLost(@NonNull Network network) {
                        if (!isCurrentNetworkCallback(gen)) return;
                        handleNetworkUpdate(cm, null, true);
                    }
                };
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        cm.registerDefaultNetworkCallback(callback);
                    } else {
                        cm.registerNetworkCallback(new android.net.NetworkRequest.Builder().build(), callback);
                    }
                    synchronized (mResourceLock) {
                        mRegisteredNetworkCallback = callback;
                    }
                    return true;
                } catch (Exception e) {
                    Log.w(TAG, "Gagal mendaftarkan NetworkCallback Companion: " + e.getMessage());
                    return false;
                }
            }

            @Override
            public void unregister() {
                // Unregister handled in cleanupLocalMonitorsAndLocks()
            }
        });
    }

    private boolean isCurrentNetworkCallback(long registeredGen) {
        return registeredGen == sServiceGeneration.get()
                && mInstanceGeneration == registeredGen
                && mNetworkCoordinator.canDispatchCallback(registeredGen);
    }

    private void handleNetworkUpdate(
            @NonNull ConnectivityManager cm,
            @Nullable Network network,
            boolean checkActiveOnLost
    ) {
        TikTokLiveConnector.NetworkSnapshot snapshot = checkActiveOnLost
                ? readActiveNetworkSnapshot(cm)
                : readNetworkSnapshot(cm, network);
        dispatchNetworkSnapshot(snapshot);
    }

    private void handleNetworkUpdate(
            @NonNull ConnectivityManager cm,
            @NonNull Network network,
            @NonNull NetworkCapabilities caps
    ) {
        TikTokLiveConnector.NetworkSnapshot snapshot = buildSnapshotFromCapabilities(network, caps);
        dispatchNetworkSnapshot(snapshot);
    }

    private void dispatchNetworkSnapshot(@NonNull TikTokLiveConnector.NetworkSnapshot snapshot) {
        mLatestNetworkSnapshot = snapshot;
        syncLocks();
        TikTokLiveConnector.getInstance(getApplicationContext()).onSystemNetworkChanged(snapshot);
    }

    @NonNull
    private static TikTokLiveConnector.NetworkSnapshot readActiveNetworkSnapshot(@NonNull ConnectivityManager cm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network active = cm.getActiveNetwork();
            return readNetworkSnapshot(cm, active);
        }
        return new TikTokLiveConnector.NetworkSnapshot(true, false, false, -1L);
    }

    @NonNull
    private static TikTokLiveConnector.NetworkSnapshot readNetworkSnapshot(
            @NonNull ConnectivityManager cm,
            @Nullable Network network
    ) {
        if (network == null) {
            return new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L);
        }
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return buildSnapshotFromCapabilities(network, caps);
    }

    @NonNull
    private static TikTokLiveConnector.NetworkSnapshot buildSnapshotFromCapabilities(
            @NonNull Network network,
            @Nullable NetworkCapabilities caps
    ) {
        if (caps == null) {
            return new TikTokLiveConnector.NetworkSnapshot(false, false, false, -1L);
        }
        boolean hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        boolean validated = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        boolean usable = hasInternet && validated;
        boolean wifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        boolean cellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
        long handle = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? network.getNetworkHandle() : -1L;
        return new TikTokLiveConnector.NetworkSnapshot(usable, wifi, cellular, handle);
    }

    private void syncLocks() {
        BoundedLockManager lockManager = mLockManager;
        if (lockManager == null) {
            return;
        }
        long gen = mInstanceGeneration;
        if (gen != sServiceGeneration.get()) {
            lockManager.releaseAll(-1L);
            return;
        }
        TikTokLiveConnector connector = TikTokLiveConnector.getInstance(getApplicationContext());
        boolean sessionActive = connector.isSessionActive();
        TikTokLiveConnector.NetworkSnapshot net = mLatestNetworkSnapshot;
        boolean wifiActive = net.available && net.wifi;
        long nowMs = System.currentTimeMillis();
        lockManager.sync(nowMs, gen, sIsRunning, sessionActive, wifiActive);

        if (lockManager.isWakeHeld() || lockManager.isWifiHeld()) {
            scheduleLeaseExpiryCheckLocked(gen);
        } else {
            cancelLeaseExpiryTask();
        }
    }

    private void scheduleLeaseExpiryCheckLocked(long gen) {
        synchronized (mResourceLock) {
            if (mLeaseExpiryTask != null) {
                mLeaseExpiryTask.cancel(false);
                mLeaseExpiryTask = null;
            }
            if (mLockWatchdog.isShutdown()) {
                return;
            }
            mLeaseExpiryTask = mLockWatchdog.schedule(() -> {
                if (gen != sServiceGeneration.get()) {
                    return;
                }
                BoundedLockManager manager = mLockManager;
                if (manager != null) {
                    manager.expireIfNeeded(System.currentTimeMillis(), gen);
                }
            }, LOCK_LEASE_MS + 100L, TimeUnit.MILLISECONDS);
        }
    }

    private void cancelLeaseExpiryTask() {
        synchronized (mResourceLock) {
            if (mLeaseExpiryTask != null) {
                mLeaseExpiryTask.cancel(false);
                mLeaseExpiryTask = null;
            }
        }
    }

    private void cleanupLocalMonitorsAndLocks() {
        cancelLeaseExpiryTask();
        final ConnectivityManager.NetworkCallback callbackToUnregister;
        final TikTokLiveConnector.SessionStateObserver observerToRemove;
        synchronized (mResourceLock) {
            callbackToUnregister = mRegisteredNetworkCallback;
            mRegisteredNetworkCallback = null;
            observerToRemove = mConnectorObserver;
            mConnectorObserver = null;
        }

        if (observerToRemove != null) {
            try {
                TikTokLiveConnector.getInstance(getApplicationContext())
                        .removeSessionStateObserver(observerToRemove);
            } catch (Exception ignored) {
            }
        }

        mNetworkCoordinator.unregisterOnce(mInstanceGeneration, new NetworkCallbackRegistrar() {
            @Override
            public boolean register() {
                return false;
            }

            @Override
            public void unregister() {
                if (callbackToUnregister != null) {
                    try {
                        ConnectivityManager cm = (ConnectivityManager) getApplicationContext()
                                .getSystemService(Context.CONNECTIVITY_SERVICE);
                        if (cm != null) {
                            cm.unregisterNetworkCallback(callbackToUnregister);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Gagal unregister NetworkCallback: " + e.getMessage());
                    }
                }
            }
        });

        BoundedLockManager lockManager = mLockManager;
        if (lockManager != null) {
            lockManager.releaseAll(-1L);
        }
    }

    /**
     * Menjalankan proses tetap hidup selama Floating HUD / sesi LIVE aktif. Dipanggil pada
     * setiap START agar status foreground tetap segar walau service sempat di-restart sistem.
     *
     * Hanya menggunakan FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK agar CompanionService
     * tidak pernah mengklaim akses mikrofon latar belakang terhadap aplikasi TikTok LIVE.
     */
    private void promoteToForeground() {
        Notification notification = buildStatusNotification();
        if (notification == null) {
            sHasMicrophoneType = false;
            Log.e(TAG, "Notifikasi companion gagal dibangun; service berjalan tanpa foreground.");
            return;
        }
        try {
            sHasMicrophoneType = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.i(TAG, "CompanionService berjalan sebagai foreground service (mediaPlayback).");
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
        performFullTeardownOnce();
        stopSelf();
    }

    private void performFullTeardownOnce() {
        sIsRunning = false;
        sHasMicrophoneType = false;
        sServiceGeneration.incrementAndGet();
        cleanupLocalMonitorsAndLocks();
        if (!mCleanupExecuted.compareAndSet(false, true)) {
            return;
        }
        try {
            TikTokLiveConnector.getInstance(getApplicationContext())
                    .disconnect("Companion Service dihentikan.");
        } catch (Exception ignored) {
        }
        try {
            NativeMusicPlayer.releaseSharedIfCreated();
        } catch (Exception ignored) {
        }
        try {
            FloatingCompanionPlugin.onNativeCompanionStopped(getApplicationContext());
        } catch (Exception ignored) {
        }
        notifyLifecycleStopped();
        try {
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling notification: " + e.getMessage());
        }
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
        if (sInstance == this) {
            sInstance = null;
        }
        performFullTeardownOnce();
        mLockWatchdog.shutdownNow();
        Log.i(TAG, "CompanionService destroyed (gen=" + mInstanceGeneration + ")");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
