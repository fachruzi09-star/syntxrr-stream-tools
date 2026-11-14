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
  type TikTokTransportAdapter,
} from '../tiktokLiveConnector';

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
}

async function main(): Promise<void> {
  runNormalizerTests();
  runBoundedDedupTests();
  await runConnectorStateAndBusTests();
  console.log('ALL_TIKTOK_CONNECTOR_TESTS_PASSED');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
