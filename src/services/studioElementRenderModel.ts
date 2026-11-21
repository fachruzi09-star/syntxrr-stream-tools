import type { StreamEvent, StudioElement } from '../types';
import { normalizeUnitVolume } from '../types';
import type { ModeBStreamSnapshot } from './nativeStreamingBridge';
import { parseSafeNumericNominal } from './studioElementCatalog';

export const SUPPORTED_SOUNDBOARD_SFX = [
  'cheer',
  'horn',
  'level_up',
  'game_over',
  'tada',
  'bell',
] as const;

export type SupportedSoundboardSfx = (typeof SUPPORTED_SOUNDBOARD_SFX)[number];

const SUPPORTED_SFX_SET = new Set<string>(SUPPORTED_SOUNDBOARD_SFX);

const SOUNDBOARD_LABELS: Record<SupportedSoundboardSfx, string> = {
  cheer: 'Cheer / Tepuk Tangan',
  horn: 'Air Horn',
  level_up: 'Level Up',
  game_over: 'Game Over',
  tada: 'Tada Fanfare',
  bell: 'Crystal Bell',
};

export function appendUniqueStreamEvent(
  history: readonly StreamEvent[],
  event: StreamEvent,
  maxItems = 50,
): StreamEvent[] {
  if (!event || typeof event.id !== 'string' || !event.id.trim()) {
    return history.slice(0, maxItems);
  }
  const safeMax = Math.max(1, Math.min(200, Math.floor(maxItems)));
  if (history.some((item) => item.id === event.id)) {
    return history.slice(0, safeMax);
  }
  return [event, ...history].slice(0, safeMax);
}

export function deduplicateStreamEvents(
  events: readonly StreamEvent[],
  maxItems = 50,
): StreamEvent[] {
  const safeMax = Math.max(1, Math.min(200, Math.floor(maxItems)));
  const seen = new Set<string>();
  const result: StreamEvent[] = [];
  for (const item of events) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= safeMax) break;
  }
  return result;
}

export function extractViewerCountFromEvent(event: StreamEvent | null | undefined): number | null {
  if (!event || event.type !== 'viewer') return null;
  if (typeof event.viewerCount === 'number' && Number.isFinite(event.viewerCount) && event.viewerCount >= 0) {
    return Math.floor(event.viewerCount);
  }
  if (typeof event.amount === 'number' && Number.isFinite(event.amount) && event.amount >= 0) {
    return Math.floor(event.amount);
  }
  return null;
}

export function getLatestViewerCountFromHistory(events: readonly StreamEvent[]): number | null {
  for (const event of events) {
    const count = extractViewerCountFromEvent(event);
    if (count !== null) return count;
  }
  return null;
}

export function resolveViewerCounterDisplay(params: {
  liveViewerCount: number | null;
  fallbackPropertyValue?: unknown;
}): {
  count: number | null;
  formattedCount: string;
  hasLiveSample: boolean;
} {
  const { liveViewerCount, fallbackPropertyValue } = params;
  if (typeof liveViewerCount === 'number' && Number.isFinite(liveViewerCount) && liveViewerCount >= 0) {
    const clean = Math.floor(liveViewerCount);
    return {
      count: clean,
      formattedCount: clean.toLocaleString('id-ID'),
      hasLiveSample: true,
    };
  }
  if (
    typeof fallbackPropertyValue === 'number' &&
    Number.isFinite(fallbackPropertyValue) &&
    fallbackPropertyValue >= 0
  ) {
    const clean = Math.floor(fallbackPropertyValue);
    return {
      count: clean,
      formattedCount: clean.toLocaleString('id-ID'),
      hasLiveSample: false,
    };
  }
  return {
    count: null,
    formattedCount: '—',
    hasLiveSample: false,
  };
}

export function extractLikeIncrementFromEvent(event: StreamEvent | null | undefined): number {
  if (!event || event.type !== 'like') return 0;
  if (typeof event.amount === 'number' && Number.isFinite(event.amount) && event.amount > 0) {
    return Math.floor(event.amount);
  }
  if (typeof event.likeCount === 'number' && Number.isFinite(event.likeCount) && event.likeCount > 0) {
    return Math.floor(event.likeCount);
  }
  return 1;
}

export type BrowserEmbedUrlValidation =
  | { isValid: true; safeUrl: string; hostname: string }
  | { isValid: false; reason: 'empty' | 'invalid_url' | 'unsupported_protocol' };

export function validateSafeBrowserEmbedUrl(rawUrl: unknown): BrowserEmbedUrlValidation {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { isValid: false, reason: 'empty' };
  }
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { isValid: false, reason: 'unsupported_protocol' };
    }
    if (!parsed.hostname) {
      return { isValid: false, reason: 'invalid_url' };
    }
    return {
      isValid: true,
      safeUrl: parsed.toString(),
      hostname: parsed.hostname,
    };
  } catch {
    return { isValid: false, reason: 'invalid_url' };
  }
}

export function resolveSeparatorStyle(
  element: Pick<StudioElement, 'width' | 'height'>,
  props: Record<string, unknown>,
): {
  orientation: 'horizontal' | 'vertical';
  lineColor: string;
  thickness: number;
  glow: boolean;
} {
  let orientation: 'horizontal' | 'vertical' = 'horizontal';
  if (props.orientation === 'vertical' || props.direction === 'vertical') {
    orientation = 'vertical';
  } else if (props.orientation === 'horizontal' || props.direction === 'horizontal') {
    orientation = 'horizontal';
  } else if (
    typeof element.height === 'number' &&
    typeof element.width === 'number' &&
    element.height > element.width
  ) {
    orientation = 'vertical';
  }

  const lineColor =
    typeof props.lineColor === 'string' && props.lineColor.trim()
      ? props.lineColor.trim()
      : typeof props.borderColor === 'string' && props.borderColor.trim()
        ? props.borderColor.trim()
        : '#F2C230';

  const rawThickness = props.thickness ?? props.borderWidth;
  const thickness =
    typeof rawThickness === 'number' && Number.isFinite(rawThickness)
      ? Math.max(1, Math.min(24, rawThickness))
      : 2;

  return {
    orientation,
    lineColor,
    thickness,
    glow: props.glow !== false,
  };
}

export function isSupportedSoundboardSfx(value: unknown): value is SupportedSoundboardSfx {
  return typeof value === 'string' && SUPPORTED_SFX_SET.has(value);
}

function isSafeCustomAudioUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:audio/')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export type SoundboardControlModel =
  | {
      mode: 'custom_url';
      isSupported: true;
      audioUrl: string;
      label: string;
      volumeUnit: number;
      volumePercent: number;
    }
  | {
      mode: 'synth';
      isSupported: true;
      sfxType: SupportedSoundboardSfx;
      label: string;
      volumeUnit: number;
      volumePercent: number;
    }
  | {
      mode: 'invalid';
      isSupported: false;
      requestedSfx: string;
      label: string;
      volumeUnit: number;
      volumePercent: number;
    };

export function resolveSoundboardControlModel(
  props: Record<string, unknown>,
): SoundboardControlModel {
  const volumeUnit = normalizeUnitVolume(props.volume, 0.9);
  const volumePercent = Math.round(volumeUnit * 100);

  if (isSafeCustomAudioUrl(props.audioUrl)) {
    const customLabel =
      typeof props.title === 'string' && props.title.trim()
        ? props.title.trim()
        : 'Audio SFX Kustom';
    return {
      mode: 'custom_url',
      isSupported: true,
      audioUrl: props.audioUrl.trim(),
      label: customLabel,
      volumeUnit,
      volumePercent,
    };
  }

  const rawSfx = props.presetSfx ?? 'horn';
  if (isSupportedSoundboardSfx(rawSfx)) {
    return {
      mode: 'synth',
      isSupported: true,
      sfxType: rawSfx,
      label: SOUNDBOARD_LABELS[rawSfx],
      volumeUnit,
      volumePercent,
    };
  }

  return {
    mode: 'invalid',
    isSupported: false,
    requestedSfx: String(rawSfx ?? ''),
    label: 'SFX Tidak Didukung',
    volumeUnit,
    volumePercent,
  };
}

export function resolveActiveUsernameModel(
  events: readonly StreamEvent[],
  props: Record<string, unknown>,
): {
  hasEvent: boolean;
  displayText: string;
  username: string | null;
  prefix: string;
  badge: string | null;
  eventType: StreamEvent['type'] | null;
} {
  const prefix = typeof props.prefix === 'string' ? props.prefix : '';
  const badge = typeof props.badge === 'string' && props.badge.trim() ? props.badge.trim() : null;
  const latest = events.find(
    (event) => typeof event?.username === 'string' && event.username.trim().length > 0,
  );

  if (!latest) {
    return {
      hasEvent: false,
      displayText: 'Menunggu interaksi penonton...',
      username: null,
      prefix,
      badge,
      eventType: null,
    };
  }

  const cleanUsername = latest.username.trim();
  return {
    hasEvent: true,
    displayText: `${prefix}${cleanUsername}`,
    username: cleanUsername,
    prefix,
    badge,
    eventType: latest.type,
  };
}

function isSafeImageSrc(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveDynamicAvatarModel(
  events: readonly StreamEvent[],
  props: Record<string, unknown>,
): {
  avatarUrl: string | null;
  username: string | null;
  initial: string | null;
  shape: 'circle' | 'square' | 'rounded';
  borderGlow: boolean;
} {
  const shape =
    props.shape === 'square' || props.shape === 'rounded' || props.shape === 'circle'
      ? props.shape
      : 'circle';
  const borderGlow = props.borderGlow !== false;

  const eventWithAvatar = events.find((event) => isSafeImageSrc(event?.userAvatar));
  const latestUserEvent =
    eventWithAvatar ||
    events.find((event) => typeof event?.username === 'string' && event.username.trim().length > 0);

  if (!latestUserEvent) {
    return {
      avatarUrl: null,
      username: null,
      initial: null,
      shape,
      borderGlow,
    };
  }

  const cleanName = latestUserEvent.username?.trim() || null;
  const initial = cleanName ? cleanName.replace(/^@+/, '').charAt(0).toUpperCase() || '?' : '?';

  return {
    avatarUrl: eventWithAvatar && isSafeImageSrc(eventWithAvatar.userAvatar) ? eventWithAvatar.userAvatar.trim() : null,
    username: cleanName,
    initial,
    shape,
    borderGlow,
  };
}

export function buildEventFeedItems(
  events: readonly StreamEvent[],
  maxItemsRaw: unknown = 4,
): StreamEvent[] {
  const maxItems =
    typeof maxItemsRaw === 'number' && Number.isFinite(maxItemsRaw) && maxItemsRaw > 0
      ? Math.max(1, Math.min(20, Math.floor(maxItemsRaw)))
      : 4;
  return deduplicateStreamEvents(events, maxItems);
}

export interface ProgressBarModel {
  current: number;
  target: number;
  percent: number;
  isValidTarget: boolean;
  currency: string;
  formattedCurrent: string;
  formattedTarget: string;
  percentLabel: string;
}

function formatNominalWithCurrency(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const formattedNumber = safe.toLocaleString('id-ID');
  return currency ? `${currency} ${formattedNumber}` : formattedNumber;
}

export function computeProgressBarModel(props: Record<string, unknown>): ProgressBarModel {
  const parsedCurrent = parseSafeNumericNominal(props.currentAmount ?? props.current);
  const parsedTarget = parseSafeNumericNominal(props.targetAmount ?? props.target);

  const current =
    typeof parsedCurrent === 'number' && Number.isFinite(parsedCurrent) && parsedCurrent >= 0
      ? parsedCurrent
      : 0;
  const isValidTarget =
    typeof parsedTarget === 'number' && Number.isFinite(parsedTarget) && parsedTarget > 0;
  const target = isValidTarget ? parsedTarget : 0;

  let percent = 0;
  if (isValidTarget && target > 0) {
    const rawPercent = (current / target) * 100;
    percent = Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 0;
  }

  const roundedPercent = Math.round(percent * 10) / 10;
  const currency = typeof props.currency === 'string' ? props.currency.trim() : '';

  return {
    current,
    target,
    percent: roundedPercent,
    isValidTarget,
    currency,
    formattedCurrent: formatNominalWithCurrency(current, currency),
    formattedTarget: isValidTarget ? formatNominalWithCurrency(target, currency) : '—',
    percentLabel: `${Math.round(roundedPercent)}%`,
  };
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  supportCount: number;
  lastEventType: 'gift' | 'donation';
  lastAmount: number | null;
  lastCurrency: string | null;
  lastDetail: string;
  formattedLastAmount: string | null;
  lastTimestamp: number;
}

export function buildLeaderboardEntries(
  events: readonly StreamEvent[],
  topCountRaw: unknown = 3,
): LeaderboardEntry[] {
  const topCount =
    typeof topCountRaw === 'number' && Number.isFinite(topCountRaw) && topCountRaw > 0
      ? Math.max(1, Math.min(10, Math.floor(topCountRaw)))
      : 3;

  const grouped = new Map<
    string,
    {
      username: string;
      supportCount: number;
      lastEventType: 'gift' | 'donation';
      lastAmount: number | null;
      lastCurrency: string | null;
      lastDetail: string;
      lastTimestamp: number;
    }
  >();

  for (const event of events) {
    if (!event || (event.type !== 'gift' && event.type !== 'donation')) continue;
    const username = typeof event.username === 'string' ? event.username.trim() : '';
    if (!username) continue;

    const key = username.toLowerCase();
    const numericAmount =
      typeof event.amount === 'number' && Number.isFinite(event.amount) && event.amount > 0
        ? event.amount
        : null;
    const currency =
      typeof event.currency === 'string' && event.currency.trim()
        ? event.currency.trim()
        : event.type === 'gift' && numericAmount !== null
          ? 'Koin'
          : null;
    const timestamp = typeof event.timestamp === 'number' && Number.isFinite(event.timestamp) ? event.timestamp : 0;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        username,
        supportCount: 1,
        lastEventType: event.type,
        lastAmount: numericAmount,
        lastCurrency: currency,
        lastDetail: typeof event.detail === 'string' ? event.detail : '',
        lastTimestamp: timestamp,
      });
    } else {
      existing.supportCount += 1;
      if (timestamp >= existing.lastTimestamp) {
        existing.username = username;
        existing.lastEventType = event.type;
        existing.lastAmount = numericAmount;
        existing.lastCurrency = currency;
        existing.lastDetail = typeof event.detail === 'string' ? event.detail : '';
        existing.lastTimestamp = timestamp;
      }
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (b.supportCount !== a.supportCount) {
        return b.supportCount - a.supportCount;
      }
      return b.lastTimestamp - a.lastTimestamp;
    })
    .slice(0, topCount)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      formattedLastAmount:
        entry.lastAmount !== null
          ? entry.lastCurrency
            ? `${entry.lastCurrency} ${entry.lastAmount.toLocaleString('id-ID')}`
            : entry.lastAmount.toLocaleString('id-ID')
          : null,
    }));
}

export function getTopDonorNameFromHistory(events: readonly StreamEvent[]): string | null {
  const entries = buildLeaderboardEntries(events, 1);
  return entries[0]?.username ?? null;
}

export function getActiveTargetTextFromElements(
  elements: readonly StudioElement[],
  currentElementProps: Record<string, unknown>,
): string | null {
  if (typeof currentElementProps.target === 'string' && currentElementProps.target.trim()) {
    return currentElementProps.target.trim();
  }
  if (
    typeof currentElementProps.target === 'number' &&
    Number.isFinite(currentElementProps.target) &&
    currentElementProps.target > 0
  ) {
    return currentElementProps.target.toLocaleString('id-ID');
  }

  const counterElem = elements.find((item) => item.type === 'counter');
  if (counterElem) {
    const rawTarget = counterElem.properties?.targetGoal ?? counterElem.properties?.target;
    const parsed = parseSafeNumericNominal(rawTarget);
    if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) {
      return parsed.toLocaleString('id-ID');
    }
  }

  const progressElem = elements.find((item) => item.type === 'progress_bar');
  if (progressElem) {
    const model = computeProgressBarModel(progressElem.properties || {});
    if (model.isValidTarget) {
      return model.formattedTarget;
    }
  }

  return null;
}

export interface DynamicTextContext {
  latestUsername?: string | null;
  targetText?: string | null;
  currentTimeText?: string | null;
  durationText?: string | null;
  topDonorName?: string | null;
}

export function resolveDynamicTextOutput(params: {
  template?: unknown;
  fallback?: unknown;
  context: DynamicTextContext;
}): {
  text: string;
  usedFallback: boolean;
} {
  const rawTemplate =
    typeof params.template === 'string' ? params.template : '';
  const rawFallback =
    typeof params.fallback === 'string' && params.fallback.trim()
      ? params.fallback.trim()
      : 'Menunggu data siaran...';

  const cleanFallback = rawFallback.replace(/\{[^}]+\}/g, '—').trim() || 'Menunggu data siaran...';

  if (!rawTemplate.trim()) {
    return { text: cleanFallback, usedFallback: true };
  }

  const tokenValues: Record<string, string | null | undefined> = {
    username: params.context.latestUsername?.trim() || null,
    target: params.context.targetText?.trim() || null,
    waktu: params.context.currentTimeText?.trim() || null,
    durasi: params.context.durationText?.trim() || null,
    top_donor_name: params.context.topDonorName?.trim() || null,
  };

  let missingToken = false;
  const replaced = rawTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, tokenName: string) => {
    const val = tokenValues[tokenName];
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
    missingToken = true;
    return '';
  });

  if (missingToken) {
    return { text: cleanFallback, usedFallback: true };
  }

  // Ensure no unparsed raw "{...}" token ever slips through
  const finalClean = replaced.replace(/\{[^}]+\}/g, '—').trim();
  if (!finalClean) {
    return { text: cleanFallback, usedFallback: true };
  }

  return { text: finalClean, usedFallback: false };
}

export function resolveStickerVisualModel(stickerIdRaw: unknown, floatEffectRaw: unknown): {
  stickerId: string;
  emoji: string;
  label: string;
  floatEffect: boolean;
} {
  const stickerId =
    typeof stickerIdRaw === 'string' && stickerIdRaw.trim()
      ? stickerIdRaw.trim().toLowerCase()
      : 'fire';

  const STICKER_MAP: Record<string, { emoji: string; label: string }> = {
    fire: { emoji: '🔥', label: 'Fire Hype' },
    heart: { emoji: '❤️', label: 'Love Tap' },
    love: { emoji: '💖', label: 'Super Love' },
    star: { emoji: '⭐', label: 'Star Vote' },
    clap: { emoji: '👏', label: 'Applause' },
    rocket: { emoji: '🚀', label: 'Boost' },
    laugh: { emoji: '😂', label: 'LOL' },
    crown: { emoji: '👑', label: 'VIP Crown' },
    gift: { emoji: '🎁', label: 'Special Gift' },
  };

  const matched = STICKER_MAP[stickerId] ?? { emoji: '✨', label: stickerId.toUpperCase() };
  return {
    stickerId,
    emoji: matched.emoji,
    label: matched.label,
    floatEffect: floatEffectRaw !== false,
  };
}

export function buildLiveTextRenderModel(params: {
  isModeBSelected: boolean;
  modeBStatus?: ModeBStreamSnapshot;
  showFps?: boolean;
  showBitrate?: boolean;
  fps?: number | null;
  resolution?: string | null;
}): {
  isLive: boolean;
  statusLabel: string;
  tone: 'live' | 'transition' | 'error' | 'offline';
  fpsLabel: string;
  resolutionLabel: string;
  bitrateLabel: string;
} {
  const { isModeBSelected, modeBStatus, showFps = true, showBitrate = true, fps, resolution } = params;

  const isLive = Boolean(
    isModeBSelected && modeBStatus?.status === 'live' && modeBStatus?.isStreaming,
  );

  let statusLabel = 'OFFLINE';
  let tone: 'live' | 'transition' | 'error' | 'offline' = 'offline';

  if (!isModeBSelected) {
    statusLabel = 'STANDBY';
    tone = 'offline';
  } else if (isLive) {
    statusLabel = 'LIVE';
    tone = 'live';
  } else {
    switch (modeBStatus?.status) {
      case 'starting':
      case 'connecting':
      case 'resharing':
        statusLabel = 'CONNECTING';
        tone = 'transition';
        break;
      case 'host_wait':
      case 'reshare_waiting':
        statusLabel = 'HOST WAIT';
        tone = 'transition';
        break;
      case 'stopping':
        statusLabel = 'STOPPING';
        tone = 'transition';
        break;
      case 'error':
      case 'capture_lost':
      case 'disconnected':
        statusLabel = modeBStatus.status === 'capture_lost' ? 'CAPTURE LOST' : 'TERPUTUS';
        tone = 'error';
        break;
      default:
        statusLabel = 'OFFLINE';
        tone = 'offline';
        break;
    }
  }

  const fpsLabel =
    showFps && typeof fps === 'number' && Number.isFinite(fps) && fps > 0
      ? `${Math.round(fps)} FPS`
      : '—';

  const resolutionLabel =
    typeof resolution === 'string' && resolution.trim() ? resolution.trim() : '—';

  const bitrateValue = modeBStatus?.bitrateKbps;
  const bitrateLabel =
    showBitrate &&
    isModeBSelected &&
    typeof bitrateValue === 'number' &&
    Number.isFinite(bitrateValue) &&
    bitrateValue > 0 &&
    (isLive || modeBStatus?.status === 'host_wait' || modeBStatus?.status === 'connecting')
      ? `${Math.round(bitrateValue)} kbps`
      : '—';

  return {
    isLive,
    statusLabel,
    tone,
    fpsLabel,
    resolutionLabel,
    bitrateLabel,
  };
}
