package com.syntxrr.streamtools;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/** Capacitor bridge for the native MediaProjection + H.264/AAC + RTMP Mode B pipeline. */
@CapacitorPlugin(
        name = "NativeStreaming",
        permissions = {
                @Permission(alias = "audioCapture", strings = { Manifest.permission.RECORD_AUDIO }),
                @Permission(alias = "cameraCapture", strings = { Manifest.permission.CAMERA })
        }
)
public final class NativeStreamingPlugin extends Plugin implements ModeBStreamService.Listener {

    @Override
    public void load() {
        super.load();
        ModeBStreamService.setListener(this);
    }

    private File getOverlayAssetDirectory(String assetNamespace) {
        if (assetNamespace == null || assetNamespace.trim().isEmpty()) {
            return ModeBAssetNamespace.getRootDirectory(getContext());
        }
        return ModeBAssetNamespace.getNamespaceDirectory(getContext(), assetNamespace.trim());
    }

    private void deleteStagedNamespaceQuietly(String assetNamespace) {
        if (!ModeBAssetNamespace.isValid(assetNamespace)) return;
        try { ModeBAssetNamespace.deleteNamespace(getContext(), assetNamespace); }
        catch (RuntimeException ignored) { /* Best-effort cleanup for rejected, unattached staging data. */ }
    }

    private boolean deleteOverlayAssetDirectory() {
        return ModeBAssetNamespace.clearAll(getContext());
    }

    @PluginMethod
    public void clearOverlayAssets(PluginCall call) {
        try {
            if (!deleteOverlayAssetDirectory()) {
                call.reject("Cache aset overlay tidak dapat dibersihkan sepenuhnya.");
                return;
            }
            call.resolve(new JSObject().put("success", true));
        } catch (Exception exception) {
            call.reject("Gagal membersihkan cache media overlay: " + safeError(exception));
        }
    }

    @PluginMethod
    public void clearOverlayAssetNamespace(PluginCall call) {
        String assetNamespace = call.getString("assetNamespace", "");
        if (!ModeBAssetNamespace.isValid(assetNamespace)) {
            call.reject("Namespace aset scene tidak valid.");
            return;
        }
        try {
            boolean deleted = ModeBAssetNamespace.deleteNamespace(getContext(), assetNamespace);
            call.resolve(new JSObject().put("success", deleted));
        } catch (Exception exception) {
            call.reject("Gagal membersihkan namespace aset scene: " + safeError(exception));
        }
    }

    @PluginMethod
    public void uploadOverlayAsset(PluginCall call) {
        String id = call.getString("id", "");
        String assetType = call.getString("assetType", "image").toLowerCase(java.util.Locale.ROOT);
        String mimeType = call.getString("mimeType", "").toLowerCase(java.util.Locale.ROOT);
        String dataBase64 = call.getString("dataBase64", "");
        if (!ModeBStreamPolicy.isValidOverlayAssetId(id)) {
            call.reject("ID aset overlay tidak valid.");
            return;
        }
        boolean isVideo = "video".equals(assetType);
        if (!(isVideo || "image".equals(assetType))) {
            call.reject("Jenis aset overlay tidak dikenali.");
            return;
        }
        if (isVideo ? !ModeBStreamPolicy.isSupportedOverlayVideoMimeType(mimeType)
                : !ModeBStreamPolicy.isSupportedOverlayImageMimeType(mimeType)) {
            call.reject(isVideo ? "Format video overlay harus MP4." : "Format gambar overlay harus PNG, JPG, WebP, atau GIF.");
            return;
        }
        int maxBase64Length = isVideo ? 16_800_000 : 7_100_000;
        if (dataBase64 == null || dataBase64.isEmpty() || dataBase64.length() > maxBase64Length) {
            call.reject(isVideo ? "Data video overlay kosong atau terlalu besar." : "Data gambar overlay kosong atau terlalu besar.");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(dataBase64, Base64.DEFAULT);
        } catch (IllegalArgumentException exception) {
            call.reject("Data aset overlay tidak valid.");
            return;
        }
        boolean validSize = isVideo ? ModeBStreamPolicy.isValidOverlayVideoSize(bytes.length)
                : ModeBStreamPolicy.isValidOverlayImageSize(bytes.length);
        if (!validSize) {
            call.reject(isVideo ? "Ukuran video overlay melebihi batas 12 MB." : "Ukuran gambar overlay melebihi batas 5 MB.");
            return;
        }
        boolean validSignature = isVideo ? ModeBStreamPolicy.matchesMp4Signature(bytes)
                : ModeBStreamPolicy.matchesImageSignature(bytes, mimeType);
        if (!validSignature) {
            call.reject("Isi file tidak cocok dengan format aset yang dikirim.");
            return;
        }

        String assetNamespace = call.getString("assetNamespace", "");
        if (assetNamespace != null && !assetNamespace.trim().isEmpty()
                && !ModeBAssetNamespace.isValid(assetNamespace.trim())) {
            call.reject("Namespace aset scene tidak valid.");
            return;
        }
        File directory;
        try {
            directory = getOverlayAssetDirectory(assetNamespace);
        } catch (IllegalArgumentException exception) {
            call.reject("Namespace aset scene tidak valid.");
            return;
        }
        if (!directory.mkdirs() && !directory.isDirectory()) {
            call.reject("Cache aset overlay tidak dapat dibuat.");
            return;
        }
        String extension = isVideo ? ".mp4" : ".img";
        String expectedExtension = isVideo ? ".mp4" : ".img";
        File target = new File(directory, id + extension);
        File temporary = new File(directory, id + ".tmp");
        long totalBytes = bytes.length;
        int existingCount = 0;
        File[] existingAssets = directory.listFiles();
        if (existingAssets != null) {
            for (File existing : existingAssets) {
                if (!existing.isFile() || !existing.getName().endsWith(expectedExtension) || existing.equals(target)) continue;
                if (isVideo) {
                    existingCount++;
                    totalBytes += existing.length();
                } else {
                    totalBytes += existing.length();
                }
            }
        }
        if (isVideo && !ModeBStreamPolicy.canStoreOverlayVideoAsset(existingCount, target.isFile())) {
            call.reject("Maksimal dua klip MP4 lokal berbeda dapat dipakai dalam satu preset Mode B.");
            return;
        }
        if (isVideo ? !ModeBStreamPolicy.isValidOverlayVideoTotal(totalBytes)
                : !ModeBStreamPolicy.isValidOverlayImageTotal(totalBytes)) {
            call.reject(isVideo ? "Total gabungan dua video overlay melebihi batas 12 MB." : "Total gambar overlay melebihi batas 12 MB.");
            return;
        }
        try (FileOutputStream output = new FileOutputStream(temporary, false)) {
            output.write(bytes);
            output.flush();
            if (target.exists() && !target.delete()) {
                throw new IllegalStateException("File aset lama tidak dapat diganti.");
            }
            if (!temporary.renameTo(target)) {
                throw new IllegalStateException("File aset overlay tidak dapat disimpan.");
            }
            call.resolve(new JSObject().put("success", true).put("bytes", bytes.length));
        } catch (Exception exception) {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
            call.reject("Gagal menyimpan aset overlay: " + safeError(exception));
        }
    }

    @PluginMethod
    public void startStream(PluginCall call) {
        if (!ModeBStreamService.canStartNewSession()) {
            call.reject(ModeBStreamService.getNewSessionBlockMessage());
            return;
        }
        String audioSource = call.getString("audioSource", "mix");
        if (!ModeBStreamPolicy.isSupportedAudioSource(audioSource)) {
            call.reject("Sumber audio Mode B tidak dikenali.");
            return;
        }
        if ("internal".equals(audioSource) && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Audio internal memerlukan Android 10 atau lebih baru.");
            return;
        }
        // Android playback capture requires RECORD_AUDIO for the app-owned Internal source too.
        // This permission is required even when the selected route is Internal; it never changes
        // the route or silently switches the user to microphone audio.
        if (ModeBStreamPolicy.requiresRecordAudioPermission(audioSource)
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("audioCapture", call, "audioCapturePermissionResult");
            return;
        }
        requestCameraPermissionIfNeeded(call);
    }

    @PermissionCallback
    private void audioCapturePermissionResult(PluginCall call) {
        if (call == null) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Android memerlukan izin perekaman audio untuk menyiapkan sumber audio Mode B. " +
                    "Pilihan audio tetap mengikuti pengaturan; mode Internal tidak dialihkan ke mikrofon.");
            return;
        }
        requestCameraPermissionIfNeeded(call);
    }

    private void requestCameraPermissionIfNeeded(PluginCall call) {
        if (call == null) return;
        boolean cameraRequired = ModeBStreamPolicy.hasVisibleCameraOverlay(
                call.getData() == null ? null : call.getData().optJSONArray("overlayElements"));
        if (cameraRequired && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("cameraCapture", call, "cameraCapturePermissionResult");
            return;
        }
        launchScreenCapture(call);
    }

    @PermissionCallback
    private void cameraCapturePermissionResult(PluginCall call) {
        if (call == null) return;
        boolean cameraRequired = ModeBStreamPolicy.hasVisibleCameraOverlay(
                call.getData() == null ? null : call.getData().optJSONArray("overlayElements"));
        if (cameraRequired && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Preset Studio memakai elemen Kamera. Berikan izin Kamera Android atau hapus elemen kamera dari preset.");
            return;
        }
        launchScreenCapture(call);
    }

    private void launchScreenCapture(PluginCall call) {
        if (!ModeBStreamService.canStartNewSession()) {
            call.reject(ModeBStreamService.getNewSessionBlockMessage());
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            call.reject("Mode B memerlukan Android 5.0 atau lebih baru.");
            return;
        }
        MediaProjectionManager manager = (MediaProjectionManager)
                getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("Layanan berbagi layar Android tidak tersedia pada perangkat ini.");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "screenCapturePermissionResult");
    }

    @ActivityCallback
    private void screenCapturePermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Izin berbagi layar dibatalkan. Tidak ada siaran yang dimulai.");
            return;
        }

        JSObject options = call.getData();
        String rtmpUrl = options == null ? null : options.getString("rtmpUrl");
        if (rtmpUrl == null || !(rtmpUrl.startsWith("rtmp://") || rtmpUrl.startsWith("rtmps://"))) {
            call.reject("Alamat RTMP/RTMPS tidak valid.");
            return;
        }

        Intent serviceIntent = new Intent(getContext(), ModeBStreamService.class);
        serviceIntent.setAction(ModeBStreamService.ACTION_START);
        serviceIntent.putExtra(ModeBStreamService.EXTRA_RESULT_CODE, result.getResultCode());
        serviceIntent.putExtra(ModeBStreamService.EXTRA_RESULT_DATA, result.getData());
        serviceIntent.putExtra(ModeBStreamService.EXTRA_RTMP_URL, rtmpUrl);
        serviceIntent.putExtra(ModeBStreamService.EXTRA_WIDTH, call.getInt("width", 1280));
        serviceIntent.putExtra(ModeBStreamService.EXTRA_HEIGHT, call.getInt("height", 720));
        serviceIntent.putExtra(ModeBStreamService.EXTRA_BITRATE, call.getInt("videoBitrate", 4_000_000));
        serviceIntent.putExtra(ModeBStreamService.EXTRA_FPS, call.getInt("fps", 30));
        serviceIntent.putExtra(ModeBStreamService.EXTRA_AUDIO_BITRATE, call.getInt("audioBitrate", 128_000));
        serviceIntent.putExtra(ModeBStreamService.EXTRA_AUDIO_SOURCE, call.getString("audioSource", "mix"));
        JSONArray overlayElements = options == null ? null : options.optJSONArray("overlayElements");
        String overlayJson = overlayElements == null ? "[]" : overlayElements.toString();
        if (overlayJson.length() > 128_000) {
            call.reject("Preset Studio terlalu besar untuk dikirim ke encoder. Kurangi elemen atau properti media lalu coba lagi.");
            return;
        }
        serviceIntent.putExtra(ModeBStreamService.EXTRA_OVERLAY_ELEMENTS, overlayJson);
        JSONObject screenCaptureLayer = options == null ? null : options.optJSONObject("screenCaptureLayer");
        String screenCaptureLayerJson = screenCaptureLayer == null ? null : screenCaptureLayer.toString();
        if (screenCaptureLayerJson != null && screenCaptureLayerJson.length() > 4096) {
            call.reject("Konfigurasi layer Tangkapan Layar terlalu besar.");
            return;
        }
        serviceIntent.putExtra(ModeBStreamService.EXTRA_SCREEN_CAPTURE_LAYER, screenCaptureLayerJson);
        String backgroundAssetId = options == null ? null : options.optString("backgroundAssetId", null);
        if (backgroundAssetId != null && !backgroundAssetId.trim().isEmpty()
                && !ModeBStreamPolicy.isValidOverlayAssetId(backgroundAssetId)) {
            call.reject("ID background preset tidak valid.");
            return;
        }
        serviceIntent.putExtra(ModeBStreamService.EXTRA_BACKGROUND_ASSET_ID, backgroundAssetId);
        String sceneAssetNamespace = options == null ? "" : options.optString("sceneAssetNamespace", "");
        String backgroundAssetNamespace = options == null ? "" : options.optString("backgroundAssetNamespace", "");
        String screensaverAssetNamespace = options == null ? "" : options.optString("screensaverAssetNamespace", "");
        if (!ModeBAssetNamespace.isValid(sceneAssetNamespace)
                || (!backgroundAssetNamespace.isEmpty() && !ModeBAssetNamespace.isValid(backgroundAssetNamespace))
                || (!screensaverAssetNamespace.isEmpty() && !ModeBAssetNamespace.isValid(screensaverAssetNamespace))) {
            call.reject("Namespace aset scene/background tidak valid. Siapkan ulang media preset.");
            return;
        }
        serviceIntent.putExtra(ModeBStreamService.EXTRA_SCENE_ASSET_NAMESPACE, sceneAssetNamespace);
        serviceIntent.putExtra(ModeBStreamService.EXTRA_BACKGROUND_ASSET_NAMESPACE, backgroundAssetNamespace);
        serviceIntent.putExtra(ModeBStreamService.EXTRA_SCREENSAVER_ASSET_NAMESPACE, screensaverAssetNamespace);
        JSONObject screensaver = options == null ? null : options.optJSONObject("screensaver");
        String screensaverJson = screensaver == null ? null : screensaver.toString();
        try {
            ModeBScreensaverPolicy.fromJson(screensaverJson);
        } catch (RuntimeException invalidScreensaver) {
            call.reject(safeError(invalidScreensaver));
            return;
        }
        serviceIntent.putExtra(ModeBStreamService.EXTRA_SCREENSAVER, screensaverJson);

        if (!ModeBStreamService.canStartNewSession()) {
            call.reject(ModeBStreamService.getNewSessionBlockMessage());
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            JSObject response = new JSObject();
            response.put("success", true);
            response.put("status", "starting");
            response.put("message", "Izin capture diterima. Encoder sedang disiapkan.");
            call.resolve(response);
        } catch (Exception exception) {
            call.reject("Gagal memulai layanan encoder: " + safeError(exception));
        }
    }

    @PluginMethod
    public void stopStream(PluginCall call) {
        try {
            Intent stopIntent = new Intent(getContext(), ModeBStreamService.class);
            stopIntent.setAction(ModeBStreamService.ACTION_STOP);
            getContext().startService(stopIntent);
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("status", "stopping");
            result.put("canStartNewSession", ModeBStreamService.canStartNewSession());
            call.resolve(result);
        } catch (Exception exception) {
            boolean stopped = getContext().stopService(new Intent(getContext(), ModeBStreamService.class));
            JSObject result = new JSObject();
            result.put("success", stopped);
            result.put("status", stopped ? "stopped" : ModeBStreamService.getLastStatus());
            result.put("canStartNewSession", ModeBStreamService.canStartNewSession());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void requestScreenReshare(PluginCall call) {
        if (!ModeBStreamService.canRequestScreenReshare()) {
            call.reject("Mode B tidak sedang menunggu izin berbagi layar baru.");
            return;
        }
        MediaProjectionManager manager = (MediaProjectionManager)
                getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("Layanan berbagi layar Android tidak tersedia.");
            return;
        }
        // The floating reshare action must not be included in the fresh screen capture.
        ModeBStreamService.hideReshareFloatingControl();
        try {
            startActivityForResult(call, manager.createScreenCaptureIntent(), "screenResharePermissionResult");
        } catch (RuntimeException launchFailure) {
            ModeBStreamService.restoreReshareFloatingControl("Tidak dapat membuka izin layar. LIVE tetap berjalan; coba lagi dari tombol Bagikan Layar Lagi.");
            call.reject("Tidak dapat membuka izin berbagi layar Android: " + safeError(launchFailure));
        }
    }

    @ActivityCallback
    private void screenResharePermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            String message = "Izin berbagi layar belum diberikan. LIVE tetap berjalan; bagikan layar lagi untuk mencoba kembali.";
            ModeBStreamService.restoreReshareFloatingControl(message);
            JSObject cancelled = new JSObject();
            cancelled.put("success", false);
            cancelled.put("status", "reshare_waiting");
            cancelled.put("isStreaming", true);
            cancelled.put("message", message);
            call.resolve(cancelled);
            return;
        }
        Intent serviceIntent = new Intent(getContext(), ModeBStreamService.class);
        serviceIntent.setAction(ModeBStreamService.ACTION_RESHARE);
        serviceIntent.putExtra(ModeBStreamService.EXTRA_RESULT_CODE, result.getResultCode());
        serviceIntent.putExtra(ModeBStreamService.EXTRA_RESULT_DATA, result.getData());
        try {
            // The foreground service and the RTMP encoder already exist. Do not start a second
            // service or issue a second foreground-service type transition for reshare.
            getContext().startService(serviceIntent);
            JSObject response = new JSObject();
            response.put("success", true);
            response.put("status", "resharing");
            response.put("isStreaming", true);
            response.put("message", "Izin layar baru diterima. Menyambungkan layar ke sesi LIVE yang sama.");
            call.resolve(response);
        } catch (Exception exception) {
            ModeBStreamService.restoreReshareFloatingControl("Layar belum tersambung. LIVE tetap berjalan; coba Bagikan Layar Lagi.");
            call.reject("Gagal mengirim izin layar baru ke encoder yang sedang berjalan: " + safeError(exception));
        }
    }

    private int readPresetTransitionDuration(JSONObject data, String key) throws org.json.JSONException {
        Object raw = data.opt(key);
        if (raw == null || raw == JSONObject.NULL) return 0;
        String type;
        int durationMs = ModeBPresetTransitionPolicy.DEFAULT_DURATION_MS;
        if (raw instanceof String) {
            type = ((String) raw).trim();
        } else if (raw instanceof JSONObject) {
            JSONObject transition = (JSONObject) raw;
            if (!transition.optBoolean("enabled", true)) return 0;
            type = transition.optString("type", "");
            Object duration = transition.opt("durationMs");
            if (duration != null && duration != JSONObject.NULL) {
                if (!(duration instanceof Number)) throw new IllegalArgumentException("Durasi transisi harus berupa angka.");
                double numeric = ((Number) duration).doubleValue();
                if (Double.isNaN(numeric) || Double.isInfinite(numeric) || numeric != Math.rint(numeric)) {
                    throw new IllegalArgumentException("Durasi transisi harus berupa bilangan bulat.");
                }
                durationMs = (int) numeric;
            }
        } else {
            throw new IllegalArgumentException("Format metadata transisi tidak didukung.");
        }
        return ModeBPresetTransitionPolicy.resolveDuration(type, durationMs);
    }

    @PluginMethod
    public void setHostWait(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        if (!ModeBStreamService.setHostWait(enabled)) {
            call.reject("Layar tunggu tidak tersedia. Pastikan Mode B LIVE dan screensaver preset aktif.");
            return;
        }
        JSObject response = new JSObject();
        response.put("success", true);
        response.put("status", enabled ? "host_wait" : "live");
        response.put("isStreaming", true);
        response.put("message", enabled ? "Layar tunggu sedang ditampilkan." : "Tampilan LIVE sedang dilanjutkan.");
        call.resolve(response);
    }

    @PluginMethod
    public void replaceLiveScene(PluginCall call) {
        JSObject data = call.getData();
        if (data == null) {
            call.reject("Data scene baru tidak tersedia.");
            return;
        }
        String assetNamespace = data.optString("assetNamespace", "");
        String backgroundAssetNamespace = data.optString("backgroundAssetNamespace", "");
        String screensaverAssetNamespace = data.optString("screensaverAssetNamespace", "");
        if (!ModeBAssetNamespace.isValid(assetNamespace)) {
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("Namespace aset scene baru tidak valid.");
            return;
        }
        if (!backgroundAssetNamespace.isEmpty() && !ModeBAssetNamespace.isValid(backgroundAssetNamespace)) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("Namespace background scene baru tidak valid.");
            return;
        }
        if (!screensaverAssetNamespace.isEmpty() && !ModeBAssetNamespace.isValid(screensaverAssetNamespace)) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("Namespace media layar tunggu scene baru tidak valid.");
            return;
        }
        JSONArray overlayElements = data.optJSONArray("overlayElements");
        String overlayJson = overlayElements == null ? "[]" : overlayElements.toString();
        if (overlayJson.length() > 128_000) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("Snapshot overlay scene terlalu besar untuk diganti saat LIVE.");
            return;
        }
        JSONObject screenCaptureLayer = data.optJSONObject("screenCaptureLayer");
        String screenCaptureJson = screenCaptureLayer == null ? null : screenCaptureLayer.toString();
        if (screenCaptureJson != null && screenCaptureJson.length() > 4096) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("Konfigurasi screen capture scene baru terlalu besar.");
            return;
        }
        final int transitionOutMs;
        final int transitionInMs;
        final String screensaverJson;
        try {
            transitionOutMs = readPresetTransitionDuration(data, "transitionOut");
            transitionInMs = readPresetTransitionDuration(data, "transitionIn");
            JSONObject screensaver = data.optJSONObject("screensaver");
            screensaverJson = screensaver == null ? null : screensaver.toString();
            ModeBScreensaverPolicy.fromJson(screensaverJson);
        } catch (Exception transitionError) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject(safeError(transitionError));
            return;
        }
        String backgroundAssetId = data.optString("backgroundAssetId", "");
        if (backgroundAssetId != null && !backgroundAssetId.trim().isEmpty()
                && !ModeBStreamPolicy.isValidOverlayAssetId(backgroundAssetId)) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("ID background scene baru tidak valid.");
            return;
        }
        boolean queued = ModeBStreamService.requestLiveOverlaySceneReplacement(
                overlayJson, backgroundAssetId, backgroundAssetNamespace, screenCaptureJson, assetNamespace,
                screensaverAssetNamespace, screensaverJson, transitionOutMs, transitionInMs,
                (success, message) -> {
                    if (success) {
                        call.resolve(new JSObject().put("success", true).put("status", "live").put("message", message));
                    } else {
                        call.reject(message == null || message.isEmpty()
                                ? "Scene baru tidak dapat diterapkan ke output LIVE." : message);
                    }
                }
        );
        if (!queued) {
            deleteStagedNamespaceQuietly(assetNamespace);
            deleteStagedNamespaceQuietly(backgroundAssetNamespace);
            deleteStagedNamespaceQuietly(screensaverAssetNamespace);
            call.reject("Layanan Mode B aktif tidak ditemukan untuk mengganti scene LIVE.");
        }
    }

    @PluginMethod
    public void pushOverlayEvent(PluginCall call) {
        JSObject data = call.getData();
        if (data == null) {
            call.resolve(new JSObject().put("accepted", false));
            return;
        }
        String eventJson = data.toString();
        if (eventJson.length() > 4096) {
            call.reject("Data event terlalu besar untuk overlay siaran.");
            return;
        }
        boolean accepted = ModeBStreamService.pushOverlayEvent(eventJson);
        JSObject result = new JSObject();
        result.put("accepted", accepted);
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", ModeBStreamService.getLastStatus());
        result.put("message", ModeBStreamService.getLastMessage());
        result.put("isStreaming", ModeBStreamService.isLastStreaming());
        result.put("bitrateKbps", ModeBStreamService.getLastBitrateKbps());
        result.put("canStartNewSession", ModeBStreamService.canStartNewSession());
        call.resolve(result);
    }

    @Override
    public void onModeBStreamState(String status, String message, boolean streaming, long bitrateKbps) {
        JSObject event = new JSObject();
        event.put("status", status);
        event.put("message", message);
        event.put("isStreaming", streaming);
        event.put("bitrateKbps", bitrateKbps);
        event.put("canStartNewSession", ModeBStreamService.canStartNewSession());
        event.put("timestamp", System.currentTimeMillis());
        notifyListeners("streamState", event);
    }

    private String safeError(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().trim().isEmpty()) {
            return "kesalahan tidak diketahui";
        }
        return exception.getMessage();
    }
}
