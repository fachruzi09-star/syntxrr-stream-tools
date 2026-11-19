import type { StudioScreensaverSettings } from '../types';

export interface ModeBScreensaverRuntimeSpec {
  on: boolean;
  text: string;
  media: string;
  mediaType: 'image' | 'video';
  mediaSound: boolean;
  enter: { type: 'fade' | 'cut'; duration: number };
  exit: { type: 'fade' | 'cut'; duration: number };
}

export const MODE_B_SCREENSAVER_DEFAULT_TEXT = 'Sedang menunggu host';
export const MODE_B_SCREENSAVER_DEFAULT_FADE_MS = 300;
const MIN_FADE_MS = 100;
const MAX_FADE_MS = 1200;

function readTransition(value: unknown, label: string): { type: 'fade' | 'cut'; duration: number } {
  if (value === undefined || value === null) {
    return { type: 'fade', duration: MODE_B_SCREENSAVER_DEFAULT_FADE_MS };
  }
  let type = '';
  let duration = MODE_B_SCREENSAVER_DEFAULT_FADE_MS;
  if (typeof value === 'string') {
    type = value.trim().toLowerCase();
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
    const rawDuration = record.duration ?? record.durationMs;
    if (rawDuration !== undefined) {
      if (typeof rawDuration !== 'number' || !Number.isInteger(rawDuration)) {
        throw new Error(`${label}: durasi harus berupa bilangan bulat.`);
      }
      duration = rawDuration;
    }
  } else {
    throw new Error(`${label}: format transisi tidak didukung.`);
  }

  if (!type || type === 'none' || type === 'cut') return { type: 'cut', duration: 0 };
  if (type !== 'fade') throw new Error(`${label}: Saat ini hanya mendukung transisi fade atau cut.`);
  if (duration < MIN_FADE_MS || duration > MAX_FADE_MS) {
    throw new Error(`${label}: durasi fade harus ${MIN_FADE_MS}–${MAX_FADE_MS} ms.`);
  }
  return { type: 'fade', duration };
}

export function isSupportedScreensaverAssetSelection(
  expectedMediaType: 'image' | 'video',
  storedAssetType: string,
  mimeType: string,
): boolean {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (expectedMediaType === 'video') {
    return storedAssetType === 'video' && normalizedMime === 'video/mp4';
  }
  return (
    storedAssetType === 'image' &&
    ['image/png', 'image/jpeg', 'image/gif'].includes(normalizedMime)
  );
}

export function normalizeModeBScreensaver(value: unknown): ModeBScreensaverRuntimeSpec {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = typeof record.text === 'string' ? record.text.trim().slice(0, 180) : '';
  const media = typeof record.media === 'string' ? record.media.trim() : '';
  const mediaType = record.mediaType === 'video' ? 'video' : 'image';
  return {
    on: record.on === true,
    text: text || MODE_B_SCREENSAVER_DEFAULT_TEXT,
    media,
    mediaType,
    mediaSound: record.mediaSound === true,
    enter: readTransition(record.enter, 'Transisi masuk layar tunggu'),
    exit: readTransition(record.exit, 'Transisi keluar layar tunggu'),
  };
}

export function toStudioScreensaverSettings(value: unknown): StudioScreensaverSettings {
  const current =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    on: current.on === true,
    text: typeof current.text === 'string' ? current.text : '',
    media: typeof current.media === 'string' ? current.media : '',
    mediaType: current.mediaType === 'video' ? 'video' : 'image',
    mediaSound: current.mediaSound === true,
    enter:
      typeof current.enter === 'string'
        ? current.enter
        : current.enter && typeof current.enter === 'object'
          ? (current.enter as Record<string, unknown>)
          : { type: 'fade', duration: MODE_B_SCREENSAVER_DEFAULT_FADE_MS },
    exit:
      typeof current.exit === 'string'
        ? current.exit
        : current.exit && typeof current.exit === 'object'
          ? (current.exit as Record<string, unknown>)
          : { type: 'fade', duration: MODE_B_SCREENSAVER_DEFAULT_FADE_MS },
  };
}
