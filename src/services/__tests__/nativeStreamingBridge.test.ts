import type { PluginListenerHandle } from '@capacitor/core';
import {
  __resetNativeStreamingBridgeForTests,
  __setNativeStreamingBridgeTestAdapter,
  canChangeActivePresetDuringModeB,
  clearModeBOverlayAssetNamespace,
  clearModeBOverlayAssets,
  createModeBOverlaySnapshot,
  createModeBScreenCaptureLayer,
  forwardModeBOverlayEvent,
  getModeBStreamStatus,
  isModeBSceneMutationLocked,
  isNativeStreamingAvailable,
  onModeBStreamState,
  prepareModeBOverlayAssets,
  pushModeBOverlayEvent,
  replaceModeBLiveOverlayScene,
  requestModeBScreenReshare,
  setModeBHostWait,
  startModeBStream,
  stopModeBStream,
  uploadModeBOverlayAsset,
  type ModeBStreamSnapshot,
  type NativeStreamingPluginInterface,
} from '../nativeStreamingBridge';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function createMockPlugin(overrides: Partial<NativeStreamingPluginInterface> = {}) {
  const calls: Array<{ method: string; args?: unknown }> = [];
  const stateListeners: Array<(snapshot: ModeBStreamSnapshot) => void> = [];
  let handleRemovedCount = 0;

  const plugin: NativeStreamingPluginInterface = {
    async clearOverlayAssets() {
      calls.push({ method: 'clearOverlayAssets' });
      return { success: true };
    },
    async clearOverlayAssetNamespace(options) {
      calls.push({ method: 'clearOverlayAssetNamespace', args: options });
      return { success: true };
    },
    async uploadOverlayAsset(options) {
      calls.push({ method: 'uploadOverlayAsset', args: options });
      return { success: true, bytes: options.dataBase64.length };
    },
    async startStream(options) {
      calls.push({ method: 'startStream', args: options });
      return { success: true, status: 'starting', message: 'Izin capture diterima.' };
    },
    async stopStream() {
      calls.push({ method: 'stopStream' });
      return { success: true, status: 'stopping' };
    },
    async requestScreenReshare() {
      calls.push({ method: 'requestScreenReshare' });
      return { success: true, status: 'resharing', isStreaming: true, message: 'Reshare dimulai.' };
    },
    async setHostWait(options) {
      calls.push({ method: 'setHostWait', args: options });
      return {
        success: true,
        status: options.enabled ? 'host_wait' : 'live',
        isStreaming: true,
        message: options.enabled ? 'Layar tunggu aktif.' : 'LIVE dilanjutkan.',
      };
    },
    async replaceLiveScene(options) {
      calls.push({ method: 'replaceLiveScene', args: options });
      return { success: true, status: 'live', message: 'Scene diperbarui.' };
    },
    async pushOverlayEvent(event) {
      calls.push({ method: 'pushOverlayEvent', args: event });
      return { accepted: true };
    },
    async getStatus() {
      calls.push({ method: 'getStatus' });
      return { status: 'live', message: 'RTMP aktif', isStreaming: true, bitrateKbps: 3800 };
    },
    async addListener(eventName, listenerFunc): Promise<PluginListenerHandle> {
      calls.push({ method: 'addListener', args: eventName });
      stateListeners.push(listenerFunc);
      return {
        remove: async () => {
          handleRemovedCount += 1;
          const idx = stateListeners.indexOf(listenerFunc);
          if (idx >= 0) stateListeners.splice(idx, 1);
        },
      };
    },
    ...overrides,
  };

  return {
    plugin,
    calls,
    emitState: (snapshot: ModeBStreamSnapshot) => {
      for (const fn of [...stateListeners]) fn(snapshot);
    },
    getListenerCount: () => stateListeners.length,
    getHandleRemovedCount: () => handleRemovedCount,
  };
}

async function runTests(): Promise<void> {
  // 1. V109 composition & projection layer assertions
  const element = {
    id: 'overlay_text',
    name: 'Overlay Text',
    type: 'text',
    x: 10,
    y: 12,
    width: 40,
    height: 10,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: { text: 'LIVE' },
  };

  const snapshot = createModeBOverlaySnapshot([element]);
  assertEqual(snapshot.length, 1, 'native snapshot contains only actual Studio overlay elements');
  assertEqual(snapshot[0].id, element.id, 'the original Studio overlay is retained');
  assertEqual(snapshot[0].type, 'text', 'ordinary overlay element type is preserved');
  assertEqual(snapshot[0].properties.text, 'LIVE', 'allowed text properties are retained');
  assertEqual(
    snapshot.some((item) => item.id === 'syntxrr_preset_background'),
    false,
    'preset background is never synthesized as a post-capture overlay',
  );
  assertEqual(
    snapshot[0].properties['imageUrl'],
    undefined,
    'arbitrary WebView media URLs never cross the native bridge',
  );
  assertEqual(createModeBOverlaySnapshot(null).length, 0, 'null input returns empty snapshot');

  // A1.2: dynamic_text & username Mode B native snapshot property forwarding
  const dynamicSnapshot = createModeBOverlaySnapshot([
    {
      id: 'dyn_text_1',
      name: 'Teks Dinamis',
      type: 'dynamic_text',
      x: 5,
      y: 8,
      width: 65,
      height: 8,
      layer: 2,
      visible: true,
      opacity: 100,
      rotation: 0,
      properties: {
        template: 'Top Donatur: {top_donor_name}',
        fallback: 'Belum ada donasi hari ini',
        fontSize: 18,
        textColor: '#FDE047',
        backgroundColor: 'transparent',
        target: 'Rp 1.000.000',
        imageUrl: 'https://evil.example/a.png',
        oversizedProp: 'x'.repeat(1001),
      },
    },
    {
      id: 'user_badge_1',
      name: 'Nama Penonton',
      type: 'username',
      x: 5,
      y: 20,
      width: 45,
      height: 8,
      layer: 3,
      visible: true,
      opacity: 100,
      rotation: 0,
      properties: {
        prefix: '⭐ ',
        badge: 'VIP Supporter',
        fontSize: 14,
        textColor: '#FFFFFF',
        backgroundColor: '#111827',
        avatarUrl: 'https://evil.example/avatar.png',
      },
    },
    {
      id: 'prog_1',
      name: 'Progress Bar',
      type: 'progress_bar',
      x: 5,
      y: 35,
      width: 80,
      height: 9,
      layer: 1,
      visible: true,
      opacity: 100,
      rotation: 0,
      properties: {
        currentAmount: 350000,
        targetAmount: 1000000,
        currency: 'Rp',
      },
    },
  ]);
  assertEqual(dynamicSnapshot.length, 3, 'dynamic_text, username, and progress_bar included in snapshot');
  assertEqual(dynamicSnapshot[0].type, 'progress_bar', 'elements sorted by layer ascending');
  assertEqual(dynamicSnapshot[0].properties.currency, 'Rp', 'progress_bar currency retained for target parity');
  assertEqual(dynamicSnapshot[0].properties.targetAmount, 1000000, 'progress_bar targetAmount retained');
  assertEqual(dynamicSnapshot[1].type, 'dynamic_text', 'dynamic_text element retained');
  assertEqual(
    dynamicSnapshot[1].properties.template,
    'Top Donatur: {top_donor_name}',
    'dynamic_text template forwarded to native snapshot',
  );
  assertEqual(
    dynamicSnapshot[1].properties.fallback,
    'Belum ada donasi hari ini',
    'dynamic_text fallback forwarded to native snapshot',
  );
  assertEqual(dynamicSnapshot[1].properties.fontSize, 18, 'dynamic_text fontSize forwarded');
  assertEqual(dynamicSnapshot[1].properties.textColor, '#FDE047', 'dynamic_text textColor forwarded');
  assertEqual(dynamicSnapshot[1].properties.backgroundColor, 'transparent', 'dynamic_text transparent backgroundColor forwarded');
  assertEqual(dynamicSnapshot[1].properties.target, 'Rp 1.000.000', 'dynamic_text target forwarded');
  assertEqual(dynamicSnapshot[1].properties['imageUrl'], undefined, 'dynamic_text rejects non-allowlisted imageUrl');
  assertEqual(dynamicSnapshot[1].properties['oversizedProp'], undefined, 'dynamic_text rejects non-allowlisted oversized props');
  assertEqual(dynamicSnapshot[2].type, 'username', 'username element retained');
  assertEqual(dynamicSnapshot[2].properties.prefix, '⭐ ', 'username prefix forwarded with trailing space preserved');
  assertEqual(dynamicSnapshot[2].properties.badge, 'VIP Supporter', 'username badge forwarded to native snapshot');
  assertEqual(dynamicSnapshot[2].properties.fontSize, 14, 'username fontSize forwarded');
  assertEqual(dynamicSnapshot[2].properties.textColor, '#FFFFFF', 'username textColor forwarded');
  assertEqual(dynamicSnapshot[2].properties.backgroundColor, '#111827', 'username backgroundColor forwarded');
  assertEqual(dynamicSnapshot[2].properties['avatarUrl'], undefined, 'username rejects arbitrary avatarUrl');

  const manyElements = Array.from({ length: 60 }, (_, index) => ({
    ...element,
    id: `element_${index}`,
    layer: index + 1,
  }));
  const boundedSnapshot = createModeBOverlaySnapshot(manyElements);
  assertEqual(boundedSnapshot.length, 60, 'native overlay bound accepts 60 Studio elements');
  assertEqual(boundedSnapshot[0].id, 'element_0', 'first item ordered by layer');
  assertEqual(boundedSnapshot[59].id, 'element_59', 'last item ordered by layer');

  const reorderedSnapshot = createModeBOverlaySnapshot([
    { ...element, id: 'higher', layer: 9 },
    { ...element, id: 'lower', layer: 2 },
  ]);
  assertEqual(reorderedSnapshot[0].id, 'lower', 'overlay layers sort ascending');
  assertEqual(reorderedSnapshot[1].id, 'higher', 'higher layer renders later');

  let oversizedSnapshotRejected = false;
  try {
    createModeBOverlaySnapshot([...manyElements, { ...element, id: 'element_60', layer: 61 }]);
  } catch (error) {
    oversizedSnapshotRejected = error instanceof Error && error.message.includes('60 elemen');
  }
  assert(oversizedSnapshotRejected, 'snapshot rejects more than 60 visible Studio overlay elements');

  const screenCaptureElement = {
    id: 'screen_main',
    name: 'Tangkapan Layar',
    type: 'screen_capture',
    x: 0,
    y: 20,
    width: 100,
    height: 56,
    layer: 1,
    visible: true,
    opacity: 100,
    rotation: 0,
    properties: { cropMode: 'fit' },
  };
  const screenLayer = createModeBScreenCaptureLayer([
    screenCaptureElement,
    { ...element, id: 'camera_top', type: 'camera', layer: 2 },
  ]);
  assertEqual(screenLayer.enabled, true, 'visible screen capture creates active projection layer');
  assertEqual(screenLayer.y, 20, 'screen capture y position retained');
  assertEqual(screenLayer.cropMode, 'fit', 'Fit crop mode retained');
  assertEqual(createModeBOverlaySnapshot([screenCaptureElement]).length, 0, 'screen capture excluded from overlay snapshot');
  assertEqual(createModeBScreenCaptureLayer([]).width, 100, 'default full-frame layer retained');
  assertEqual(
    createModeBScreenCaptureLayer([{ ...screenCaptureElement, visible: false }]).enabled,
    false,
    'hidden screen capture disables visual layer only',
  );

  // 2. Non-Android / browser unavailability behavior (must never simulate streaming)
  await __resetNativeStreamingBridgeForTests();
  assertEqual(isNativeStreamingAvailable(), false, 'unavailable in Node/non-Android runtime');
  const webStart = await startModeBStream({
    rtmpUrl: 'rtmp://live.example.com/app/key123',
    width: 1280,
    height: 720,
    videoBitrate: 4_000_000,
    audioBitrate: 128_000,
    fps: 30,
    sceneAssetNamespace: 'scene_test_12345',
  });
  assertEqual(webStart.status, 'error', 'startModeBStream fails cleanly outside Android');
  assertEqual(webStart.isStreaming, false, 'non-Android never fakes isStreaming=true');
  const webStatus = await getModeBStreamStatus();
  assertEqual(webStatus.status, 'idle', 'non-Android status stays idle');
  assertEqual(await onModeBStreamState(() => undefined), null, 'non-Android does not register listener');
  assertEqual((await clearModeBOverlayAssets()).success, false, 'clearModeBOverlayAssets fails cleanly outside Android');
  assertEqual((await pushModeBOverlayEvent({ id: '1', type: 'chat', username: 'u', detail: 'hi', timestamp: 1 })).accepted, false, 'pushModeBOverlayEvent rejects outside Android');

  // 3. Android runtime: input validation, RTMP start contract, cache cleanup
  const mock = createMockPlugin();
  __setNativeStreamingBridgeTestAdapter({ plugin: mock.plugin, isNativeAvailable: true });
  assertEqual(isNativeStreamingAvailable(), true, 'test adapter enables Android bridge path');

  const invalidRtmp = await startModeBStream({
    rtmpUrl: 'https://invalid.example.com',
    width: 1280,
    height: 720,
    videoBitrate: 4_000_000,
    audioBitrate: 128_000,
    fps: 30,
    sceneAssetNamespace: 'scene_valid_12345',
  });
  assertEqual(invalidRtmp.status, 'error', 'non-RTMP URL rejected cleanly');
  assertEqual(
    mock.calls.some((c) => c.method === 'clearOverlayAssets'),
    true,
    'invalid start cleans up staged cache quietly',
  );
  assertEqual(
    mock.calls.some((c) => c.method === 'startStream'),
    false,
    'invalid RTMP URL never calls native startStream',
  );

  mock.calls.length = 0;
  const startRes = await startModeBStream({
    rtmpUrl: '  rtmps://a.rtmp.example.com/live/stream_key_1  ',
    width: 1280,
    height: 720,
    videoBitrate: 4_000_000,
    audioBitrate: 128_000,
    fps: 30,
    audioSource: 'internal',
    sceneAssetNamespace: 'scene_valid_12345',
    overlayElements: snapshot,
    screenCaptureLayer: screenLayer,
  });
  assertEqual(startRes.status, 'starting', 'startModeBStream reports starting from native');
  assertEqual(startRes.isStreaming, false, 'startModeBStream never claims live RTMP before streamState');
  const startCall = mock.calls.find((c) => c.method === 'startStream');
  assert(startCall !== undefined, 'native startStream invoked');
  assertEqual(
    (startCall?.args as { rtmpUrl: string }).rtmpUrl,
    'rtmps://a.rtmp.example.com/live/stream_key_1',
    'trimmed valid RTMPS URL preserved intact',
  );

  // 4. Direct upload, namespace clear, prepareModeBOverlayAssets
  const badUpload = await uploadModeBOverlayAsset({
    id: '../bad',
    mimeType: 'image/png',
    dataBase64: 'AAAA',
  });
  assertEqual(badUpload.success, false, 'invalid asset id rejected before native call');

  const goodUpload = await uploadModeBOverlayAsset({
    id: 'img_badge_1',
    assetType: 'image',
    mimeType: 'image/png',
    dataBase64: 'iVBORw0KGgo=',
    assetNamespace: 'scene_valid_12345',
  });
  assertEqual(goodUpload.success, true, 'valid image upload forwards to native plugin');
  assertEqual((await clearModeBOverlayAssetNamespace('bad')).success, false, 'invalid namespace rejected');
  assertEqual((await clearModeBOverlayAssetNamespace('scene_valid_12345')).success, true, 'valid namespace cleared');

  // Text-only preset requires no resolver
  const textPrepared = await prepareModeBOverlayAssets(snapshot);
  assert(textPrepared.sceneAssetNamespace.startsWith('scene_'), 'generated valid scene namespace');

  // Image + screensaver staging with explicit resolver
  mock.calls.length = 0;
  const mediaPrepared = await prepareModeBOverlayAssets(
    [
      {
        ...element,
        id: 'img_el',
        type: 'image',
        properties: { imageAssetId: 'img_overlay_1' },
      },
    ],
    'bg_main_1',
    {
      preserveExistingCache: true,
      screensaverAssetId: 'saver_mp4_1',
      screensaverAssetType: 'video',
      resolveAssets: async (ids) => {
        assertEqual(ids.length, 3, 'resolver receives overlay image, background, and screensaver ids');
        return [
          {
            id: 'img_overlay_1',
            name: 'logo.png',
            type: 'image',
            mimeType: 'image/png',
            sizeBytes: 4,
            blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
          },
          {
            id: 'bg_main_1',
            name: 'bg.png',
            type: 'image',
            mimeType: 'image/png',
            sizeBytes: 4,
            blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
          },
          {
            id: 'saver_mp4_1',
            name: 'wait.mp4',
            type: 'video',
            mimeType: 'video/mp4',
            sizeBytes: 8,
            blob: new Blob([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], {
              type: 'video/mp4',
            }),
          },
        ];
      },
    },
  );
  assert(mediaPrepared.backgroundAssetNamespace.startsWith('background_'), 'background namespace created');
  assert(mediaPrepared.screensaverAssetNamespace.startsWith('screensaver_'), 'screensaver namespace created');
  assertEqual(
    mock.calls.filter((c) => c.method === 'uploadOverlayAsset').length,
    3,
    'all 3 unique assets uploaded to isolated namespaces',
  );

  // 5. replaceLiveScene + screensaverAssetNamespace forwarding + reshare + hostWait + stop + getStatus
  mock.calls.length = 0;
  const replaced = await replaceModeBLiveOverlayScene({
    overlayElements: snapshot,
    screenCaptureLayer: screenLayer,
    activeBackgroundAssetId: 'bg_old',
    backgroundAssetId: 'bg_main_1',
    transitionOut: { type: 'fade', durationMs: 250 },
    transitionIn: { type: 'fade', durationMs: 300 },
    screensaver: { on: true, text: 'Wait...', mediaType: 'image' },
    resolveAssets: async () => [
      {
        id: 'bg_main_1',
        name: 'bg.png',
        type: 'image',
        mimeType: 'image/png',
        sizeBytes: 4,
        blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
      },
    ],
  });
  assertEqual(replaced.success, true, 'replaceModeBLiveOverlayScene succeeds with valid inputs');
  const replaceCall = mock.calls.find((c) => c.method === 'replaceLiveScene');
  assert(replaceCall !== undefined, 'native replaceLiveScene called');
  assert(
    'screensaverAssetNamespace' in (replaceCall?.args as Record<string, unknown>),
    'replaceLiveScene payload includes screensaverAssetNamespace contract field',
  );

  const hostWaitRes = await setModeBHostWait(true);
  assertEqual(hostWaitRes.status, 'live', 'setModeBHostWait returns latest getStatus snapshot');
  const reshareRes = await requestModeBScreenReshare();
  assertEqual(reshareRes.status, 'resharing', 'requestModeBScreenReshare returns native resharing status');
  assertEqual(reshareRes.isStreaming, true, 'reshare keeps session streaming');
  assertEqual(await canChangeActivePresetDuringModeB(), false, 'live status blocks active preset change');
  const stopRes = await stopModeBStream();
  assertEqual(stopRes.status, 'stopping', 'stopModeBStream returns stopping status');

  // 6. Real vs simulated overlay event forwarding
  mock.calls.length = 0;
  forwardModeBOverlayEvent({
    id: 'sim_1',
    type: 'chat',
    username: 'bot',
    detail: 'sim',
    timestamp: 1000,
    isSimulation: true,
  });
  assertEqual(mock.calls.length, 0, 'simulated events never forward to Mode B native overlay');

  // Enable forwarding via streamState live emission & test deduplication + teardown
  const receivedA: ModeBStreamSnapshot[] = [];
  const receivedB: ModeBStreamSnapshot[] = [];
  const listenerA = (s: ModeBStreamSnapshot) => {
    receivedA.push(s);
  };
  const listenerB = (s: ModeBStreamSnapshot) => {
    receivedB.push(s);
    throw new Error('subscriber error must not break others');
  };

  const [subA1, subA2, subB] = await Promise.all([
    onModeBStreamState(listenerA),
    onModeBStreamState(listenerA), // duplicate callback ignored
    onModeBStreamState(listenerB),
  ]);
  assertEqual(mock.getListenerCount(), 1, 'concurrent subscriptions register only ONE native streamState listener');
  assertEqual(isModeBSceneMutationLocked(), true, 'scene edits start locked until idle snapshot arrives');

  mock.emitState({ status: 'live', message: 'RTMP live', isStreaming: true, bitrateKbps: 4200, timestamp: 2000 });
  assertEqual(receivedA.length, 1, 'duplicate callback fires only once per event');
  assertEqual(receivedB.length, 1, 'second subscriber receives event cleanly');

  // Now forwarding is active -> real non-simulated event forwards
  mock.calls.length = 0;
  forwardModeBOverlayEvent({
    id: 'real_1',
    type: 'gift',
    username: 'alice',
    detail: 'Rose x5',
    diamondCount: 5,
    repeatCount: 5,
    timestamp: 2500,
  });
  await Promise.resolve();
  assertEqual(
    mock.calls.filter((c) => c.method === 'pushOverlayEvent').length,
    1,
    'real non-simulated event forwards once Mode B is live',
  );

  // Idle state unlocks scene mutations
  mock.emitState({ status: 'idle', message: 'Idle', isStreaming: false, bitrateKbps: 0, timestamp: 3000 });
  assertEqual(isModeBSceneMutationLocked(), false, 'idle streamState unlocks Mode B scene mutations');

  // Bridge never fabricates canStartNewSession=true when omitted or on browser fallback
  assertEqual(stopRes.canStartNewSession, false, 'stopModeBStream does not fabricate readiness true when omitted');
  const readPluginWithFlag = createMockPlugin({
    async getStatus() {
      return {
        status: 'stopped',
        message: 'Cleanup selesai',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: true,
      };
    },
  });
  __setNativeStreamingBridgeTestAdapter({ plugin: readPluginWithFlag.plugin, isNativeAvailable: true });
  const flaggedStatus = await getModeBStreamStatus();
  assertEqual(flaggedStatus.canStartNewSession, true, 'getModeBStreamStatus preserves native canStartNewSession=true');

  // Partial removal keeps native handle alive until last subscriber removes
  await subA1?.remove();
  await subA2?.remove();
  assertEqual(mock.getHandleRemovedCount(), 0, 'native handle stays attached while subB still active');
  await subB?.remove();
  assertEqual(mock.getHandleRemovedCount(), 1, 'native handle removed once all subscribers unsubscribe');
  assertEqual(mock.getListenerCount(), 0, 'no leaked native listeners remain');

  await __resetNativeStreamingBridgeForTests();
  const browserFallbackStatus = await getModeBStreamStatus();
  assertEqual(browserFallbackStatus.canStartNewSession, false, 'non-Android status returns canStartNewSession=false');
  console.log(`Native streaming bridge tests passed: ${assertionCount} assertions.`);
}

void runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
