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
import { applyPresetGroupStateToElements } from './presetModel';
import { getStudioMediaAssetIdFromUri, normalizeModeBAudioSource } from './storage';
import {
  normalizeCameraProperties,
  normalizeStudioElementProperties,
} from './studioElementCatalog';

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
    if (elem.type === 'screen_capture') {
      return normalizeStudioElementProperties(elem);
    }
    const props = elem.properties ? { ...elem.properties } : {};
    if ((elem.type === 'image' || elem.type === 'sticker') && !props.imageAssetId) {
      const parsedId = getStudioMediaAssetIdFromUri(props.imageUrl);
      if (parsedId) props.imageAssetId = parsedId;
    } else if (elem.type === 'video' && !props.videoAssetId) {
      const parsedId = getStudioMediaAssetIdFromUri(props.videoUrl);
      if (parsedId) props.videoAssetId = parsedId;
    } else if (elem.type === 'camera') {
      return { ...elem, properties: normalizeCameraProperties(props) };
    }
    return { ...elem, properties: props };
  });
}

function resolveModeBGroupedScene(
  elements: StudioElement[],
  preset: StudioPreset | null | undefined,
): {
  effectiveElements: StudioElement[];
  screenCaptureGrouped: boolean;
} {
  const effectiveElements = preset
    ? applyPresetGroupStateToElements({
        elements,
        groups: preset.groups,
        superGroups: preset.superGroups,
      })
    : elements;

  const screenCaptureIds = new Set(
    effectiveElements
      .filter((element) => element.type === 'screen_capture')
      .map((element) => element.id),
  );
  const screenCaptureGrouped = (preset?.groups ?? []).some((group) =>
    group.elementIds.some((elementId) => screenCaptureIds.has(elementId)),
  );

  return {
    effectiveElements,
    screenCaptureGrouped,
  };
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

const DEFAULT_READINESS_POLL_INTERVAL_MS = 250;
const DEFAULT_READINESS_MAX_ATTEMPTS = 24;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

export function hasConfirmedModeBReadiness(
  snapshot: Pick<ModeBStreamSnapshot, 'canStartNewSession'> | null | undefined,
): boolean {
  return Boolean(snapshot && snapshot.canStartNewSession === true);
}

export interface WaitForModeBReadinessOptions {
  getStatusFn?: () => Promise<ModeBStreamSnapshot>;
  sleepFn?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxAttempts?: number;
  onSnapshot?: (snapshot: ModeBStreamSnapshot) => void;
}

export interface ModeBReadinessWaitResult {
  ready: boolean;
  attempts: number;
  snapshot: ModeBStreamSnapshot;
  reason: 'ready' | 'not_ready_timeout' | 'status_error' | 'invalid_readiness';
  message: string;
}

export async function waitForModeBSessionReadiness(
  options: WaitForModeBReadinessOptions = {},
): Promise<ModeBReadinessWaitResult> {
  const {
    getStatusFn = getModeBStreamStatus,
    sleepFn = defaultSleep,
    intervalMs = DEFAULT_READINESS_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_READINESS_MAX_ATTEMPTS,
    onSnapshot,
  } = options;

  const totalAttempts = Math.max(1, Math.floor(maxAttempts));
  let lastSnapshot: ModeBStreamSnapshot = {
    status: 'error',
    message: 'Status kesiapan encoder Mode B belum terbaca.',
    isStreaming: false,
    bitrateKbps: 0,
    canStartNewSession: false,
  };

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const snapshot = await getStatusFn();
      lastSnapshot = snapshot;
      onSnapshot?.(snapshot);

      if (hasConfirmedModeBReadiness(snapshot)) {
        return {
          ready: true,
          attempts: attempt,
          snapshot,
          reason: 'ready',
          message: snapshot.message || 'Encoder Mode B siap untuk sesi baru.',
        };
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Gagal membaca status pembersihan encoder Mode B.';
      const errorSnapshot: ModeBStreamSnapshot = {
        status: 'error',
        message,
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      };
      onSnapshot?.(errorSnapshot);
      return {
        ready: false,
        attempts: attempt,
        snapshot: errorSnapshot,
        reason: 'status_error',
        message,
      };
    }

    if (attempt < totalAttempts) {
      await sleepFn(intervalMs);
    }
  }

  const missingField = typeof lastSnapshot.canStartNewSession !== 'boolean';
  const failMessage = missingField
    ? 'Status kesiapan native Mode B (canStartNewSession) tidak tersedia; operasi ditahan demi keamanan.'
    : lastSnapshot.message && lastSnapshot.status === 'error'
    ? lastSnapshot.message
    : 'Pembersihan encoder/GL dan cache aset Mode B sebelumnya belum selesai. Coba lagi sesaat lagi.';

  return {
    ready: false,
    attempts: totalAttempts,
    snapshot: { ...lastSnapshot, canStartNewSession: false },
    reason: missingField ? 'invalid_readiness' : 'not_ready_timeout',
    message: failMessage,
  };
}

export interface StopModeBAndWaitOptions extends WaitForModeBReadinessOptions {
  stopFn?: () => Promise<ModeBStreamSnapshot>;
  onStopSnapshot?: (snapshot: ModeBStreamSnapshot) => void;
}

export async function stopModeBStreamAndWaitForCleanup(
  options: StopModeBAndWaitOptions = {},
): Promise<ModeBReadinessWaitResult & { stopSnapshot: ModeBStreamSnapshot }> {
  const {
    stopFn = stopModeBStream,
    onStopSnapshot,
    ...waitOptions
  } = options;

  let stopSnapshot: ModeBStreamSnapshot;
  try {
    stopSnapshot = await stopFn();
    onStopSnapshot?.(stopSnapshot);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Gagal mengirim perintah berhenti ke encoder Mode B.';
    const errorSnapshot: ModeBStreamSnapshot = {
      status: 'error',
      message,
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
    return {
      ready: false,
      attempts: 0,
      snapshot: errorSnapshot,
      stopSnapshot: errorSnapshot,
      reason: 'status_error',
      message,
    };
  }

  const waitResult = await waitForModeBSessionReadiness(waitOptions);
  return {
    ...waitResult,
    stopSnapshot,
  };
}

export interface ModeBLifecycleCoordinator {
  getSnapshot: () => ModeBStreamSnapshot;
  getRevision: () => number;
  isActionPending: () => boolean;
  commitNativeEvent: (snapshot: ModeBStreamSnapshot) => ModeBStreamSnapshot;
  commitPromiseSnapshotIfUnchanged: (
    capturedRevision: number,
    snapshot: ModeBStreamSnapshot,
  ) => { applied: boolean; snapshot: ModeBStreamSnapshot };
  runExclusiveAction: <T>(
    actionLabel: string,
    fn: () => Promise<T>,
  ) => Promise<{ acquired: true; value: T } | { acquired: false; reason: string }>;
}

export function createModeBLifecycleCoordinator(
  initialSnapshot: ModeBStreamSnapshot,
  hooks?: {
    onSnapshotChange?: (snapshot: ModeBStreamSnapshot) => void;
    onPendingChange?: (pending: boolean) => void;
  },
): ModeBLifecycleCoordinator {
  let currentSnapshot = initialSnapshot;
  let revision = 0;
  let pending = false;

  const setSnapshot = (next: ModeBStreamSnapshot) => {
    currentSnapshot = next;
    hooks?.onSnapshotChange?.(next);
  };

  const setPending = (nextPending: boolean) => {
    pending = nextPending;
    hooks?.onPendingChange?.(nextPending);
  };

  return {
    getSnapshot: () => currentSnapshot,
    getRevision: () => revision,
    isActionPending: () => pending,
    commitNativeEvent: (snapshot: ModeBStreamSnapshot) => {
      revision += 1;
      setSnapshot(snapshot);
      return currentSnapshot;
    },
    commitPromiseSnapshotIfUnchanged: (capturedRevision: number, snapshot: ModeBStreamSnapshot) => {
      if (capturedRevision !== revision) {
        return { applied: false, snapshot: currentSnapshot };
      }
      setSnapshot(snapshot);
      return { applied: true, snapshot: currentSnapshot };
    },
    runExclusiveAction: async <T,>(actionLabel: string, fn: () => Promise<T>) => {
      if (pending) {
        return {
          acquired: false as const,
          reason: `Operasi Mode B lain sedang berjalan. Tunggu hingga selesai sebelum menjalankan ${actionLabel}.`,
        };
      }
      setPending(true);
      try {
        const value = await fn();
        return { acquired: true as const, value };
      } finally {
        setPending(false);
      }
    },
  };
}

export interface PrepareAndStartModeBParams {
  settings: AppSettings;
  elements: StudioElement[];
  activePreset: StudioPreset | null;
  resolveAssets?: ModeBMediaAssetResolver;
  notificationAdapter?: NotificationPermissionAdapter;
  isNativeStreamingFn?: () => boolean;
  getStatusFn?: typeof getModeBStreamStatus;
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
    getStatusFn = getModeBStreamStatus,
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
        canStartNewSession: false,
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
        canStartNewSession: false,
      },
    };
  }

  let preflightStatus: ModeBStreamSnapshot;
  try {
    preflightStatus = await getStatusFn();
  } catch (error) {
    return {
      notification,
      snapshot: {
        status: 'error',
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Status kesiapan encoder Mode B tidak dapat diverifikasi. Coba hentikan sesi sebelumnya lalu ulangi.',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      },
    };
  }

  if (!hasConfirmedModeBReadiness(preflightStatus) || isModeBSessionActive(preflightStatus)) {
    return {
      notification,
      snapshot: {
        status: 'error',
        message:
          preflightStatus.message && preflightStatus.status === 'error'
            ? preflightStatus.message
            : 'Sesi siaran Mode B sebelumnya masih aktif atau pembersihan encoder/aset belum selesai. Tunggu sebentar lalu coba Go Live lagi.',
        isStreaming: preflightStatus.isStreaming === true,
        bitrateKbps: preflightStatus.bitrateKbps || 0,
        canStartNewSession: false,
      },
    };
  }

  try {
    const { effectiveElements, screenCaptureGrouped } = resolveModeBGroupedScene(
      elements,
      activePreset,
    );
    const normalizedElements = normalizeElementsForModeBSnapshot(effectiveElements);
    const screenCaptureLayer = createModeBScreenCaptureLayer(
      normalizedElements,
      screenCaptureGrouped,
    );
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
    const { effectiveElements, screenCaptureGrouped } = resolveModeBGroupedScene(
      elements,
      targetPreset,
    );
    const normalizedElements = normalizeElementsForModeBSnapshot(effectiveElements);
    const screenCaptureLayer = createModeBScreenCaptureLayer(
      normalizedElements,
      screenCaptureGrouped,
    );
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
    const effectiveActiveElements = activePreset
      ? applyPresetGroupStateToElements(activePreset)
      : [];
    const sceneHasCamera = [...effectiveActiveElements, ...normalizedElements].some(
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
  isNativeStreaming?: boolean;
  stopModeASession: () => Promise<boolean | void>;
  verifyModeAStopped?: () => Promise<boolean>;
  hideHudIfNeeded: () => Promise<void>;
  stopModeBSession: () => Promise<ModeBStreamSnapshot>;
  getModeBStatus?: () => Promise<ModeBStreamSnapshot>;
  waitForModeBReadiness?: (
    options?: WaitForModeBReadinessOptions,
  ) => Promise<ModeBReadinessWaitResult>;
}

export interface ExecuteOperatingModeSwitchResult {
  switched: boolean;
  nextMode: 'MODE_A_TIKTOK_COMPANION' | 'MODE_B_STREAMING_ENCODER';
  stoppedModeA: boolean;
  stoppedModeB: boolean;
  modeBSnapshot?: ModeBStreamSnapshot;
  errorMessage?: string;
}

export async function executeOperatingModeSwitch(
  ctx: SwitchOperatingModeContext,
): Promise<ExecuteOperatingModeSwitchResult> {
  const previousMode = normalizeOperatingMode(ctx.currentMode);
  const nextMode = normalizeOperatingMode(ctx.targetMode);
  const currentIsModeA = isModeAOperatingMode(previousMode);
  const currentIsModeB = isModeBOperatingMode(previousMode);
  const targetIsModeB = nextMode === 'MODE_B_STREAMING_ENCODER';
  const targetIsModeA = nextMode === 'MODE_A_TIKTOK_COMPANION';
  const nativeStreamingActive = ctx.isNativeStreaming ?? isNativeStreamingAvailable();
  const waitReadinessFn = ctx.waitForModeBReadiness ?? waitForModeBSessionReadiness;
  const getStatusFn = ctx.getModeBStatus ?? getModeBStreamStatus;

  let stoppedModeA = false;
  let stoppedModeB = false;
  let latestModeBSnapshot: ModeBStreamSnapshot | undefined = ctx.modeBStatus;

  if (currentIsModeA && targetIsModeB) {
    if (ctx.companionRunning || ctx.modeASessionMode !== 'inactive' || ctx.isTikTokActive) {
      try {
        const stopAResult = await ctx.stopModeASession();
        if (stopAResult === false) {
          return {
            switched: false,
            nextMode: previousMode,
            stoppedModeA: false,
            stoppedModeB: false,
            modeBSnapshot: latestModeBSnapshot,
            errorMessage:
              'Sesi Companion / TikTok Mode A gagal dihentikan. Perpindahan ke Mode B dibatalkan.',
          };
        }
        if (ctx.verifyModeAStopped) {
          const stoppedVerified = await ctx.verifyModeAStopped();
          if (!stoppedVerified) {
            return {
              switched: false,
              nextMode: previousMode,
              stoppedModeA: false,
              stoppedModeB: false,
              modeBSnapshot: latestModeBSnapshot,
              errorMessage:
                'Companion Service atau konektor TikTok Mode A masih aktif. Perpindahan ke Mode B dibatalkan.',
            };
          }
        }
        stoppedModeA = true;
      } catch (error) {
        return {
          switched: false,
          nextMode: previousMode,
          stoppedModeA: false,
          stoppedModeB: false,
          modeBSnapshot: latestModeBSnapshot,
          errorMessage:
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Gagal menghentikan sesi Mode A sebelum pindah ke Mode B.',
        };
      }
    } else {
      await ctx.hideHudIfNeeded();
    }

    if (nativeStreamingActive || ctx.waitForModeBReadiness || ctx.getModeBStatus) {
      const readinessResult = await waitReadinessFn({ getStatusFn });
      latestModeBSnapshot = readinessResult.snapshot;
      if (!readinessResult.ready) {
        return {
          switched: false,
          nextMode: previousMode,
          stoppedModeA,
          stoppedModeB: false,
          modeBSnapshot: latestModeBSnapshot,
          errorMessage:
            readinessResult.message ||
            'Mode B masih membersihkan sesi sebelumnya. Tunggu sebentar sebelum pindah ke Mode B.',
        };
      }
    }
  } else if (currentIsModeB && targetIsModeA) {
    if (isModeBSessionActive(ctx.modeBStatus)) {
      try {
        latestModeBSnapshot = await ctx.stopModeBSession();
        stoppedModeB = true;
      } catch (error) {
        return {
          switched: false,
          nextMode: previousMode,
          stoppedModeA: false,
          stoppedModeB: false,
          modeBSnapshot: latestModeBSnapshot,
          errorMessage:
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Gagal menghentikan siaran Mode B. Mode tetap dipertahankan di Mode B.',
        };
      }
    }

    if (
      stoppedModeB ||
      ((nativeStreamingActive || ctx.waitForModeBReadiness || ctx.getModeBStatus) &&
        !hasConfirmedModeBReadiness(latestModeBSnapshot))
    ) {
      if (nativeStreamingActive || ctx.waitForModeBReadiness || ctx.getModeBStatus) {
        const readinessResult = await waitReadinessFn({ getStatusFn });
        latestModeBSnapshot = readinessResult.snapshot;
        if (!readinessResult.ready) {
          return {
            switched: false,
            nextMode: previousMode,
            stoppedModeA: false,
            stoppedModeB,
            modeBSnapshot: latestModeBSnapshot,
            errorMessage:
              readinessResult.message ||
              'Pembersihan encoder/GL Mode B belum selesai. Perpindahan ke Mode A dibatalkan.',
          };
        }
      }
    }
  } else if (targetIsModeB) {
    await ctx.hideHudIfNeeded();
  }

  return {
    switched: true,
    nextMode,
    stoppedModeA,
    stoppedModeB,
    modeBSnapshot: latestModeBSnapshot,
  };
}

export async function stopModeBSessionSafely(
  stopFn: typeof stopModeBStream = stopModeBStream,
): Promise<ModeBStreamSnapshot> {
  return stopFn();
}
