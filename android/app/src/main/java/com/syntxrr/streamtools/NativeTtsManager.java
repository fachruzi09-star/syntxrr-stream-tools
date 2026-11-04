package com.syntxrr.streamtools;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import java.util.LinkedList;
import java.util.Locale;
import java.util.Queue;

/**
 * NativeTtsManager
 * 
 * Standalone native Text-to-Speech engine utilizing Android's TextToSpeech service.
 * Operates independent of WebView DOM speech synthesis, ensuring live stream
 * event alerts (donations, gifts, chat) continue to be spoken even when TikTok is
 * in the foreground.
 */
public class NativeTtsManager implements TextToSpeech.OnInitListener {

    private static final String TAG = "NativeTtsManager";

    private final Context mContext;
    @Nullable
    private TextToSpeech mTextToSpeech;
    private boolean mIsInitialized = false;
    private boolean mIsInitializing = false;

    private float mSpeechRate = 1.0f;
    private float mPitch = 1.0f;
    private Locale mCurrentLocale = new Locale("id", "ID");

    public interface OnTtsEventListener {
        void onTtsStart(String utteranceId);
        void onTtsDone(String utteranceId);
        void onTtsError(String utteranceId, String errorMessage);
    }

    @Nullable
    private OnTtsEventListener mEventListener;

    // Buffer requests called before OnInit completes
    private static class PendingSpeech {
        final String utteranceId;
        final String text;
        final float rate;
        final float pitch;
        final String language;
        final boolean queue;

        PendingSpeech(String utteranceId, String text, float rate, float pitch, String language, boolean queue) {
            this.utteranceId = utteranceId;
            this.text = text;
            this.rate = rate;
            this.pitch = pitch;
            this.language = language;
            this.queue = queue;
        }
    }

    private final Queue<PendingSpeech> mPendingQueue = new LinkedList<>();

    public NativeTtsManager(@NonNull Context context) {
        this.mContext = context.getApplicationContext();
        initializeTts();
    }

    public void setEventListener(@Nullable OnTtsEventListener listener) {
        this.mEventListener = listener;
    }

    private synchronized void initializeTts() {
        if (mIsInitializing || mIsInitialized) {
            return;
        }
        mIsInitializing = true;
        try {
            Log.i(TAG, "Initializing Android native TextToSpeech engine...");
            mTextToSpeech = new TextToSpeech(mContext, this);
        } catch (Exception e) {
            mIsInitializing = false;
            Log.e(TAG, "Exception initializing TextToSpeech: " + e.getMessage(), e);
        }
    }

    @Override
    public synchronized void onInit(int status) {
        mIsInitializing = false;
        if (status == TextToSpeech.SUCCESS && mTextToSpeech != null) {
            mIsInitialized = true;
            Log.i(TAG, "TextToSpeech engine successfully initialized.");

            // 1. Configure audio attributes for media/accessibility
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                    mTextToSpeech.setAudioAttributes(audioAttributes);
                } catch (Exception e) {
                    Log.w(TAG, "Failed to set AudioAttributes on TTS: " + e.getMessage());
                }
            }

            // 2. Set default language to Indonesian (id-ID)
            int langResult = mTextToSpeech.setLanguage(mCurrentLocale);
            if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.w(TAG, "Indonesian language data missing or not supported, falling back to default locale.");
                mCurrentLocale = Locale.getDefault();
                mTextToSpeech.setLanguage(mCurrentLocale);
            }

            mTextToSpeech.setSpeechRate(mSpeechRate);
            mTextToSpeech.setPitch(mPitch);

            // 3. Register UtteranceProgressListener
            mTextToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    Log.d(TAG, "TTS utterance started: " + utteranceId);
                    if (mEventListener != null) {
                        mEventListener.onTtsStart(utteranceId);
                    }
                }

                @Override
                public void onDone(String utteranceId) {
                    Log.d(TAG, "TTS utterance finished: " + utteranceId);
                    if (mEventListener != null) {
                        mEventListener.onTtsDone(utteranceId);
                    }
                }

                @Override
                public void onError(String utteranceId) {
                    Log.w(TAG, "TTS utterance error on: " + utteranceId);
                    if (mEventListener != null) {
                        mEventListener.onTtsError(utteranceId, "Unknown TTS error");
                    }
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    Log.w(TAG, "TTS utterance error on " + utteranceId + " with code: " + errorCode);
                    if (mEventListener != null) {
                        mEventListener.onTtsError(utteranceId, "TTS error code " + errorCode);
                    }
                }
            });

            // 4. Drain any pending speech requests accumulated before initialization finished
            processPendingQueue();

        } else {
            mIsInitialized = false;
            Log.e(TAG, "TextToSpeech initialization failed with status code: " + status);
            mPendingQueue.clear();
        }
    }

    private synchronized void processPendingQueue() {
        while (!mPendingQueue.isEmpty() && mIsInitialized && mTextToSpeech != null) {
            PendingSpeech req = mPendingQueue.poll();
            if (req != null) {
                speakInternal(req.utteranceId, req.text, req.rate, req.pitch, req.language, req.queue);
            }
        }
    }

    public synchronized boolean isReady() {
        return mIsInitialized && mTextToSpeech != null;
    }

    public synchronized boolean isInitializing() {
        return mIsInitializing;
    }

    public synchronized String getCurrentLanguageTag() {
        return mCurrentLocale != null ? mCurrentLocale.toLanguageTag() : "id-ID";
    }

    /**
     * Speak given text. If engine is still initializing, queues request safely.
     * @return true if queued or spoken, false if completely failed.
     */
    public synchronized boolean speak(
            @NonNull String utteranceId,
            @NonNull String text,
            float rate,
            float pitch,
            @Nullable String language,
            boolean queue
    ) {
        if (!mIsInitialized || mTextToSpeech == null) {
            if (mIsInitializing) {
                Log.i(TAG, "TTS engine still initializing. Enqueuing pending request: " + utteranceId);
                mPendingQueue.offer(new PendingSpeech(utteranceId, text, rate, pitch, language, queue));
                return true;
            } else {
                Log.w(TAG, "TTS engine not initialized and not initializing. Starting init...");
                initializeTts();
                mPendingQueue.offer(new PendingSpeech(utteranceId, text, rate, pitch, language, queue));
                return true;
            }
        }

        return speakInternal(utteranceId, text, rate, pitch, language, queue);
    }

    private synchronized boolean speakInternal(
            @NonNull String utteranceId,
            @NonNull String text,
            float rate,
            float pitch,
            @Nullable String language,
            boolean queue
    ) {
        if (mTextToSpeech == null) return false;

        try {
            // Apply language if specified
            if (language != null && !language.trim().isEmpty()) {
                Locale targetLocale = parseLocale(language);
                if (targetLocale != null && !targetLocale.equals(mCurrentLocale)) {
                    int check = mTextToSpeech.setLanguage(targetLocale);
                    if (check != TextToSpeech.LANG_MISSING_DATA && check != TextToSpeech.LANG_NOT_SUPPORTED) {
                        mCurrentLocale = targetLocale;
                    }
                }
            }

            // Apply rate and pitch
            mSpeechRate = Math.max(0.5f, Math.min(2.0f, rate));
            mPitch = Math.max(0.5f, Math.min(2.0f, pitch));
            mTextToSpeech.setSpeechRate(mSpeechRate);
            mTextToSpeech.setPitch(mPitch);

            int queueMode = queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH;

            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Bundle params = new Bundle();
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
                result = mTextToSpeech.speak(text, queueMode, params, utteranceId);
            } else {
                result = mTextToSpeech.speak(text, queueMode, null);
            }

            return result == TextToSpeech.SUCCESS;
        } catch (Exception e) {
            Log.e(TAG, "Error executing speak: " + e.getMessage(), e);
            return false;
        }
    }

    private Locale parseLocale(String langCode) {
        try {
            if (langCode.contains("-")) {
                String[] parts = langCode.split("-");
                return new Locale(parts[0], parts[1]);
            } else if (langCode.contains("_")) {
                String[] parts = langCode.split("_");
                return new Locale(parts[0], parts[1]);
            } else {
                return new Locale(langCode);
            }
        } catch (Exception e) {
            return Locale.getDefault();
        }
    }

    /**
     * Immediately stop any current or pending speech.
     */
    public synchronized void stop() {
        mPendingQueue.clear();
        if (mTextToSpeech != null && mIsInitialized) {
            try {
                mTextToSpeech.stop();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping TTS: " + e.getMessage());
            }
        }
    }

    /**
     * Shutdown and cleanup native TTS engine.
     */
    public synchronized void shutdown() {
        mPendingQueue.clear();
        mEventListener = null;
        if (mTextToSpeech != null) {
            try {
                mTextToSpeech.stop();
                mTextToSpeech.shutdown();
            } catch (Exception e) {
                Log.e(TAG, "Error during TTS shutdown: " + e.getMessage());
            } finally {
                mTextToSpeech = null;
                mIsInitialized = false;
                mIsInitializing = false;
                Log.i(TAG, "Native TextToSpeech engine shutdown cleanly.");
            }
        }
    }
}
