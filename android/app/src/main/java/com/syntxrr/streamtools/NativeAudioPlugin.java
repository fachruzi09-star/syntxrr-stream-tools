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
            ret.put("success", false);
            ret.put("streamId", 0);
            ret.put("soundId", soundId);
            ret.put("message", "Sound ID tidak terdaftar atau belum dimuat. Gunakan Web Audio fallback.");
            call.resolve(ret);
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
        super.handleOnDestroy();
    }
}
