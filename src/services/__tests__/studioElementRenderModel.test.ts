// Unit tests for Studio Fase 1B Tahap 2: Complete Studio Renderer Helpers
// Run in the project environment with: bun run src/services/__tests__/studioElementRenderModel.test.ts

import type { StreamEvent, StudioElement } from '../../types';
import { normalizeStudioElementProperties } from '../studioElementCatalog';
import {
  appendUniqueStreamEvent,
  buildEventFeedItems,
  buildLeaderboardEntries,
  buildLiveTextRenderModel,
  computeProgressBarModel,
  deduplicateStreamEvents,
  extractLikeIncrementFromEvent,
  extractViewerCountFromEvent,
  getLatestViewerCountFromHistory,
  resolveActiveUsernameModel,
  resolveDynamicAvatarModel,
  resolveDynamicTextOutput,
  resolveSeparatorStyle,
  resolveSoundboardControlModel,
  resolveStickerVisualModel,
  resolveViewerCounterDisplay,
  validateSafeBrowserEmbedUrl,
} from '../studioElementRenderModel';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function runStudioElementRenderModelTests(): void {
  // 1. Dynamic Text: replaces known tokens and falls back cleanly when data is missing (no raw {token})
  const dynamicFilled = resolveDynamicTextOutput({
    template: 'Top Donatur: {top_donor_name} | Jam {waktu} | Target {target} | Durasi {durasi} | Hi {username}',
    fallback: 'Belum ada data siaran',
    context: {
      latestUsername: 'BudiGamer',
      targetText: 'Rp 1.000.000',
      currentTimeText: '20:15',
      durationText: '00:45:10',
      topDonorName: 'RizkyKing',
    },
  });
  assertEqual(dynamicFilled.usedFallback, false, 'dynamic text fills all available tokens');
  assertEqual(
    dynamicFilled.text,
    'Top Donatur: RizkyKing | Jam 20:15 | Target Rp 1.000.000 | Durasi 00:45:10 | Hi BudiGamer',
    'dynamic text replaces all 5 known tokens',
  );
  assert(!/\{[^}]+\}/.test(dynamicFilled.text), 'filled dynamic text has zero raw tokens');

  const dynamicMissing = resolveDynamicTextOutput({
    template: 'Top Donatur: {top_donor_name}',
    fallback: 'Belum ada donasi hari ini',
    context: {
      latestUsername: null,
      targetText: null,
      currentTimeText: '20:15',
      durationText: null,
      topDonorName: null,
    },
  });
  assertEqual(dynamicMissing.usedFallback, true, 'dynamic text uses fallback when token data is missing');
  assertEqual(dynamicMissing.text, 'Belum ada donasi hari ini', 'dynamic text returns configured fallback');
  assert(!/\{[^}]+\}/.test(dynamicMissing.text), 'fallback output never shows raw {token}');

  const dynamicUnknownToken = resolveDynamicTextOutput({
    template: 'Halo {unknown_token_xyz}',
    fallback: 'Teks aman {bad_token}',
    context: {},
  });
  assertEqual(dynamicUnknownToken.usedFallback, true, 'unknown token triggers fallback');
  assert(!/\{[^}]+\}/.test(dynamicUnknownToken.text), 'unknown token never leaks raw braces');

  // 2. Progress Bar: Rupiah strings, numbers, target 0, negative, invalid, >100% clamp (zero NaN/Infinity)
  const progRupiah = computeProgressBarModel({
    current: 'Rp 450.000',
    target: 'Rp 1.000.000',
    currency: 'Rp',
  });
  assertEqual(progRupiah.current, 450000, 'progress parses Rp 450.000');
  assertEqual(progRupiah.target, 1000000, 'progress parses Rp 1.000.000');
  assertEqual(progRupiah.percent, 45, 'progress calculates 45%');
  assertEqual(progRupiah.percentLabel, '45%', 'progress formats 45%');
  assertEqual(progRupiah.formattedCurrent, 'Rp 450.000', 'progress formats current with currency');

  const progTargetZero = computeProgressBarModel({
    currentAmount: 50000,
    targetAmount: 0,
    currency: 'Rp',
  });
  assertEqual(progTargetZero.isValidTarget, false, 'target 0 marks target invalid');
  assertEqual(progTargetZero.percent, 0, 'target 0 results in 0% instead of Infinity/NaN');
  assert(Number.isFinite(progTargetZero.percent), 'target 0 percent is finite');

  const progOverflow = computeProgressBarModel({
    currentAmount: 250000,
    targetAmount: 100000,
  });
  assertEqual(progOverflow.percent, 100, 'progress clamps >100% to 100%');

  const progNegativeAndInvalid = computeProgressBarModel({
    currentAmount: -500,
    targetAmount: 'bukan_angka',
  });
  assertEqual(progNegativeAndInvalid.current, 0, 'negative current clamps to 0');
  assertEqual(progNegativeAndInvalid.target, 0, 'invalid target becomes 0');
  assertEqual(progNegativeAndInvalid.percent, 0, 'invalid target produces 0%');
  assert(Number.isFinite(progNegativeAndInvalid.current), 'current is finite');
  assert(Number.isFinite(progNegativeAndInvalid.percent), 'percent is finite');

  // 3. Leaderboard: real gift/donation events only, topCount respected, never mixes currencies
  const mixedCurrencyEvents: StreamEvent[] = [
    {
      id: 'ev_chat_1',
      type: 'chat',
      username: 'ChatOnlyUser',
      detail: 'Halo',
      amount: 999999,
      timestamp: 100,
    },
    {
      id: 'ev_don_1',
      type: 'donation',
      username: 'SultanA',
      detail: 'Semangat!',
      amount: 100000,
      currency: 'Rp',
      timestamp: 200,
    },
    {
      id: 'ev_don_2',
      type: 'donation',
      username: 'SultanA',
      detail: 'Support lagi ($)',
      amount: 10,
      currency: 'USD',
      timestamp: 300,
    },
    {
      id: 'ev_gift_1',
      type: 'gift',
      username: 'ViewerB',
      detail: 'Mawar',
      amount: 50,
      currency: 'Koin',
      timestamp: 250,
    },
  ];

  const leaderboardEmpty = buildLeaderboardEntries([], 3);
  assertEqual(leaderboardEmpty.length, 0, 'leaderboard returns empty array when no real events exist');

  const leaderboardEntries = buildLeaderboardEntries(mixedCurrencyEvents, 2);
  assertEqual(leaderboardEntries.length, 2, 'leaderboard limits to topCount=2');
  assertEqual(leaderboardEntries[0].username, 'SultanA', 'SultanA ranks #1 by support interactions (2x)');
  assertEqual(leaderboardEntries[0].supportCount, 2, 'SultanA support count is 2');
  assertEqual(leaderboardEntries[0].lastAmount, 10, 'does NOT sum Rp 100.000 + 10 USD together');
  assertEqual(leaderboardEntries[0].lastCurrency, 'USD', 'keeps latest event currency separate');
  assertEqual(leaderboardEntries[0].formattedLastAmount, 'USD 10', 'formats latest nominal + currency separately');
  assert(
    !leaderboardEntries.some((entry) => entry.username === 'ChatOnlyUser'),
    'excludes non-gift/non-donation events',
  );

  // 4. Browser Embed URL validation: accepts http/https, rejects dangerous schemes and invalid URLs
  const validHttps = validateSafeBrowserEmbedUrl('https://syntxrr.com/widgets/preview?room=1');
  assertEqual(validHttps.isValid, true, 'accepts valid https URL');
  const validHttp = validateSafeBrowserEmbedUrl('http://localhost:8080/overlay');
  assertEqual(validHttp.isValid, true, 'accepts valid http URL');

  const badJs = validateSafeBrowserEmbedUrl('javascript:alert(1)');
  assertEqual(badJs.isValid, false, 'rejects javascript: URL');
  const badData = validateSafeBrowserEmbedUrl('data:text/html,<script>alert(1)</script>');
  assertEqual(badData.isValid, false, 'rejects data: URL');
  const badFile = validateSafeBrowserEmbedUrl('file:///etc/passwd');
  assertEqual(badFile.isValid, false, 'rejects file: URL');
  const emptyUrl = validateSafeBrowserEmbedUrl('   ');
  assertEqual(emptyUrl.isValid, false, 'rejects empty URL');
  const malformedUrl = validateSafeBrowserEmbedUrl('not a valid url');
  assertEqual(malformedUrl.isValid, false, 'rejects malformed URL');

  // 5. Viewer Count vs Like Count isolation
  const likeEvent: StreamEvent = {
    id: 'ev_like_1',
    type: 'like',
    username: 'TapUser',
    detail: 'Liked',
    amount: 25,
    timestamp: 400,
  };
  const viewerEvent: StreamEvent = {
    id: 'ev_view_1',
    type: 'viewer',
    username: 'TikTokSystem',
    detail: 'Penonton aktif',
    viewerCount: 875,
    timestamp: 410,
  };

  assertEqual(extractViewerCountFromEvent(likeEvent), null, 'like event does NOT produce viewer count');
  assertEqual(extractLikeIncrementFromEvent(viewerEvent), 0, 'viewer event does NOT increment likes');
  assertEqual(extractViewerCountFromEvent(viewerEvent), 875, 'viewer event extracts viewerCount');
  assertEqual(extractLikeIncrementFromEvent(likeEvent), 25, 'like event extracts like increment');

  assertEqual(
    getLatestViewerCountFromHistory([likeEvent]),
    null,
    'history with only like events leaves live viewer count null',
  );
  assertEqual(
    getLatestViewerCountFromHistory([likeEvent, viewerEvent]),
    875,
    'history finds real viewer event ignoring like events',
  );

  const viewerFallbackDisplay = resolveViewerCounterDisplay({
    liveViewerCount: null,
    fallbackPropertyValue: 1420,
  });
  assertEqual(viewerFallbackDisplay.formattedCount, '1.420', 'uses initial property viewerCount before viewer events');
  assertEqual(viewerFallbackDisplay.hasLiveSample, false, 'marks fallback sample as not live yet');

  const viewerLiveDisplay = resolveViewerCounterDisplay({
    liveViewerCount: 875,
    fallbackPropertyValue: 1420,
  });
  assertEqual(viewerLiveDisplay.formattedCount, '875', 'live viewer count overrides initial property fallback');
  assertEqual(viewerLiveDisplay.hasLiveSample, true, 'marks live viewer count as live sample');

  // 6. Event History deduplication: never duplicates event IDs
  const evA: StreamEvent = { id: 'dup_1', type: 'chat', username: 'U1', detail: 'Hi', timestamp: 1 };
  const evB: StreamEvent = { id: 'dup_2', type: 'follow', username: 'U2', detail: 'Followed', timestamp: 2 };
  let history = deduplicateStreamEvents([evA, evA, evB, evA], 50);
  assertEqual(history.length, 2, 'deduplicateStreamEvents removes duplicate IDs');
  history = appendUniqueStreamEvent(history, evA, 50);
  assertEqual(history.length, 2, 'appendUniqueStreamEvent ignores duplicate event ID');
  const feedItems = buildEventFeedItems(history, 2);
  assertEqual(feedItems.length, 2, 'buildEventFeedItems respects maxItems without fabricating items');

  // 7. Non-destructive normalization + local media preservation
  const legacyMediaElement: StudioElement = {
    id: 'legacy_media_1',
    name: 'Legacy Logo',
    type: 'image',
    x: 10,
    y: 10,
    width: 25,
    height: 15,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: {
      imageUrl: 'studio-media://asset_abc123',
      imageAssetId: 'asset_abc123',
      customUnknownProp: 'preserve-me',
    },
  };
  const normalizedMedia = normalizeStudioElementProperties(legacyMediaElement);
  assertEqual(
    normalizedMedia.properties.imageUrl,
    'studio-media://asset_abc123',
    'normalization preserves studio-media:// URI',
  );
  assertEqual(
    normalizedMedia.properties.imageAssetId,
    'asset_abc123',
    'normalization preserves imageAssetId',
  );
  assertEqual(
    normalizedMedia.properties.customUnknownProp,
    'preserve-me',
    'normalization preserves unknown legacy properties',
  );
  assert(normalizedMedia !== legacyMediaElement, 'normalization returns cloned element without mutating source');

  // 8. Soundboard validation, custom URL support & safe volume conversion
  const validSfx = resolveSoundboardControlModel({ presetSfx: 'horn', volume: 85 });
  assertEqual(validSfx.isSupported, true, 'validates supported presetSfx');
  assertEqual(validSfx.mode, 'synth', 'uses synth mode for presetSfx');
  assertEqual(validSfx.volumePercent, 85, 'converts percentage volume safely');

  const customSfx = resolveSoundboardControlModel({
    presetSfx: 'invalid_sfx',
    audioUrl: 'https://cdn.example.com/airhorn.mp3',
    volume: 0.7,
  });
  assertEqual(customSfx.mode, 'custom_url', 'prioritizes safe audioUrl via custom_url mode');
  assertEqual(customSfx.volumePercent, 70, 'normalizes unit volume 0.7 -> 70%');

  const invalidSfx = resolveSoundboardControlModel({ presetSfx: 'bad_sfx_name' });
  assertEqual(invalidSfx.isSupported, false, 'rejects unsupported presetSfx');

  // 9. Live Text honesty & Separator / Sticker / Username / Avatar helpers
  const notLiveStatus = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'connecting',
      message: 'Connecting...',
      isStreaming: false,
      bitrateKbps: 0,
    },
  });
  assertEqual(notLiveStatus.isLive, false, 'live_text does not claim LIVE while connecting');
  assertEqual(notLiveStatus.fpsLabel, '—', 'live_text shows — for unavailable FPS');
  assertEqual(notLiveStatus.resolutionLabel, '—', 'live_text shows — for unavailable resolution');

  const activeLiveStatus = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'live',
      message: 'Streaming',
      isStreaming: true,
      bitrateKbps: 4200,
    },
  });
  assertEqual(activeLiveStatus.isLive, true, 'live_text reports LIVE only when status=live and isStreaming=true');
  assertEqual(activeLiveStatus.bitrateLabel, '4200 kbps', 'live_text reports real Mode B bitrateKbps');

  const sepVertical = resolveSeparatorStyle({ width: 2, height: 60 }, { lineColor: '#00FF00', thickness: 4 });
  assertEqual(sepVertical.orientation, 'vertical', 'tall separator defaults to vertical orientation');
  assertEqual(sepVertical.lineColor, '#00FF00', 'separator respects lineColor');
  assertEqual(sepVertical.thickness, 4, 'separator respects thickness');

  const stickerVisual = resolveStickerVisualModel('fire', true);
  assertEqual(stickerVisual.emoji, '🔥', 'maps fire stickerId cleanly');
  assertEqual(stickerVisual.floatEffect, true, 'preserves floatEffect');

  const emptyUsername = resolveActiveUsernameModel([], { prefix: '⭐ ', badge: 'VIP' });
  assertEqual(emptyUsername.hasEvent, false, 'username shows waiting fallback when no events');
  const activeAvatar = resolveDynamicAvatarModel(
    [{ id: 'av_1', type: 'chat', username: 'Dina', userAvatar: 'https://img.example.com/a.png', detail: 'hi', timestamp: 1 }],
    { shape: 'rounded', borderGlow: false },
  );
  assertEqual(activeAvatar.avatarUrl, 'https://img.example.com/a.png', 'avatar reads userAvatar');
  assertEqual(activeAvatar.shape, 'rounded', 'avatar respects shape');
  assertEqual(activeAvatar.borderGlow, false, 'avatar respects borderGlow');

  console.log(
    `Studio element render model tests passed: ${assertionCount} assertions (dynamic text, progress bar, leaderboard currency isolation, browser embed URL security, viewer/like isolation, event deduplication, normalization & live_text).`,
  );
}

runStudioElementRenderModelTests();
