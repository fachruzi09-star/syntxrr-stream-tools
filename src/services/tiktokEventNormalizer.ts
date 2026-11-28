// TikTokEventNormalizer & BoundedEventDeduplicator
// Memetakan pesan Webcast TikTok yang sudah didekode ke kontrak StreamEvent SYNTXRR.
// Tidak menyimpan histori chat secara permanen dan mengabaikan payload tak lengkap dengan aman.

import type { StreamEvent } from '../types';
import type { NativeTikTokRawEventPayload } from './nativeCompanionBridge';

export interface NormalizeOutcome {
  event: StreamEvent | null;
  viewerCount?: number;
  totalLikeCount?: number;
  roomEnded?: boolean;
  ignoredReason?: string;
}

const MAX_USERNAME_LEN = 64;
const MAX_DETAIL_LEN = 280;
const DEFAULT_DEDUP_WINDOW = 500;

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen);
}

function toSafeInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return fallback;
}

function normalizeRepeatEnd(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed !== 0;
    }
  }
  return undefined;
}

function resolveDisplayUsername(raw: NativeTikTokRawEventPayload): string {
  const handle = sanitizeText(raw.username, MAX_USERNAME_LEN);
  if (handle) return handle;
  const nick = sanitizeText(raw.nickname, MAX_USERNAME_LEN);
  if (nick) return nick;
  const uid = sanitizeText(raw.userId, 32);
  return uid ? `user_${uid}` : '';
}

function normalizeTimestamp(rawCreateTime: unknown, nowMs: number): number {
  const num = toSafeInt(rawCreateTime, 0);
  if (num <= 0) return nowMs;
  // Webcast createTime kadang dalam detik atau milidetik
  return num < 1_000_000_000_000 ? num * 1000 : num;
}

export class BoundedEventDeduplicator {
  private readonly maxEntries: number;
  private readonly seenSet = new Set<string>();
  private readonly orderQueue: string[] = [];

  constructor(maxEntries = DEFAULT_DEDUP_WINDOW) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  has(key: string): boolean {
    return this.seenSet.has(key);
  }

  markAndCheckDuplicate(key: string): boolean {
    if (!key) return false;
    if (this.seenSet.has(key)) {
      return true;
    }
    this.seenSet.add(key);
    this.orderQueue.push(key);
    while (this.orderQueue.length > this.maxEntries) {
      const oldest = this.orderQueue.shift();
      if (oldest) {
        this.seenSet.delete(oldest);
      }
    }
    return false;
  }

  clear(): void {
    this.seenSet.clear();
    this.orderQueue.length = 0;
  }

  size(): number {
    return this.seenSet.size;
  }
}

export class TikTokEventNormalizer {
  private readonly deduplicator: BoundedEventDeduplicator;
  private fallbackCounter = 0;

  constructor(maxDedupWindow = DEFAULT_DEDUP_WINDOW) {
    this.deduplicator = new BoundedEventDeduplicator(maxDedupWindow);
  }

  reset(): void {
    this.deduplicator.clear();
    this.fallbackCounter = 0;
  }

  getDedupWindowSize(): number {
    return this.deduplicator.size();
  }

  normalize(raw: NativeTikTokRawEventPayload | null | undefined, nowMs = Date.now()): NormalizeOutcome {
    if (!raw || typeof raw !== 'object' || typeof raw.method !== 'string') {
      return { event: null, ignoredReason: 'invalid_payload' };
    }

    const method = raw.method.trim();
    if (!method) {
      return { event: null, ignoredReason: 'missing_method' };
    }

    const msgId = sanitizeText(raw.msgId, 64);
    const timestamp = normalizeTimestamp(raw.createTime, nowMs);
    const username = resolveDisplayUsername(raw);
    const userId = sanitizeText(raw.userId, 48) || undefined;
    const userAvatar = sanitizeText(raw.avatarUrl, 300) || undefined;

    if (method === 'WebcastControlMessage') {
      const controlAction = toSafeInt(raw.controlAction, 0);
      return {
        event: null,
        roomEnded: controlAction === 3,
        ignoredReason: controlAction === 3 ? 'live_ended' : 'control_message',
      };
    }

    if (method === 'WebcastRoomUserSeqMessage') {
      if (raw.viewerCount === undefined || raw.viewerCount === null) {
        return { event: null, ignoredReason: 'missing_viewer_count' };
      }
      const viewerCount = toSafeInt(raw.viewerCount, 0);
      const dedupKey = msgId
        ? `viewer:${msgId}:${viewerCount}`
        : `viewer_ts:${timestamp}:${viewerCount}`;
      if (msgId && this.deduplicator.markAndCheckDuplicate(dedupKey)) {
        return { event: null, viewerCount, ignoredReason: 'duplicate' };
      }
      const id = msgId ? `tt_viewer_${msgId}` : `tt_viewer_${timestamp}_${++this.fallbackCounter}`;
      return {
        viewerCount,
        event: {
          id,
          type: 'viewer',
          username: 'TikTok LIVE',
          detail: `${viewerCount.toLocaleString('id-ID')} penonton aktif`,
          amount: viewerCount,
          viewerCount,
          timestamp,
          isSimulation: false,
        },
      };
    }

    if (method === 'WebcastChatMessage' || method === 'WebcastEmoteChatMessage') {
      const content = sanitizeText(raw.content, MAX_DETAIL_LEN);
      if (!content) {
        return { event: null, ignoredReason: 'empty_chat' };
      }
      if (!username) {
        return { event: null, ignoredReason: 'missing_chat_sender' };
      }
      const dedupKey = msgId ? `chat:${msgId}` : '';
      if (dedupKey && this.deduplicator.markAndCheckDuplicate(dedupKey)) {
        return { event: null, ignoredReason: 'duplicate' };
      }
      const id = msgId ? `tt_chat_${msgId}` : `tt_chat_${timestamp}_${++this.fallbackCounter}`;
      return {
        event: {
          id,
          type: 'chat',
          username,
          userId,
          userAvatar,
          detail: content,
          timestamp,
          isSimulation: false,
        },
      };
    }

    if (method === 'WebcastGiftMessage') {
      const giftId = sanitizeText(raw.giftId, 48);
      const giftName = sanitizeText(raw.giftName, 80) || (giftId ? `Gift #${giftId}` : '');
      if (!giftId && !giftName) {
        return { event: null, ignoredReason: 'incomplete_gift' };
      }
      const repeatCount = Math.max(1, toSafeInt(raw.repeatCount, 1));
      const repeatEnd = normalizeRepeatEnd(raw.repeatEnd);
      const diamondCount = toSafeInt(raw.diamondCount, 0);
      const giftImage = sanitizeText(raw.giftImage, 320) || undefined;
      const totalDiamonds = diamondCount > 0 ? diamondCount * repeatCount : undefined;

      // Sertakan repeatCount dalam kunci dedup agar combo/streak naik tetap diteruskan,
      // sementara replay frame identik tetap tersaring.
      const dedupKey = msgId ? `gift:${msgId}:${giftId || giftName}:${repeatCount}` : '';
      if (dedupKey && this.deduplicator.markAndCheckDuplicate(dedupKey)) {
        return { event: null, ignoredReason: 'duplicate' };
      }

      const id = msgId
        ? `tt_gift_${msgId}_x${repeatCount}`
        : `tt_gift_${timestamp}_${++this.fallbackCounter}`;
      const sender = username || 'Penonton LIVE';
      const detail =
        repeatCount > 1
          ? `mengirim ${repeatCount}x ${giftName}`
          : `mengirim ${giftName}`;

      return {
        event: {
          id,
          type: 'gift',
          username: sender,
          userId,
          userAvatar,
          detail,
          amount: totalDiamonds ?? repeatCount,
          currency: totalDiamonds !== undefined ? 'Koin' : 'Gift',
          giftId: giftId || undefined,
          giftName,
          repeatCount,
          ...(repeatEnd !== undefined ? { repeatEnd } : {}),
          diamondCount,
          giftImage,
          timestamp,
          isSimulation: false,
        },
      };
    }

    if (method === 'WebcastLikeMessage') {
      const likeCount = toSafeInt(raw.likeCount, 0);
      const totalLikeCount = toSafeInt(raw.totalLikeCount, 0);
      if (likeCount <= 0 && totalLikeCount <= 0) {
        return { event: null, ignoredReason: 'empty_like' };
      }
      const dedupKey = msgId ? `like:${msgId}:${likeCount}:${totalLikeCount}` : '';
      if (dedupKey && this.deduplicator.markAndCheckDuplicate(dedupKey)) {
        return { event: null, totalLikeCount: totalLikeCount || undefined, ignoredReason: 'duplicate' };
      }
      const id = msgId ? `tt_like_${msgId}` : `tt_like_${timestamp}_${++this.fallbackCounter}`;
      const sender = username || 'Penonton LIVE';
      const detail =
        likeCount > 0
          ? `mengirim ${likeCount} tap layar`
          : `total ${totalLikeCount.toLocaleString('id-ID')} like`;
      return {
        totalLikeCount: totalLikeCount > 0 ? totalLikeCount : undefined,
        event: {
          id,
          type: 'like',
          username: sender,
          userId,
          userAvatar,
          detail,
          amount: likeCount > 0 ? likeCount : totalLikeCount,
          likeCount: likeCount > 0 ? likeCount : undefined,
          totalLikeCount: totalLikeCount > 0 ? totalLikeCount : undefined,
          timestamp,
          isSimulation: false,
        },
      };
    }

    if (method === 'WebcastSocialMessage') {
      const action = toSafeInt(raw.action, 0);
      const displayKey = sanitizeText(raw.displayKey, 80).toLowerCase();
      let socialType: 'follow' | 'share' | null = null;

      if (action === 3 || displayKey.includes('share')) {
        socialType = 'share';
      } else if (action === 1 || displayKey.includes('follow')) {
        socialType = 'follow';
      }

      if (!socialType) {
        return { event: null, ignoredReason: 'unknown_social_action' };
      }

      const dedupKey = msgId ? `social:${socialType}:${msgId}` : '';
      if (dedupKey && this.deduplicator.markAndCheckDuplicate(dedupKey)) {
        return { event: null, ignoredReason: 'duplicate' };
      }
      const id = msgId
        ? `tt_${socialType}_${msgId}`
        : `tt_${socialType}_${timestamp}_${++this.fallbackCounter}`;
      const sender = username || 'Penonton LIVE';

      return {
        event: {
          id,
          type: socialType,
          username: sender,
          userId,
          userAvatar,
          detail:
            socialType === 'follow'
              ? 'mulai mengikuti siaran Anda'
              : 'membagikan siaran LIVE Anda',
          timestamp,
          isSimulation: false,
        },
      };
    }

    if (method === 'WebcastMemberMessage') {
      const action = toSafeInt(raw.action, 0);
      if (action !== 1) {
        return {
          event: null,
          ignoredReason: action === 3 ? 'member_subscribed' : 'unknown_member_action',
        };
      }
      if (!username) {
        return { event: null, ignoredReason: 'missing_member_username' };
      }
      const dedupKey = msgId ? `join:${msgId}` : '';
      if (dedupKey && this.deduplicator.markAndCheckDuplicate(dedupKey)) {
        return { event: null, ignoredReason: 'duplicate' };
      }
      const id = msgId ? `tt_join_${msgId}` : `tt_join_${timestamp}_${++this.fallbackCounter}`;
      const memberCount = toSafeInt(raw.memberCount, 0);
      return {
        viewerCount: memberCount > 0 ? memberCount : undefined,
        event: {
          id,
          type: 'join',
          username,
          userId,
          userAvatar,
          detail: 'bergabung ke siaran LIVE',
          viewerCount: memberCount > 0 ? memberCount : undefined,
          timestamp,
          isSimulation: false,
        },
      };
    }

    return { event: null, ignoredReason: `unmapped_method:${method}` };
  }
}
