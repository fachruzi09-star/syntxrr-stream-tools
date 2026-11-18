package com.syntxrr.streamtools;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * NativeMusicPlayer
 *
 * Engine pemutaran musik latar belakang berbasis Android MediaPlayer + MediaSession
 * untuk subsistem Song Request Mode A SYNTXRR STREAM.
 *
 * Berjalan di proses native aplikasi yang dijaga tetap hidup oleh CompanionService
 * (FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK), sehingga pemutaran lagu tetap berlanjut
 * saat WebView masuk ke latar belakang (mis. saat membuka TikTok LIVE).
 */
public class NativeMusicPlayer {

    private static final String TAG = "NativeMusicPlayer";
    private static final String MEDIA_SESSION_TAG = "SYNTXRR_SongRequest";
    private static final int MAX_BASE64_DECODED_BYTES = 25 * 1024 * 1024; // 25 MB safety limit

    public interface OnMusicEventListener {
        void onMusicState(
                String trackId,
                String status,
                boolean isPlaying,
                long positionMs,
                long durationMs,
                @Nullable String errorMessage
        );

        void onTransportCommand(String command);
    }

    public static class MusicSnapshot {
        public final String trackId;
        public final String title;
        public final String artist;
        public final String status;
        public final boolean isPlaying;
        public final long positionMs;
        public final long durationMs;
        @Nullable
        public final String errorMessage;

        MusicSnapshot(
                String trackId,
                String title,
                String artist,
                String status,
                boolean isPlaying,
                long positionMs,
                long durationMs,
                @Nullable String errorMessage
        ) {
            this.trackId = trackId;
            this.title = title;
            this.artist = artist;
            this.status = status;
            this.isPlaying = isPlaying;
            this.positionMs = positionMs;
            this.durationMs = durationMs;
            this.errorMessage = errorMessage;
        }
    }

    private final Context mAppContext;
    private final Object mLock = new Object();

    @Nullable
    private MediaPlayer mMediaPlayer;
    @Nullable
    private MediaSession mMediaSession;
    @Nullable
    private OnMusicEventListener mListener;
    @Nullable
    private File mTempAudioFile;

    private String mTrackId = "";
    private String mTitle = "";
    private String mArtist = "";
    private String mStatus = "idle"; // idle | preparing | playing | paused | completed | stopped | error
    @Nullable
    private String mLastError = null;
    private boolean mPrepared = false;
    private long mDurationMs = 0L;
    private float mVolume = 0.85f;
    private int mSessionGeneration = 0;

    @Nullable
    private static volatile NativeMusicPlayer sInstance;

    @NonNull
    public static NativeMusicPlayer getInstance(@NonNull Context context) {
        NativeMusicPlayer current = sInstance;
        if (current == null) {
            synchronized (NativeMusicPlayer.class) {
                current = sInstance;
                if (current == null) {
                    current = new NativeMusicPlayer(context.getApplicationContext());
                    sInstance = current;
                }
            }
        }
        return current;
    }

    public static void releaseSharedIfCreated() {
        NativeMusicPlayer current;
        synchronized (NativeMusicPlayer.class) {
            current = sInstance;
            sInstance = null;
        }
        if (current != null) {
            current.release();
        }
    }

    public NativeMusicPlayer(@NonNull Context context) {
        mAppContext = context.getApplicationContext();
        initMediaSession();
    }

    public void setEventListener(@Nullable OnMusicEventListener listener) {
        synchronized (mLock) {
            mListener = listener;
        }
    }

    private void initMediaSession() {
        try {
            MediaSession session = new MediaSession(mAppContext, MEDIA_SESSION_TAG);
            session.setFlags(
                    MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
                            MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
            );
            session.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    emitTransport("play");
                }

                @Override
                public void onPause() {
                    emitTransport("pause");
                }

                @Override
                public void onSkipToNext() {
                    emitTransport("next");
                }

                @Override
                public void onStop() {
                    emitTransport("stop");
                }
            });
            session.setActive(true);
            mMediaSession = session;
        } catch (Exception e) {
            Log.w(TAG, "Gagal inisialisasi MediaSession: " + e.getMessage());
        }
    }

    public boolean playUri(
            @NonNull String trackId,
            @NonNull String title,
            @NonNull String artist,
            @NonNull String sourceUri,
            float volume
    ) {
        synchronized (mLock) {
            return startPlaybackInternal(trackId, title, artist, sourceUri, null, null, volume);
        }
    }

    public boolean playBase64(
            @NonNull String trackId,
            @NonNull String title,
            @NonNull String artist,
            @NonNull String base64Audio,
            @Nullable String mimeType,
            float volume
    ) {
        synchronized (mLock) {
            return startPlaybackInternal(trackId, title, artist, null, base64Audio, mimeType, volume);
        }
    }

    private boolean startPlaybackInternal(
            @NonNull String trackId,
            @NonNull String title,
            @NonNull String artist,
            @Nullable String sourceUri,
            @Nullable String base64Audio,
            @Nullable String mimeType,
            float volume
    ) {
        final int generation = ++mSessionGeneration;
        releaseMediaPlayerOnlyLocked();
        cleanupTempFileLocked();

        mTrackId = trackId;
        mTitle = title;
        mArtist = artist;
        mVolume = clampVolume(volume);
        mLastError = null;
        mPrepared = false;
        mDurationMs = 0L;
        mStatus = "preparing";

        File preparedFile = null;
        if (base64Audio != null && !base64Audio.isEmpty()) {
            try {
                byte[] decoded = Base64.decode(base64Audio, Base64.DEFAULT);
                if (decoded == null || decoded.length == 0) {
                    setErrorLocked(trackId, "Data audio lokal kosong.");
                    return false;
                }
                if (decoded.length > MAX_BASE64_DECODED_BYTES) {
                    setErrorLocked(trackId, "Ukuran file audio melebihi batas transfer 25 MB.");
                    return false;
                }
                String ext = resolveExtension(mimeType);
                File cacheDir = mAppContext.getCacheDir();
                File outFile = new File(cacheDir, "sr_track_" + System.currentTimeMillis() + "." + ext);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(decoded);
                    fos.flush();
                }
                mTempAudioFile = outFile;
                preparedFile = outFile;
            } catch (IllegalArgumentException | IOException e) {
                setErrorLocked(trackId, "Gagal menyiapkan audio lokal: " + e.getMessage());
                return false;
            }
        } else if (sourceUri == null || sourceUri.trim().isEmpty()) {
            setErrorLocked(trackId, "Sumber audio tidak tersedia.");
            return false;
        }

        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setWakeMode(mAppContext, PowerManager.PARTIAL_WAKE_LOCK);
            mp.setAudioAttributes(
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
            );
            mp.setVolume(mVolume, mVolume);

            mp.setOnPreparedListener(player -> {
                synchronized (mLock) {
                    if (generation != mSessionGeneration || mMediaPlayer != player) {
                        return;
                    }
                    try {
                        mPrepared = true;
                        int dur = player.getDuration();
                        mDurationMs = dur > 0 ? dur : 0L;
                        player.start();
                        mStatus = "playing";
                        mLastError = null;
                        updateMediaSessionLocked(PlaybackState.STATE_PLAYING, 0L);
                        updateCompanionStatusLocked(true);
                        emitStateLocked();
                    } catch (Exception startErr) {
                        setErrorLocked(trackId, "Gagal memulai pemutaran: " + startErr.getMessage());
                    }
                }
            });

            mp.setOnCompletionListener(player -> {
                synchronized (mLock) {
                    if (generation != mSessionGeneration || mMediaPlayer != player) {
                        return;
                    }
                    mStatus = "completed";
                    mLastError = null;
                    long finalPos = mDurationMs > 0 ? mDurationMs : 0L;
                    updateMediaSessionLocked(PlaybackState.STATE_STOPPED, finalPos);
                    updateCompanionStatusLocked(false);
                    emitStateLocked();
                }
            });

            mp.setOnErrorListener((player, what, extra) -> {
                synchronized (mLock) {
                    if (generation != mSessionGeneration || mMediaPlayer != player) {
                        return true;
                    }
                    setErrorLocked(trackId, "Kesalahan pemutar audio native (kode " + what + "/" + extra + ").");
                }
                return true;
            });

            if (preparedFile != null) {
                mp.setDataSource(preparedFile.getAbsolutePath());
            } else {
                Uri uri = Uri.parse(sourceUri.trim());
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                if ("content".equals(scheme) || "file".equals(scheme)) {
                    mp.setDataSource(mAppContext, uri);
                } else {
                    mp.setDataSource(sourceUri.trim());
                }
            }

            mMediaPlayer = mp;
            updateMediaSessionLocked(PlaybackState.STATE_BUFFERING, 0L);
            emitStateLocked();
            mp.prepareAsync();
            return true;
        } catch (Exception e) {
            setErrorLocked(trackId, "Gagal memuat sumber audio: " + e.getMessage());
            return false;
        }
    }

    public boolean pause() {
        synchronized (mLock) {
            if (mMediaPlayer == null || !mPrepared) {
                return false;
            }
            try {
                if (mMediaPlayer.isPlaying()) {
                    mMediaPlayer.pause();
                }
                mStatus = "paused";
                updateMediaSessionLocked(PlaybackState.STATE_PAUSED, getSafePositionLocked());
                updateCompanionStatusLocked(false);
                emitStateLocked();
                return true;
            } catch (Exception e) {
                Log.w(TAG, "pause gagal: " + e.getMessage());
                return false;
            }
        }
    }

    public boolean resume() {
        synchronized (mLock) {
            if (mMediaPlayer == null || !mPrepared) {
                return false;
            }
            try {
                if (!mMediaPlayer.isPlaying()) {
                    mMediaPlayer.start();
                }
                mStatus = "playing";
                mLastError = null;
                updateMediaSessionLocked(PlaybackState.STATE_PLAYING, getSafePositionLocked());
                updateCompanionStatusLocked(true);
                emitStateLocked();
                return true;
            } catch (Exception e) {
                setErrorLocked(mTrackId, "Gagal melanjutkan pemutaran: " + e.getMessage());
                return false;
            }
        }
    }

    public void stop() {
        synchronized (mLock) {
            mSessionGeneration++;
            boolean hadTrack = !mTrackId.isEmpty() || mMediaPlayer != null;
            releaseMediaPlayerOnlyLocked();
            cleanupTempFileLocked();
            mPrepared = false;
            mDurationMs = 0L;
            mLastError = null;
            mStatus = "stopped";
            updateMediaSessionLocked(PlaybackState.STATE_STOPPED, 0L);
            updateCompanionStatusLocked(false);
            if (hadTrack) {
                emitStateLocked();
            }
            mTrackId = "";
            mTitle = "";
            mArtist = "";
        }
    }

    public float setVolume(float volume) {
        synchronized (mLock) {
            mVolume = clampVolume(volume);
            if (mMediaPlayer != null) {
                try {
                    mMediaPlayer.setVolume(mVolume, mVolume);
                } catch (Exception e) {
                    Log.w(TAG, "setVolume gagal: " + e.getMessage());
                }
            }
            return mVolume;
        }
    }

    public MusicSnapshot getStatus() {
        synchronized (mLock) {
            boolean playing = false;
            if (mMediaPlayer != null && mPrepared) {
                try {
                    playing = mMediaPlayer.isPlaying();
                } catch (Exception ignored) {
                    playing = false;
                }
            }
            long pos = getSafePositionLocked();
            long dur = mDurationMs;
            if (mMediaPlayer != null && mPrepared && dur <= 0) {
                try {
                    int rawDur = mMediaPlayer.getDuration();
                    if (rawDur > 0) dur = rawDur;
                } catch (Exception ignored) {
                }
            }
            return new MusicSnapshot(
                    mTrackId,
                    mTitle,
                    mArtist,
                    mStatus,
                    playing,
                    pos,
                    dur,
                    mLastError
            );
        }
    }

    public void release() {
        synchronized (NativeMusicPlayer.class) {
            if (sInstance == this) {
                sInstance = null;
            }
        }
        synchronized (mLock) {
            mSessionGeneration++;
            releaseMediaPlayerOnlyLocked();
            cleanupTempFileLocked();
            if (mMediaSession != null) {
                try {
                    mMediaSession.setActive(false);
                    mMediaSession.release();
                } catch (Exception ignored) {
                }
                mMediaSession = null;
            }
            mPrepared = false;
            mStatus = "idle";
            mTrackId = "";
            mTitle = "";
            mArtist = "";
            mLastError = null;
            mListener = null;
        }
    }

    private void releaseMediaPlayerOnlyLocked() {
        if (mMediaPlayer != null) {
            try {
                if (mMediaPlayer.isPlaying()) {
                    mMediaPlayer.stop();
                }
            } catch (Exception ignored) {
            }
            try {
                mMediaPlayer.reset();
            } catch (Exception ignored) {
            }
            try {
                mMediaPlayer.release();
            } catch (Exception ignored) {
            }
            mMediaPlayer = null;
        }
    }

    private void cleanupTempFileLocked() {
        if (mTempAudioFile != null) {
            try {
                if (mTempAudioFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    mTempAudioFile.delete();
                }
            } catch (Exception ignored) {
            }
            mTempAudioFile = null;
        }
    }

    private long getSafePositionLocked() {
        if (mMediaPlayer != null && mPrepared) {
            try {
                int pos = mMediaPlayer.getCurrentPosition();
                return Math.max(0L, pos);
            } catch (Exception ignored) {
            }
        }
        return 0L;
    }

    private void setErrorLocked(@NonNull String trackId, @NonNull String message) {
        releaseMediaPlayerOnlyLocked();
        cleanupTempFileLocked();
        mPrepared = false;
        mStatus = "error";
        mLastError = message;
        mTrackId = trackId;
        updateMediaSessionLocked(PlaybackState.STATE_ERROR, 0L);
        updateCompanionStatusLocked(false);
        emitStateLocked();
    }

    private void updateMediaSessionLocked(int playbackState, long positionMs) {
        if (mMediaSession == null) return;
        try {
            if (!mTitle.isEmpty()) {
                MediaMetadata.Builder meta = new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, mTitle)
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, mArtist);
                if (mDurationMs > 0) {
                    meta.putLong(MediaMetadata.METADATA_KEY_DURATION, mDurationMs);
                }
                mMediaSession.setMetadata(meta.build());
            }
            PlaybackState.Builder state = new PlaybackState.Builder()
                    .setActions(
                            PlaybackState.ACTION_PLAY |
                                    PlaybackState.ACTION_PAUSE |
                                    PlaybackState.ACTION_PLAY_PAUSE |
                                    PlaybackState.ACTION_SKIP_TO_NEXT |
                                    PlaybackState.ACTION_STOP
                    )
                    .setState(playbackState, positionMs, playbackState == PlaybackState.STATE_PLAYING ? 1.0f : 0f);
            mMediaSession.setPlaybackState(state.build());
        } catch (Exception e) {
            Log.w(TAG, "updateMediaSession gagal: " + e.getMessage());
        }
    }

    private void updateCompanionStatusLocked(boolean isPlayingNow) {
        if (!CompanionService.isRunning()) return;
        if (isPlayingNow && !mTitle.isEmpty()) {
            CompanionService.updateStatusDetail("Song Request: " + mTitle);
        } else {
            CompanionService.updateStatusDetail("Floating HUD aktif");
        }
    }

    private void emitStateLocked() {
        OnMusicEventListener listener = mListener;
        if (listener == null) return;
        boolean playing = false;
        if (mMediaPlayer != null && mPrepared) {
            try {
                playing = mMediaPlayer.isPlaying();
            } catch (Exception ignored) {
                playing = false;
            }
        }
        final String trackId = mTrackId;
        final String status = mStatus;
        final boolean isPlayingFinal = playing || "playing".equals(status);
        final long pos = getSafePositionLocked();
        final long dur = mDurationMs;
        final String err = mLastError;
        try {
            listener.onMusicState(trackId, status, isPlayingFinal, pos, dur, err);
        } catch (Exception e) {
            Log.w(TAG, "Gagal emit musicState: " + e.getMessage());
        }
    }

    private void emitTransport(@NonNull String command) {
        final OnMusicEventListener listener;
        synchronized (mLock) {
            listener = mListener;
        }
        if (listener != null) {
            try {
                listener.onTransportCommand(command);
            } catch (Exception e) {
                Log.w(TAG, "Gagal emit transport command: " + e.getMessage());
            }
        }
    }

    private static float clampVolume(float v) {
        if (Float.isNaN(v)) return 0.85f;
        return Math.max(0.0f, Math.min(1.0f, v));
    }

    private static String resolveExtension(@Nullable String mimeType) {
        if (mimeType == null) return "mp3";
        String lower = mimeType.toLowerCase();
        if (lower.contains("wav")) return "wav";
        if (lower.contains("ogg")) return "ogg";
        if (lower.contains("aac")) return "aac";
        if (lower.contains("mp4") || lower.contains("m4a")) return "m4a";
        if (lower.contains("flac")) return "flac";
        return "mp3";
    }
}
