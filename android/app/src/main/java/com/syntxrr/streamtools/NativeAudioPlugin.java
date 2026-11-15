package com.syntxrr.streamtools;

import android.content.Context;
import android.os.Build;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * NativeAudioPlugin
 * 
 * Capacitor native bridge plugin exposing low-latency SoundPool SFX playback
 * and background Text-to-Speech (TTS) to the SYNTXRR STREAM web client.
 */
@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {

    @Nullable
    private NativeSoundPoolManager mSoundPoolManager;
    @Nullable
    private NativeTtsManager mTtsManager;
    @Nullable
    private NativeMusicPlayer mMusicPlayer;

    private synchronized NativeSoundPoolManager getSoundPoolManager() {
        if (mSoundPoolManager == null) {
            Context appContext = getContext().getApplicationContext();
            mSoundPoolManager = new NativeSoundPoolManager(appContext);
        }
        return mSoundPoolManager;
    }

    private synchronized NativeTtsManager getTtsManager() {
        if (mTtsManager == null) {
            Context appContext = getContext().getApplicationContext();
            mTtsManager = new NativeTtsManager(appContext);
            mTtsManager.setEventListener(new NativeTtsManager.OnTtsEventListener() {
                @Override
                public void onTtsStart(String utteranceId) {
                    JSObject data = new JSObject();
                    data.put("utteranceId", utteranceId);
                    data.put("timestamp", System.currentTimeMillis());
                    notifyListeners("ttsStart", data);
                }

                @Override
                public void onTtsDone(String utteranceId) {
                    JSObject data = new JSObject();
                    data.put("utteranceId", utteranceId);
                    data.put("timestamp", System.currentTimeMillis());
                    notifyListeners("ttsDone", data);
                }

                @Override
                public void onTtsError(String utteranceId, String errorMessage) {
                    JSObject data = new JSObject();
                    data.put("utteranceId", utteranceId);
                    data.put("error", errorMessage);
                    data.put("timestamp", System.currentTimeMillis());
                    notifyListeners("ttsError", data);
                }
            });
        }
        return mTtsManager;
    }

    @Override
    public void load() {
        super.load();
        getMusicPlayer();
    }

    private synchronized NativeMusicPlayer getMusicPlayer() {
        if (mMusicPlayer == null) {
            Context appContext = getContext().getApplicationContext();
            mMusicPlayer = NativeMusicPlayer.getInstance(appContext);
        }
        mMusicPlayer.setEventListener(new NativeMusicPlayer.OnMusicEventListener() {
            @Override
            public void onMusicState(
                    String trackId,
                    String status,
                    boolean isPlaying,
                    long positionMs,
                    long durationMs,
                    @Nullable String errorMessage
            ) {
                JSObject data = new JSObject();
                data.put("trackId", trackId);
                data.put("status", status);
                data.put("isPlaying", isPlaying);
                data.put("positionMs", positionMs);
                data.put("durationMs", durationMs);
                if (errorMessage != null) {
                    data.put("errorMessage", errorMessage);
                }
                data.put("timestamp", System.currentTimeMillis());
                notifyListeners("musicState", data);
            }

            @Override
            public void onTransportCommand(String command) {
                JSObject data = new JSObject();
                data.put("command", command);
                data.put("timestamp", System.currentTimeMillis());
                notifyListeners("musicTransport", data);
            }
        });
        return mMusicPlayer;
    }

    @PluginMethod
    public void playSfx(PluginCall call) {
        String soundId = call.getString("soundId");
        if (soundId == null || soundId.trim().isEmpty()) {
            call.reject("soundId wajib disertakan.");
            return;
        }

        String filePath = call.getString("filePath");
        Double volumeObj = call.getDouble("volume", 1.0);
        float volume = volumeObj != null ? volumeObj.floatValue() : 1.0f;

        Double rateObj = call.getDouble("rate", 1.0);
        float rate = rateObj != null ? rateObj.floatValue() : 1.0f;

        boolean loop = Boolean.TRUE.equals(call.getBoolean("loop", false));

        NativeSoundPoolManager spManager = getSoundPoolManager();

        // If local file path provided and not yet registered, load it
        if (filePath != null && !filePath.trim().isEmpty() && !spManager.isSoundLoaded(soundId)) {
            spManager.loadSoundFile(soundId, filePath);
        }

        int streamId = spManager.playSound(soundId, volume, rate, loop);

        JSObject ret = new JSObject();
        if (streamId > 0) {
            ret.put("success", true);
            ret.put("streamId", streamId);
            ret.put("soundId", soundId);
            ret.put("message", "SFX berhasil diputar via SoundPool.");
            call.resolve(ret);
        } else if (streamId == -2) {
            ret.put("success", false);
            ret.put("streamId", 0);
            ret.put("soundId", soundId);
            ret.put("message", "Audio sedang dimuat ke memori, coba sesaat lagi.");
            call.resolve(ret);
        } else if (streamId == 0) {
            // Check if it is a synthetic procedural sound (default presets horn, tada, cheer, bell, etc.)
            boolean synthPlayed = spManager.playSynthSound(soundId, volume);
            if (synthPlayed) {
                ret.put("success", true);
                ret.put("streamId", 1);
                ret.put("soundId", soundId);
                ret.put("message", "SFX sintetis diputar via native AudioTrack.");
                call.resolve(ret);
            } else {
                ret.put("success", false);
                ret.put("streamId", 0);
                ret.put("soundId", soundId);
                ret.put("message", "Sound ID tidak terdaftar atau belum dimuat. Gunakan Web Audio fallback.");
                call.resolve(ret);
            }
        } else {
            ret.put("success", false);
            ret.put("streamId", 0);
            ret.put("soundId", soundId);
            ret.put("message", "Gagal memutar audio via SoundPool.");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopSfx(PluginCall call) {
        Integer streamId = call.getInt("streamId");
        NativeSoundPoolManager spManager = getSoundPoolManager();

        if (streamId != null && streamId > 0) {
            boolean stopped = spManager.stopStream(streamId);
            JSObject ret = new JSObject();
            ret.put("success", stopped);
            ret.put("streamId", streamId);
            call.resolve(ret);
        } else {
            spManager.stopAllStreams();
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Semua stream SFX dihentikan.");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void setMasterVolume(PluginCall call) {
        Double volumeObj = call.getDouble("volume");
        if (volumeObj == null) {
            call.reject("Parameter volume (0.0 - 1.0) wajib disertakan.");
            return;
        }

        float volume = volumeObj.floatValue();
        NativeSoundPoolManager spManager = getSoundPoolManager();
        spManager.setMasterVolume(volume);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("volume", spManager.getMasterVolume());
        call.resolve(ret);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Teks TTS tidak boleh kosong.");
            return;
        }

        String utteranceId = call.getString("utteranceId");
        if (utteranceId == null || utteranceId.trim().isEmpty()) {
            utteranceId = "utt_" + System.currentTimeMillis() + "_" + (int) (Math.random() * 1000);
        }

        Double rateObj = call.getDouble("rate", 1.0);
        float rate = rateObj != null ? rateObj.floatValue() : 1.0f;

        Double pitchObj = call.getDouble("pitch", 1.0);
        float pitch = pitchObj != null ? pitchObj.floatValue() : 1.0f;

        String language = call.getString("language", "id-ID");
        boolean queue = Boolean.TRUE.equals(call.getBoolean("queue", true));

        NativeTtsManager tts = getTtsManager();
        boolean queuedOrSpoken = tts.speak(utteranceId, text, rate, pitch, language, queue);

        JSObject ret = new JSObject();
        ret.put("success", queuedOrSpoken);
        ret.put("utteranceId", utteranceId);
        ret.put("queued", queuedOrSpoken && !tts.isReady());
        ret.put("message", queuedOrSpoken
                ? (tts.isReady() ? "TTS diputar." : "TTS masuk antrean inisialisasi.")
                : "Gagal memproses permintaan TTS.");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        NativeTtsManager tts = getTtsManager();
        tts.stop();

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "TTS berhasil dihentikan.");
        call.resolve(ret);
    }

    @PluginMethod
    public void getAudioStatus(PluginCall call) {
        NativeSoundPoolManager spManager = getSoundPoolManager();
        NativeTtsManager tts = getTtsManager();

        JSObject ret = new JSObject();
        ret.put("soundPoolReady", spManager.isReady());
        ret.put("ttsReady", tts.isReady());
        ret.put("ttsInitializing", tts.isInitializing());
        ret.put("ttsLanguage", tts.getCurrentLanguageTag());
        ret.put("masterVolume", spManager.getMasterVolume());
        call.resolve(ret);
    }

    @PluginMethod
    public void playMusicTrack(PluginCall call) {
        String trackId = call.getString("trackId");
        if (trackId == null || trackId.trim().isEmpty()) {
            call.reject("trackId wajib disertakan.");
            return;
        }
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");
        String sourceUri = call.getString("sourceUri");
        String base64Audio = call.getString("base64Audio");
        String mimeType = call.getString("mimeType", "audio/mpeg");
        Double volumeObj = call.getDouble("volume", 0.85);
        float volume = volumeObj != null ? volumeObj.floatValue() : 0.85f;

        NativeMusicPlayer player = getMusicPlayer();
        boolean accepted;
        if (base64Audio != null && !base64Audio.trim().isEmpty()) {
            accepted = player.playBase64(trackId.trim(), title, artist, base64Audio, mimeType, volume);
        } else if (sourceUri != null && !sourceUri.trim().isEmpty()) {
            accepted = player.playUri(trackId.trim(), title, artist, sourceUri.trim(), volume);
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Sumber audio (sourceUri atau base64Audio) tidak tersedia.");
            call.resolve(ret);
            return;
        }

        NativeMusicPlayer.MusicSnapshot snap = player.getStatus();
        JSObject ret = new JSObject();
        ret.put("success", accepted);
        ret.put("trackId", snap.trackId);
        ret.put("status", snap.status);
        if (snap.errorMessage != null) {
            ret.put("message", snap.errorMessage);
        } else {
            ret.put("message", accepted ? "Memuat pemutaran musik native." : "Gagal memulai musik native.");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void pauseMusicTrack(PluginCall call) {
        NativeMusicPlayer player = getMusicPlayer();
        boolean paused = player.pause();
        NativeMusicPlayer.MusicSnapshot snap = player.getStatus();
        JSObject ret = new JSObject();
        ret.put("success", paused);
        ret.put("status", snap.status);
        ret.put("isPlaying", snap.isPlaying);
        ret.put("positionMs", snap.positionMs);
        ret.put("durationMs", snap.durationMs);
        call.resolve(ret);
    }

    @PluginMethod
    public void resumeMusicTrack(PluginCall call) {
        NativeMusicPlayer player = getMusicPlayer();
        boolean resumed = player.resume();
        NativeMusicPlayer.MusicSnapshot snap = player.getStatus();
        JSObject ret = new JSObject();
        ret.put("success", resumed);
        ret.put("status", snap.status);
        ret.put("isPlaying", snap.isPlaying);
        ret.put("positionMs", snap.positionMs);
        ret.put("durationMs", snap.durationMs);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopMusicTrack(PluginCall call) {
        NativeMusicPlayer player = getMusicPlayer();
        player.stop();
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("status", "stopped");
        call.resolve(ret);
    }

    @PluginMethod
    public void setMusicVolume(PluginCall call) {
        Double volumeObj = call.getDouble("volume");
        if (volumeObj == null) {
            call.reject("Parameter volume (0.0 - 1.0) wajib disertakan.");
            return;
        }
        NativeMusicPlayer player = getMusicPlayer();
        float applied = player.setVolume(volumeObj.floatValue());
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("volume", applied);
        call.resolve(ret);
    }

    @PluginMethod
    public void getMusicStatus(PluginCall call) {
        NativeMusicPlayer player = getMusicPlayer();
        NativeMusicPlayer.MusicSnapshot snap = player.getStatus();
        JSObject ret = new JSObject();
        ret.put("trackId", snap.trackId);
        ret.put("title", snap.title);
        ret.put("artist", snap.artist);
        ret.put("status", snap.status);
        ret.put("isPlaying", snap.isPlaying);
        ret.put("positionMs", snap.positionMs);
        ret.put("durationMs", snap.durationMs);
        if (snap.errorMessage != null) {
            ret.put("errorMessage", snap.errorMessage);
        }
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (mSoundPoolManager != null) {
            mSoundPoolManager.release();
            mSoundPoolManager = null;
        }
        if (mTtsManager != null) {
            mTtsManager.shutdown();
            mTtsManager = null;
        }
        if (mMusicPlayer != null) {
            mMusicPlayer.setEventListener(null);
            if (!CompanionService.isRunning()) {
                mMusicPlayer.release();
            }
            mMusicPlayer = null;
        }
        super.handleOnDestroy();
    }
}
