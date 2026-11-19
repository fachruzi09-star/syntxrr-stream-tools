import type {
  AppSettings,
  CanvasOrientation,
  ModeASessionMode,
  ModeBAudioSource,
  ResolutionTarget,
  StudioElement,
  StudioPreset,
} from '../types';
import { isModeAOperatingMode, isModeBOperatingMode, normalizeOperatingMode } from '../types';
import {
  checkNotificationPermission,
  isNativeAndroid,
  requestNotificationPermission,
} from './nativeCompanionBridge';
import {
  createModeBOverlaySnapshot,
  createModeBScreenCaptureLayer,
  getModeBStreamStatus,
  isNativeStreamingAvailable,
  prepareModeBOverlayAssets,
  replaceModeBLiveOverlayScene,
  startModeBStream,
  stopModeBStream,
  type ModeBMediaAssetResolver,
  type ModeBStreamSnapshot,
  type ModeBStreamStatus,
} from './nativeStreamingBridge';
import { canChangeActivePresetForSnapshot } from './modeBPresetSwitchPolicy';
import { normalizeModeBPresetTransition } from './modeBPresetTransitionPolicy';
import { normalizeModeBScreensaver } from './modeBScreensaverPolicy';
import { getStudioMediaAssetIdFromUri, normalizeModeBAudioSource } from './storage';

export interface ModeBRtmpValidationResult {
  valid: boolean;
  server: string;
  hasStreamKey: boolean;
  rtmpUrl?: string;
  serverError?: string;
  streamKeyError?: string;
  summaryError?: string;
}

export function validateModeBRtmpConfig(
  rtmpServer: string | undefined | null,
  streamKey: string | undefined | null,
): ModeBRtmpValidationResult {
  const server = typeof rtmpServer === 'string' ? rtmpServer.trim().replace(/\/+$/, '') : '';
  const key = typeof streamKey === 'string' ? streamKey.trim() : '';

  const isServerValid = /^rtmps?:\/\/\S+$/i.test(server);
  const hasStreamKey = key.length > 0;

  let serverError: string | undefined;
  let streamKeyError: string | undefined;

  if (!isServerValid) {
    serverError = 'Masukkan URL server RTMP atau RTMPS yang valid (contoh: rtmp://... atau rtmps://...).';
  }
  if (!hasStreamKey) {
    streamKeyError = 'Stream Key wajib diisi di Pengaturan sebelum memulai siaran Mode B.';
  }

  const summaryError = serverError && streamKeyError
    ? 'URL server RTMP/RTMPS dan Stream Key belum lengkap. Lengkapi di Pengaturan terlebih dahulu.'
    : serverError || streamKeyError;

  return {
    valid: isServerValid && hasStreamKey,
    server,
    hasStreamKey,
    rtmpUrl: isServerValid && hasStreamKey ? `${server}/${key}` : undefined,
    serverError,
    streamKeyError,
    summaryError,
  };
}

export function resolveModeBVideoDimensions(
  targetResolution: ResolutionTarget | string | undefined,
  canvasOrientation: CanvasOrientation | string | undefined,
): { width: number; height: number } {
  const shortSide =
    targetResolution === '1440p' ? 1440 : targetResolution === '720p' ? 720 : 1080;
  const longSide =
    targetResolution === '1440p' ? 2560 : targetResolution === '720p' ? 1280 : 1920;

  if (canvasOrientation === '16:9') {
    return { width: longSide, height: shortSide };
  }
  if (canvasOrientation === '1:1') {
    return { width: shortSide, height: shortSide };
  }
  return { width: shortSide, height: longSide };
}

export function isModeBSessionActive(
  snapshot: Pick<ModeBStreamSnapshot, 'status' | 'isStreaming'> | null | undefined,
): boolean {
  if (!snapshot) return false;
  if (snapshot.isStreaming === true) return true;
  return (
    snapshot.status === 'starting' ||
    snapshot.status === 'connecting' ||
    snapshot.status === 'live' ||
    snapshot.status === 'host_wait' ||
    snapshot.status === 'stopping' ||
    snapshot.status === 'reshare_waiting' ||
    snapshot.status === 'resharing'
  );
}

export function isModeBStoppableStatus(status: ModeBStreamStatus): boolean {
  return (
    status === 'starting' ||
    status === 'connecting' ||
    status === 'live' ||
    status === 'host_wait' ||
    status === 'reshare_waiting' ||
    status === 'resharing' ||
    status === 'error'
  );
}

export function normalizeElementsForModeBSnapshot(elements: StudioElement[]): StudioElement[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((elem) => {
    const props = elem.properties ? { ...elem.properties } : {};
    if ((elem.type === 'image' || elem.type === 'sticker') && !props.imageAssetId) {
      const parsedId = getStudioMediaAssetIdFromUri(props.imageUrl);
      if (parsedId) props.imageAssetId = parsedId;
    } else if (elem.type === 'video' && !props.videoAssetId) {
      const parsedId = getStudioMediaAssetIdFromUri(props.videoUrl);
      if (parsedId) props.videoAssetId = parsedId;
    }
    return { ...elem, properties: props };
  });
}

export interface ModeBNotificationCheckResult {
  state: 'granted' | 'denied' | 'web';
  requested: boolean;
  warningMessage?: string;
}

export interface NotificationPermissionAdapter {
  isNativeAndroid: () => boolean;
  checkNotificationPermission: () => Promise<{ granted: boolean }>;
  requestNotificationPermission: () => Promise<{ granted: boolean }>;
}

const defaultNotificationAdapter: NotificationPermissionAdapter = {
  isNativeAndroid,
  checkNotificationPermission,
  requestNotificationPermission,
};

export async function ensureModeBNotificationPermission(
  adapter: NotificationPermissionAdapter = defaultNotificationAdapter,
): Promise<ModeBNotificationCheckResult> {
  if (!adapter.isNativeAndroid()) {
    return { state: 'web', requested: false };
  }

  try {
    const current = await adapter.checkNotificationPermission();
    if (current?.granted) {
      return { state: 'granted', requested: false };
    }
  } catch {
    return {
      state: 'denied',
      requested: false,
      warningMessage:
        'Status izin notifikasi Android tidak dapat diverifikasi. Aktifkan izin notifikasi aplikasi agar status foreground service Mode B terlihat oleh sistem.',
    };
  }

  try {
    const requested = await adapter.requestNotificationPermission();
    if (requested?.granted) {
      return { state: 'granted', requested: true };
    }
    return {
      state: 'denied',
      requested: true,
      warningMessage:
        'Izin notifikasi Android belum diberikan. Pada Android 13+, notifikasi foreground service Mode B mungkin tidak muncul di status bar sampai izin diberikan di Pengaturan sistem.',
    };
  } catch {
    return {
      state: 'denied',
      requested: true,
      warningMessage:
        'Permintaan izin notifikasi Android gagal diproses. Buka Pengaturan sistem aplikasi untuk mengaktifkan Notifikasi.',
    };
  }
}

export interface PrepareAndStartModeBParams {
  settings: AppSettings;
  elements: StudioElement[];
  activePreset: StudioPreset | null;
  resolveAssets?: ModeBMediaAssetResolver;
  notificationAdapter?: NotificationPermissionAdapter;
  isNativeStreamingFn?: () => boolean;
  startStreamFn?: typeof startModeBStream;
}

export interface PrepareAndStartModeBOutcome {
  snapshot: ModeBStreamSnapshot;
  notification: ModeBNotificationCheckResult;
}

export async function prepareAndStartModeBStream(
  params: PrepareAndStartModeBParams,
): Promise<PrepareAndStartModeBOutcome> {
  const {
    settings,
    elements,
    activePreset,
    resolveAssets,
    notificationAdapter = defaultNotificationAdapter,
    isNativeStreamingFn = isNativeStreamingAvailable,
    startStreamFn = startModeBStream,
  } = params;

  const rtmpCheck = validateModeBRtmpConfig(settings.rtmpServer, settings.streamKey);
  if (!rtmpCheck.valid || !rtmpCheck.rtmpUrl) {
    return {
      notification: notificationAdapter.isNativeAndroid()
        ? { state: 'denied', requested: false }
        : { state: 'web', requested: false },
      snapshot: {
        status: 'error',
        message: rtmpCheck.summaryError || 'Konfigurasi RTMP Mode B belum lengkap.',
        isStreaming: false,
        bitrateKbps: 0,
      },
    };
  }

  const notification = await ensureModeBNotificationPermission(notificationAdapter);

  if (!isNativeStreamingFn()) {
    return {
      notification,
      snapshot: {
        status: 'error',
        message: 'Encoder RTMP native hanya tersedia pada APK Android. Konfigurasi RTMP valid dan siap dipakai di Android.',
        isStreaming: false,
        bitrateKbps: 0,
      },
    };
  }

  try {
    const normalizedElements = normalizeElementsForModeBSnapshot(elements);
    const screenCaptureLayer = createModeBScreenCaptureLayer(normalizedElements, false);
    const overlayElements = createModeBOverlaySnapshot(normalizedElements);

    const backgroundAssetId = activePreset?.backgroundUri
      ? getStudioMediaAssetIdFromUri(activePreset.backgroundUri)
      : undefined;
    if (activePreset?.backgroundUri && !backgroundAssetId) {
      throw new Error(
        'Background preset Mode B harus berupa gambar lokal dari Pustaka Media Studio.',
      );
    }

    const screensaver = normalizeModeBScreensaver(activePreset?.screensaver);
    const screensaverAssetId = screensaver.on
      ? getStudioMediaAssetIdFromUri(screensaver.media)
      : undefined;
    if (screensaver.on && screensaver.media && !screensaverAssetId) {
      throw new Error(
        'Media Layar Tunggu Mode B harus dipilih dari Pustaka Media lokal.',
      );
    }

    const preparedAssets = await prepareModeBOverlayAssets(
      overlayElements,
      backgroundAssetId,
      {
        screensaverAssetId,
        screensaverAssetType: screensaver.mediaType,
        resolveAssets,
      },
    );

    const { width, height } = resolveModeBVideoDimensions(
      settings.targetResolution,
      settings.canvasOrientation,
    );
    const audioSource: ModeBAudioSource = normalizeModeBAudioSource(
      settings.modeBAudioSource,
      'mix',
    );

    const result = await startStreamFn({
      rtmpUrl: rtmpCheck.rtmpUrl,
      width,
      height,
      videoBitrate: Math.max(500, settings.videoBitrateKbps || 4000) * 1000,
      audioBitrate: Math.max(64, settings.audioBitrateKbps || 128) * 1000,
      fps: settings.frameRate || 30,
      audioSource,
      overlayElements,
      screenCaptureLayer,
      backgroundAssetId,
      screensaver,
      ...preparedAssets,
    });

    return { notification, snapshot: result };
  } catch (error) {
    return {
      notification,
      snapshot: {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Gagal menyiapkan aset dan konfigurasi siaran Mode B.',
        isStreaming: false,
        bitrateKbps: 0,
      },
    };
  }
}

export interface ApplyLiveSceneParams {
  elements: StudioElement[];
  targetPreset: StudioPreset | null;
  activePreset: StudioPreset | null;
  modeBStatus?: ModeBStreamSnapshot;
  resolveAssets?: ModeBMediaAssetResolver;
  getStatusFn?: typeof getModeBStreamStatus;
  replaceSceneFn?: typeof replaceModeBLiveOverlayScene;
}

export async function applyLiveSceneChangeToModeB(
  params: ApplyLiveSceneParams,
): Promise<{ allowed: boolean; applied: boolean; message?: string }> {
  const {
    elements,
    targetPreset,
    activePreset,
    resolveAssets,
    getStatusFn = getModeBStreamStatus,
    replaceSceneFn = replaceModeBLiveOverlayScene,
  } = params;

  const snapshot = params.modeBStatus ?? (await getStatusFn());
  if (canChangeActivePresetForSnapshot(snapshot)) {
    return { allowed: true, applied: false };
  }

  if (snapshot.status !== 'live' || snapshot.isStreaming !== true) {
    return {
      allowed: false,
      applied: false,
      message:
        'Mode B sedang memproses transisi atau statusnya belum stabil. Tunggu hingga LIVE aktif atau berhenti sebelum mengubah preset.',
    };
  }

  if (
    activePreset &&
    targetPreset &&
    targetPreset.canvasOrientation !== activePreset.canvasOrientation
  ) {
    return {
      allowed: false,
      applied: false,
      message:
        'Pergantian preset saat LIVE harus mempertahankan orientasi kanvas yang sedang berjalan. Hentikan LIVE untuk mengganti orientasi.',
    };
  }

  try {
    const normalizedElements = normalizeElementsForModeBSnapshot(elements);
    const screenCaptureLayer = createModeBScreenCaptureLayer(normalizedElements, false);
    const overlayElements = createModeBOverlaySnapshot(normalizedElements);

    const activeBackgroundAssetId =
      getStudioMediaAssetIdFromUri(activePreset?.backgroundUri) ?? '';
    const nextBackgroundAssetId =
      getStudioMediaAssetIdFromUri(targetPreset?.backgroundUri) ?? '';
    if (targetPreset?.backgroundUri && !nextBackgroundAssetId) {
      throw new Error(
        'Background preset baru harus berasal dari Pustaka Media lokal.',
      );
    }

    const transitionOutResult = normalizeModeBPresetTransition(
      activePreset?.transitionOut,
      'Transisi keluar',
    );
    if (!transitionOutResult.ok) throw new Error(transitionOutResult.message);

    const transitionInResult = normalizeModeBPresetTransition(
      targetPreset?.transitionIn,
      'Transisi masuk',
    );
    if (!transitionInResult.ok) throw new Error(transitionInResult.message);

    const hasTransition = Boolean(transitionOutResult.value || transitionInResult.value);
    const sceneHasCamera = [...(activePreset?.elements ?? []), ...normalizedElements].some(
      (element) =>
        element.type === 'camera' &&
        element.visible !== false &&
        element.opacity > 0 &&
        element.width > 0 &&
        element.height > 0,
    );
    if (hasTransition && sceneHasCamera) {
      throw new Error(
        'Transisi fade LIVE belum tersedia untuk scene yang memakai kamera. Lepas transisi atau hentikan LIVE.',
      );
    }

    const screensaver = normalizeModeBScreensaver(targetPreset?.screensaver);
    const screensaverAssetId = screensaver.on
      ? getStudioMediaAssetIdFromUri(screensaver.media)
      : undefined;
    if (screensaver.on && screensaver.media && !screensaverAssetId) {
      throw new Error('Media Layar Tunggu harus berasal dari Pustaka Media lokal.');
    }

    const replacement = await replaceSceneFn({
      overlayElements,
      screenCaptureLayer,
      activeBackgroundAssetId,
      backgroundAssetId: nextBackgroundAssetId,
      transitionOut: transitionOutResult.value,
      transitionIn: transitionInResult.value,
      screensaver,
      screensaverAssetId,
      screensaverAssetType: screensaver.mediaType,
      resolveAssets,
    });

    if (!replacement.success) {
      return { allowed: false, applied: false, message: replacement.message };
    }
    return { allowed: true, applied: true, message: replacement.message };
  } catch (error) {
    return {
      allowed: false,
      applied: false,
      message:
        error instanceof Error
          ? error.message
          : 'Scene baru tidak dapat diterapkan ke output LIVE Mode B.',
    };
  }
}

export interface SwitchOperatingModeContext {
  currentMode: AppSettings['operatingMode'];
  targetMode: AppSettings['operatingMode'];
  companionRunning: boolean;
  modeASessionMode: ModeASessionMode;
  isTikTokActive: boolean;
  modeBStatus: ModeBStreamSnapshot;
  stopModeASession: () => Promise<void>;
  hideHudIfNeeded: () => Promise<void>;
  stopModeBSession: () => Promise<ModeBStreamSnapshot>;
}

export async function executeOperatingModeSwitch(
  ctx: SwitchOperatingModeContext,
): Promise<{
  nextMode: 'MODE_A_TIKTOK_COMPANION' | 'MODE_B_STREAMING_ENCODER';
  stoppedModeA: boolean;
  stoppedModeB: boolean;
}> {
  const nextMode = normalizeOperatingMode(ctx.targetMode);
  const currentIsModeA = isModeAOperatingMode(ctx.currentMode);
  const currentIsModeB = isModeBOperatingMode(ctx.currentMode);
  const targetIsModeB = nextMode === 'MODE_B_STREAMING_ENCODER';
  const targetIsModeA = nextMode === 'MODE_A_TIKTOK_COMPANION';

  let stoppedModeA = false;
  let stoppedModeB = false;

  if (currentIsModeA && targetIsModeB) {
    if (ctx.companionRunning || ctx.modeASessionMode !== 'inactive' || ctx.isTikTokActive) {
      await ctx.stopModeASession();
      stoppedModeA = true;
    } else {
      await ctx.hideHudIfNeeded();
    }
  } else if (currentIsModeB && targetIsModeA) {
    if (isModeBSessionActive(ctx.modeBStatus)) {
      await ctx.stopModeBSession();
      stoppedModeB = true;
    }
  } else if (targetIsModeB) {
    await ctx.hideHudIfNeeded();
  }

  return { nextMode, stoppedModeA, stoppedModeB };
}

export async function stopModeBSessionSafely(
  stopFn: typeof stopModeBStream = stopModeBStream,
): Promise<ModeBStreamSnapshot> {
  return stopFn();
}
