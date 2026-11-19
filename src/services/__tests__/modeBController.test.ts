import {
  applyLiveSceneChangeToModeB,
  ensureModeBNotificationPermission,
  executeOperatingModeSwitch,
  prepareAndStartModeBStream,
  resolveModeBVideoDimensions,
  validateModeBRtmpConfig,
} from '../modeBController';
import {
  __resetNativeStreamingBridgeForTests,
  __setNativeStreamingBridgeTestAdapter,
  forwardModeBOverlayEvent,
  getModeBStreamStatus,
  requestModeBScreenReshare,
  setModeBHostWait,
  stopModeBStream,
  type ModeBStreamSnapshot,
  type NativeStreamingPluginInterface,
} from '../nativeStreamingBridge';
import { DEFAULT_SETTINGS, DEFAULT_STUDIO_ELEMENTS } from '../storage';
import type { StudioPreset } from '../../types';

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

function createPreset(overrides: Partial<StudioPreset> = {}): StudioPreset {
  return {
    id: 'preset_test',
    name: 'Preset Uji',
    category: 'hp_screen',
    canvasOrientation: '9:16',
    elements: DEFAULT_STUDIO_ELEMENTS,
    createdAt: 1000,
    isFavorite: false,
    description: 'Preset uji Mode B',
    thumbnailColor: '#2563EB',
    ...overrides,
  };
}

async function runTests(): Promise<void> {
  // 1. RTMP validation & streamKey secrecy
  const invalidEmptyKey = validateModeBRtmpConfig('rtmp://live.twitch.tv/app/', '');
  assertEqual(invalidEmptyKey.valid, false, 'empty stream key must fail validation');
  assert(Boolean(invalidEmptyKey.streamKeyError), 'empty stream key sets streamKeyError');

  const invalidProto = validateModeBRtmpConfig('https://not-rtmp.example.com', 'secret_abc_123');
  assertEqual(invalidProto.valid, false, 'non-rtmp scheme must fail validation');
  assert(!JSON.stringify(invalidProto).includes('secret_abc_123'), 'failed validation must never expose streamKey');

  const validRtmps = validateModeBRtmpConfig('rtmps://a.rtmps.youtube.com/live2/', 'my_secret_stream_key');
  assertEqual(validRtmps.valid, true, 'valid rtmps server + key passes validation');
  assertEqual(validRtmps.rtmpUrl, 'rtmps://a.rtmps.youtube.com/live2/my_secret_stream_key', 'joins server and key cleanly');

  // 2. Resolution & orientation mapping
  assertEqual(resolveModeBVideoDimensions('1080p', '9:16').width, 1080, '9:16 1080p width');
  assertEqual(resolveModeBVideoDimensions('1080p', '9:16').height, 1920, '9:16 1080p height');
  assertEqual(resolveModeBVideoDimensions('720p', '16:9').width, 1280, '16:9 720p width');
  assertEqual(resolveModeBVideoDimensions('720p', '16:9').height, 720, '16:9 720p height');
  assertEqual(resolveModeBVideoDimensions('1080p', '1:1').width, 1080, '1:1 1080p width');
  assertEqual(resolveModeBVideoDimensions('1080p', '1:1').height, 1080, '1:1 1080p height');

  // 3. POST_NOTIFICATIONS check + denial honesty
  const grantedCheck = await ensureModeBNotificationPermission({
    isNativeAndroid: () => true,
    checkNotificationPermission: async () => ({ granted: false }),
    requestNotificationPermission: async () => ({ granted: true }),
  });
  assertEqual(grantedCheck.state, 'granted', 'requests permission when initially missing and marks granted');
  assertEqual(grantedCheck.requested, true, 'marks requested=true');

  const deniedCheck = await ensureModeBNotificationPermission({
    isNativeAndroid: () => true,
    checkNotificationPermission: async () => ({ granted: false }),
    requestNotificationPermission: async () => ({ granted: false }),
  });
  assertEqual(deniedCheck.state, 'denied', 'denied notification permission must never fake granted');
  assert(Boolean(deniedCheck.warningMessage), 'denied notification permission returns explicit warningMessage');

  // 4. prepareAndStartModeBStream never fakes live, passes audioSource/dimensions, and forwards bridge responses
  let nativeStatus: ModeBStreamSnapshot = {
    status: 'idle',
    message: 'Mode B siap.',
    isStreaming: false,
    bitrateKbps: 0,
  };
  const calls: Array<{ method: string; args?: unknown }> = [];

  const mockPlugin: NativeStreamingPluginInterface = {
    async clearOverlayAssets() {
      calls.push({ method: 'clearOverlayAssets' });
      return { success: true };
    },
    async clearOverlayAssetNamespace() {
      return { success: true };
    },
    async uploadOverlayAsset() {
      return { success: true, bytes: 4 };
    },
    async startStream(options) {
      calls.push({ method: 'startStream', args: options });
      nativeStatus = { status: 'starting', message: 'Meminta izin Screen Capture...', isStreaming: false, bitrateKbps: 0 };
      return { success: true, status: 'starting', message: 'Meminta izin Screen Capture...' };
    },
    async stopStream() {
      calls.push({ method: 'stopStream' });
      nativeStatus = { status: 'stopping', message: 'Menghentikan siaran...', isStreaming: false, bitrateKbps: 0 };
      return { success: true, status: 'stopping', message: 'Menghentikan siaran...' };
    },
    async requestScreenReshare() {
      calls.push({ method: 'requestScreenReshare' });
      nativeStatus = { status: 'reshare_waiting', message: 'Menunggu izin Screen Share baru...', isStreaming: true, bitrateKbps: 0 };
      return { success: true, status: 'reshare_waiting', isStreaming: true, message: 'Menunggu izin Screen Share baru...' };
    },
    async setHostWait(options) {
      calls.push({ method: 'setHostWait', args: options });
      nativeStatus = {
        status: options.enabled ? 'host_wait' : 'live',
        message: options.enabled ? 'Layar tunggu aktif' : 'LIVE aktif',
        isStreaming: true,
        bitrateKbps: 4200,
      };
      return { success: true, status: nativeStatus.status, isStreaming: true, message: nativeStatus.message };
    },
    async replaceLiveScene(options) {
      calls.push({ method: 'replaceLiveScene', args: options });
      return { success: true, status: 'live', message: 'Overlay LIVE diperbarui' };
    },
    async pushOverlayEvent(event) {
      calls.push({ method: 'pushOverlayEvent', args: event });
      return { accepted: true };
    },
    async getStatus() {
      calls.push({ method: 'getStatus' });
      return nativeStatus;
    },
    async addListener() {
      return { remove: async () => {} };
    },
  };

  __setNativeStreamingBridgeTestAdapter({
    isNativeAvailable: true,
    plugin: mockPlugin,
  });

  try {
    // Missing streamKey must NOT invoke native startStream
    const missingKeyOutcome = await prepareAndStartModeBStream({
      settings: { ...DEFAULT_SETTINGS, streamKey: '' },
      elements: DEFAULT_STUDIO_ELEMENTS,
      activePreset: createPreset(),
      notificationAdapter: {
        isNativeAndroid: () => true,
        checkNotificationPermission: async () => ({ granted: true }),
        requestNotificationPermission: async () => ({ granted: true }),
      },
    });
    assertEqual(missingKeyOutcome.snapshot.status, 'error', 'missing key returns error snapshot');
    assert(!calls.some((c) => c.method === 'startStream'), 'startStream is not called when streamKey is missing');

    // Valid start enters 'starting' (never fakes 'live')
    const validOutcome = await prepareAndStartModeBStream({
      settings: {
        ...DEFAULT_SETTINGS,
        operatingMode: 'MODE_B_STREAMING_ENCODER',
        rtmpServer: 'rtmp://live.twitch.tv/app',
        streamKey: 'valid_user_stream_key',
        modeBAudioSource: 'internal',
        targetResolution: '1080p',
        canvasOrientation: '16:9',
        frameRate: 60,
        videoBitrateKbps: 6000,
        audioBitrateKbps: 160,
      },
      elements: DEFAULT_STUDIO_ELEMENTS,
      activePreset: createPreset({ canvasOrientation: '16:9' }),
      notificationAdapter: {
        isNativeAndroid: () => true,
        checkNotificationPermission: async () => ({ granted: true }),
        requestNotificationPermission: async () => ({ granted: true }),
      },
      resolveAssets: async () => [],
    });

    assertEqual(validOutcome.snapshot.status, 'starting', 'startStream keeps honest starting state until native live event');
    const startCall = calls.find((c) => c.method === 'startStream');
    assert(Boolean(startCall), 'startStream invoked on valid config');
    const startArgs = startCall!.args as Record<string, unknown>;
    assertEqual(startArgs.audioSource, 'internal', 'passes modeBAudioSource to native startStream');
    assertEqual(startArgs.width, 1920, 'passes resolved landscape width');
    assertEqual(startArgs.height, 1080, 'passes resolved landscape height');

    // Reshare + Host Wait + Live Scene Swap
    const reshareRes = await requestModeBScreenReshare();
    assertEqual(reshareRes.status, 'reshare_waiting', 'reshare updates status from native');

    const hostWaitOn = await setModeBHostWait(true);
    assertEqual(hostWaitOn.status, 'host_wait', 'host_wait ON switches status');

    const hostWaitOff = await setModeBHostWait(false);
    assertEqual(hostWaitOff.status, 'live', 'host_wait OFF restores live status');

    const liveStatus = await getModeBStreamStatus();
    assertEqual(liveStatus.status, 'live', 'getModeBStreamStatus reads live state');

    // Orientation mismatch blocked during live
    const mismatchSwap = await applyLiveSceneChangeToModeB({
      elements: DEFAULT_STUDIO_ELEMENTS,
      targetPreset: createPreset({ id: 'p_landscape', canvasOrientation: '16:9' }),
      activePreset: createPreset({ id: 'p_portrait', canvasOrientation: '9:16' }),
      modeBStatus: liveStatus,
    });
    assertEqual(mismatchSwap.allowed, false, 'live preset switch blocks orientation change');

    // Live preset containing non-live-replaceable widget (e.g. song_request) is blocked honestly
    const nonReplaceableSwap = await applyLiveSceneChangeToModeB({
      elements: DEFAULT_STUDIO_ELEMENTS,
      targetPreset: createPreset({ id: 'p_portrait_sr', canvasOrientation: '9:16' }),
      activePreset: createPreset({ id: 'p_portrait', canvasOrientation: '9:16' }),
      modeBStatus: liveStatus,
      resolveAssets: async () => [],
    });
    assertEqual(nonReplaceableSwap.allowed, false, 'live swap blocks elements outside LIVE_REPLACEABLE_OVERLAY_TYPES');

    // Same-orientation live overlay swap with supported live overlay types succeeds
    const liveSafeElements = DEFAULT_STUDIO_ELEMENTS.filter((el) => el.type !== 'song_request');
    const validSwap = await applyLiveSceneChangeToModeB({
      elements: liveSafeElements,
      targetPreset: createPreset({
        id: 'p_portrait_2',
        canvasOrientation: '9:16',
        elements: liveSafeElements,
      }),
      activePreset: createPreset({
        id: 'p_portrait',
        canvasOrientation: '9:16',
        elements: liveSafeElements,
      }),
      modeBStatus: liveStatus,
      resolveAssets: async () => [],
    });
    assertEqual(validSwap.allowed, true, 'same-orientation live scene update is allowed');
    assertEqual(validSwap.applied, true, 'same-orientation live scene update invokes replaceLiveScene');

    // 5. Simulated events must NOT forward to Mode B; real events DO forward
    calls.length = 0;
    await forwardModeBOverlayEvent({
      id: 'sim_1',
      type: 'gift',
      username: 'Tester',
      detail: 'Rose',
      timestamp: Date.now(),
      isSimulation: true,
    });
    assertEqual(
      calls.filter((c) => c.method === 'pushOverlayEvent').length,
      0,
      'simulated event must NEVER be forwarded to native Mode B overlay',
    );

    await forwardModeBOverlayEvent({
      id: 'real_1',
      type: 'chat',
      username: 'ViewerAsli',
      detail: 'Halo bang!',
      timestamp: Date.now(),
      isSimulation: false,
    });
    assertEqual(
      calls.filter((c) => c.method === 'pushOverlayEvent').length,
      1,
      'real non-simulated event forwards to native Mode B overlay',
    );

    // 6. Mode A <-> Mode B isolation switching
    let stopModeACalled = 0;
    let hideHudCalled = 0;
    let stopModeBCalled = 0;

    const aToB = await executeOperatingModeSwitch({
      currentMode: 'MODE_A_TIKTOK_COMPANION',
      targetMode: 'MODE_B_STREAMING_ENCODER',
      companionRunning: true,
      modeASessionMode: 'with_live_connector',
      isTikTokActive: true,
      modeBStatus: { status: 'idle', message: '', isStreaming: false, bitrateKbps: 0 },
      stopModeASession: async () => {
        stopModeACalled += 1;
      },
      hideHudIfNeeded: async () => {
        hideHudCalled += 1;
      },
      stopModeBSession: async () => stopModeBStream(),
    });
    assertEqual(aToB.nextMode, 'MODE_B_STREAMING_ENCODER', 'Mode A -> B selects Mode B');
    assertEqual(aToB.stoppedModeA, true, 'Mode A -> B tears down active Mode A session');
    assertEqual(stopModeACalled, 1, 'stopModeASession called once');

    const aIdleToB = await executeOperatingModeSwitch({
      currentMode: 'MODE_A_TIKTOK_COMPANION',
      targetMode: 'MODE_B_STREAMING_ENCODER',
      companionRunning: false,
      modeASessionMode: 'inactive',
      isTikTokActive: false,
      modeBStatus: { status: 'idle', message: '', isStreaming: false, bitrateKbps: 0 },
      stopModeASession: async () => {
        stopModeACalled += 1;
      },
      hideHudIfNeeded: async () => {
        hideHudCalled += 1;
      },
      stopModeBSession: async () => stopModeBStream(),
    });
    assertEqual(aIdleToB.stoppedModeA, false, 'inactive Mode A does not force redundant teardown');
    assertEqual(hideHudCalled, 1, 'hideHudIfNeeded still called when moving to Mode B');

    const bToA = await executeOperatingModeSwitch({
      currentMode: 'MODE_B_STREAMING_ENCODER',
      targetMode: 'MODE_A_TIKTOK_COMPANION',
      companionRunning: false,
      modeASessionMode: 'inactive',
      isTikTokActive: false,
      modeBStatus: { status: 'live', message: 'LIVE', isStreaming: true, bitrateKbps: 3500 },
      stopModeASession: async () => {},
      hideHudIfNeeded: async () => {},
      stopModeBSession: async () => {
        stopModeBCalled += 1;
        return stopModeBStream();
      },
    });
    assertEqual(bToA.nextMode, 'MODE_A_TIKTOK_COMPANION', 'Mode B -> A selects Mode A');
    assertEqual(bToA.stoppedModeB, true, 'Mode B -> A stops active Mode B RTMP session');
    assertEqual(stopModeBCalled, 1, 'stopModeBSession called once');
  } finally {
    __resetNativeStreamingBridgeForTests();
  }

  console.log(`modeBController.test.ts PASSED (${assertionCount} assertions)`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
