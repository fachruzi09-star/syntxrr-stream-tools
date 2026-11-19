import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { StreamEvent, StudioScreensaverSettings } from '../types';
import { StorageService } from './storage';
import type { NativeModeBOverlayElement, NativeModeBScreenCaptureLayer } from './modeBComposition';
import { canChangeActivePresetForSnapshot } from './modeBPresetSwitchPolicy';
import { isLiveOverlaySceneReplaceable } from './modeBLiveScenePolicy';
import { normalizeModeBPresetTransition, type ModeBPresetTransitionSpec } from './modeBPresetTransitionPolicy';
import { shouldLockModeBSceneMutations } from './modeBSceneMutationPolicy';
import { isSupportedScreensaverAssetSelection, normalizeModeBScreensaver } from './modeBScreensaverPolicy';

export { createModeBOverlaySnapshot, createModeBScreenCaptureLayer } from './modeBComposition';
export type {
  ModeBOverlaySourceElement,
  NativeModeBOverlayElement,
  NativeModeBScreenCaptureLayer,
} from './modeBComposition';

export type ModeBAudioSource = 'mix' | 'internal' | 'microphone';
export type ModeBStreamStatus =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'live'
  | 'host_wait'
  | 'stopping'
  | 'stopped'
  | 'disconnected'
  | 'capture_lost'
  | 'reshare_waiting'
  | 'resharing'
  | 'error';

export interface StartModeBStreamOptions {
  rtmpUrl: string;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  fps: number;
  audioSource?: ModeBAudioSource;
  overlayElements?: NativeModeBOverlayElement[];
  screenCaptureLayer?: NativeModeBScreenCaptureLayer;
  backgroundAssetId?: string;
  sceneAssetNamespace: string;
  backgroundAssetNamespace?: string;
  screensaverAssetNamespace?: string;
  screensaver?: StudioScreensaverSettings | Record<string, unknown> | null;
}

export interface PreparedModeBOverlayAssets {
  sceneAssetNamespace: string;
  backgroundAssetNamespace: string;
  screensaverAssetNamespace: string;
}

export interface ModeBStreamSnapshot {
  status: ModeBStreamStatus;
  message: string;
  isStreaming: boolean;
  bitrateKbps: number;
  canStartNewSession?: boolean;
  timestamp?: number;
}

export interface NativeModeBLiveEvent {
  id: string;
  type: string;
  username: string;
  detail: string;
  amount?: number;
  viewerCount?: number;
  totalLikeCount?: number;
  repeatCount?: number;
  timestamp: number;
}

export interface ModeBLocalMediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  mimeType: string;
  sizeBytes?: number;
  blob: Blob;
}

export type ModeBMediaAssetResolver = (ids: string[]) => Promise<ModeBLocalMediaAsset[]>;

export interface UploadModeBOverlayAssetOptions {
  id: string;
  mimeType: string;
  dataBase64: string;
  assetType?: 'image' | 'video';
  assetNamespace?: string;
}

export interface ReplaceModeBLiveSceneOptions {
  overlayElements: NativeModeBOverlayElement[];
  screenCaptureLayer?: NativeModeBScreenCaptureLayer;
  /** Current background identity from the active preset; used to stage only an actual change. */
  activeBackgroundAssetId?: string;
  backgroundAssetId?: string;
  transitionOut?: ModeBPresetTransitionSpec | null;
  transitionIn?: ModeBPresetTransitionSpec | null;
  screensaver?: StudioScreensaverSettings | Record<string, unknown> | null;
  screensaverAssetId?: string;
  screensaverAssetType?: 'image' | 'video';
  resolveAssets?: ModeBMediaAssetResolver;
}

export interface NativeStreamingPluginInterface {
  clearOverlayAssets(): Promise<{ success: boolean }>;
  clearOverlayAssetNamespace(options: { assetNamespace: string }): Promise<{ success: boolean }>;
  uploadOverlayAsset(options: UploadModeBOverlayAssetOptions): Promise<{ success: boolean; bytes: number }>;
  startStream(options: StartModeBStreamOptions): Promise<{
    success: boolean;
    status: ModeBStreamStatus;
    message?: string;
  }>;
  stopStream(): Promise<{
    success: boolean;
    status: ModeBStreamStatus;
    canStartNewSession?: boolean;
  }>;
  requestScreenReshare(): Promise<{
    success: boolean;
    status: ModeBStreamStatus;
    isStreaming: boolean;
    message?: string;
  }>;
  setHostWait(options: { enabled: boolean }): Promise<{
    success: boolean;
    status: ModeBStreamStatus;
    isStreaming?: boolean;
    message?: string;
  }>;
  replaceLiveScene(options: {
    overlayElements: NativeModeBOverlayElement[];
    screenCaptureLayer?: NativeModeBScreenCaptureLayer;
    backgroundAssetId?: string;
    backgroundAssetNamespace?: string;
    screensaverAssetNamespace?: string;
    transitionOut?: ModeBPresetTransitionSpec | null;
    transitionIn?: ModeBPresetTransitionSpec | null;
    assetNamespace: string;
    screensaver?: StudioScreensaverSettings | Record<string, unknown> | null;
  }): Promise<{ success: boolean; status: ModeBStreamStatus; message?: string }>;
  pushOverlayEvent(event: NativeModeBLiveEvent): Promise<{ accepted: boolean }>;
  getStatus(): Promise<ModeBStreamSnapshot>;
  addListener(
    eventName: 'streamState',
    listenerFunc: (snapshot: ModeBStreamSnapshot) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeStreamingPlugin = registerPlugin<NativeStreamingPluginInterface>('NativeStreaming');

interface NativeStreamingTestAdapter {
  plugin?: NativeStreamingPluginInterface;
  isNativeAvailable?: boolean;
}

let testAdapter: NativeStreamingTestAdapter | null = null;

function getNativeStreamingPlugin(): NativeStreamingPluginInterface {
  return testAdapter?.plugin ?? NativeStreamingPlugin;
}

const VALID_ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const VALID_ASSET_NAMESPACE_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const VALID_AUDIO_SOURCES = new Set<ModeBAudioSource>(['mix', 'internal', 'microphone']);
const ACTIVE_FORWARDING_STATUSES = new Set<ModeBStreamStatus>([
  'starting',
  'connecting',
  'live',
  'host_wait',
  'reshare_waiting',
  'resharing',
]);

const MAX_MODE_B_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MODE_B_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_MODE_B_IMAGE_ASSETS = 10; // up to 8 overlay images, 1 background, and 1 screensaver image/GIF
const MAX_MODE_B_OVERLAY_IMAGE_ASSETS = 8;
const MAX_MODE_B_VIDEO_ASSETS = 2;
const MAX_MODE_B_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_MODE_B_IMAGE_BASE64_LENGTH = 7_100_000;
const MAX_MODE_B_VIDEO_BASE64_LENGTH = 16_800_000;
const MAX_MODE_B_OVERLAY_JSON_LENGTH = 128_000;
const MAX_MODE_B_SCREEN_CAPTURE_JSON_LENGTH = 4096;
const MAX_MODE_B_EVENT_JSON_LENGTH = 4096;

const MODE_B_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MODE_B_VIDEO_MIME_TYPES = new Set(['video/mp4']);

let modeBOverlayForwardingActive = false;
let modeBSceneMutationLocked = true; // Fail closed on Android until native status is read once.

// Singleton native listener registry to prevent duplicate subscriptions or listener leaks.
const streamStateSubscribers = new Set<(snapshot: ModeBStreamSnapshot) => void>();
let activeNativeStreamHandle: PluginListenerHandle | null = null;
let pendingNativeStreamSubscription: Promise<PluginListenerHandle | null> | null = null;
let streamSubscriptionGeneration = 0;

function updateModeBSceneMutationLock(
  snapshot: Pick<ModeBStreamSnapshot, 'status' | 'isStreaming'> | null | undefined,
): void {
  modeBSceneMutationLocked = shouldLockModeBSceneMutations(snapshot);
}

function syncModeBRuntimeState(snapshot: ModeBStreamSnapshot): void {
  modeBOverlayForwardingActive =
    snapshot.isStreaming === true || ACTIVE_FORWARDING_STATUSES.has(snapshot.status);
  updateModeBSceneMutationLock(snapshot);
}

function isValidPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidAssetId(value: unknown): value is string {
  return typeof value === 'string' && VALID_ASSET_ID_PATTERN.test(value);
}

export function isValidModeBAssetNamespace(value: unknown): value is string {
  return typeof value === 'string' && VALID_ASSET_NAMESPACE_PATTERN.test(value);
}

function createModeBAssetNamespace(prefix: 'scene' | 'background' | 'screensaver'): string {
  const randomPart = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca aset media Studio.'));
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Format aset media tidak dapat dibaca.'));
          return;
        }
        const separator = reader.result.indexOf(',');
        if (separator < 0) {
          reject(new Error('Data media Studio tidak valid.'));
          return;
        }
        resolve(reader.result.slice(separator + 1));
      };
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function getDefaultAssetResolver(): ModeBMediaAssetResolver | null {
  const storageRecord = StorageService as unknown as Partial<{
    getStudioMediaAssetsByIds: ModeBMediaAssetResolver;
  }>;
  return typeof storageRecord.getStudioMediaAssetsByIds === 'function'
    ? (ids) => storageRecord.getStudioMediaAssetsByIds!(ids)
    : null;
}

async function clearNativeOverlayAssetCacheQuietly(): Promise<void> {
  if (!isNativeStreamingAvailable()) return;
  try {
    await getNativeStreamingPlugin().clearOverlayAssets();
  } catch {
    /* Cleanup must never mask the primary start/validation outcome. */
  }
}

async function clearNativeOverlayAssetNamespaceQuietly(assetNamespace: string): Promise<void> {
  if (!isNativeStreamingAvailable() || !isValidModeBAssetNamespace(assetNamespace)) return;
  try {
    await getNativeStreamingPlugin().clearOverlayAssetNamespace({ assetNamespace });
  } catch {
    /* Cleanup must never mask the primary failure reason. */
  }
}

/**
 * True only when executing inside the Capacitor Android runtime and the NativeStreaming plugin
 * is registered. Always returns false in browsers, desktop, and iOS.
 */
export function isNativeStreamingAvailable(): boolean {
  if (testAdapter && typeof testAdapter.isNativeAvailable === 'boolean') {
    return testAdapter.isNativeAvailable;
  }
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }
    if (typeof Capacitor.isPluginAvailable === 'function') {
      return Capacitor.isPluginAvailable('NativeStreaming');
    }
    return true;
  } catch {
    return false;
  }
}

/** Synchronous fail-closed guard for high-frequency Studio edit callbacks. */
export function isModeBSceneMutationLocked(): boolean {
  return isNativeStreamingAvailable() && modeBSceneMutationLocked;
}

export async function clearModeBOverlayAssets(): Promise<{ success: boolean; message?: string }> {
  if (!isNativeStreamingAvailable()) {
    return { success: false, message: 'Cache aset overlay native hanya tersedia pada APK Android.' };
  }
  try {
    const result = await getNativeStreamingPlugin().clearOverlayAssets();
    return {
      success: result?.success === true,
      message: result?.success ? 'Cache aset overlay dibersihkan.' : 'Cache aset overlay gagal dibersihkan.',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Gagal membersihkan cache media overlay.',
    };
  }
}

export async function clearModeBOverlayAssetNamespace(
  assetNamespace: string,
): Promise<{ success: boolean; message?: string }> {
  const normalizedNamespace = typeof assetNamespace === 'string' ? assetNamespace.trim() : '';
  if (!isValidModeBAssetNamespace(normalizedNamespace)) {
    return { success: false, message: 'Namespace aset scene tidak valid.' };
  }
  if (!isNativeStreamingAvailable()) {
    return { success: false, message: 'Cache namespace overlay native hanya tersedia pada APK Android.' };
  }
  try {
    const result = await getNativeStreamingPlugin().clearOverlayAssetNamespace({
      assetNamespace: normalizedNamespace,
    });
    return { success: result?.success === true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Gagal membersihkan namespace aset scene.',
    };
  }
}

export async function uploadModeBOverlayAsset(
  options: UploadModeBOverlayAssetOptions,
): Promise<{ success: boolean; bytes: number; message?: string }> {
  if (!isNativeStreamingAvailable()) {
    return {
      success: false,
      bytes: 0,
      message: 'Unggah aset overlay native hanya tersedia pada APK Android.',
    };
  }
  if (!options || !isValidAssetId(options.id)) {
    return { success: false, bytes: 0, message: 'ID aset overlay tidak valid.' };
  }

  const assetType = (options.assetType ?? 'image').toLowerCase();
  const isVideo = assetType === 'video';
  if (!isVideo && assetType !== 'image') {
    return { success: false, bytes: 0, message: 'Jenis aset overlay tidak dikenali.' };
  }

  const mimeType = typeof options.mimeType === 'string' ? options.mimeType.trim().toLowerCase() : '';
  if (isVideo ? !MODE_B_VIDEO_MIME_TYPES.has(mimeType) : !MODE_B_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      success: false,
      bytes: 0,
      message: isVideo
        ? 'Format video overlay harus MP4.'
        : 'Format gambar overlay harus PNG, JPG, WebP, atau GIF.',
    };
  }

  const maxBase64Length = isVideo ? MAX_MODE_B_VIDEO_BASE64_LENGTH : MAX_MODE_B_IMAGE_BASE64_LENGTH;
  if (
    typeof options.dataBase64 !== 'string' ||
    options.dataBase64.length === 0 ||
    options.dataBase64.length > maxBase64Length
  ) {
    return {
      success: false,
      bytes: 0,
      message: isVideo
        ? 'Data video overlay kosong atau terlalu besar.'
        : 'Data gambar overlay kosong atau terlalu besar.',
    };
  }

  const trimmedNamespace =
    typeof options.assetNamespace === 'string' ? options.assetNamespace.trim() : '';
  if (trimmedNamespace.length > 0 && !isValidModeBAssetNamespace(trimmedNamespace)) {
    return { success: false, bytes: 0, message: 'Namespace aset scene tidak valid.' };
  }

  try {
    const result = await getNativeStreamingPlugin().uploadOverlayAsset({
      id: options.id,
      assetType: isVideo ? 'video' : 'image',
      mimeType,
      dataBase64: options.dataBase64,
      ...(trimmedNamespace ? { assetNamespace: trimmedNamespace } : {}),
    });
    return {
      success: result?.success === true,
      bytes: typeof result?.bytes === 'number' && Number.isFinite(result.bytes) ? result.bytes : 0,
    };
  } catch (error) {
    return {
      success: false,
      bytes: 0,
      message: error instanceof Error ? error.message : 'Gagal mengunggah aset overlay native.',
    };
  }
}

/**
 * Stages an immutable scene media set into its own native namespace directory.
 * Preset backgrounds and screensaver media receive isolated namespaces so live scene swaps
 * never delete assets still read by active decoders.
 */
export async function prepareModeBOverlayAssets(
  elements: NativeModeBOverlayElement[] | undefined | null,
  backgroundAssetId?: string,
  options: {
    preserveExistingCache?: boolean;
    screensaverAssetId?: string;
    screensaverAssetType?: 'image' | 'video';
    resolveAssets?: ModeBMediaAssetResolver;
  } = {},
): Promise<PreparedModeBOverlayAssets> {
  const sceneAssetNamespace = createModeBAssetNamespace('scene');
  const normalizedBackgroundId =
    typeof backgroundAssetId === 'string' ? backgroundAssetId.trim() : '';
  const backgroundAssetNamespace = normalizedBackgroundId
    ? createModeBAssetNamespace('background')
    : '';
  const screensaverAssetId =
    typeof options.screensaverAssetId === 'string' ? options.screensaverAssetId.trim() : '';
  const screensaverAssetType = options.screensaverAssetType === 'video' ? 'video' : 'image';
  const screensaverAssetNamespace = screensaverAssetId
    ? createModeBAssetNamespace('screensaver')
    : '';

  if (!isNativeStreamingAvailable()) {
    return { sceneAssetNamespace, backgroundAssetNamespace, screensaverAssetNamespace };
  }

  const visualElements = (Array.isArray(elements) ? elements : []).filter(
    (element) =>
      element &&
      element.visible !== false &&
      (element.type === 'image' || element.type === 'sticker' || element.type === 'video'),
  );
  const videoElements = visualElements.filter((element) => element.type === 'video');
  const imageIdsRaw = visualElements
    .filter((element) => element.type === 'image' || element.type === 'sticker')
    .map((element) => element.properties?.imageAssetId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());
  const videoIdsRaw = videoElements
    .map((element) => element.properties?.videoAssetId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());

  if (videoIdsRaw.length !== videoElements.length) {
    throw new Error(
      'Mode B hanya dapat merender video MP4 lokal dari Pustaka Media. URL video remote belum didukung.',
    );
  }

  const allIds = [
    ...imageIdsRaw,
    ...videoIdsRaw,
    ...(normalizedBackgroundId ? [normalizedBackgroundId] : []),
    ...(screensaverAssetId ? [screensaverAssetId] : []),
  ];
  if (allIds.some((id) => !isValidAssetId(id))) {
    throw new Error('Identitas aset media Studio tidak valid. Hapus lalu impor ulang media tersebut.');
  }

  const imageIds = Array.from(new Set(imageIdsRaw));
  const videoIds = Array.from(new Set(videoIdsRaw));
  const allUniqueImageIds = Array.from(
    new Set([
      ...imageIds,
      ...(normalizedBackgroundId ? [normalizedBackgroundId] : []),
      ...(screensaverAssetId && screensaverAssetType === 'image' ? [screensaverAssetId] : []),
    ]),
  );

  if (imageIds.length > MAX_MODE_B_OVERLAY_IMAGE_ASSETS) {
    throw new Error(
      `Preset memiliki lebih dari ${MAX_MODE_B_OVERLAY_IMAGE_ASSETS} gambar/sticker overlay lokal. Kurangi aset agar compositor tetap ringan.`,
    );
  }
  if (allUniqueImageIds.length > MAX_MODE_B_IMAGE_ASSETS) {
    throw new Error(
      'Preset memiliki terlalu banyak gambar untuk overlay, background, dan screensaver. Kurangi aset agar compositor tetap ringan.',
    );
  }
  if (videoIds.length > MAX_MODE_B_VIDEO_ASSETS) {
    throw new Error(
      `Preset memiliki lebih dari ${MAX_MODE_B_VIDEO_ASSETS} video MP4 lokal berbeda. Kurangi jumlah klip pada kanvas.`,
    );
  }

  const plugin = getNativeStreamingPlugin();
  try {
    if (!options.preserveExistingCache) {
      const cleared = await plugin.clearOverlayAssets();
      if (!cleared?.success) {
        throw new Error('Cache media native tidak dapat disiapkan.');
      }
    }
    await plugin.clearOverlayAssetNamespace({ assetNamespace: sceneAssetNamespace });
    if (backgroundAssetNamespace) {
      await plugin.clearOverlayAssetNamespace({ assetNamespace: backgroundAssetNamespace });
    }
    if (screensaverAssetNamespace) {
      await plugin.clearOverlayAssetNamespace({ assetNamespace: screensaverAssetNamespace });
    }

    const requestedIds = Array.from(
      new Set([
        ...allUniqueImageIds,
        ...videoIds,
        ...(screensaverAssetId ? [screensaverAssetId] : []),
      ]),
    );
    if (requestedIds.length === 0) {
      return { sceneAssetNamespace, backgroundAssetNamespace, screensaverAssetNamespace };
    }

    const resolver = options.resolveAssets ?? getDefaultAssetResolver();
    if (!resolver) {
      throw new Error(
        'Resolver aset media lokal (StorageService.getStudioMediaAssetsByIds) belum terhubung pada storage.ts.',
      );
    }

    const assets = await resolver(requestedIds);
    const byId = new Map<string, ModeBLocalMediaAsset>();
    for (const asset of assets) {
      if (asset && typeof asset.id === 'string') {
        byId.set(asset.id, asset);
      }
    }

    let totalImageBytes = 0;
    let totalVideoBytes = 0;

    const uploadAsset = async (
      id: string,
      expectedType: 'image' | 'video',
      assetNamespace: string,
    ) => {
      const asset = byId.get(id);
      if (!asset || asset.type !== expectedType) {
        throw new Error(
          `Aset ${expectedType === 'video' ? 'video' : 'gambar'} Studio ${id} tidak ditemukan di penyimpanan lokal. Buka Studio dan impor ulang aset tersebut.`,
        );
      }
      const mimeType = (asset.mimeType || asset.blob?.type || '').trim().toLowerCase();
      const sizeBytes = asset.blob?.size > 0 ? asset.blob.size : asset.sizeBytes || 0;
      if (expectedType === 'image') {
        if (!MODE_B_IMAGE_MIME_TYPES.has(mimeType)) {
          throw new Error(
            `Format gambar ${asset.name} belum didukung. Gunakan PNG, JPG, WebP, atau GIF.`,
          );
        }
        if (sizeBytes <= 0 || sizeBytes > MAX_MODE_B_IMAGE_BYTES) {
          throw new Error(
            `Gambar ${asset.name} kosong atau terlalu besar. Batas per gambar adalah 5 MB.`,
          );
        }
        totalImageBytes += sizeBytes;
        if (totalImageBytes > MAX_MODE_B_TOTAL_IMAGE_BYTES) {
          throw new Error(
            'Total gambar/sticker/background preset melebihi 12 MB. Kurangi jumlah atau ukuran aset.',
          );
        }
      } else {
        if (!MODE_B_VIDEO_MIME_TYPES.has(mimeType)) {
          throw new Error(
            `Video ${asset.name} belum didukung untuk siaran native. Gunakan file MP4.`,
          );
        }
        if (sizeBytes <= 0 || sizeBytes > MAX_MODE_B_VIDEO_BYTES) {
          throw new Error(
            `Video ${asset.name} kosong atau terlalu besar. Batas setiap klip MP4 lokal adalah 12 MB, dengan total gabungan maksimal 12 MB.`,
          );
        }
        totalVideoBytes += sizeBytes;
        if (totalVideoBytes > MAX_MODE_B_VIDEO_BYTES) {
          throw new Error('Total video preset melebihi 12 MB.');
        }
      }

      const result = await plugin.uploadOverlayAsset({
        id,
        mimeType,
        assetType: expectedType,
        assetNamespace,
        dataBase64: await blobToBase64(asset.blob),
      });
      if (!result?.success) {
        throw new Error(`Aset ${asset.name} gagal disiapkan untuk encoder.`);
      }
    };

    for (const id of imageIds) await uploadAsset(id, 'image', sceneAssetNamespace);
    for (const id of videoIds) await uploadAsset(id, 'video', sceneAssetNamespace);
    if (screensaverAssetId && screensaverAssetNamespace) {
      const screensaverAsset = byId.get(screensaverAssetId);
      if (!screensaverAsset) {
        throw new Error(
          'Media Screensaver tidak ditemukan di Pustaka Media. Impor ulang file tersebut.',
        );
      }
      const screensaverMime = (
        screensaverAsset.mimeType ||
        screensaverAsset.blob?.type ||
        ''
      )
        .trim()
        .toLowerCase();
      if (
        !isSupportedScreensaverAssetSelection(
          screensaverAssetType,
          screensaverAsset.type,
          screensaverMime,
        )
      ) {
        throw new Error(
          screensaverAssetType === 'video'
            ? 'Screensaver video hanya menerima MP4 lokal. Pilih ulang file MP4.'
            : 'Screensaver hanya menerima PNG, JPG, atau GIF lokal. Pilih ulang media yang sesuai.',
        );
      }
      await uploadAsset(screensaverAssetId, screensaverAssetType, screensaverAssetNamespace);
    }
    if (normalizedBackgroundId && backgroundAssetNamespace) {
      await uploadAsset(normalizedBackgroundId, 'image', backgroundAssetNamespace);
    }

    return { sceneAssetNamespace, backgroundAssetNamespace, screensaverAssetNamespace };
  } catch (error) {
    await clearNativeOverlayAssetNamespaceQuietly(sceneAssetNamespace);
    if (backgroundAssetNamespace) {
      await clearNativeOverlayAssetNamespaceQuietly(backgroundAssetNamespace);
    }
    if (screensaverAssetNamespace) {
      await clearNativeOverlayAssetNamespaceQuietly(screensaverAssetNamespace);
    }
    throw error;
  }
}

function buildNativeLiveEventPayload(event: StreamEvent): NativeModeBLiveEvent | null {
  if (!event || event.isSimulation) return null;
  const payload: NativeModeBLiveEvent = {
    id: String(event.id || '').slice(0, 120),
    type: String(event.type || 'custom').slice(0, 40),
    username: String(event.username || '').slice(0, 80),
    detail: String(event.detail || '').slice(0, 500),
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : Date.now(),
  };
  const eventAmount =
    typeof event.amount === 'number'
      ? event.amount
      : typeof event.diamondCount === 'number'
        ? event.diamondCount
        : typeof event.likeCount === 'number'
          ? event.likeCount
          : undefined;
  if (typeof eventAmount === 'number' && Number.isFinite(eventAmount)) {
    payload.amount = Math.max(0, Math.min(1_000_000, eventAmount));
  }
  if (typeof event.viewerCount === 'number' && Number.isFinite(event.viewerCount)) {
    payload.viewerCount = Math.max(0, Math.min(10_000_000, event.viewerCount));
  }
  if (typeof event.totalLikeCount === 'number' && Number.isFinite(event.totalLikeCount)) {
    payload.totalLikeCount = Math.max(0, Math.min(2_000_000_000, event.totalLikeCount));
  }
  if (typeof event.repeatCount === 'number' && Number.isFinite(event.repeatCount)) {
    payload.repeatCount = Math.max(0, Math.min(1_000_000, event.repeatCount));
  }
  if (JSON.stringify(payload).length > MAX_MODE_B_EVENT_JSON_LENGTH) {
    payload.detail = payload.detail.slice(0, 200);
    if (JSON.stringify(payload).length > MAX_MODE_B_EVENT_JSON_LENGTH) {
      return null;
    }
  }
  return payload;
}

/** Explicit wrapper for `NativeStreaming.pushOverlayEvent` with payload size enforcement. */
export async function pushModeBOverlayEvent(
  payload: NativeModeBLiveEvent,
): Promise<{ accepted: boolean; message?: string }> {
  if (!isNativeStreamingAvailable()) {
    return { accepted: false, message: 'Overlay event Mode B hanya tersedia pada APK Android.' };
  }
  if (!payload || typeof payload !== 'object') {
    return { accepted: false, message: 'Data event overlay tidak valid.' };
  }
  if (JSON.stringify(payload).length > MAX_MODE_B_EVENT_JSON_LENGTH) {
    return { accepted: false, message: 'Data event terlalu besar untuk overlay siaran.' };
  }
  try {
    const result = await getNativeStreamingPlugin().pushOverlayEvent(payload);
    return { accepted: result?.accepted === true };
  } catch (error) {
    return {
      accepted: false,
      message: error instanceof Error ? error.message : 'Gagal mengirim event ke overlay siaran.',
    };
  }
}

/** Forwards real (non-simulated) StreamEvent data to the active native Mode B overlay compositor. */
export function forwardModeBOverlayEvent(event: StreamEvent): void {
  if (!event || event.isSimulation || !modeBOverlayForwardingActive || !isNativeStreamingAvailable()) {
    return;
  }
  const payload = buildNativeLiveEventPayload(event);
  if (!payload) return;
  void getNativeStreamingPlugin()
    .pushOverlayEvent(payload)
    .catch(() => undefined);
}

/**
 * Replaces the native aggregate overlay in the current RTMP session.
 * Scene images, stickers, and MP4 files are uploaded to a fresh immutable namespace;
 * the native service retains namespace cleanup ownership after receiving the request.
 */
export async function replaceModeBLiveOverlayScene(
  options: ReplaceModeBLiveSceneOptions,
): Promise<{ success: boolean; message: string }> {
  if (!isNativeStreamingAvailable()) {
    return {
      success: false,
      message: 'Pergantian scene LIVE native hanya tersedia pada APK Android.',
    };
  }
  if (!options || !isLiveOverlaySceneReplaceable(options.overlayElements)) {
    return {
      success: false,
      message:
        'Pergantian LIVE mendukung teks, widget, gambar, stiker, MP4 lokal, dan kamera dengan pemilik lensa yang sama. Penambahan kamera atau perubahan lensa memerlukan LIVE dihentikan lalu dimulai ulang.',
    };
  }

  const transitionOutCheck = normalizeModeBPresetTransition(options.transitionOut, 'Transisi keluar');
  if (!transitionOutCheck.ok) {
    return { success: false, message: transitionOutCheck.message };
  }
  const transitionInCheck = normalizeModeBPresetTransition(options.transitionIn, 'Transisi masuk');
  if (!transitionInCheck.ok) {
    return { success: false, message: transitionInCheck.message };
  }

  if (options.screensaver !== undefined && options.screensaver !== null) {
    try {
      normalizeModeBScreensaver(options.screensaver);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Konfigurasi layar tunggu tidak valid.',
      };
    }
  }

  const overlayJson = JSON.stringify(options.overlayElements ?? []);
  if (overlayJson.length > MAX_MODE_B_OVERLAY_JSON_LENGTH) {
    return {
      success: false,
      message: 'Snapshot overlay scene terlalu besar untuk diganti saat LIVE.',
    };
  }
  if (options.screenCaptureLayer) {
    const captureJson = JSON.stringify(options.screenCaptureLayer);
    if (captureJson.length > MAX_MODE_B_SCREEN_CAPTURE_JSON_LENGTH) {
      return {
        success: false,
        message: 'Konfigurasi screen capture scene baru terlalu besar.',
      };
    }
  }

  const activeBackgroundId =
    typeof options.activeBackgroundAssetId === 'string' ? options.activeBackgroundAssetId.trim() : '';
  const nextBackgroundId =
    typeof options.backgroundAssetId === 'string' ? options.backgroundAssetId.trim() : '';
  if (nextBackgroundId && !isValidAssetId(nextBackgroundId)) {
    return { success: false, message: 'ID background scene baru tidak valid.' };
  }
  const backgroundChanged = activeBackgroundId !== nextBackgroundId;

  let stagedAssets: PreparedModeBOverlayAssets | null = null;
  try {
    stagedAssets = await prepareModeBOverlayAssets(
      options.overlayElements,
      backgroundChanged && nextBackgroundId ? nextBackgroundId : undefined,
      {
        preserveExistingCache: true,
        screensaverAssetId: options.screensaverAssetId,
        screensaverAssetType: options.screensaverAssetType,
        resolveAssets: options.resolveAssets,
      },
    );

    const result = await getNativeStreamingPlugin().replaceLiveScene({
      overlayElements: options.overlayElements,
      screenCaptureLayer: options.screenCaptureLayer,
      backgroundAssetId: nextBackgroundId,
      backgroundAssetNamespace: backgroundChanged ? stagedAssets.backgroundAssetNamespace : '',
      screensaverAssetNamespace: stagedAssets.screensaverAssetNamespace,
      transitionOut: transitionOutCheck.value,
      transitionIn: transitionInCheck.value,
      screensaver: options.screensaver ?? null,
      assetNamespace: stagedAssets.sceneAssetNamespace,
    });

    // Native service owns cleanup once the request reaches it so active decoders never race file deletion.
    return {
      success: result?.success === true,
      message:
        result?.message ||
        (result?.success
          ? 'Scene overlay diperbarui pada output LIVE.'
          : 'Scene overlay tidak dapat diperbarui.'),
    };
  } catch (error) {
    // Preserve uploaded staging namespaces on uncertain failure; native session cleanup retires orphans safely.
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Gagal mengganti scene overlay pada output LIVE.',
    };
  }
}

export async function canChangeActivePresetDuringModeB(): Promise<boolean> {
  if (!isNativeStreamingAvailable()) return true;
  try {
    const snapshot = await getNativeStreamingPlugin().getStatus();
    return canChangeActivePresetForSnapshot(snapshot);
  } catch {
    return false;
  }
}

/** Shows or hides the Mode B host-wait screen while preserving the current RTMP session. */
export async function setModeBHostWait(enabled: boolean): Promise<ModeBStreamSnapshot> {
  if (!isNativeStreamingAvailable()) {
    return {
      status: 'error',
      message: 'Layar tunggu LIVE hanya tersedia pada APK Android.',
      isStreaming: false,
      bitrateKbps: 0,
    };
  }
  if (typeof enabled !== 'boolean') {
    return {
      status: 'error',
      message: 'Parameter layar tunggu harus berupa boolean.',
      isStreaming: false,
      bitrateKbps: 0,
    };
  }

  const plugin = getNativeStreamingPlugin();
  try {
    const result = await plugin.setHostWait({ enabled });
    const snapshot = await plugin.getStatus();
    syncModeBRuntimeState(snapshot);
    return {
      status: snapshot.status || result.status || (enabled ? 'host_wait' : 'live'),
      message:
        snapshot.message ||
        result.message ||
        (enabled ? 'Layar tunggu ditampilkan.' : 'Tampilan LIVE dilanjutkan.'),
      isStreaming: snapshot.isStreaming === true,
      bitrateKbps: typeof snapshot.bitrateKbps === 'number' ? snapshot.bitrateKbps : 0,
      ...(typeof snapshot.canStartNewSession === 'boolean'
        ? { canStartNewSession: snapshot.canStartNewSession }
        : {}),
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Layar tunggu tidak dapat diubah.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  }
}

function validateStartModeBStreamOptions(options: StartModeBStreamOptions): string | null {
  if (!options || typeof options !== 'object') {
    return 'Konfigurasi Mode B tidak valid.';
  }
  const endpoint = typeof options.rtmpUrl === 'string' ? options.rtmpUrl.trim() : '';
  if (!/^rtmps?:\/\/\S+$/i.test(endpoint)) {
    return 'Gunakan alamat server RTMP atau RTMPS yang valid.';
  }
  if (!isValidPositiveInteger(options.width) || !isValidPositiveInteger(options.height)) {
    return 'Resolusi video Mode B harus berupa bilangan bulat positif.';
  }
  if (!isValidPositiveInteger(options.videoBitrate) || !isValidPositiveInteger(options.audioBitrate)) {
    return 'Bitrate video dan audio Mode B harus berupa bilangan bulat positif.';
  }
  if (!isValidPositiveInteger(options.fps)) {
    return 'FPS Mode B harus berupa bilangan bulat positif.';
  }
  if (options.audioSource !== undefined && !VALID_AUDIO_SOURCES.has(options.audioSource)) {
    return 'Sumber audio Mode B tidak dikenali.';
  }
  if (!isValidModeBAssetNamespace(options.sceneAssetNamespace)) {
    return 'Namespace aset scene tidak valid. Siapkan ulang media preset.';
  }
  if (
    options.backgroundAssetNamespace &&
    !isValidModeBAssetNamespace(options.backgroundAssetNamespace)
  ) {
    return 'Namespace aset background tidak valid. Siapkan ulang media preset.';
  }
  if (
    options.screensaverAssetNamespace &&
    !isValidModeBAssetNamespace(options.screensaverAssetNamespace)
  ) {
    return 'Namespace aset layar tunggu tidak valid. Siapkan ulang media preset.';
  }
  if (options.backgroundAssetId && !isValidAssetId(options.backgroundAssetId.trim())) {
    return 'ID background preset tidak valid.';
  }
  if (options.overlayElements !== undefined) {
    if (!Array.isArray(options.overlayElements)) {
      return 'Snapshot elemen overlay Mode B harus berupa array.';
    }
    if (JSON.stringify(options.overlayElements).length > MAX_MODE_B_OVERLAY_JSON_LENGTH) {
      return 'Preset Studio terlalu besar untuk dikirim ke encoder. Kurangi elemen atau properti media lalu coba lagi.';
    }
  }
  if (options.screenCaptureLayer !== undefined && options.screenCaptureLayer !== null) {
    if (JSON.stringify(options.screenCaptureLayer).length > MAX_MODE_B_SCREEN_CAPTURE_JSON_LENGTH) {
      return 'Konfigurasi layer Tangkapan Layar terlalu besar.';
    }
  }
  if (options.screensaver !== undefined && options.screensaver !== null) {
    try {
      normalizeModeBScreensaver(options.screensaver);
    } catch (error) {
      return error instanceof Error ? error.message : 'Konfigurasi layar tunggu tidak valid.';
    }
  }
  return null;
}

export async function startModeBStream(options: StartModeBStreamOptions): Promise<ModeBStreamSnapshot> {
  if (!isNativeStreamingAvailable()) {
    return {
      status: 'error',
      message: 'Encoder RTMP native hanya tersedia pada APK Android.',
      isStreaming: false,
      bitrateKbps: 0,
    };
  }

  const validationError = validateStartModeBStreamOptions(options);
  if (validationError) {
    await clearNativeOverlayAssetCacheQuietly();
    return {
      status: 'error',
      message: validationError,
      isStreaming: false,
      bitrateKbps: 0,
    };
  }

  const normalizedOptions: StartModeBStreamOptions = {
    ...options,
    rtmpUrl: options.rtmpUrl.trim(),
    ...(typeof options.backgroundAssetId === 'string'
      ? { backgroundAssetId: options.backgroundAssetId.trim() }
      : {}),
  };

  // Lock Studio mutations before Android launches the MediaProjection consent dialog so Studio
  // cannot diverge from the snapshot queued into the encoder.
  updateModeBSceneMutationLock({ status: 'starting', isStreaming: false });
  try {
    const result = await getNativeStreamingPlugin().startStream(normalizedOptions);
    const accepted = result?.success === true && result.status !== 'error';
    modeBOverlayForwardingActive = accepted;
    // startStream only reports consent/service initialization ('starting'); RTMP live state is
    // strictly reported asynchronously by streamState / getStatus.
    const reportedStatus: ModeBStreamStatus = accepted ? result.status || 'starting' : result?.status || 'error';
    updateModeBSceneMutationLock({ status: reportedStatus, isStreaming: false });
    if (!accepted) {
      await clearNativeOverlayAssetCacheQuietly();
    }
    return {
      status: reportedStatus,
      message:
        result?.message ||
        (accepted ? 'Memulai capture dan encoder native.' : 'Encoder native gagal dimulai.'),
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  } catch (error) {
    modeBOverlayForwardingActive = false;
    updateModeBSceneMutationLock({ status: 'error', isStreaming: false });
    await clearNativeOverlayAssetCacheQuietly();
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Gagal memulai encoder native.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  }
}

/** Requests a fresh Android screen-capture token while keeping the existing RTMP session alive. */
export async function requestModeBScreenReshare(): Promise<ModeBStreamSnapshot> {
  if (!isNativeStreamingAvailable()) {
    return {
      status: 'error',
      message: 'Pemulihan berbagi layar hanya tersedia pada APK Android.',
      isStreaming: false,
      bitrateKbps: 0,
    };
  }

  updateModeBSceneMutationLock({ status: 'reshare_waiting', isStreaming: true });
  const plugin = getNativeStreamingPlugin();
  try {
    const result = await plugin.requestScreenReshare();
    const streaming = result?.isStreaming === true;
    modeBOverlayForwardingActive = streaming;
    const status: ModeBStreamStatus = result?.status || (streaming ? 'reshare_waiting' : 'error');
    updateModeBSceneMutationLock({ status, isStreaming: streaming });
    return {
      status,
      message:
        result?.message ||
        (streaming
          ? 'LIVE tetap berjalan; menunggu layar dibagikan kembali.'
          : 'Tidak dapat meminta izin layar baru.'),
      isStreaming: streaming,
      bitrateKbps: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal meminta izin layar baru.';
    try {
      const snapshot = await plugin.getStatus();
      syncModeBRuntimeState(snapshot);
      return {
        ...snapshot,
        message: snapshot.isStreaming ? message : snapshot.message,
      };
    } catch {
      modeBOverlayForwardingActive = false;
      updateModeBSceneMutationLock(null);
      return { status: 'error', message, isStreaming: false, bitrateKbps: 0 };
    }
  }
}

export async function stopModeBStream(): Promise<ModeBStreamSnapshot> {
  if (!isNativeStreamingAvailable()) {
    return {
      status: 'idle',
      message: 'Encoder native tidak aktif di browser.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  }
  try {
    const result = await getNativeStreamingPlugin().stopStream();
    modeBOverlayForwardingActive = false;
    const nextStatus: ModeBStreamStatus = result?.status || 'stopping';
    updateModeBSceneMutationLock({ status: nextStatus, isStreaming: false });
    return {
      status: nextStatus,
      message: 'Permintaan berhenti dikirim ke encoder native.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: result?.canStartNewSession === true ? true : false,
    };
  } catch (error) {
    modeBOverlayForwardingActive = false;
    updateModeBSceneMutationLock(null);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Gagal menghentikan encoder native.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  }
}

export async function getModeBStreamStatus(): Promise<ModeBStreamSnapshot> {
  if (!isNativeStreamingAvailable()) {
    return {
      status: 'idle',
      message: 'Mode B native belum tersedia di browser.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  }
  try {
    const snapshot = await getNativeStreamingPlugin().getStatus();
    syncModeBRuntimeState(snapshot);
    return snapshot;
  } catch (error) {
    updateModeBSceneMutationLock(null);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Tidak dapat membaca status encoder.',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    };
  }
}

function ensureNativeStreamStateListener(): Promise<PluginListenerHandle | null> {
  if (activeNativeStreamHandle) {
    return Promise.resolve(activeNativeStreamHandle);
  }
  if (pendingNativeStreamSubscription) {
    return pendingNativeStreamSubscription;
  }

  const registrationGen = ++streamSubscriptionGeneration;
  const registrationPromise = getNativeStreamingPlugin()
    .addListener('streamState', (snapshot) => {
      syncModeBRuntimeState(snapshot);
      for (const subscriber of Array.from(streamStateSubscribers)) {
        try {
          subscriber(snapshot);
        } catch {
          /* Isolate subscriber errors so state sync and other listeners always run. */
        }
      }
    })
    .then(async (handle) => {
      if (pendingNativeStreamSubscription === registrationPromise) {
        pendingNativeStreamSubscription = null;
      }
      if (streamStateSubscribers.size === 0 || registrationGen !== streamSubscriptionGeneration) {
        await handle.remove().catch(() => undefined);
        return null;
      }
      activeNativeStreamHandle = handle;
      return handle;
    })
    .catch((error) => {
      if (pendingNativeStreamSubscription === registrationPromise) {
        pendingNativeStreamSubscription = null;
      }
      throw error;
    });

  pendingNativeStreamSubscription = registrationPromise;
  return registrationPromise;
}

async function teardownNativeStreamStateListenerIfEmpty(): Promise<void> {
  if (streamStateSubscribers.size > 0) return;
  streamSubscriptionGeneration += 1;
  const handle = activeNativeStreamHandle;
  activeNativeStreamHandle = null;
  if (handle) {
    await handle.remove().catch(() => undefined);
  }
}

/**
 * Subscribes to native `streamState` updates using a shared singleton Capacitor listener.
 * Duplicate callback registrations are ignored, and unsubscribing removes the native
 * listener handle once no active subscribers remain.
 */
export async function onModeBStreamState(
  listener: (snapshot: ModeBStreamSnapshot) => void,
): Promise<PluginListenerHandle | null> {
  if (!isNativeStreamingAvailable() || typeof listener !== 'function') {
    return null;
  }

  streamStateSubscribers.add(listener);
  try {
    await ensureNativeStreamStateListener();
  } catch (error) {
    streamStateSubscribers.delete(listener);
    await teardownNativeStreamStateListenerIfEmpty();
    throw error;
  }

  if (!streamStateSubscribers.has(listener)) {
    await teardownNativeStreamStateListenerIfEmpty();
    return { remove: async () => undefined };
  }

  let removed = false;
  return {
    remove: async () => {
      if (removed) return;
      removed = true;
      streamStateSubscribers.delete(listener);
      await teardownNativeStreamStateListenerIfEmpty();
    },
  };
}

/** @internal Test helper only — injects a mock plugin adapter for Node unit tests. */
export function __setNativeStreamingBridgeTestAdapter(
  adapter: NativeStreamingTestAdapter | null,
): void {
  testAdapter = adapter;
}

/** @internal Test helper only — resets module state and clears active listener registrations. */
export async function __resetNativeStreamingBridgeForTests(): Promise<void> {
  streamStateSubscribers.clear();
  streamSubscriptionGeneration += 1;
  const handle = activeNativeStreamHandle;
  activeNativeStreamHandle = null;
  pendingNativeStreamSubscription = null;
  if (handle) {
    await handle.remove().catch(() => undefined);
  }
  modeBOverlayForwardingActive = false;
  modeBSceneMutationLocked = true;
  testAdapter = null;
}
