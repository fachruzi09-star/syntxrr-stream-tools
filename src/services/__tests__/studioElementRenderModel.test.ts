// Unit tests for Studio Fase 1B Tahap 2: Complete Studio Renderer Helpers
// Run in the project environment with: bun run src/services/__tests__/studioElementRenderModel.test.ts

import type { StreamEvent, StudioElement } from '../../types';
import {
  createStudioElementFromSource,
  normalizeStudioElementProperties,
} from '../studioElementCatalog';
import {
  appendChatMessageFromEvent,
  appendUniqueStreamEvent,
  applyLikeEventToCount,
  applyMediaReplacementToElements,
  buildChatMessageBgOpacityPatch,
  buildChatMessagesFromHistory,
  buildEventFeedItems,
  buildLeaderboardEntries,
  buildLiveTextRenderModel,
  clampChatMessageOpacity,
  computeProgressBarModel,
  deduplicateStreamEvents,
  deriveInitialLikeCountFromHistory,
  extractLikeIncrementFromEvent,
  extractViewerCountFromEvent,
  getLatestAudienceUsernameFromHistory,
  getLatestViewerCountFromHistory,
  resolveActiveUsernameModel,
  resolveChatMessageBackground,
  resolveDynamicAvatarModel,
  resolveDynamicTextOutput,
  resolveSeparatorStyle,
  resolveSoundboardControlModel,
  resolveStickerVisualModel,
  resolveViewerCounterDisplay,
  shouldPlayEventAlertSound,
  shouldShowViewerLiveBadge,
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

  // === FASE 1B TAHAP 2.1 CORRECTIVE TESTS ===

  // 10.1 totalLikeCount treated as absolute total (NEVER summed as increment) & empty history starts at 0
  assertEqual(deriveInitialLikeCountFromHistory([]), 0, 'empty history initializes Like count at 0 (no fake 1240)');

  const totalLikePacket1: StreamEvent = {
    id: 'tt_like_tot_1',
    type: 'like',
    username: 'PenontonA',
    detail: 'total 15.000 like',
    amount: 15000,
    totalLikeCount: 15000,
    timestamp: 1000,
  };
  const totalLikePacket2: StreamEvent = {
    id: 'tt_like_tot_2',
    type: 'like',
    username: 'PenontonB',
    detail: 'total 15.040 like',
    amount: 15040,
    totalLikeCount: 15040,
    timestamp: 1005,
  };
  assertEqual(extractLikeIncrementFromEvent(totalLikePacket1), 0, 'cumulative totalLikeCount does not report as increment');
  let runningLikes = deriveInitialLikeCountFromHistory([]);
  runningLikes = applyLikeEventToCount(runningLikes, totalLikePacket1);
  assertEqual(runningLikes, 15000, 'first totalLikeCount sets absolute total');
  runningLikes = applyLikeEventToCount(runningLikes, totalLikePacket2);
  assertEqual(runningLikes, 15040, 'second totalLikeCount updates to 15040 instead of summing 30040');
  assertEqual(
    deriveInitialLikeCountFromHistory([totalLikePacket2, totalLikePacket1]),
    15040,
    'chronological history replay returns latest totalLikeCount 15040 without double-summing',
  );

  // 10.2 likeCount increment works accurately & viewer event never alters Like count
  const deltaLikePacket: StreamEvent = {
    id: 'tt_like_delta_1',
    type: 'like',
    username: 'Tapper',
    detail: 'mengirim 12 tap layar',
    amount: 12,
    likeCount: 12,
    timestamp: 1010,
  };
  assertEqual(extractLikeIncrementFromEvent(deltaLikePacket), 12, 'extracts increment when likeCount is present');
  runningLikes = applyLikeEventToCount(100, deltaLikePacket);
  assertEqual(runningLikes, 112, 'increments existing Like count by likeCount=12');
  runningLikes = applyLikeEventToCount(runningLikes, viewerEvent);
  assertEqual(runningLikes, 112, 'viewer event never alters Like count');

  // 10.3 Viewer event (username: 'TikTok LIVE') never becomes audience username / {username} / avatar
  const tiktokSystemViewerEvent: StreamEvent = {
    id: 'tt_viewer_sys',
    type: 'viewer',
    username: 'TikTok LIVE',
    detail: '500 penonton aktif',
    viewerCount: 500,
    amount: 500,
    timestamp: 2000,
  };
  assertEqual(
    getLatestAudienceUsernameFromHistory([tiktokSystemViewerEvent]),
    null,
    'viewer event is ignored when resolving {username} for dynamic_text',
  );
  const usernameAfterOnlyViewer = resolveActiveUsernameModel([tiktokSystemViewerEvent], {
    prefix: '⭐ ',
    badge: 'VIP',
  });
  assertEqual(usernameAfterOnlyViewer.hasEvent, false, 'viewer event does not count as audience user');
  assertEqual(usernameAfterOnlyViewer.username, null, 'TikTok LIVE viewer event never becomes username widget text');
  const avatarAfterOnlyViewer = resolveDynamicAvatarModel([tiktokSystemViewerEvent], {});
  assertEqual(avatarAfterOnlyViewer.username, null, 'viewer event never becomes avatar username');

  // 10.4 Older user avatar is NEVER paired with a newer audience username lacking a photo
  const olderUserWithPhoto: StreamEvent = {
    id: 'ev_older_photo',
    type: 'gift',
    username: 'OldSupporter',
    userAvatar: 'https://img.example.com/old-user.png',
    detail: 'mengirim Mawar',
    timestamp: 3000,
  };
  const newerUserNoPhoto: StreamEvent = {
    id: 'ev_newer_nophoto',
    type: 'chat',
    username: 'NewChatter',
    detail: 'Halo semua!',
    timestamp: 3100,
  };
  const newestFirstEvents: StreamEvent[] = [tiktokSystemViewerEvent, newerUserNoPhoto, olderUserWithPhoto];
  assertEqual(
    getLatestAudienceUsernameFromHistory(newestFirstEvents),
    'NewChatter',
    'consistent audience resolver selects NewChatter over viewer event and older gift',
  );
  const pairedUsername = resolveActiveUsernameModel(newestFirstEvents, {});
  const pairedAvatar = resolveDynamicAvatarModel(newestFirstEvents, {});
  assertEqual(pairedUsername.username, 'NewChatter', 'username widget picks NewChatter');
  assertEqual(pairedAvatar.username, 'NewChatter', 'avatar widget picks the SAME NewChatter');
  assertEqual(pairedAvatar.initial, 'N', 'avatar falls back to NewChatter initial');
  assertEqual(pairedAvatar.avatarUrl, null, 'older OldSupporter avatar is NOT paired with NewChatter');

  // 10.5 Empty chat history produces zero fake users (no DimasGamer / SitiStream)
  const emptyChats = buildChatMessagesFromHistory([], 20);
  assertEqual(emptyChats.length, 0, 'empty chat history returns empty array without fake users');
  const onlyViewerChats = buildChatMessagesFromHistory([tiktokSystemViewerEvent], 20);
  assertEqual(onlyViewerChats.length, 0, 'non-chat history produces zero chat rows');
  const appendedChats = appendChatMessageFromEvent(
    appendChatMessageFromEvent(emptyChats, newerUserNoPhoto, 20),
    newerUserNoPhoto,
    20,
  );
  assertEqual(appendedChats.length, 1, 'chat append deduplicates by event ID');
  assertEqual(appendedChats[0].user, 'NewChatter', 'chat item keeps real username');

  // 10.6 Viewer fallback is NEVER marked as LIVE
  assertEqual(
    shouldShowViewerLiveBadge(true, viewerFallbackDisplay.hasLiveSample),
    false,
    'viewer fallback suppresses LIVE badge',
  );
  assertEqual(
    shouldShowViewerLiveBadge(true, viewerLiveDisplay.hasLiveSample),
    true,
    'live viewer sample enables LIVE badge when liveBadge prop enabled',
  );
  assertEqual(
    shouldShowViewerLiveBadge(false, viewerLiveDisplay.hasLiveSample),
    false,
    'explicit liveBadge=false hides LIVE badge even with live sample',
  );

  // 10.7 Event alert sound respects both soundEnabled and soundEffect aliases
  assertEqual(shouldPlayEventAlertSound({ soundEnabled: true, soundEffect: true }), true, 'plays alert sound when enabled');
  assertEqual(shouldPlayEventAlertSound({ soundEnabled: false, soundEffect: true }), false, 'mutes alert when soundEnabled=false');
  assertEqual(shouldPlayEventAlertSound({ soundEnabled: true, soundEffect: false }), false, 'mutes alert when soundEffect=false');
  assertEqual(shouldPlayEventAlertSound({}), true, 'defaults alert sound to enabled when flags omitted');

  // === A1.1 DYNAMIC ELEMENT INSPECTOR & RENDER MODEL TESTS ===

  // 11.1 Username comes from latest valid audience event and applies prefix + badge cleanly
  const blankUsernameChat: StreamEvent = {
    id: 'ev_blank_user',
    type: 'chat',
    username: '   ',
    detail: 'pesan tanpa username',
    timestamp: 4000,
  };
  const latestValidFollow: StreamEvent = {
    id: 'ev_valid_follow',
    type: 'follow',
    username: '  NadiaStream  ',
    userAvatar: 'https://img.example.com/nadia.png',
    detail: 'mulai mengikuti',
    timestamp: 3900,
  };
  const olderGiftWithDiffUser: StreamEvent = {
    id: 'ev_older_gift',
    type: 'gift',
    username: 'OldDonatur',
    userAvatar: 'https://img.example.com/old-donatur.png',
    detail: 'mengirim Singa',
    timestamp: 3500,
  };
  const a11Events: StreamEvent[] = [tiktokSystemViewerEvent, blankUsernameChat, latestValidFollow, olderGiftWithDiffUser];
  const resolvedUser = resolveActiveUsernameModel(a11Events, { prefix: '🔥 ', badge: '  MVP  ' });
  assertEqual(resolvedUser.hasEvent, true, 'username detects latest valid audience event');
  assertEqual(resolvedUser.username, 'NadiaStream', 'username trims whitespace and skips viewer/blank events');
  assertEqual(resolvedUser.displayText, '🔥 NadiaStream', 'username combines prefix and latest valid username');
  assertEqual(resolvedUser.badge, 'MVP', 'username trims badge label');
  assertEqual(resolvedUser.eventType, 'follow', 'username preserves latest valid audience event type');

  const resolvedUserEmptyBadge = resolveActiveUsernameModel(a11Events, { prefix: '@', badge: '   ' });
  assertEqual(resolvedUserEmptyBadge.displayText, '@NadiaStream', 'username supports @ prefix');
  assertEqual(resolvedUserEmptyBadge.badge, null, 'whitespace badge becomes null');

  // 11.2 Avatar stays paired with the exact same audience event & validates all shape/borderGlow options
  const pairedLatestAvatar = resolveDynamicAvatarModel(a11Events, { shape: 'circle', borderGlow: true });
  assertEqual(pairedLatestAvatar.username, resolvedUser.username, 'avatar pairs with exact same latest valid username');
  assertEqual(pairedLatestAvatar.avatarUrl, 'https://img.example.com/nadia.png', 'avatar pairs with exact same event photo');
  assertEqual(pairedLatestAvatar.shape, 'circle', 'avatar supports circle shape');
  assertEqual(pairedLatestAvatar.borderGlow, true, 'avatar supports borderGlow=true');

  const squareAvatar = resolveDynamicAvatarModel(a11Events, { shape: 'square', borderGlow: false });
  assertEqual(squareAvatar.shape, 'square', 'avatar supports square shape');
  assertEqual(squareAvatar.borderGlow, false, 'avatar supports borderGlow=false');

  const roundedAvatar = resolveDynamicAvatarModel(a11Events, { shape: 'rounded' });
  assertEqual(roundedAvatar.shape, 'rounded', 'avatar supports rounded shape');
  assertEqual(roundedAvatar.borderGlow, true, 'avatar defaults borderGlow to true when omitted');

  const invalidShapeUnsafeUrlEvent: StreamEvent = {
    id: 'ev_unsafe_av',
    type: 'donation',
    username: '@ZakiPro',
    userAvatar: 'javascript:alert(1)',
    detail: 'donasi',
    timestamp: 4100,
  };
  const sanitizedAvatar = resolveDynamicAvatarModel([invalidShapeUnsafeUrlEvent], { shape: 'hexagon' });
  assertEqual(sanitizedAvatar.shape, 'circle', 'invalid shape falls back safely to circle');
  assertEqual(sanitizedAvatar.avatarUrl, null, 'unsafe javascript: userAvatar is rejected');
  assertEqual(sanitizedAvatar.initial, 'Z', 'initial strips leading @ cleanly');

  // 11.3 Dynamic Text safely handles missing tokens (including durationText=null) & empty templates
  const durationMissingResult = resolveDynamicTextOutput({
    template: 'Live selama {durasi} bersama {username}',
    fallback: 'Siaran siap dimulai',
    context: {
      latestUsername: 'NadiaStream',
      durationText: null,
    },
  });
  assertEqual(durationMissingResult.usedFallback, true, 'null durationText triggers fallback safely');
  assertEqual(durationMissingResult.text, 'Siaran siap dimulai', 'null durationText returns clean fallback text');
  assert(!/\{[^}]+\}/.test(durationMissingResult.text), 'missing duration never leaks {durasi}');

  const emptyTemplateResult = resolveDynamicTextOutput({
    template: '   ',
    fallback: 'Fallback aman',
    context: { latestUsername: 'NadiaStream' },
  });
  assertEqual(emptyTemplateResult.usedFallback, true, 'empty template triggers fallback safely');
  assertEqual(emptyTemplateResult.text, 'Fallback aman', 'empty template returns trimmed fallback');

  // === A2.1 EVENT FEED BOUNDS & LIVE VIEWER COUNTER PRIORITY CHECKS ===
  const twentyFiveEvents: StreamEvent[] = Array.from({ length: 25 }, (_, idx) => ({
    id: `ev_feed_${idx}`,
    type: 'chat',
    username: `User${idx}`,
    detail: `Pesan ${idx}`,
    timestamp: 5000 + idx,
  }));
  assertEqual(buildEventFeedItems(twentyFiveEvents, 25).length, 20, 'event_feed clamps maxItems > 20 to 20');
  assertEqual(buildEventFeedItems(twentyFiveEvents, 0).length, 4, 'event_feed falls back to default 4 when maxItems <= 0');
  assertEqual(buildEventFeedItems(twentyFiveEvents, 7.9).length, 7, 'event_feed floors fractional maxItems to integer');
  assertEqual(buildEventFeedItems([], 10).length, 0, 'event_feed returns empty array when no real events exist');

  const liveZeroOverridesFallback = resolveViewerCounterDisplay({
    liveViewerCount: 0,
    fallbackPropertyValue: 5000,
  });
  assertEqual(liveZeroOverridesFallback.count, 0, 'liveViewerCount=0 still overrides fallbackPropertyValue');
  assertEqual(liveZeroOverridesFallback.hasLiveSample, true, 'liveViewerCount=0 counts as valid LIVE sample');
  assertEqual(
    shouldShowViewerLiveBadge(true, liveZeroOverridesFallback.hasLiveSample),
    true,
    'LIVE badge displays when live sample 0 is active and liveBadge=true',
  );

  const standbyZeroFallback = resolveViewerCounterDisplay({
    liveViewerCount: null,
    fallbackPropertyValue: 0,
  });
  assertEqual(standbyZeroFallback.count, 0, 'non-negative integer fallback 0 is accepted when LIVE sample absent');
  assertEqual(standbyZeroFallback.hasLiveSample, false, 'zero fallback remains standby (not LIVE)');
  assertEqual(
    shouldShowViewerLiveBadge(true, standbyZeroFallback.hasLiveSample),
    false,
    'LIVE badge remains hidden during standby even if liveBadge=true',
  );

  // === A2.2 PROGRESS BAR & COUNTER EDGE-CASE CHECKS ===
  const zeroCurrentValidTarget = computeProgressBarModel({
    currentAmount: 0,
    targetAmount: 1000000,
    currency: 'Rp',
  });
  assertEqual(zeroCurrentValidTarget.current, 0, 'progress_bar supports currentAmount=0');
  assertEqual(zeroCurrentValidTarget.percent, 0, 'progress_bar computes 0% when currentAmount=0');
  assertEqual(zeroCurrentValidTarget.formattedCurrent, 'Rp 0', 'progress_bar formats 0 with Rp currency');
  assertEqual(zeroCurrentValidTarget.formattedTarget, 'Rp 1.000.000', 'progress_bar formats 1.000.000 with Rp currency');

  const invalidTargetModel = computeProgressBarModel({
    currentAmount: 50000,
    targetAmount: -100,
    currency: 'USD',
  });
  assertEqual(invalidTargetModel.isValidTarget, false, 'negative targetAmount is invalid');
  assertEqual(invalidTargetModel.formattedTarget, '—', 'invalid targetAmount falls back to —');
  assertEqual(invalidTargetModel.percent, 0, 'invalid targetAmount yields 0%');

  const supportedNominalStrings = computeProgressBarModel({
    current: 'Rp 1.250.000',
    target: 'Rp 1.000.000',
    currency: 'Rp',
  });
  assertEqual(supportedNominalStrings.current, 1250000, 'parses Indonesian dot-thousands nominal string');
  assertEqual(supportedNominalStrings.percent, 100, 'clamps current > target strictly at 100%');
  assertEqual(supportedNominalStrings.percentLabel, '100%', 'formats clamped percent label as 100%');

  const customCurrencyEmpty = computeProgressBarModel({
    currentAmount: 250,
    targetAmount: 500,
    currency: '',
  });
  assertEqual(customCurrencyEmpty.formattedCurrent, '250', 'empty currency omits prefix cleanly');
  assertEqual(customCurrencyEmpty.formattedTarget, '500', 'empty currency formats plain target');
  assertEqual(customCurrencyEmpty.percent, 50, 'computes 50% accurately');

  // === A2.3 LEADERBOARD RENDER MODEL EDGE-CASE CHECKS ===
  assertEqual(
    buildLeaderboardEntries([], 3).length,
    0,
    'leaderboard returns empty list when no events have occurred yet',
  );

  const nonSupportingOnly: StreamEvent[] = [
    { id: 'c1', type: 'chat', username: 'chatter', detail: 'halo', timestamp: 1000 },
    { id: 'f1', type: 'follow', username: 'follower', detail: 'followed', timestamp: 1100 },
    { id: 'l1', type: 'like', username: 'liker', detail: 'liked', timestamp: 1200 },
    { id: 'g-empty', type: 'gift', username: '   ', detail: 'Rose', amount: 10, timestamp: 1300 },
  ];
  assertEqual(
    buildLeaderboardEntries(nonSupportingOnly, 5).length,
    0,
    'leaderboard excludes chat/follow/like events and gift events without valid username',
  );

  const manyDonors: StreamEvent[] = Array.from({ length: 14 }, (_, idx) => ({
    id: `d-${idx}`,
    type: 'donation' as const,
    username: `Supporter_${idx + 1}`,
    detail: 'Sawer',
    amount: (idx + 1) * 1000,
    currency: 'Rp',
    timestamp: 2000 + idx,
  }));
  assertEqual(
    buildLeaderboardEntries(manyDonors, 25).length,
    10,
    'leaderboard clamps topCount above 10 strictly to 10 entries',
  );
  assertEqual(
    buildLeaderboardEntries(manyDonors, 0).length,
    3,
    'leaderboard falls back to 3 entries when topCount <= 0',
  );
  assertEqual(
    buildLeaderboardEntries(manyDonors, Number.NaN).length,
    3,
    'leaderboard falls back to 3 entries when topCount is NaN',
  );

  const a23MixedCurrencyEvents: StreamEvent[] = [
    {
      id: 'm1',
      type: 'donation',
      username: 'Bima',
      detail: 'Support 1',
      amount: 50000,
      currency: 'Rp',
      timestamp: 1000,
    },
    {
      id: 'm2',
      type: 'gift',
      username: 'bima',
      detail: 'Support 2',
      amount: 10,
      currency: 'USD',
      timestamp: 2000,
    },
    {
      id: 'm3',
      type: 'gift',
      username: 'Citra',
      detail: 'Support 1',
      amount: 100,
      currency: 'Koin',
      timestamp: 2500,
    },
    {
      id: 'm4',
      type: 'gift',
      username: 'Andi',
      detail: 'Support 1',
      amount: 20,
      currency: 'Koin',
      timestamp: 1500,
    },
  ];
  const a23RankedMixed = buildLeaderboardEntries(a23MixedCurrencyEvents, 10);
  assertEqual(a23RankedMixed.length, 3, 'groups case-insensitive usernames into distinct leaderboard entries');
  assertEqual(a23RankedMixed[0]?.username, 'bima', 'ranks highest supportCount first');
  assertEqual(a23RankedMixed[0]?.supportCount, 2, 'counts repeat support accurately');
  assertEqual(
    a23RankedMixed[0]?.formattedLastAmount,
    'USD 10',
    'uses latest event nominal & currency without summing mixed currencies',
  );
  assertEqual(a23RankedMixed[1]?.username, 'Citra', 'breaks equal supportCount ties by newest timestamp');
  assertEqual(a23RankedMixed[2]?.username, 'Andi', 'orders older equal-count donor after newer tie');

  // === A2.4 LIVE TEXT RENDER MODEL HONESTY & VISIBILITY CHECKS ===
  const modeAStandby = buildLiveTextRenderModel({
    isModeBSelected: false,
    modeBStatus: {
      status: 'live',
      message: 'Streaming',
      isStreaming: true,
      bitrateKbps: 3800,
    },
  });
  assertEqual(modeAStandby.isLive, false, 'Mode A remains standby even if snapshot had live status');
  assertEqual(modeAStandby.statusLabel, 'STANDBY', 'Mode A displays STANDBY');
  assertEqual(modeAStandby.bitrateLabel, '—', 'Mode A suppresses Mode B bitrate');

  const liveFlagWithoutStreaming = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'live',
      message: 'Stale',
      isStreaming: false,
      bitrateKbps: 3200,
    },
  });
  assertEqual(liveFlagWithoutStreaming.isLive, false, 'requires both status=live and isStreaming=true to report LIVE');

  const hostWaitState = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'host_wait',
      message: 'Waiting host',
      isStreaming: false,
      bitrateKbps: 1800,
    },
  });
  assertEqual(hostWaitState.isLive, false, 'host_wait never claims LIVE');
  assertEqual(hostWaitState.statusLabel, 'HOST WAIT', 'host_wait displays HOST WAIT');
  assertEqual(hostWaitState.bitrateLabel, '1800 kbps', 'host_wait preserves valid positive bitrate');

  const stoppingState = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'stopping',
      message: 'Stopping',
      isStreaming: false,
      bitrateKbps: 2500,
    },
  });
  assertEqual(stoppingState.statusLabel, 'STOPPING', 'stopping displays STOPPING');
  assertEqual(stoppingState.bitrateLabel, '—', 'stopping hides bitrate as session ends');

  const errorState = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'error',
      message: 'Socket failure',
      isStreaming: false,
      bitrateKbps: 2000,
    },
  });
  assertEqual(errorState.isLive, false, 'error state is never LIVE');
  assertEqual(errorState.statusLabel, 'TERPUTUS', 'error state displays TERPUTUS');
  assertEqual(errorState.tone, 'error', 'error state sets error tone');
  assertEqual(errorState.bitrateLabel, '—', 'error state hides stale bitrate');

  const captureLostState = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'capture_lost',
      message: 'Projection revoked',
      isStreaming: false,
      bitrateKbps: 0,
    },
  });
  assertEqual(captureLostState.statusLabel, 'CAPTURE LOST', 'capture_lost displays CAPTURE LOST');
  assertEqual(captureLostState.tone, 'error', 'capture_lost sets error tone');

  const hiddenTogglesAndInvalidBitrate = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'live',
      message: 'Streaming',
      isStreaming: true,
      bitrateKbps: 0,
    },
    showFps: false,
    showBitrate: true,
    fps: 60,
    resolution: '   ',
  });
  assertEqual(hiddenTogglesAndInvalidBitrate.fpsLabel, '—', 'showFps=false hides fps even when supplied');
  assertEqual(hiddenTogglesAndInvalidBitrate.bitrateLabel, '—', 'zero/invalid bitrateKbps displays —');
  assertEqual(hiddenTogglesAndInvalidBitrate.resolutionLabel, '—', 'blank resolution displays —');

  const bitrateHiddenByToggle = buildLiveTextRenderModel({
    isModeBSelected: true,
    modeBStatus: {
      status: 'live',
      message: 'Streaming',
      isStreaming: true,
      bitrateKbps: 4500,
    },
    showFps: true,
    showBitrate: false,
  });
  assertEqual(bitrateHiddenByToggle.bitrateLabel, '—', 'showBitrate=false hides valid live bitrate');
  assertEqual(bitrateHiddenByToggle.fpsLabel, '—', 'unavailable fps stays — even when showFps=true');

  // --- A2.5 P2.1 Media Replacement Lock Enforcement ---
  const baseImgElem: StudioElement = {
    ...createStudioElementFromSource('image', []),
    id: 'media_img_1',
    locked: true,
    properties: {
      imageUrl: 'https://example.com/original.png',
      imageAssetId: 'asset_old',
    },
  };
  const baseVideoElem: StudioElement = {
    ...createStudioElementFromSource('video', []),
    id: 'media_vid_1',
    locked: false,
    properties: {
      videoUrl: 'https://example.com/old.mp4',
      videoAssetId: 'asset_vid_old',
    },
  };
  const baseStickerElem: StudioElement = {
    ...createStudioElementFromSource('sticker', []),
    id: 'media_stk_1',
    locked: true,
    properties: {
      imageUrl: 'https://example.com/sticker.webp',
    },
  };

  const lockedImgReplace = applyMediaReplacementToElements({
    elements: [baseImgElem, baseVideoElem],
    selectedElement: baseImgElem,
    url: 'https://example.com/new.png',
    assetId: 'asset_new',
    assetUri: 'studio-media://asset_new',
    isElementGroupLocked: false,
    isStrictModeBLocked: false,
  });
  assertEqual(lockedImgReplace.applied, false, 'locked image blocks media replacement');
  assertEqual(
    lockedImgReplace.elements[0].properties.imageUrl,
    'https://example.com/original.png',
    'locked image preserves original imageUrl',
  );
  assertEqual(
    lockedImgReplace.elements[0].properties.imageAssetId,
    'asset_old',
    'locked image preserves original imageAssetId',
  );

  const lockedStickerReplace = applyMediaReplacementToElements({
    elements: [baseStickerElem],
    selectedElement: baseStickerElem,
    url: 'https://example.com/new-sticker.webp',
    isElementGroupLocked: false,
    isStrictModeBLocked: false,
  });
  assertEqual(lockedStickerReplace.applied, false, 'locked sticker blocks media replacement');
  assertEqual(
    lockedStickerReplace.elements[0].properties.imageUrl,
    'https://example.com/sticker.webp',
    'locked sticker keeps original imageUrl',
  );

  const groupLockedVideoReplace = applyMediaReplacementToElements({
    elements: [baseVideoElem],
    selectedElement: baseVideoElem,
    url: 'https://example.com/new.mp4',
    isElementGroupLocked: true,
    isStrictModeBLocked: false,
  });
  assertEqual(groupLockedVideoReplace.applied, false, 'group-locked video blocks media replacement');
  assertEqual(
    groupLockedVideoReplace.elements[0].properties.videoUrl,
    'https://example.com/old.mp4',
    'group-locked video preserves videoUrl',
  );

  const strictLockedVideoReplace = applyMediaReplacementToElements({
    elements: [baseVideoElem],
    selectedElement: baseVideoElem,
    url: 'https://example.com/new.mp4',
    isElementGroupLocked: false,
    isStrictModeBLocked: true,
  });
  assertEqual(strictLockedVideoReplace.applied, false, 'strict Mode B lock blocks media replacement');

  const unlockedImgElem: StudioElement = { ...baseImgElem, locked: false };
  const unlockedImgUrlOnly = applyMediaReplacementToElements({
    elements: [unlockedImgElem, baseVideoElem],
    selectedElement: unlockedImgElem,
    url: 'https://example.com/replaced.png',
    isElementGroupLocked: false,
    isStrictModeBLocked: false,
  });
  assertEqual(unlockedImgUrlOnly.applied, true, 'unlocked image allows media replacement');
  assertEqual(
    unlockedImgUrlOnly.elements[0].properties.imageUrl,
    'https://example.com/replaced.png',
    'unlocked image updates imageUrl',
  );
  assertEqual(
    unlockedImgUrlOnly.elements[0].properties.imageAssetId,
    undefined,
    'unlocked image URL-only replacement clears stale imageAssetId',
  );

  const unlockedVideoWithAsset = applyMediaReplacementToElements({
    elements: [baseVideoElem],
    selectedElement: baseVideoElem,
    url: 'blob:video-fallback',
    assetId: 'asset_vid_new',
    assetUri: 'studio-media://asset_vid_new',
    isElementGroupLocked: false,
    isStrictModeBLocked: false,
  });
  assertEqual(unlockedVideoWithAsset.applied, true, 'unlocked video allows asset replacement');
  assertEqual(
    unlockedVideoWithAsset.elements[0].properties.videoUrl,
    'studio-media://asset_vid_new',
    'unlocked video uses studio-media assetUri when assetId present',
  );
  assertEqual(
    unlockedVideoWithAsset.elements[0].properties.videoAssetId,
    'asset_vid_new',
    'unlocked video stores new videoAssetId',
  );

  const textElem = createStudioElementFromSource('text', []);
  const nonMediaReplace = applyMediaReplacementToElements({
    elements: [textElem],
    selectedElement: textElem,
    url: 'https://example.com/new.png',
    isElementGroupLocked: false,
    isStrictModeBLocked: false,
  });
  assertEqual(nonMediaReplace.applied, false, 'non-media element ignores media replacement');

  // --- A2.5 P2.2 Chat Message Background Opacity Synchronization ---
  const defaultChat = createStudioElementFromSource('chat_message', []);
  const resolvedDefaultChatBg = resolveChatMessageBackground(defaultChat.properties);
  assertEqual(resolvedDefaultChatBg.bgOpacity, 82, 'catalog default chat_message resolves bgOpacity 82');
  assertEqual(
    resolvedDefaultChatBg.backgroundColor,
    'rgba(15, 19, 27, 0.82)',
    'catalog default chat_message preserves rgba(15, 19, 27, 0.82)',
  );

  const normalizedDefaultChat = normalizeStudioElementProperties(defaultChat);
  assertEqual(
    resolveChatMessageBackground(normalizedDefaultChat.properties).backgroundColor,
    'rgba(15, 19, 27, 0.82)',
    'normalized catalog chat_message stays identical',
  );

  const patch50 = buildChatMessageBgOpacityPatch(defaultChat.properties, 50);
  assertEqual(patch50.bgOpacity, 50, 'chat opacity patch sets bgOpacity 50');
  assertEqual(
    patch50.backgroundColor,
    'rgba(15, 19, 27, 0.5)',
    'chat opacity patch preserves catalog RGB (15, 19, 27) at 0.5 alpha',
  );
  const updatedChatElem: StudioElement = {
    ...defaultChat,
    properties: { ...defaultChat.properties, ...patch50 },
  };
  const normalizedUpdatedChat = normalizeStudioElementProperties(updatedChatElem);
  const resolvedUpdatedChat = resolveChatMessageBackground(normalizedUpdatedChat.properties);
  assertEqual(resolvedUpdatedChat.bgOpacity, 50, 'Inspector value remains 50 after normalize');
  assertEqual(
    resolvedUpdatedChat.backgroundColor,
    'rgba(15, 19, 27, 0.5)',
    'Canvas renderer background stays rgba(15, 19, 27, 0.5) after normalize',
  );
  assertEqual(updatedChatElem.properties.maxMessages, 5, 'unrelated maxMessages preserved');
  assertEqual(updatedChatElem.properties.fontSize, 13, 'unrelated fontSize preserved');
  assertEqual(updatedChatElem.properties.showBadges, true, 'unrelated showBadges preserved');

  // Clamping boundaries 10..100 & invalid fallback
  assertEqual(clampChatMessageOpacity(0, 82), 10, 'clamps numeric 0 to min 10');
  assertEqual(clampChatMessageOpacity(-5, 82), 10, 'clamps negative number to min 10');
  assertEqual(clampChatMessageOpacity('5', 82), 10, 'clamps string 5 to min 10');
  assertEqual(clampChatMessageOpacity(150, 82), 100, 'clamps numeric 150 to max 100');
  assertEqual(clampChatMessageOpacity('999', 82), 100, 'clamps string 999 to max 100');
  assertEqual(clampChatMessageOpacity('', 82), 82, 'empty string falls back to current valid opacity without becoming 10 or NaN');
  assertEqual(clampChatMessageOpacity('abc', 82), 82, 'non-numeric string falls back safely without NaN');
  assertEqual(clampChatMessageOpacity(Number.NaN, 82), 82, 'NaN falls back safely');

  const patchMin = buildChatMessageBgOpacityPatch(defaultChat.properties, '0');
  assertEqual(patchMin.bgOpacity, 10, 'patch clamps 0 input to 10');
  assertEqual(patchMin.backgroundColor, 'rgba(15, 19, 27, 0.1)', 'patch reflects 0.1 alpha');

  const patchMax = buildChatMessageBgOpacityPatch(defaultChat.properties, '125');
  assertEqual(patchMax.bgOpacity, 100, 'patch clamps 125 input to 100');
  assertEqual(patchMax.backgroundColor, 'rgba(15, 19, 27, 1)', 'patch reflects 1.0 alpha');

  // Legacy without backgroundColor preserves (12, 14, 18) RGB
  const legacyOpacityOnly = resolveChatMessageBackground({ bgOpacity: 85 });
  assertEqual(legacyOpacityOnly.bgOpacity, 85, 'legacy bgOpacity-only resolves 85');
  assertEqual(
    legacyOpacityOnly.backgroundColor,
    'rgba(12, 14, 18, 0.85)',
    'legacy bgOpacity-only falls back to rgba(12, 14, 18, 0.85)',
  );
  const legacyPatch = buildChatMessageBgOpacityPatch({ bgOpacity: 85 }, 40);
  assertEqual(
    legacyPatch.backgroundColor,
    'rgba(12, 14, 18, 0.4)',
    'updating legacy bgOpacity-only preserves (12, 14, 18) RGB',
  );

  // Custom hex/rgb backgroundColor preserves RGB channels
  const customHexPatch = buildChatMessageBgOpacityPatch({ backgroundColor: '#1E293B', bgOpacity: 75 }, 60);
  assertEqual(customHexPatch.bgOpacity, 60, 'custom hex chat bg updates bgOpacity to 60');
  assertEqual(
    customHexPatch.backgroundColor,
    'rgba(30, 41, 59, 0.6)',
    'custom hex chat bg preserves RGB (30, 41, 59) at 0.6 alpha',
  );

  console.log(
    `Studio element render model tests passed: ${assertionCount} assertions (Tahap 2 + Tahap 2.1 + A1.1 + A2.1 + A2.2 + A2.3 + A2.4 + A2.5 checks).`,
  );
}

runStudioElementRenderModelTests();
