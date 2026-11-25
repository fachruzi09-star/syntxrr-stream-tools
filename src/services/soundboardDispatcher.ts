import { SoundboardItem } from '../types';
import { SoundboardPlaybackResult, soundboardEngine } from './soundboardEngine';

export type SoundboardDispatchStatus = 'played' | 'not_found' | 'invalid_audio' | 'error';

export type SoundboardDispatchPlaybackReason = Extract<SoundboardPlaybackResult, { ok: false }>['reason'];

export interface SoundboardDispatchResult {
  status: SoundboardDispatchStatus;
  item?: SoundboardItem;
  reason?:
    | 'invalid_slot'
    | 'empty_slot'
    | 'slot_collision'
    | 'missing_audio'
    | 'missing_synth_type'
    | 'invalid_audio_url'
    | 'invalid_synth_type'
    | 'ambiguous_item';
  error?: unknown;
  playbackReason?: SoundboardDispatchPlaybackReason;
}

export type SoundboardDispatchTarget = SoundboardItem | number;

const VALID_SYNTH_TYPES = new Set([
  'cheer',
  'horn',
  'level_up',
  'game_over',
  'tada',
  'bell',
]);

function isValidAudioUrl(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidSynthType(value: unknown): value is NonNullable<SoundboardItem['synthType']> {
  return typeof value === 'string' && VALID_SYNTH_TYPES.has(value);
}

function resolveTarget(target: SoundboardDispatchTarget, items: SoundboardItem[]): SoundboardDispatchResult {
  if (typeof target === 'number') {
    if (!Number.isInteger(target) || target < 1 || target > 4) {
      return { status: 'not_found', reason: 'invalid_slot' };
    }

    const matches = items.filter((item) => item.isQuickSlot && item.quickSlotKey === target);

    if (matches.length === 0) {
      return { status: 'not_found', reason: 'empty_slot' };
    }

    if (matches.length > 1) {
      return { status: 'not_found', reason: 'slot_collision' };
    }

    return { status: 'played', item: matches[0] };
  }

  const matches = items.filter((item) => item.id === target.id);
  if (matches.length > 1) {
    return { status: 'not_found', reason: 'ambiguous_item' };
  }

  if (matches.length === 0) {
    return { status: 'not_found' };
  }

  return { status: 'played', item: matches[0] };
}

export async function dispatchSoundboard(
  target: SoundboardDispatchTarget,
  items: SoundboardItem[],
  volume: number,
): Promise<SoundboardDispatchResult> {
  if (!Array.isArray(items)) {
    return { status: 'error', error: new TypeError('Soundboard items must be an array') };
  }

  const resolved = resolveTarget(target, items);
  if (resolved.status !== 'played' || !resolved.item) {
    return resolved;
  }

  const item = resolved.item;
  const normalizedVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.85;

  try {
    const hasAudioUrl = item.audioUrl !== undefined && item.audioUrl !== null;
    const hasSynthType = item.synthType !== undefined && item.synthType !== null;

    if (hasAudioUrl && hasSynthType) {
      return { status: 'invalid_audio', item, reason: 'ambiguous_item' };
    }

    if (hasAudioUrl) {
      if (!isValidAudioUrl(item.audioUrl)) {
        return { status: 'invalid_audio', item, reason: 'invalid_audio_url' };
      }
      const playback = await soundboardEngine.playCustomFile(item.id, item.audioUrl, normalizedVolume);
      if (!playback.ok) {
        return { status: 'error', item, error: playback.error, playbackReason: playback.reason };
      }
      return { status: 'played', item };
    }

    if (hasSynthType) {
      if (!isValidSynthType(item.synthType)) {
        return { status: 'invalid_audio', item, reason: 'invalid_synth_type' };
      }
      const playback = await soundboardEngine.playSynthesizedSFX(item.synthType, normalizedVolume);
      if (!playback.ok) {
        return { status: 'error', item, error: playback.error, playbackReason: playback.reason };
      }
      return { status: 'played', item };
    }

    return { status: 'invalid_audio', item, reason: 'missing_audio' };
  } catch (error) {
    return { status: 'error', item, error };
  }
}

export function isBlobSchemeAudioUrl(url: unknown): boolean {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith('blob:');
}

export function isHttpOrHttpsAudioUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isPlayableSoundboardAudioUrl(url: unknown): url is string {
  return isBlobSchemeAudioUrl(url) || isHttpOrHttpsAudioUrl(url);
}

export function isValidSoundboardBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob && value.size > 0;
}

export async function hydrateSoundboardItem(
  item: SoundboardItem,
  deps: {
    getSoundboardAudio: (id: string) => Promise<Blob | null>;
    createObjectUrl: (blob: Blob) => string;
  },
): Promise<SoundboardItem> {
  if (item.synthType && VALID_SYNTH_TYPES.has(item.synthType) && !item.audioUrl) {
    return item;
  }

  let audioBlob: Blob | null = null;
  try {
    audioBlob = await deps.getSoundboardAudio(item.id);
  } catch {
    audioBlob = null;
  }

  if (isValidSoundboardBlob(audioBlob)) {
    return {
      ...item,
      audioUrl: deps.createObjectUrl(audioBlob),
    };
  }

  if (isHttpOrHttpsAudioUrl(item.audioUrl)) {
    return item;
  }

  if (item.audioUrl !== undefined) {
    const { audioUrl: _staleAudioUrl, ...withoutStaleUrl } = item;
    return withoutStaleUrl;
  }

  return item;
}

export async function hydrateSoundboardItems(
  items: readonly SoundboardItem[],
  deps: {
    getSoundboardAudio: (id: string) => Promise<Blob | null>;
    createObjectUrl: (blob: Blob) => string;
  },
): Promise<SoundboardItem[]> {
  if (!Array.isArray(items) || items.length === 0) return [];
  return Promise.all(items.map((item) => hydrateSoundboardItem(item, deps)));
}

export function hasMissingCustomSoundboardAudio(item: SoundboardItem): boolean {
  return !isPlayableSoundboardAudioUrl(item.audioUrl) && !isValidSynthType(item.synthType);
}

export function formatSoundboardPlaybackError(
  reason: SoundboardDispatchPlaybackReason | 'missing_local_audio',
  itemName?: string,
): { title: string; message: string } {
  const label = itemName?.trim() ? `"${itemName.trim()}"` : 'efek suara ini';
  switch (reason) {
    case 'missing_local_audio':
      return {
        title: 'File Audio Perlu Diimpor Ulang',
        message: `File audio lokal untuk ${label} tidak tersedia atau sudah kedaluwarsa. Hapus item ini lalu impor ulang file audionya.`,
      };
    case 'invalid_audio':
      return {
        title: 'Sumber Audio Tidak Valid',
        message: `Sumber audio untuk ${label} tidak valid atau sudah kedaluwarsa. Silakan impor ulang file audio.`,
      };
    case 'audio_context_unavailable':
      return {
        title: 'Audio Tidak Tersedia',
        message: 'Web Audio API tidak tersedia di perangkat atau browser ini.',
      };
    case 'audio_context_resume_failed':
    case 'audio_context_suspended':
      return {
        title: 'Pemutaran Audio Terblokir',
        message: 'Browser menahan pemutaran audio. Ketuk layar lalu coba putar ulang.',
      };
    case 'audio_context_playback_failed':
      return {
        title: 'Gagal Memutar Efek Suara',
        message: `Efek suara synthesizer ${label} gagal diputar.`,
      };
    case 'audio_play_failed':
    default:
      return {
        title: 'Gagal Memutar Audio Kustom',
        message: `Audio ${label} gagal diputar. Pastikan file audio masih valid atau impor ulang.`,
      };
  }
}

export interface SoundboardPlaybackEngineLike {
  playSynthesizedSFX: (
    type: NonNullable<SoundboardItem['synthType']>,
    volume?: number,
  ) => Promise<SoundboardPlaybackResult>;
  playCustomFile: (
    id: string,
    audioUrl: string,
    volume?: number,
  ) => Promise<SoundboardPlaybackResult>;
}

export async function executeLiveCenterSoundboardPlay(params: {
  target: SoundboardItem | NonNullable<SoundboardItem['synthType']>;
  volume?: number;
  engine: SoundboardPlaybackEngineLike;
  onPlaybackError: (notice: { title: string; message: string }) => void;
}): Promise<
  | { ok: true }
  | { ok: false; reason: SoundboardDispatchPlaybackReason | 'missing_local_audio' }
> {
  const { target, volume, engine, onPlaybackError } = params;
  const normalizedVolume =
    typeof volume === 'number' && Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : undefined;

  if (typeof target === 'string') {
    try {
      const res = await engine.playSynthesizedSFX(target, normalizedVolume);
      if (!res.ok) {
        onPlaybackError(formatSoundboardPlaybackError(res.reason, target));
        return { ok: false, reason: res.reason };
      }
      return { ok: true };
    } catch {
      onPlaybackError(formatSoundboardPlaybackError('audio_context_playback_failed', target));
      return { ok: false, reason: 'audio_context_playback_failed' };
    }
  }

  if (isPlayableSoundboardAudioUrl(target.audioUrl)) {
    try {
      const res = await engine.playCustomFile(target.id, target.audioUrl, normalizedVolume);
      if (!res.ok) {
        onPlaybackError(formatSoundboardPlaybackError(res.reason, target.name));
        return { ok: false, reason: res.reason };
      }
      return { ok: true };
    } catch {
      onPlaybackError(formatSoundboardPlaybackError('audio_play_failed', target.name));
      return { ok: false, reason: 'audio_play_failed' };
    }
  }

  if (isValidSynthType(target.synthType)) {
    try {
      const res = await engine.playSynthesizedSFX(target.synthType, normalizedVolume);
      if (!res.ok) {
        onPlaybackError(formatSoundboardPlaybackError(res.reason, target.name));
        return { ok: false, reason: res.reason };
      }
      return { ok: true };
    } catch {
      onPlaybackError(formatSoundboardPlaybackError('audio_context_playback_failed', target.name));
      return { ok: false, reason: 'audio_context_playback_failed' };
    }
  }

  onPlaybackError(formatSoundboardPlaybackError('missing_local_audio', target.name));
  return { ok: false, reason: 'missing_local_audio' };
}

const SUPPORTED_SOUNDBOARD_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];

export function isSupportedSoundboardAudioFile(
  file: Pick<File, 'name' | 'type' | 'size'> | null | undefined,
): boolean {
  if (!file || typeof file.size !== 'number' || file.size <= 0) return false;
  const mime = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
  if (mime.startsWith('audio/')) return true;
  const lowerName = typeof file.name === 'string' ? file.name.trim().toLowerCase() : '';
  return SUPPORTED_SOUNDBOARD_AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export async function executeSoundboardAudioImport(params: {
  file: File;
  existingItems: readonly SoundboardItem[];
  probeDurationSec: (file: File) => Promise<number>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  saveSoundboardAudio: (id: string, file: Blob) => Promise<void>;
  deleteSoundboardAudio: (id: string) => Promise<void>;
  onSoundboardItemsChange: (items: SoundboardItem[]) => Promise<void>;
  createId?: () => string;
}): Promise<
  | { ok: true; item: SoundboardItem }
  | { ok: false; title: string; message: string; error?: unknown }
> {
  const { file, existingItems } = params;
  if (!isSupportedSoundboardAudioFile(file)) {
    return {
      ok: false,
      title: 'Format Audio Tidak Didukung',
      message: 'Harap pilih file audio yang valid (MP3, WAV, OGG, M4A, atau AAC).',
    };
  }

  const id = params.createId
    ? params.createId()
    : `sb_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let durationSec = 1;
  try {
    const probed = await params.probeDurationSec(file);
    durationSec = Number.isFinite(probed) ? Math.max(1, Math.round(probed)) : 1;
  } catch {
    durationSec = 1;
  }

  let audioUrl = '';
  try {
    audioUrl = params.createObjectUrl(file);
    await params.saveSoundboardAudio(id, file);
    const savedItem: SoundboardItem = {
      id,
      name: file.name.replace(/\.[^/.]+$/, '').trim() || 'Imported sound',
      category: 'SFX',
      icon: 'Volume2',
      durationSec,
      isQuickSlot: false,
      audioUrl,
    };
    await params.onSoundboardItemsChange([...existingItems, savedItem]);
    return { ok: true, item: savedItem };
  } catch (error) {
    if (audioUrl) {
      try {
        params.revokeObjectUrl(audioUrl);
      } catch {}
    }
    try {
      await params.deleteSoundboardAudio(id);
    } catch {}
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Gagal menyimpan audio Soundboard ke penyimpanan perangkat.';
    return {
      ok: false,
      title: 'Gagal Mengimpor Audio Soundboard',
      message: detail,
      error,
    };
  }
}

