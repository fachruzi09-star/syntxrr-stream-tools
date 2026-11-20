// Unit test terarah untuk TikTokEventNormalizer, BoundedEventDeduplicator, dan TikTokLiveConnector
// Dijalankan via: bun run src/services/__tests__/tiktokConnector.test.ts

import type { StreamEvent } from '../../types';
import type {
  NativeTikTokRawEventPayload,
  NativeTikTokStatePayload,
} from '../nativeCompanionBridge';
import {
  BoundedEventDeduplicator,
  TikTokEventNormalizer,
} from '../tiktokEventNormalizer';
import {
  TikTokLiveConnector,
  buildModeAHonestStatus,
  isValidTikTokTargetUsername,
  normalizeTikTokTargetUsername,
  resolveTikTokTargetUsername,
  type TikTokTransportAdapter,
} from '../tiktokLiveConnector';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TIKTOK_ACCOUNT_STATE,
  mergeBackupSettings,
  omitCredentials,
  sanitizeTikTokAccountState,
} from '../storage';
import {
  applyVerifiedProfileToAccountState,
  clearPendingPkce,
  getTikTokAuthConfiguration,
  handleTikTokAuthCallbackUrl,
  maskApiKeyPreview,
  savePendingPkce,
  startTikTokOAuthLogin,
} from '../tiktokAuthService';
import { buildChatModel, hudEventSourceStatus } from '../hudController';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`);
  }
}

function runNormalizerTests(): void {
  const normalizer = new TikTokEventNormalizer(5);

  // 1. WebcastChatMessage
  const chatRes = normalizer.normalize(
    {
      method: 'WebcastChatMessage',
      msgId: '1001',
      createTime: 1731571200,
      userId: 'u_1',
      username: 'budi_live',
      content: '!play Neon Horizon',
    },
    1731571200000
  );
  assert(chatRes.event !== null, 'Chat event should be normalized');
  assertEqual(chatRes.event?.type, 'chat', 'Chat type');
  assertEqual(chatRes.event?.username, 'budi_live', 'Chat username');
  assertEqual(chatRes.event?.detail, '!play Neon Horizon', 'Chat detail');
  assertEqual(chatRes.event?.isSimulation, false, 'Real event must set isSimulation=false');

  // 2. WebcastEmoteChatMessage
  const emoteRes = normalizer.normalize({
    method: 'WebcastEmoteChatMessage',
    msgId: '1002',
    nickname: 'EmoteUser',
    content: '[Emote:123]',
  });
  assertEqual(emoteRes.event?.type, 'chat', 'Emote chat mapped to chat');
  assertEqual(emoteRes.event?.username, 'EmoteUser', 'Fallback to nickname');

  // 3. WebcastGiftMessage + combo progression vs exact duplicate
  const gift1 = normalizer.normalize({
    method: 'WebcastGiftMessage',
    msgId: '2001',
    username: 'sultan',
    giftId: '5655',
    giftName: 'Rose',
    repeatCount: 1,
    diamondCount: 1,
    giftImage: 'https://example.com/rose.png',
  });
  assertEqual(gift1.event?.type, 'gift', 'Gift type');
  assertEqual(gift1.event?.amount, 1, 'Gift coins calculation x1');
  assertEqual(gift1.event?.giftName, 'Rose', 'Gift name preserved');
  assertEqual(gift1.event?.giftImage, 'https://example.com/rose.png', 'Gift image preserved');

  // Same msgId with incremented repeatCount (combo streak) MUST NOT be dropped
  const giftCombo = normalizer.normalize({
    method: 'WebcastGiftMessage',
    msgId: '2001',
    username: 'sultan',
    giftId: '5655',
    giftName: 'Rose',
    repeatCount: 5,
    diamondCount: 1,
  });
  assert(giftCombo.event !== null, 'Incremented gift repeatCount must pass');
  assertEqual(giftCombo.event?.amount, 5, 'Gift coins calculation x5');

  // Exact replay of (msgId, giftId, repeatCount=5) MUST be dropped
  const giftDup = normalizer.normalize({
    method: 'WebcastGiftMessage',
    msgId: '2001',
    username: 'sultan',
    giftId: '5655',
    giftName: 'Rose',
    repeatCount: 5,
    diamondCount: 1,
  });
  assertEqual(giftDup.event, null, 'Exact gift duplicate must be dropped');
  assertEqual(giftDup.ignoredReason, 'duplicate', 'Exact gift duplicate reason');

  // 4. WebcastLikeMessage
  const likeRes = normalizer.normalize({
    method: 'WebcastLikeMessage',
    msgId: '3001',
    username: 'tapper',
    likeCount: 15,
    totalLikeCount: 1250,
  });
  assertEqual(likeRes.event?.type, 'like', 'Like type');
  assertEqual(likeRes.event?.likeCount, 15, 'Like delta');
  assertEqual(likeRes.totalLikeCount, 1250, 'Total like count');

  // 5. WebcastSocialMessage (follow vs share vs unknown)
  const followRes = normalizer.normalize({
    method: 'WebcastSocialMessage',
    msgId: '4001',
    username: 'new_fan',
    action: 1,
  });
  assertEqual(followRes.event?.type, 'follow', 'Social action=1 mapped to follow');

  const shareRes = normalizer.normalize({
    method: 'WebcastSocialMessage',
    msgId: '4002',
    username: 'sharer',
    action: 3,
  });
  assertEqual(shareRes.event?.type, 'share', 'Social action=3 mapped to share');

  const unknownSocial = normalizer.normalize({
    method: 'WebcastSocialMessage',
    msgId: '4003',
    username: 'anon',
    action: 99,
  });
  assertEqual(unknownSocial.event, null, 'Unknown social action ignored safely');

  // 6. WebcastMemberMessage (join)
  const joinRes = normalizer.normalize({
    method: 'WebcastMemberMessage',
    msgId: '5001',
    username: 'viewer_join',
    memberCount: 42,
  });
  assertEqual(joinRes.event?.type, 'join', 'Member mapped to join');
  assertEqual(joinRes.viewerCount, 42, 'Member viewerCount');

  // 7. WebcastRoomUserSeqMessage (viewers)
  const viewerRes = normalizer.normalize({
    method: 'WebcastRoomUserSeqMessage',
    msgId: '6001',
    viewerCount: 318,
  });
  assertEqual(viewerRes.event?.type, 'viewer', 'RoomUserSeq mapped to viewer');
  assertEqual(viewerRes.viewerCount, 318, 'Viewer count updated');

  // 8. WebcastControlMessage (LIVE ended)
  const controlEnd = normalizer.normalize({
    method: 'WebcastControlMessage',
    msgId: '7001',
    controlAction: 3,
  });
  assertEqual(controlEnd.event, null, 'Control message does not emit fake chat/alert event');
  assertEqual(controlEnd.roomEnded, true, 'Control action=3 flags roomEnded');

  // 9. Incomplete / unknown payloads ignored safely
  const emptyChat = normalizer.normalize({
    method: 'WebcastChatMessage',
    msgId: '8001',
    username: 'nobody',
    content: '   ',
  });
  assertEqual(emptyChat.event, null, 'Empty chat must be ignored');

  const unknownMethod = normalizer.normalize({
    method: 'WebcastUnknownFutureMessage',
    msgId: '9001',
  });
  assertEqual(unknownMethod.event, null, 'Unknown method must be ignored safely');
}

function runBoundedDedupTests(): void {
  const dedup = new BoundedEventDeduplicator(3);
  assertEqual(dedup.markAndCheckDuplicate('a'), false, 'first a');
  assertEqual(dedup.markAndCheckDuplicate('b'), false, 'first b');
  assertEqual(dedup.markAndCheckDuplicate('c'), false, 'first c');
  assertEqual(dedup.markAndCheckDuplicate('b'), true, 'duplicate b');
  assertEqual(dedup.markAndCheckDuplicate('d'), false, 'first d evicts a');
  assertEqual(dedup.size(), 3, 'window size stays bounded at 3');
  assertEqual(dedup.has('a'), false, 'oldest key a evicted');
  assertEqual(dedup.has('d'), true, 'newest key d kept');
}

async function runConnectorStateAndBusTests(): Promise<void> {
  const hooks: {
    stateCb: ((p: NativeTikTokStatePayload) => void) | null;
    eventCb: ((p: NativeTikTokRawEventPayload) => void) | null;
  } = {
    stateCb: null,
    eventCb: null,
  };
  let connectCallCount = 0;
  let disconnectCallCount = 0;
  const emittedEvents: StreamEvent[] = [];

  const mockAdapter: TikTokTransportAdapter = {
    isSupported: () => true,
    connect: async (opts) => {
      connectCallCount += 1;
      return {
        accepted: true,
        status: {
          state: 'resolving_room',
          transport: 'none',
          username: opts.username,
          roomId: '',
          viewerCount: 0,
          totalLikeCount: 0,
          message: `Resolving @${opts.username}`,
        },
      };
    },
    disconnect: async () => {
      disconnectCallCount += 1;
      return {
        success: true,
        status: {
          state: 'disconnected',
          transport: 'none',
          username: 'streamer_test',
          roomId: '',
          viewerCount: 0,
          totalLikeCount: 0,
          message: 'Disconnected',
        },
      };
    },
    getStatus: async () => null,
    onState: async (cb) => {
      hooks.stateCb = cb;
      return { remove: async () => { hooks.stateCb = null; } };
    },
    onEvent: async (cb) => {
      hooks.eventCb = cb;
      return { remove: async () => { hooks.eventCb = null; } };
    },
  };

  const connector = new TikTokLiveConnector(mockAdapter, (evt) => {
    emittedEvents.push(evt);
  });

  const observedStates: string[] = [];
  const unsub = connector.subscribe((s) => observedStates.push(s.state));

  // Invalid username rejected without touching transport
  const badRes = await connector.connect({ username: '   ' });
  assertEqual(badRes.state, 'error', 'Empty username sets error');
  assertEqual(connectCallCount, 0, 'Empty username does not call adapter.connect');

  // Valid username connects cleanly
  const startRes = await connector.connect({ username: '@streamer_test' });
  assertEqual(startRes.state, 'resolving_room', 'Starts in resolving_room');
  assertEqual(connectCallCount, 1, 'adapter.connect called once');

  // Duplicate connect for same active username must not create duplicate transport session
  await connector.connect({ username: 'streamer_test' });
  assertEqual(connectCallCount, 1, 'Duplicate connect prevented');

  // Simulate direct rejection -> Euler fallback -> connected_euler
  hooks.stateCb?.({
    state: 'connecting_direct',
    transport: 'direct_ws',
    username: 'streamer_test',
    roomId: '777123',
    viewerCount: 0,
    totalLikeCount: 0,
    message: 'Connecting direct WS',
  });
  hooks.stateCb?.({
    state: 'connecting_euler',
    transport: 'euler',
    username: 'streamer_test',
    roomId: '777123',
    viewerCount: 0,
    totalLikeCount: 0,
    message: 'Direct rejected, trying EulerStream',
  });
  hooks.stateCb?.({
    state: 'connected_euler',
    transport: 'euler',
    username: 'streamer_test',
    roomId: '777123',
    viewerCount: 15,
    totalLikeCount: 0,
    message: 'Connected via EulerStream',
  });
  assertEqual(connector.isConnected(), true, 'Connector reports connected on connected_euler');

  // Emit raw events (including duplicate msgId + LIVE end control message)
  hooks.eventCb?.({
    method: 'WebcastChatMessage',
    msgId: '991',
    username: 'penonton1',
    content: '!play Horizon',
  });
  hooks.eventCb?.({
    method: 'WebcastChatMessage',
    msgId: '991',
    username: 'penonton1',
    content: '!play Horizon',
  });
  assertEqual(emittedEvents.length, 1, 'Duplicate chat frame deduplicated before eventBus');
  assertEqual(emittedEvents[0].detail, '!play Horizon', 'Normalized chat forwarded to bus');

  // LIVE ended control message transitions cleanly to waiting_for_live
  hooks.eventCb?.({
    method: 'WebcastControlMessage',
    msgId: '992',
    controlAction: 3,
  });
  assertEqual(connector.getStatus().state, 'waiting_for_live', 'LIVE end sets waiting_for_live');
  assertEqual(connector.isConnected(), false, 'Connector no longer connected after LIVE ends');

  await connector.disconnect();
  assertEqual(disconnectCallCount, 1, 'Disconnect invokes adapter.disconnect');
  assertEqual(connector.getStatus().state, 'disconnected', 'State resets to disconnected');
  assert(observedStates.includes('connected_euler'), 'Observed connected_euler state');

  unsub();
  await connector.destroy();

  // Browser-unsupported mode must report truthful error, never fake connected
  const webOnlyConnector = new TikTokLiveConnector({
    ...mockAdapter,
    isSupported: () => false,
  });
  const webRes = await webOnlyConnector.connect({ username: 'streamer_test' });
  assertEqual(webRes.state, 'error', 'Unsupported browser runtime must report error');
  assertEqual(webRes.errorCode, 'ANDROID_NATIVE_REQUIRED', 'Truthful native required code');

  // connectionMethod='euler' passthrough check
  let lastMethod: string | undefined;
  const methodConnector = new TikTokLiveConnector({
    ...mockAdapter,
    connect: async (opts) => {
      lastMethod = opts.connectionMethod;
      return {
        accepted: true,
        status: {
          state: 'connecting_euler',
          transport: 'euler',
          connectionMethod: opts.connectionMethod,
          roomStatus: 'live',
          username: opts.username,
          roomId: '888999',
          viewerCount: 10,
          totalLikeCount: 5,
          message: 'Menghubungkan via EulerStream...',
        },
      };
    },
  });
  const eulerRes = await methodConnector.connect({
    username: 'linked_user',
    connectionMethod: 'euler',
    eulerApiKey: 'secret-key-sample',
  });
  assertEqual(lastMethod, 'euler', 'connectionMethod=euler forwarded to adapter');
  assertEqual(eulerRes.connectionMethod, 'euler', 'status preserves connectionMethod=euler');
  assertEqual(eulerRes.roomStatus, 'live', 'status preserves roomStatus=live');
  await methodConnector.destroy();

  // Euler JWT passthrough, mutual exclusivity, missing-key rejection, Direct zero-key, & credential change detection
  const recordedConnectCalls: Array<{
    username: string;
    connectionMethod?: string;
    eulerApiKey?: string;
    eulerJwtKey?: string;
    allowEulerFallback?: boolean;
  }> = [];
  const jwtConnector = new TikTokLiveConnector({
    ...mockAdapter,
    connect: async (opts) => {
      recordedConnectCalls.push({ ...opts });
      return {
        accepted: true,
        status: {
          state: opts.connectionMethod === 'euler' ? 'connecting_euler' : 'resolving_room',
          transport: opts.connectionMethod === 'euler' ? 'euler' : 'none',
          connectionMethod: opts.connectionMethod,
          roomStatus: 'unknown',
          username: opts.username,
          roomId: '',
          viewerCount: 0,
          totalLikeCount: 0,
          message: `Connecting @${opts.username}`,
        },
      };
    },
  });

  // 1. Direct mode requires neither API key nor JWT
  const directZeroKey = await jwtConnector.connect({
    username: 'direct_creator',
    connectionMethod: 'direct',
    allowEulerFallback: true,
  });
  assertEqual(directZeroKey.state, 'resolving_room', 'Direct mode connects without API key or JWT');
  assertEqual(recordedConnectCalls.length, 1, 'Direct zero-key reaches adapter');
  assertEqual(recordedConnectCalls[0].eulerApiKey, undefined, 'Direct zero-key sends no API key');
  assertEqual(recordedConnectCalls[0].eulerJwtKey, undefined, 'Direct zero-key sends no JWT');

  // 2. Updating credentials (adding JWT) during an active session must reconfigure instead of being blocked by dedup
  const withFallbackJwt = await jwtConnector.connect({
    username: 'direct_creator',
    connectionMethod: 'direct',
    allowEulerFallback: true,
    eulerJwtKey: '  jwt.secret.token.1234  ',
  });
  assertEqual(withFallbackJwt.state, 'resolving_room', 'Credential update triggers new connect');
  assertEqual(recordedConnectCalls.length, 2, 'Credential update bypasses duplicate suppression');
  assertEqual(recordedConnectCalls[1].eulerJwtKey, 'jwt.secret.token.1234', 'Trimmed JWT passed to adapter');
  assertEqual(recordedConnectCalls[1].eulerApiKey, undefined, 'API key omitted when JWT is active');

  // 3. Clearing credentials or toggling fallback during active session must also reconfigure
  await jwtConnector.connect({
    username: 'direct_creator',
    connectionMethod: 'direct',
    allowEulerFallback: false,
  });
  assertEqual(recordedConnectCalls.length, 3, 'Fallback/credential clear triggers reconfigure');
  assertEqual(recordedConnectCalls[2].allowEulerFallback, false, 'allowEulerFallback=false forwarded');
  assertEqual(recordedConnectCalls[2].eulerJwtKey, undefined, 'Cleared JWT no longer forwarded');

  // 4. Simultaneous API Key + JWT must be rejected honestly without touching adapter or leaking secrets
  const conflictingRes = await jwtConnector.connect({
    username: 'direct_creator',
    connectionMethod: 'euler',
    eulerApiKey: 'secret-api-value',
    eulerJwtKey: 'secret-jwt-value',
  });
  assertEqual(conflictingRes.state, 'error', 'Conflicting credentials enter error state');
  assertEqual(conflictingRes.errorCode, 'EULER_CONFLICTING_CREDENTIALS', 'Reports EULER_CONFLICTING_CREDENTIALS');
  assert(!conflictingRes.message.includes('secret-api-value'), 'Conflict error never exposes API key');
  assert(!conflictingRes.message.includes('secret-jwt-value'), 'Conflict error never exposes JWT');
  assertEqual(recordedConnectCalls.length, 3, 'Conflicting credentials never sent to adapter');

  // 5. Explicit Euler method without API Key or JWT fails honestly
  const missingEulerCredsRes = await jwtConnector.connect({
    username: 'direct_creator',
    connectionMethod: 'euler',
  });
  assertEqual(missingEulerCredsRes.state, 'error', 'Euler without credentials enters error state');
  assertEqual(missingEulerCredsRes.errorCode, 'EULER_API_KEY_REQUIRED', 'Reports EULER_API_KEY_REQUIRED');
  assertEqual(recordedConnectCalls.length, 3, 'Missing Euler credential never sent to adapter');

  // 6. Explicit Euler method with JWT connects cleanly
  const validEulerJwtRes = await jwtConnector.connect({
    username: 'euler_jwt_user',
    connectionMethod: 'euler',
    eulerJwtKey: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
  });
  assertEqual(validEulerJwtRes.state, 'connecting_euler', 'Euler with JWT transitions to connecting_euler');
  assertEqual(recordedConnectCalls.length, 4, 'Valid Euler JWT invokes adapter');
  assertEqual(recordedConnectCalls[3].eulerJwtKey, 'eyJhbGciOiJIUzI1NiJ9.payload.sig', 'Euler JWT forwarded');
  assertEqual(recordedConnectCalls[3].eulerApiKey, undefined, 'No API key sent with Euler JWT');

  await jwtConnector.disconnect();
  await jwtConnector.destroy();
}

function runStorageAndBackupSecurityTests(): void {
  const sanitized = sanitizeTikTokAccountState({
    isLinked: true,
    openId: 'oid_123',
    username: '@kreator_live',
    displayName: 'Kreator Live',
    connectionMethod: 'euler',
    fallbackEnabled: false,
    accountLinkStatus: 'linked',
    lastSuccessfulAuthorization: 1731571200000,
    grantedScopes: ['user.info.basic', 'user.info.profile'],
  });
  assertEqual(sanitized.isLinked, true, 'sanitize preserves linked');
  assertEqual(sanitized.username, 'kreator_live', 'sanitize strips leading @ from username');
  assertEqual(sanitized.connectionMethod, 'euler', 'sanitize keeps valid connectionMethod');
  assertEqual(sanitized.fallbackEnabled, false, 'sanitize keeps fallbackEnabled=false');

  // Linking without openId cannot pretend to be linked
  const fakeLinked = sanitizeTikTokAccountState({
    isLinked: true,
    accountLinkStatus: 'linked',
  });
  assertEqual(fakeLinked.isLinked, false, 'account without openId must not remain linked');
  assertEqual(fakeLinked.accountLinkStatus, 'unlinked', 'missing openId resets status to unlinked');

  // Credential exclusion from backup export/import (both API Key and JWT Key)
  const withSecret = {
    ...DEFAULT_SETTINGS,
    eulerStreamApiKey: 'euler_live_secret_9999',
    eulerStreamJwtKey: 'eyJhbGciOiJIUzI1NiJ9.secret.jwt8888',
    tiktokConnectionMethod: 'euler' as const,
  };
  const exported = omitCredentials(withSecret);
  assertEqual('eulerStreamApiKey' in exported, false, 'eulerStreamApiKey omitted from backup export');
  assertEqual('eulerStreamJwtKey' in exported, false, 'eulerStreamJwtKey omitted from backup export');
  const merged = mergeBackupSettings(
    { eulerStreamApiKey: 'attacker_key', eulerStreamJwtKey: 'attacker_jwt', theme: 'midnight_oled' },
    withSecret
  );
  assertEqual(merged.eulerStreamApiKey, 'euler_live_secret_9999', 'import never overwrites local euler key');
  assertEqual(merged.eulerStreamJwtKey, 'eyJhbGciOiJIUzI1NiJ9.secret.jwt8888', 'import never overwrites local euler jwt');
  assertEqual(maskApiKeyPreview('euler_live_secret_9999'), '••••9999', 'API key masked cleanly');
  assertEqual(maskApiKeyPreview('eyJhbGciOiJIUzI1NiJ9.secret.8888'), '••••8888', 'JWT masked cleanly');
}

async function runOAuthPkceAndScopeTests(): Promise<void> {
  // 1. Missing config must fail honestly without starting fake OAuth
  const unconfigured = getTikTokAuthConfiguration();
  assertEqual(unconfigured.isWebOAuthReady, false, 'Unconfigured workspace reports web OAuth not ready');
  assert(unconfigured.missingRequirements.length > 0, 'Lists missing OAuth prerequisites');
  const startFail = await startTikTokOAuthLogin(unconfigured);
  assertEqual(startFail.started, false, 'Cannot start OAuth without clientKey/redirectUri/backend');

  // 2. Callback state mismatch rejected
  savePendingPkce({
    state: 'expected_state_123',
    codeVerifier: 'verifier_abc',
    redirectUri: 'https://syntxrr.example.com/callback',
    requestedScopes: ['user.info.basic', 'user.info.profile'],
    createdAt: 1000,
  });
  const mismatch = await handleTikTokAuthCallbackUrl(
    'https://syntxrr.example.com/callback?code=auth123&state=wrong_state',
    { nowMs: 2000 }
  );
  assertEqual(mismatch.success, false, 'Mismatched OAuth state rejected');
  if (!mismatch.success) {
    assertEqual(mismatch.errorCode, 'STATE_MISMATCH', 'Reports STATE_MISMATCH');
  }

  // 3. Expired PKCE rejected
  savePendingPkce({
    state: 'state_ttl',
    codeVerifier: 'verifier_ttl',
    redirectUri: 'https://syntxrr.example.com/callback',
    requestedScopes: ['user.info.basic'],
    createdAt: 1000,
  });
  const expired = await handleTikTokAuthCallbackUrl(
    'https://syntxrr.example.com/callback?code=auth123&state=state_ttl',
    { nowMs: 1000 + 11 * 60 * 1000 }
  );
  assertEqual(expired.success, false, 'Expired PKCE session rejected');
  if (!expired.success) {
    assertEqual(expired.errorCode, 'EXPIRED_AUTH', 'Reports EXPIRED_AUTH');
  }

  // 4. Verified exchange with user.info.basic only MUST NOT fabricate/keep username
  savePendingPkce({
    state: 'state_basic',
    codeVerifier: 'verifier_basic',
    redirectUri: 'https://syntxrr.example.com/callback',
    requestedScopes: ['user.info.basic'],
    createdAt: 1000,
  });
  const basicResult = await handleTikTokAuthCallbackUrl(
    'https://syntxrr.example.com/callback?code=ok_code&state=state_basic',
    {
      nowMs: 2500,
      exchangeFn: async () => ({
        open_id: 'tt_open_basic',
        display_name: 'Streamer Basic',
        username: 'should_not_trust_without_profile_scope',
        scope: 'user.info.basic',
      }),
    }
  );
  assertEqual(basicResult.success, true, 'Basic scope login succeeds');
  if (basicResult.success) {
    assertEqual(basicResult.profile.openId, 'tt_open_basic', 'openId saved');
    assertEqual(basicResult.profile.username, undefined, 'username omitted without user.info.profile');
    assertEqual(basicResult.profile.displayName, 'Streamer Basic', 'displayName saved');
  }

  // 5. Verified exchange with user.info.profile populates username + updates account state
  savePendingPkce({
    state: 'state_profile',
    codeVerifier: 'verifier_profile',
    redirectUri: 'https://syntxrr.example.com/callback',
    requestedScopes: ['user.info.basic', 'user.info.profile'],
    createdAt: 1000,
  });
  const profileResult = await handleTikTokAuthCallbackUrl(
    'https://syntxrr.example.com/callback?code=ok_profile&state=state_profile',
    {
      nowMs: 3000,
      exchangeFn: async () => ({
        open_id: 'tt_open_profile',
        display_name: 'Streamer Pro',
        username: '@streamer_pro',
        scope: 'user.info.basic,user.info.profile',
      }),
    }
  );
  assertEqual(profileResult.success, true, 'Profile scope login succeeds');
  if (profileResult.success) {
    const linked = applyVerifiedProfileToAccountState(DEFAULT_TIKTOK_ACCOUNT_STATE, profileResult.profile);
    assertEqual(linked.isLinked, true, 'Account marked linked');
    assertEqual(linked.username, 'streamer_pro', 'Username populated when user.info.profile granted');
    assertEqual(linked.accountLinkStatus, 'linked', 'accountLinkStatus linked');
    assertEqual(linked.lastSuccessfulAuthorization, 3000, 'lastSuccessfulAuthorization recorded');
  }

  clearPendingPkce();
}

function runHonestStatusAndHudTests(): void {
  // Kondisi D: started without LIVE connection
  const noLiveSummary = buildModeAHonestStatus({
    account: {
      isLinked: true,
      openId: 'oid_1',
      username: 'kreator_a',
      connectionMethod: 'direct',
      fallbackEnabled: true,
      accountLinkStatus: 'linked',
    },
    connector: {
      state: 'disconnected',
      transport: 'none',
      connectionMethod: 'direct',
      roomStatus: 'unknown',
      username: '',
      roomId: '',
      viewerCount: 0,
      totalLikeCount: 0,
      message: 'Belum terhubung',
      updatedAt: 0,
    },
    companionRunning: true,
    sessionMode: 'without_live_connection',
  });
  assertEqual(noLiveSummary.accountLinked.label, 'Terhubung', 'Account remains linked');
  assertEqual(noLiveSummary.modeASession.label, 'Aktif (tanpa koneksi LIVE)', 'Session shows without LIVE connection');
  assertEqual(noLiveSummary.eventTransport.label, 'Disconnected', 'Event transport remains Disconnected');

  const hudNoLive = hudEventSourceStatus([], 'disconnected', 'without_live_connection');
  assertEqual(hudNoLive.text, 'Tanpa koneksi LIVE', 'HUD header shows without LIVE connection');
  const chatNoLive = buildChatModel([], 'chat', false, 0, 'disconnected', 'without_live_connection');
  assert(
    (chatNoLive.emptyText || '').includes('tanpa koneksi LIVE'),
    'HUD chat empty state informs LIVE events unavailable'
  );

  // Waiting for LIVE state separation
  const waitingSummary = buildModeAHonestStatus({
    account: {
      isLinked: true,
      openId: 'oid_1',
      username: 'kreator_a',
      connectionMethod: 'direct',
      fallbackEnabled: true,
      accountLinkStatus: 'linked',
    },
    connector: {
      state: 'waiting_for_live',
      transport: 'none',
      connectionMethod: 'direct',
      roomStatus: 'not_live',
      username: 'kreator_a',
      roomId: '',
      viewerCount: 0,
      totalLikeCount: 0,
      message: 'Menunggu @kreator_a memulai LIVE...',
      updatedAt: 0,
    },
    companionRunning: true,
    sessionMode: 'with_live_connector',
  });
  assertEqual(waitingSummary.roomStatus.label, 'Belum LIVE', 'Room status separates Belum LIVE');
  assertEqual(waitingSummary.eventTransport.label, 'Menunggu LIVE', 'Transport separates Menunggu LIVE');
}

function runTargetUsernameResolutionTests(): void {
  assertEqual(normalizeTikTokTargetUsername('  @@contoh_user  '), 'contoh_user', 'Normalizes leading @ and spaces');
  assertEqual(isValidTikTokTargetUsername('@contoh'), true, 'Validates @contoh');
  assertEqual(isValidTikTokTargetUsername('   '), false, 'Rejects empty username');
  assertEqual(isValidTikTokTargetUsername('@bad user!'), false, 'Rejects invalid characters');

  // Shared target username works even when OAuth is unconfigured/unlinked
  const resolvedPublic = resolveTikTokTargetUsername(
    { tiktokUsername: '  @contoh  ' },
    { isLinked: false, username: undefined }
  );
  assertEqual(resolvedPublic, 'contoh', 'Public target resolves without OAuth');

  // Manual target takes precedence over OAuth profile username
  const resolvedManualPriority = resolveTikTokTargetUsername(
    { tiktokUsername: 'target_live' },
    { isLinked: true, username: 'oauth_owner' }
  );
  assertEqual(resolvedManualPriority, 'target_live', 'Manual target takes priority over OAuth username');

  // Falls back to linked OAuth username if manual target is empty
  const resolvedFallback = resolveTikTokTargetUsername(
    { tiktokUsername: '' },
    { isLinked: true, username: '@oauth_owner' }
  );
  assertEqual(resolvedFallback, 'oauth_owner', 'Falls back to linked OAuth username when manual target empty');
}

async function main(): Promise<void> {
  runNormalizerTests();
  runBoundedDedupTests();
  await runConnectorStateAndBusTests();
  runStorageAndBackupSecurityTests();
  await runOAuthPkceAndScopeTests();
  runHonestStatusAndHudTests();
  runTargetUsernameResolutionTests();
  console.log('ALL_TIKTOK_CONNECTOR_TESTS_PASSED');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
