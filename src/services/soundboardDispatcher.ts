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
