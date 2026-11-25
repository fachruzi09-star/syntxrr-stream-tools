import type { StreamEvent, StudioElement } from '../types';
import { normalizeUnitVolume } from '../types';
import type { ModeBStreamSnapshot } from './nativeStreamingBridge';
import { isStudioElementReadOnly } from './studioCanvasGesture';
import {
  normalizeScreenCaptureRotation,
  parseSafeNumericNominal,
  type ScreenCaptureQuarterRotation,
} from './studioElementCatalog';

export { normalizeScreenCaptureRotation, type ScreenCaptureQuarterRotation };

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

export function shouldShowViewerLiveBadge(
  liveBadgeProp: unknown,
  hasLiveSample: boolean,
): boolean {
  return liveBadgeProp !== false && hasLiveSample;
}

export function extractLikeIncrementFromEvent(event: StreamEvent | null | undefined): number {
  if (!event || event.type !== 'like') return 0;
  if (typeof event.likeCount === 'number' && Number.isFinite(event.likeCount) && event.likeCount > 0) {
    return Math.floor(event.likeCount);
  }
  // When totalLikeCount is set without likeCount, event.amount carries cumulative total, NOT an increment
  if (
    typeof event.totalLikeCount === 'number' &&
    Number.isFinite(event.totalLikeCount) &&
    event.totalLikeCount >= 0
  ) {
    return 0;
  }
  if (typeof event.amount === 'number' && Number.isFinite(event.amount) && event.amount > 0) {
    return Math.floor(event.amount);
  }
  return 1;
}

export function applyLikeEventToCount(
  currentCount: number,
  event: StreamEvent | null | undefined,
): number {
  const safeCurrent =
    typeof currentCount === 'number' && Number.isFinite(currentCount) && currentCount > 0
      ? Math.floor(currentCount)
      : 0;
  if (!event || event.type !== 'like') {
    return safeCurrent;
  }
  if (
    typeof event.totalLikeCount === 'number' &&
    Number.isFinite(event.totalLikeCount) &&
    event.totalLikeCount >= 0
  ) {
    return Math.floor(event.totalLikeCount);
  }
  return safeCurrent + extractLikeIncrementFromEvent(event);
}

export function deriveInitialLikeCountFromHistory(events: readonly StreamEvent[]): number {
  const chronological = [...deduplicateStreamEvents(events, 200)].reverse();
  let count = 0;
  for (const event of chronological) {
    count = applyLikeEventToCount(count, event);
  }
  return count;
}

export function shouldPlayEventAlertSound(
  properties: Record<string, unknown> | undefined | null,
): boolean {
  if (!properties || typeof properties !== 'object') return true;
  if (properties.soundEnabled === false || properties.soundEffect === false) {
    return false;
  }
  return true;
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

const AUDIENCE_USER_EVENT_TYPES = new Set<StreamEvent['type']>([
  'chat',
  'gift',
  'like',
  'follow',
  'share',
  'join',
  'donation',
]);

export function resolveLatestAudienceUserEvent(
  events: readonly StreamEvent[],
): StreamEvent | null {
  for (const event of events) {
    if (!event || !AUDIENCE_USER_EVENT_TYPES.has(event.type)) continue;
    if (typeof event.username === 'string' && event.username.trim().length > 0) {
      return event;
    }
  }
  return null;
}

export function getLatestAudienceUsernameFromHistory(
  events: readonly StreamEvent[],
): string | null {
  const latest = resolveLatestAudienceUserEvent(events);
  return latest ? latest.username.trim() : null;
}

export interface StudioChatItem {
  id: string;
  user: string;
  text: string;
  badge?: string;
}

export function buildChatMessagesFromHistory(
  events: readonly StreamEvent[],
  maxItems = 20,
): StudioChatItem[] {
  const safeMax = Math.max(1, Math.min(50, Math.floor(maxItems)));
  const uniqueEvents = deduplicateStreamEvents(events, 50);
  const chronologicalChats = [...uniqueEvents]
    .reverse()
    .filter(
      (event) =>
        event.type === 'chat' &&
        typeof event.username === 'string' &&
        event.username.trim().length > 0 &&
        typeof event.detail === 'string' &&
        event.detail.trim().length > 0,
    );

  return chronologicalChats.slice(-safeMax).map((event) => ({
    id: event.id,
    user: event.username.trim(),
    text: event.detail.trim(),
    badge: 'LIVE',
  }));
}

export function appendChatMessageFromEvent(
  prev: readonly StudioChatItem[],
  event: StreamEvent,
  maxItems = 20,
): StudioChatItem[] {
  if (
    !event ||
    event.type !== 'chat' ||
    typeof event.username !== 'string' ||
    !event.username.trim() ||
    typeof event.detail !== 'string' ||
    !event.detail.trim()
  ) {
    return [...prev];
  }
  const safeMax = Math.max(1, Math.min(50, Math.floor(maxItems)));
  const entryId =
    typeof event.id === 'string' && event.id.trim()
      ? event.id.trim()
      : `c_${event.timestamp || Date.now()}`;
  if (prev.some((item) => item.id === entryId)) {
    return [...prev];
  }
  return [
    ...prev,
    {
      id: entryId,
      user: event.username.trim(),
      text: event.detail.trim(),
      badge: 'LIVE',
    },
  ].slice(-safeMax);
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
  const latest = resolveLatestAudienceUserEvent(events);

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

  // Must strictly inspect the SAME latest audience interaction event (never pair an older user's avatar with the latest username)
  const latestUserEvent = resolveLatestAudienceUserEvent(events);

  if (!latestUserEvent) {
    return {
      avatarUrl: null,
      username: null,
      initial: null,
      shape,
      borderGlow,
    };
  }

  const cleanName = latestUserEvent.username.trim();
  const initial = cleanName ? cleanName.replace(/^@+/, '').charAt(0).toUpperCase() || '?' : '?';

  return {
    avatarUrl: isSafeImageSrc(latestUserEvent.userAvatar)
      ? latestUserEvent.userAvatar.trim()
      : null,
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

export function applyMediaReplacementToElements(params: {
  elements: readonly StudioElement[];
  selectedElement: StudioElement | null | undefined;
  url: string;
  assetId?: string;
  assetUri?: string;
  isElementGroupLocked: boolean;
  isStrictModeBLocked: boolean;
}): { applied: boolean; elements: StudioElement[] } {
  const {
    elements,
    selectedElement,
    url,
    assetId,
    assetUri,
    isElementGroupLocked,
    isStrictModeBLocked,
  } = params;

  if (
    !selectedElement ||
    isStudioElementReadOnly({
      elementLocked: selectedElement.locked,
      isElementGroupLocked,
      isStrictModeBLocked,
    })
  ) {
    return { applied: false, elements: [...elements] };
  }

  if (
    selectedElement.type !== 'image' &&
    selectedElement.type !== 'sticker' &&
    selectedElement.type !== 'video'
  ) {
    return { applied: false, elements: [...elements] };
  }

  const resolvedUrl = assetUri || url;
  let matched = false;
  const updated = elements.map((elem) => {
    if (elem.id !== selectedElement.id || elem.locked) return elem;
    matched = true;
    const nextProps = { ...elem.properties };
    if (selectedElement.type === 'image' || selectedElement.type === 'sticker') {
      nextProps.imageUrl = resolvedUrl;
      if (assetId) nextProps.imageAssetId = assetId;
      else delete nextProps.imageAssetId;
    } else {
      nextProps.videoUrl = resolvedUrl;
      if (assetId) nextProps.videoAssetId = assetId;
      else delete nextProps.videoAssetId;
    }
    return { ...elem, properties: nextProps };
  });

  return { applied: matched, elements: updated };
}

function parseRgbChannelsFromColor(color: unknown): { r: number; g: number; b: number } | null {
  if (typeof color !== 'string') return null;
  const trimmed = color.trim();
  if (!trimmed) return null;

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:\d*\.?\d+))?\s*\)$/i,
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return {
        r: Math.min(255, Math.max(0, Math.round(r))),
        g: Math.min(255, Math.max(0, Math.round(g))),
        b: Math.min(255, Math.max(0, Math.round(b))),
      };
    }
  }

  const hex6 = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const hex = hex6[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const hex3 = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const hex = hex3[1];
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }

  return null;
}

function parseAlphaPercentFromRgba(color: unknown): number | null {
  if (typeof color !== 'string') return null;
  const match = color
    .trim()
    .match(/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(\d*\.?\d+)\s*\)$/i);
  if (!match) return null;
  const alpha = Number(match[1]);
  if (!Number.isFinite(alpha)) return null;
  return Math.min(100, Math.max(0, Math.round(alpha * 100)));
}

export function clampChatMessageOpacity(rawValue: unknown, fallback = 85): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? Math.min(100, Math.max(10, Math.round(fallback)))
      : 85;

  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) return safeFallback;
    return Math.min(100, Math.max(10, Math.round(rawValue)));
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return safeFallback;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return safeFallback;
    return Math.min(100, Math.max(10, Math.round(parsed)));
  }

  return safeFallback;
}

export function resolveChatMessageBackground(
  props: Record<string, unknown> | undefined | null,
): { bgOpacity: number; backgroundColor: string } {
  const safeProps = props && typeof props === 'object' ? props : {};
  const hasNumericBgOpacity =
    typeof safeProps.bgOpacity === 'number' && Number.isFinite(safeProps.bgOpacity);
  const rawBackgroundColor =
    typeof safeProps.backgroundColor === 'string' ? safeProps.backgroundColor.trim() : '';

  if (hasNumericBgOpacity) {
    const bgOpacity = clampChatMessageOpacity(safeProps.bgOpacity, 85);
    const alpha = Number((bgOpacity / 100).toFixed(2));
    const rgb = parseRgbChannelsFromColor(rawBackgroundColor);
    if (rgb) {
      return {
        bgOpacity,
        backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`,
      };
    }
    if (rawBackgroundColor) {
      return {
        bgOpacity,
        backgroundColor: rawBackgroundColor,
      };
    }
    return {
      bgOpacity,
      backgroundColor: `rgba(12, 14, 18, ${alpha})`,
    };
  }

  if (rawBackgroundColor) {
    const parsedAlpha = parseAlphaPercentFromRgba(rawBackgroundColor);
    const bgOpacity = clampChatMessageOpacity(parsedAlpha ?? 85, 85);
    return {
      bgOpacity,
      backgroundColor: rawBackgroundColor,
    };
  }

  return {
    bgOpacity: 85,
    backgroundColor: 'rgba(12, 14, 18, 0.85)',
  };
}

export function buildChatMessageBgOpacityPatch(
  currentProps: Record<string, unknown> | undefined | null,
  rawOpacity: unknown,
): { bgOpacity: number; backgroundColor: string } {
  const safeProps = currentProps && typeof currentProps === 'object' ? currentProps : {};
  const current = resolveChatMessageBackground(safeProps);
  const nextOpacity = clampChatMessageOpacity(rawOpacity, current.bgOpacity);
  const rgb =
    parseRgbChannelsFromColor(safeProps.backgroundColor) ??
    parseRgbChannelsFromColor(current.backgroundColor) ?? { r: 15, g: 19, b: 27 };
  const alpha = Number((nextOpacity / 100).toFixed(2));

  return {
    bgOpacity: nextOpacity,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`,
  };
}

export type CameraFacingMode = 'user' | 'environment';

export interface CameraPreviewTrackLike {
  stop: () => void;
}

export interface CameraPreviewStreamLike {
  getTracks: () => CameraPreviewTrackLike[];
}

export interface CameraPreviewControllerDeps<TStream extends CameraPreviewStreamLike> {
  isMounted: () => boolean;
  hasCameraElement: (elemId: string) => boolean;
  getFacingMode: (elemId: string, requestedFacingMode?: CameraFacingMode) => CameraFacingMode;
  getActiveStream: (elemId: string) => TStream | undefined;
  setActiveStream: (elemId: string, stream: TStream | null) => void;
  attachStreamToVideo?: (elemId: string, stream: TStream | null) => void;
  hasMediaDevices: () => boolean;
  requestMediaStream: (facingMode: CameraFacingMode) => Promise<TStream>;
  onUnsupported: () => void;
  onError: (err: unknown) => void;
  requestSeqMap?: Record<string, number>;
}

export interface CameraPreviewTransitionResult {
  started: boolean;
  reason: 'started' | 'stopped' | 'stale' | 'unsupported' | 'error';
  facingMode?: CameraFacingMode;
}

function stopCameraStreamTracks(stream: CameraPreviewStreamLike | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  } catch {}
}

export function createCameraPreviewController<TStream extends CameraPreviewStreamLike>(
  deps: CameraPreviewControllerDeps<TStream>,
) {
  const seqMap = deps.requestSeqMap ?? {};

  const nextRequestSeq = (elemId: string): number => {
    const next = (seqMap[elemId] ?? 0) + 1;
    seqMap[elemId] = next;
    return next;
  };

  const stopCameraPreview = (elemId: string): void => {
    nextRequestSeq(elemId);
    const existing = deps.getActiveStream(elemId);
    if (existing) {
      stopCameraStreamTracks(existing);
    }
    deps.setActiveStream(elemId, null);
    deps.attachStreamToVideo?.(elemId, null);
  };

  const startCameraPreview = async (
    elemId: string,
    requestedFacingMode?: CameraFacingMode,
  ): Promise<CameraPreviewTransitionResult> => {
    const requestId = nextRequestSeq(elemId);
    const existing = deps.getActiveStream(elemId);
    if (existing) {
      stopCameraStreamTracks(existing);
      deps.setActiveStream(elemId, null);
      deps.attachStreamToVideo?.(elemId, null);
    }

    if (!deps.hasMediaDevices()) {
      if (deps.isMounted() && seqMap[elemId] === requestId) {
        deps.onUnsupported();
      }
      return { started: false, reason: 'unsupported' };
    }

    const facing = deps.getFacingMode(elemId, requestedFacingMode);
    try {
      const stream = await deps.requestMediaStream(facing);

      if (!deps.isMounted() || seqMap[elemId] !== requestId || !deps.hasCameraElement(elemId)) {
        stopCameraStreamTracks(stream);
        return { started: false, reason: 'stale' };
      }

      const concurrent = deps.getActiveStream(elemId);
      if (concurrent && concurrent !== stream) {
        stopCameraStreamTracks(concurrent);
      }

      deps.setActiveStream(elemId, stream);
      deps.attachStreamToVideo?.(elemId, stream);
      return { started: true, reason: 'started', facingMode: facing };
    } catch (err) {
      if (seqMap[elemId] === requestId) {
        const leftover = deps.getActiveStream(elemId);
        if (leftover) {
          stopCameraStreamTracks(leftover);
        }
        deps.setActiveStream(elemId, null);
        deps.attachStreamToVideo?.(elemId, null);
        if (deps.isMounted()) {
          deps.onError(err);
        }
      }
      return { started: false, reason: 'error' };
    }
  };

  const restartCameraPreview = async (
    elemId: string,
    nextFacingMode: CameraFacingMode,
  ): Promise<CameraPreviewTransitionResult> => {
    return startCameraPreview(elemId, nextFacingMode);
  };

  const toggleCameraPreview = async (
    elemId: string,
    requestedFacingMode?: CameraFacingMode,
  ): Promise<CameraPreviewTransitionResult> => {
    const existing = deps.getActiveStream(elemId);
    if (existing) {
      stopCameraPreview(elemId);
      return { started: false, reason: 'stopped' };
    }
    return startCameraPreview(elemId, requestedFacingMode);
  };

  const invalidateCameraRequests = (elemIds?: readonly string[]): void => {
    const keys = elemIds ?? Object.keys(seqMap);
    for (const id of keys) {
      nextRequestSeq(id);
    }
  };

  return {
    startCameraPreview,
    stopCameraPreview,
    restartCameraPreview,
    toggleCameraPreview,
    invalidateCameraRequests,
  };
}

export function normalizeElementRotationForType(type: string, value: unknown): number {
  if (type === 'screen_capture') {
    return normalizeScreenCaptureRotation(value);
  }
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(360, Math.round(numeric)));
}

export interface ScreenCaptureTrackLike {
  stop: () => void;
  onended?: ((this: any, ev: Event) => any) | null;
}

export interface ScreenCaptureStreamLike {
  getTracks: () => ScreenCaptureTrackLike[];
  getVideoTracks?: () => ScreenCaptureTrackLike[];
}

export interface ScreenCapturePreviewRequestState {
  seq: number;
  ownerElemId?: string;
  presetId?: string;
}

export interface ScreenCapturePreviewControllerDeps<TStream extends ScreenCaptureStreamLike> {
  isMounted: () => boolean;
  getActivePresetId: () => string | undefined;
  resolveOwnerElementId?: (requestedElemId?: string) => string | undefined;
  hasScreenCaptureElement: (elemId?: string) => boolean;
  getActiveStream: () => TStream | null | undefined;
  setActiveStream: (stream: TStream | null, ownerElemId?: string | null) => void;
  attachStreamToVideo?: (stream: TStream | null) => void;
  hasDisplayMedia: () => boolean;
  requestDisplayMedia: () => Promise<TStream>;
  onUnsupported: () => void;
  onCancelled?: () => void;
  onError: (err: unknown) => void;
  requestState?: ScreenCapturePreviewRequestState;
}

export interface ScreenCapturePreviewTransitionResult {
  started: boolean;
  reason: 'started' | 'stopped' | 'stale' | 'unsupported' | 'cancelled' | 'error';
  ownerElemId?: string;
  presetId?: string;
}

function stopScreenCaptureStreamTracks(stream: ScreenCaptureStreamLike | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  } catch {}
}

export function isScreenCaptureCancelledError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybeErr = err as { name?: unknown; message?: unknown };
  const name = typeof maybeErr.name === 'string' ? maybeErr.name.trim() : '';
  if (name === 'AbortError') return true;
  const message = typeof maybeErr.message === 'string' ? maybeErr.message : '';
  return /\b(?:cancel|canceled|cancelled|aborted|dismiss|dismissed)\b/i.test(message);
}

export function createScreenCapturePreviewController<TStream extends ScreenCaptureStreamLike>(
  deps: ScreenCapturePreviewControllerDeps<TStream>,
) {
  const state: ScreenCapturePreviewRequestState = deps.requestState ?? { seq: 0 };

  const stopScreenCapturePreview = (): void => {
    state.seq += 1;
    state.ownerElemId = undefined;
    state.presetId = undefined;
    const existing = deps.getActiveStream();
    if (existing) {
      stopScreenCaptureStreamTracks(existing);
    }
    deps.setActiveStream(null, null);
    deps.attachStreamToVideo?.(null);
  };

  const invalidatePendingRequests = (): void => {
    state.seq += 1;
  };

  const isRequestValid = (
    requestId: number,
    ownerElemId: string | undefined,
    startPresetId: string | undefined,
  ): boolean => {
    return (
      deps.isMounted() &&
      state.seq === requestId &&
      deps.hasScreenCaptureElement(ownerElemId) &&
      deps.getActivePresetId() === startPresetId
    );
  };

  const startScreenCapturePreview = async (
    requestedElemId?: string,
  ): Promise<ScreenCapturePreviewTransitionResult> => {
    const requestId = ++state.seq;
    const ownerElemId = deps.resolveOwnerElementId
      ? deps.resolveOwnerElementId(requestedElemId)
      : requestedElemId;
    const startPresetId = deps.getActivePresetId();
    state.ownerElemId = ownerElemId;
    state.presetId = startPresetId;

    const existing = deps.getActiveStream();
    if (existing) {
      stopScreenCaptureStreamTracks(existing);
      deps.setActiveStream(null, null);
      deps.attachStreamToVideo?.(null);
    }

    if (!deps.hasDisplayMedia()) {
      if (deps.isMounted() && state.seq === requestId) {
        deps.onUnsupported();
      }
      return { started: false, reason: 'unsupported' };
    }

    if (!deps.hasScreenCaptureElement(ownerElemId)) {
      return { started: false, reason: 'stale' };
    }

    try {
      const stream = await deps.requestDisplayMedia();

      if (!isRequestValid(requestId, ownerElemId, startPresetId)) {
        stopScreenCaptureStreamTracks(stream);
        return { started: false, reason: 'stale' };
      }

      const concurrent = deps.getActiveStream();
      if (concurrent && concurrent !== stream) {
        stopScreenCaptureStreamTracks(concurrent);
      }

      const videoTracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
      const primaryTrack = videoTracks[0] ?? stream.getTracks()[0];
      if (primaryTrack) {
        primaryTrack.onended = () => {
          if (deps.getActiveStream() !== stream) {
            return;
          }
          stopScreenCaptureStreamTracks(stream);
          deps.setActiveStream(null, null);
          deps.attachStreamToVideo?.(null);
        };
      }

      deps.setActiveStream(stream, ownerElemId ?? null);
      deps.attachStreamToVideo?.(stream);
      return {
        started: true,
        reason: 'started',
        ownerElemId,
        presetId: startPresetId,
      };
    } catch (err) {
      if (state.seq === requestId) {
        const leftover = deps.getActiveStream();
        if (leftover) {
          stopScreenCaptureStreamTracks(leftover);
        }
        deps.setActiveStream(null, null);
        deps.attachStreamToVideo?.(null);

        if (isRequestValid(requestId, ownerElemId, startPresetId)) {
          if (isScreenCaptureCancelledError(err)) {
            deps.onCancelled?.();
            return { started: false, reason: 'cancelled' };
          }
          deps.onError(err);
          return { started: false, reason: 'error' };
        }
      }
      return { started: false, reason: 'stale' };
    }
  };

  const handleToggleScreenCapture = async (
    requestedElemId?: string,
  ): Promise<ScreenCapturePreviewTransitionResult> => {
    const existing = deps.getActiveStream();
    if (existing) {
      stopScreenCapturePreview();
      return { started: false, reason: 'stopped' };
    }
    return startScreenCapturePreview(requestedElemId);
  };

  return {
    startScreenCapturePreview,
    stopScreenCapturePreview,
    handleToggleScreenCapture,
    invalidatePendingRequests,
  };
}

export const SUPPORTED_LOCAL_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'] as const;
export const MAX_LOCAL_AUDIO_FILE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MANUAL_AUDIO_URL =
  'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg';

export interface LocalAudioSessionCacheEntry {
  assetId: string;
  file: File;
}

export interface PersistedStudioAudioAssetLike {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  sizeBytes?: number;
  addedAt?: number;
  blob?: Blob;
}

export type LocalAudioFileValidationResult =
  | { valid: true; mimeType: string }
  | { valid: false; title: string; message: string };

const AUDIO_EXTENSION_MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

export function inferLocalAudioMimeType(fileName: string, rawMimeType?: string): string {
  const cleanMime = typeof rawMimeType === 'string' ? rawMimeType.trim().toLowerCase() : '';
  if (cleanMime.startsWith('audio/')) {
    return cleanMime;
  }
  const lowerName = typeof fileName === 'string' ? fileName.trim().toLowerCase() : '';
  for (const [ext, mime] of Object.entries(AUDIO_EXTENSION_MIME_MAP)) {
    if (lowerName.endsWith(ext)) {
      return mime;
    }
  }
  return 'audio/mpeg';
}

export function validateLocalAudioFile(
  file: Pick<File, 'name' | 'size' | 'type'> | null | undefined,
): LocalAudioFileValidationResult {
  if (!file) {
    return {
      valid: false,
      title: 'File Audio Tidak Valid',
      message: 'Tidak ada file audio yang dipilih.',
    };
  }
  const lowerName = typeof file.name === 'string' ? file.name.trim().toLowerCase() : '';
  const cleanMime = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
  const isAudioFormat =
    cleanMime.startsWith('audio/') ||
    SUPPORTED_LOCAL_AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  if (!isAudioFormat) {
    return {
      valid: false,
      title: 'Format Audio Tidak Didukung',
      message: 'Harap pilih file audio MP3, WAV, OGG, M4A, atau AAC.',
    };
  }

  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      title: 'File Audio Kosong',
      message: 'File audio kosong atau rusak. Harap pilih file audio yang valid.',
    };
  }

  if (file.size > MAX_LOCAL_AUDIO_FILE_BYTES) {
    return {
      valid: false,
      title: 'Ukuran Audio Terlalu Besar',
      message: 'Ukuran maksimum file audio lokal adalah 20 MB.',
    };
  }

  return {
    valid: true,
    mimeType: inferLocalAudioMimeType(file.name, file.type),
  };
}

export function shouldApplyDefaultAudioTitle(currentTitle: unknown): boolean {
  if (typeof currentTitle !== 'string') return true;
  const trimmed = currentTitle.trim();
  return (
    !trimmed ||
    trimmed === 'Audio Manual (BGM)' ||
    trimmed === 'Audio Manual Track' ||
    trimmed === 'Audio Latar Belakang'
  );
}

export function buildLocalAudioSelectionPatch(params: {
  element: Pick<StudioElement, 'properties'>;
  assetId: string;
  fileName: string;
  fileSize: number;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    audioAssetId: params.assetId,
    localFileName: params.fileName,
    localFileSize: params.fileSize,
    audioSourceType: 'local',
  };
  if (shouldApplyDefaultAudioTitle(params.element.properties?.title)) {
    const cleanTitle = params.fileName.replace(/\.[^/.]+$/, '').trim();
    if (cleanTitle) {
      patch.title = cleanTitle;
    }
  }
  return patch;
}

export function buildClearLocalAudioPatch(
  extraPatch?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    audioAssetId: '',
    localFileName: '',
    localFileSize: undefined,
    audioSourceType: 'url',
    ...extraPatch,
  };
}

export type PersistLocalAudioResult =
  | {
      saved: true;
      assetId: string;
      mimeType: string;
      patch: Record<string, unknown>;
    }
  | {
      saved: false;
      reason: 'readonly' | 'invalid' | 'storage_error';
      title: string;
      message: string;
    };

export async function persistLocalAudioFileForElement(params: {
  element: Pick<StudioElement, 'id' | 'type' | 'locked' | 'properties'>;
  file: File;
  isElementGroupLocked: boolean;
  isStrictModeBLocked: boolean;
  saveStudioMediaAsset: (input: {
    name: string;
    type: 'audio';
    mimeType: string;
    blob: Blob;
  }) => Promise<PersistedStudioAudioAssetLike>;
}): Promise<PersistLocalAudioResult> {
  if (
    params.element.type !== 'audio' ||
    isStudioElementReadOnly({
      elementLocked: params.element.locked,
      isElementGroupLocked: params.isElementGroupLocked,
      isStrictModeBLocked: params.isStrictModeBLocked,
    })
  ) {
    return {
      saved: false,
      reason: 'readonly',
      title: 'Elemen Terkunci',
      message: 'Buka kunci elemen atau hentikan mode live ketat sebelum mengubah file audio.',
    };
  }

  const validation = validateLocalAudioFile(params.file);
  if (!validation.valid) {
    return {
      saved: false,
      reason: 'invalid',
      title: validation.title,
      message: validation.message,
    };
  }

  try {
    const savedAsset = await params.saveStudioMediaAsset({
      name: params.file.name,
      type: 'audio',
      mimeType: validation.mimeType,
      blob: params.file,
    });

    if (!savedAsset || typeof savedAsset.id !== 'string' || !savedAsset.id.trim()) {
      return {
        saved: false,
        reason: 'storage_error',
        title: 'Gagal Menyimpan Audio Lokal',
        message: 'Penyimpanan aset audio lokal tidak mengembalikan ID aset yang valid.',
      };
    }

    const patch = buildLocalAudioSelectionPatch({
      element: params.element,
      assetId: savedAsset.id,
      fileName: params.file.name,
      fileSize: params.file.size,
    });

    return {
      saved: true,
      assetId: savedAsset.id,
      mimeType: savedAsset.mimeType || validation.mimeType,
      patch,
    };
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : 'File audio gagal disimpan ke penyimpanan lokal perangkat.';
    return {
      saved: false,
      reason: 'storage_error',
      title: 'Gagal Menyimpan Audio Lokal',
      message: detail,
    };
  }
}

export type ResolvedAudioPlaybackSource =
  | {
      kind: 'local_file';
      assetId: string;
      file: File;
      restoredFromStorage: boolean;
    }
  | {
      kind: 'missing_local_asset';
      title: string;
      message: string;
    }
  | {
      kind: 'url';
      audioUrl: string;
    };

export async function resolveManualAudioPlaybackSource(params: {
  element: Pick<StudioElement, 'id' | 'properties'>;
  getCachedFile?: (elemId: string, assetId: string) => File | undefined;
  loadAudioAssetsByIds: (ids: string[]) => Promise<PersistedStudioAudioAssetLike[]>;
}): Promise<ResolvedAudioPlaybackSource> {
  const props = params.element.properties || {};
  const sourceType = props.audioSourceType;

  if (sourceType === 'local') {
    const rawAssetId = typeof props.audioAssetId === 'string' ? props.audioAssetId.trim() : '';
    if (!rawAssetId) {
      return {
        kind: 'missing_local_asset',
        title: 'File Audio Lokal Tidak Ditemukan',
        message:
          'File audio lokal belum tersimpan atau referensinya hilang. Silakan pilih ulang file audio dari perangkat.',
      };
    }

    const cachedFile = params.getCachedFile?.(params.element.id, rawAssetId);
    if (cachedFile && cachedFile.size > 0) {
      return {
        kind: 'local_file',
        assetId: rawAssetId,
        file: cachedFile,
        restoredFromStorage: false,
      };
    }

    try {
      const assets = await params.loadAudioAssetsByIds([rawAssetId]);
      const matched = Array.isArray(assets)
        ? assets.find(
            (asset) =>
              asset &&
              asset.id === rawAssetId &&
              asset.type === 'audio' &&
              asset.blob &&
              asset.blob.size > 0,
          )
        : undefined;

      if (!matched || !matched.blob) {
        return {
          kind: 'missing_local_asset',
          title: 'File Audio Lokal Hilang atau Rusak',
          message:
            'File audio lokal yang tersimpan tidak ditemukan atau sudah rusak. Silakan pilih ulang file audio dari perangkat.',
        };
      }

      const restoredName =
        (typeof props.localFileName === 'string' && props.localFileName.trim()) ||
        (typeof matched.name === 'string' && matched.name.trim()) ||
        `${rawAssetId}.mp3`;
      const restoredMime = inferLocalAudioMimeType(
        restoredName,
        matched.mimeType || matched.blob.type,
      );
      const restoredFile = new File([matched.blob], restoredName, {
        type: restoredMime,
        lastModified:
          typeof matched.addedAt === 'number' && Number.isFinite(matched.addedAt)
            ? matched.addedAt
            : Date.now(),
      });

      return {
        kind: 'local_file',
        assetId: rawAssetId,
        file: restoredFile,
        restoredFromStorage: true,
      };
    } catch {
      return {
        kind: 'missing_local_asset',
        title: 'Gagal Memuat Audio Lokal',
        message:
          'File audio lokal gagal dipulihkan dari penyimpanan perangkat. Silakan pilih ulang file audio.',
      };
    }
  }

  const audioUrl =
    typeof props.audioUrl === 'string' && props.audioUrl.trim()
      ? props.audioUrl.trim()
      : DEFAULT_MANUAL_AUDIO_URL;

  return {
    kind: 'url',
    audioUrl,
  };
}

export interface AudioEnginePlaybackLike {
  getState: () => {
    currentTrackId: string | null;
    currentTime: number;
    error?: string | null;
  };
  pause: () => void;
  play: () => Promise<void>;
  setVolume: (vol: number) => void;
  setLoop: (loop: boolean) => void;
  loadAndPlayFile: (id: string, title: string, artist: string, file: File) => Promise<boolean>;
  loadAndPlayUrl: (id: string, title: string, artist: string, url: string) => Promise<boolean>;
}

export interface PlayManualAudioElementResult {
  action: 'paused' | 'resumed' | 'played_local' | 'played_url' | 'missing_local_asset' | 'stale';
  success?: boolean;
}

export async function playManualAudioElement(params: {
  element: Pick<StudioElement, 'id' | 'name' | 'properties'>;
  isTestingAudio: boolean;
  audioEngine: AudioEnginePlaybackLike;
  setIsTestingAudio: (playing: boolean) => void;
  getCachedFile?: (elemId: string, assetId: string) => File | undefined;
  loadAudioAssetsByIds: (ids: string[]) => Promise<PersistedStudioAudioAssetLike[]>;
  onRestoredLocalFile?: (elemId: string, assetId: string, file: File) => void;
  onMissingLocalAsset: (notice: { title: string; message: string }) => void;
  isStillValidElement?: (elemId: string, assetId: string) => boolean;
}): Promise<PlayManualAudioElementResult> {
  const { element, audioEngine, setIsTestingAudio } = params;
  const current = audioEngine.getState();
  const isCurrentTrack = current.currentTrackId === element.id;

  if (isCurrentTrack && params.isTestingAudio) {
    audioEngine.pause();
    setIsTestingAudio(false);
    return { action: 'paused' };
  }

  if (isCurrentTrack && !params.isTestingAudio && current.currentTime > 0) {
    await audioEngine.play();
    setIsTestingAudio(true);
    return { action: 'resumed' };
  }

  const vol = (element.properties?.volume ?? 85) / 100;
  audioEngine.setVolume(vol);
  audioEngine.setLoop(element.properties?.loop !== false);

  const resolved = await resolveManualAudioPlaybackSource({
    element,
    getCachedFile: params.getCachedFile,
    loadAudioAssetsByIds: params.loadAudioAssetsByIds,
  });

  if (resolved.kind === 'missing_local_asset') {
    setIsTestingAudio(false);
    params.onMissingLocalAsset({
      title: resolved.title,
      message: resolved.message,
    });
    return { action: 'missing_local_asset', success: false };
  }

  const channelLabel = String(element.properties?.channel || 'bgm').toUpperCase();

  if (resolved.kind === 'local_file') {
    if (
      params.isStillValidElement &&
      !params.isStillValidElement(element.id, resolved.assetId)
    ) {
      return { action: 'stale' };
    }
    if (resolved.restoredFromStorage) {
      params.onRestoredLocalFile?.(element.id, resolved.assetId, resolved.file);
    }
    const trackTitle =
      (typeof element.properties?.title === 'string' && element.properties.title.trim()) ||
      resolved.file.name;
    const success = await audioEngine.loadAndPlayFile(
      element.id,
      trackTitle,
      `Manual Audio (${channelLabel})`,
      resolved.file,
    );
    setIsTestingAudio(success);
    if (!success) {
      params.onMissingLocalAsset({
        title: 'Gagal Memutar File Audio Lokal',
        message:
          'File audio lokal tidak dapat diputar atau berkasnya rusak. Silakan pilih ulang file audio dari perangkat.',
      });
    }
    return { action: 'played_local', success };
  }

  const trackTitle =
    (typeof element.properties?.title === 'string' && element.properties.title.trim()) ||
    element.name;
  const success = await audioEngine.loadAndPlayUrl(
    element.id,
    trackTitle,
    `Manual Audio (${channelLabel})`,
    resolved.audioUrl,
  );
  setIsTestingAudio(success);
  return { action: 'played_url', success };
}



