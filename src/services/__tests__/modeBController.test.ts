import {
  applyLiveSceneChangeToModeB,
  createModeBLifecycleCoordinator,
  ensureModeBNotificationPermission,
  executeOperatingModeSwitch,
  hasConfirmedModeBReadiness,
  prepareAndStartModeBStream,
  resolveModeBVideoDimensions,
  stopModeBStreamAndWaitForCleanup,
  validateModeBRtmpConfig,
  waitForModeBSessionReadiness,
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
import { getPresetGroupBounds, transformPresetGroupElements } from '../presetModel';
import type { StudioElement, StudioPreset } from '../../types';

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
    canStartNewSession: true,
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
      nativeStatus = {
        status: 'starting',
        message: 'Meminta izin Screen Capture...',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      };
      return { success: true, status: 'starting', message: 'Meminta izin Screen Capture...' };
    },
    async stopStream() {
      calls.push({ method: 'stopStream' });
      nativeStatus = {
        status: 'stopping',
        message: 'Menghentikan siaran...',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      };
      return {
        success: true,
        status: 'stopping',
        message: 'Menghentikan siaran...',
        canStartNewSession: false,
      };
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
    nativeStatus = {
      status: 'idle',
      message: 'Siap',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: true,
    };

    const aToB = await executeOperatingModeSwitch({
      currentMode: 'MODE_A_TIKTOK_COMPANION',
      targetMode: 'MODE_B_STREAMING_ENCODER',
      companionRunning: true,
      modeASessionMode: 'with_live_connector',
      isTikTokActive: true,
      modeBStatus: { status: 'idle', message: '', isStreaming: false, bitrateKbps: 0, canStartNewSession: true },
      stopModeASession: async () => {
        stopModeACalled += 1;
        return true;
      },
      hideHudIfNeeded: async () => {
        hideHudCalled += 1;
      },
      stopModeBSession: async () => stopModeBStream(),
    });
    assertEqual(aToB.switched, true, 'Mode A -> B switch confirmed');
    assertEqual(aToB.nextMode, 'MODE_B_STREAMING_ENCODER', 'Mode A -> B selects Mode B');
    assertEqual(aToB.stoppedModeA, true, 'Mode A -> B tears down active Mode A session');
    assertEqual(stopModeACalled, 1, 'stopModeASession called once');

    const aIdleToB = await executeOperatingModeSwitch({
      currentMode: 'MODE_A_TIKTOK_COMPANION',
      targetMode: 'MODE_B_STREAMING_ENCODER',
      companionRunning: false,
      modeASessionMode: 'inactive',
      isTikTokActive: false,
      modeBStatus: { status: 'idle', message: '', isStreaming: false, bitrateKbps: 0, canStartNewSession: true },
      stopModeASession: async () => {
        stopModeACalled += 1;
        return true;
      },
      hideHudIfNeeded: async () => {
        hideHudCalled += 1;
      },
      stopModeBSession: async () => stopModeBStream(),
    });
    assertEqual(aIdleToB.switched, true, 'idle Mode A -> B succeeds when Mode B ready');
    assertEqual(aIdleToB.stoppedModeA, false, 'inactive Mode A does not force redundant teardown');
    assertEqual(hideHudCalled, 1, 'hideHudIfNeeded still called when moving to Mode B');

    let pollStepForBToA = 0;
    const bToA = await executeOperatingModeSwitch({
      currentMode: 'MODE_B_STREAMING_ENCODER',
      targetMode: 'MODE_A_TIKTOK_COMPANION',
      companionRunning: false,
      modeASessionMode: 'inactive',
      isTikTokActive: false,
      modeBStatus: { status: 'live', message: 'LIVE', isStreaming: true, bitrateKbps: 3500, canStartNewSession: false },
      stopModeASession: async () => true,
      hideHudIfNeeded: async () => {},
      stopModeBSession: async () => {
        stopModeBCalled += 1;
        return stopModeBStream();
      },
      waitForModeBReadiness: async () =>
        waitForModeBSessionReadiness({
          sleepFn: async () => {},
          intervalMs: 1,
          maxAttempts: 4,
          getStatusFn: async () => {
            pollStepForBToA += 1;
            if (pollStepForBToA < 2) {
              return { status: 'stopped', message: 'Cleanup berjalan', isStreaming: false, bitrateKbps: 0, canStartNewSession: false };
            }
            return { status: 'stopped', message: 'Selesai', isStreaming: false, bitrateKbps: 0, canStartNewSession: true };
          },
        }),
    });
    assertEqual(bToA.switched, true, 'Mode B -> A completes only after cleanup readiness true');
    assertEqual(bToA.nextMode, 'MODE_A_TIKTOK_COMPANION', 'Mode B -> A selects Mode A');
    assertEqual(bToA.stoppedModeB, true, 'Mode B -> A stops active Mode B RTMP session');
    assertEqual(stopModeBCalled, 1, 'stopModeBSession called once');
    assertEqual(pollStepForBToA, 2, 'Mode B -> A waited until second poll confirmed readiness');

    // 7. Monotonic event revision & synchronous ref updates (stale promise must never overwrite live)
    let syncedRefSnapshot: ModeBStreamSnapshot = {
      status: 'idle',
      message: 'Initial',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: true,
    };
    let syncedPending = false;
    const coordinator = createModeBLifecycleCoordinator(syncedRefSnapshot, {
      onSnapshotChange: (next) => {
        syncedRefSnapshot = next;
      },
      onPendingChange: (nextPending) => {
        syncedPending = nextPending;
      },
    });

    const revBeforeStart = coordinator.getRevision();
    const liveEvent: ModeBStreamSnapshot = {
      status: 'live',
      message: 'RTMP LIVE aktif',
      isStreaming: true,
      bitrateKbps: 4500,
      canStartNewSession: false,
    };
    coordinator.commitNativeEvent(liveEvent);
    // Synchronous ref check immediately after commitNativeEvent
    assertEqual(syncedRefSnapshot.status, 'live', 'ref updates synchronously upon native streamState event');
    assertEqual(syncedRefSnapshot.isStreaming, true, 'ref captures isStreaming immediately');

    const staleStartCommit = coordinator.commitPromiseSnapshotIfUnchanged(revBeforeStart, {
      status: 'starting',
      message: 'Memulai encoder...',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    });
    assertEqual(staleStartCommit.applied, false, 'stale start Promise result rejected after newer native event');
    assertEqual(coordinator.getSnapshot().status, 'live', 'coordinator retains authoritative live status');
    assertEqual(syncedRefSnapshot.status, 'live', 'synced ref is not reverted to stale starting');

    const revBeforeStop = coordinator.getRevision();
    coordinator.commitNativeEvent({
      status: 'error',
      message: 'Encoder gagal',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    });
    const staleStopCommit = coordinator.commitPromiseSnapshotIfUnchanged(revBeforeStop, {
      status: 'stopping',
      message: 'Menghentikan...',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: false,
    });
    assertEqual(staleStopCommit.applied, false, 'stale stop Promise does not clobber newer native error event');
    assertEqual(coordinator.getSnapshot().status, 'error', 'newer error event preserved');

    // 8. Unified shared action lock (concurrent actions blocked, preset/mode switch blocked, released in finally)
    let releaseSlowStart!: () => void;
    const slowStartPromise = coordinator.runExclusiveAction('Go Live Mode B', () => new Promise<string>((resolve) => {
      releaseSlowStart = () => resolve('started');
    }));
    assertEqual(syncedPending, true, 'pending lock flips synchronously when exclusive action starts');

    const concurrentStop = await coordinator.runExclusiveAction('Stop LIVE Mode B', async () => 'stopped');
    assertEqual(concurrentStop.acquired, false, 'concurrent stop blocked while start holds shared lock');

    const concurrentPresetSwitch = await coordinator.runExclusiveAction('Mengganti Preset Mode B', async () => 'preset');
    assertEqual(concurrentPresetSwitch.acquired, false, 'preset switch blocked while Mode B action pending');

    const concurrentModeSwitch = await coordinator.runExclusiveAction('Perpindahan Mode', async () => 'switched');
    assertEqual(concurrentModeSwitch.acquired, false, 'mode switch blocked while Mode B action pending');

    releaseSlowStart();
    const slowResult = await slowStartPromise;
    assertEqual(slowResult.acquired, true, 'first exclusive action finishes');
    assertEqual(syncedPending, false, 'shared lock releases after completion');

    // Verify lock always releases in try/finally when action throws
    let threw = false;
    try {
      await coordinator.runExclusiveAction('Failing Action', async () => {
        assertEqual(syncedPending, true, 'lock held during failing action');
        throw new Error('boom');
      });
    } catch {
      threw = true;
    }
    assertEqual(threw, true, 'error propagates from runExclusiveAction');
    assertEqual(syncedPending, false, 'shared lock ALWAYS releases in finally on exception');
    assertEqual(coordinator.isActionPending(), false, 'coordinator pending resets on exception');

    // Verify preset helper skips getStatusFn when modeBStatusRef snapshot is passed inside lock
    let redundantGetStatusCalls = 0;
    const lockSafePresetCheck = await applyLiveSceneChangeToModeB({
      elements: DEFAULT_STUDIO_ELEMENTS,
      targetPreset: createPreset({ id: 'p_next', canvasOrientation: '9:16' }),
      activePreset: createPreset({ id: 'p_curr', canvasOrientation: '9:16' }),
      modeBStatus: { status: 'stopped', message: 'Stopped', isStreaming: false, bitrateKbps: 0, canStartNewSession: true },
      getStatusFn: async () => {
        redundantGetStatusCalls += 1;
        return nativeStatus;
      },
    });
    assertEqual(lockSafePresetCheck.allowed, true, 'stopped snapshot allows preset change');
    assertEqual(redundantGetStatusCalls, 0, 'passing modeBStatus avoids redundant getStatus call');

    // 9. Cleanup readiness & fail-closed guarantees
    assertEqual(hasConfirmedModeBReadiness({ canStartNewSession: true }), true, 'explicit true readiness confirms');
    assertEqual(hasConfirmedModeBReadiness({ canStartNewSession: false }), false, 'false readiness blocked');
    assertEqual(hasConfirmedModeBReadiness({ canStartNewSession: undefined }), false, 'undefined readiness fails closed');
    assertEqual(hasConfirmedModeBReadiness(null), false, 'null snapshot fails closed');

    // stopModeBStreamAndWaitForCleanup treats 'stopping' and 'stopped' with false readiness as still busy until true
    let pollCounter = 0;
    const waitCleanupSuccess = await stopModeBStreamAndWaitForCleanup({
      stopFn: async () => ({
        status: 'stopping',
        message: 'Stopping...',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      }),
      sleepFn: async () => {},
      intervalMs: 1,
      maxAttempts: 5,
      getStatusFn: async () => {
        pollCounter += 1;
        if (pollCounter === 1) {
          return { status: 'stopping', message: 'GL tearing down', isStreaming: false, bitrateKbps: 0, canStartNewSession: false };
        }
        if (pollCounter === 2) {
          return { status: 'stopped', message: 'Asset cleanup retry', isStreaming: false, bitrateKbps: 0, canStartNewSession: false };
        }
        return { status: 'stopped', message: 'Cleanup selesai', isStreaming: false, bitrateKbps: 0, canStartNewSession: true };
      },
    });
    assertEqual(waitCleanupSuccess.ready, true, 'polling succeeds once native sets canStartNewSession=true');
    assertEqual(waitCleanupSuccess.attempts, 3, 'stopped status alone did not short-circuit polling before canStartNewSession=true');

    // Fail-closed timeout when canStartNewSession stays false
    const waitCleanupTimeout = await waitForModeBSessionReadiness({
      sleepFn: async () => {},
      intervalMs: 1,
      maxAttempts: 3,
      getStatusFn: async () => ({
        status: 'stopped',
        message: 'Asset still locked',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      }),
    });
    assertEqual(waitCleanupTimeout.ready, false, 'timeout fails closed when canStartNewSession stays false');
    assertEqual(waitCleanupTimeout.reason, 'not_ready_timeout', 'timeout reports not_ready_timeout reason');

    // Fail-closed when getStatus returns undefined readiness field
    const waitMissingField = await waitForModeBSessionReadiness({
      sleepFn: async () => {},
      intervalMs: 1,
      maxAttempts: 2,
      getStatusFn: async () => ({
        status: 'idle',
        message: 'No readiness field',
        isStreaming: false,
        bitrateKbps: 0,
      }),
    });
    assertEqual(waitMissingField.ready, false, 'missing canStartNewSession field fails closed');
    assertEqual(waitMissingField.reason, 'invalid_readiness', 'missing field reports invalid_readiness');

    // Fail-closed when getStatus throws
    const waitStatusError = await waitForModeBSessionReadiness({
      sleepFn: async () => {},
      intervalMs: 1,
      maxAttempts: 3,
      getStatusFn: async () => {
        throw new Error('IPC error');
      },
    });
    assertEqual(waitStatusError.ready, false, 'getStatus error fails closed');
    assertEqual(waitStatusError.reason, 'status_error', 'getStatus error reports status_error');

    // prepareAndStartModeBStream blocks BEFORE asset resolution & startStream when canStartNewSession === false
    calls.length = 0;
    let resolveAssetsCalled = 0;
    const blockedStart = await prepareAndStartModeBStream({
      settings: {
        ...DEFAULT_SETTINGS,
        operatingMode: 'MODE_B_STREAMING_ENCODER',
        rtmpServer: 'rtmp://live.twitch.tv/app',
        streamKey: 'valid_user_stream_key',
      },
      elements: DEFAULT_STUDIO_ELEMENTS,
      activePreset: createPreset(),
      notificationAdapter: {
        isNativeAndroid: () => true,
        checkNotificationPermission: async () => ({ granted: true }),
        requestNotificationPermission: async () => ({ granted: true }),
      },
      getStatusFn: async () => ({
        status: 'stopped',
        message: 'Cleanup masih berjalan',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      }),
      resolveAssets: async () => {
        resolveAssetsCalled += 1;
        return [];
      },
    });
    assertEqual(blockedStart.snapshot.status, 'error', 'start rejected when previous cleanup is incomplete');
    assertEqual(resolveAssetsCalled, 0, 'asset preparation/upload is skipped before MediaProjection when not ready');
    assertEqual(calls.some((c) => c.method === 'startStream'), false, 'native startStream (MediaProjection) is NOT called when readiness is false');

    // 10. Mode switching fail-closed guarantees
    const blockedBToA = await executeOperatingModeSwitch({
      currentMode: 'MODE_B_STREAMING_ENCODER',
      targetMode: 'MODE_A_TIKTOK_COMPANION',
      companionRunning: false,
      modeASessionMode: 'inactive',
      isTikTokActive: false,
      modeBStatus: { status: 'live', message: 'LIVE', isStreaming: true, bitrateKbps: 3000, canStartNewSession: false },
      stopModeASession: async () => true,
      hideHudIfNeeded: async () => {},
      stopModeBSession: async () => ({
        status: 'stopping',
        message: 'Stopping...',
        isStreaming: false,
        bitrateKbps: 0,
        canStartNewSession: false,
      }),
      waitForModeBReadiness: async () =>
        waitForModeBSessionReadiness({
          sleepFn: async () => {},
          intervalMs: 1,
          maxAttempts: 2,
          getStatusFn: async () => ({
            status: 'error',
            message: 'GL worker teardown failed',
            isStreaming: false,
            bitrateKbps: 0,
            canStartNewSession: false,
          }),
        }),
    });
    assertEqual(blockedBToA.switched, false, 'Mode B -> A aborts switch when cleanup readiness fails');
    assertEqual(blockedBToA.nextMode, 'MODE_B_STREAMING_ENCODER', 'failed Mode B -> A keeps operatingMode in Mode B');
    assert(Boolean(blockedBToA.errorMessage), 'failed Mode B -> A includes clear error message');

    const blockedAToBCompanionRunning = await executeOperatingModeSwitch({
      currentMode: 'MODE_A_TIKTOK_COMPANION',
      targetMode: 'MODE_B_STREAMING_ENCODER',
      companionRunning: true,
      modeASessionMode: 'with_live_connector',
      isTikTokActive: true,
      modeBStatus: { status: 'idle', message: '', isStreaming: false, bitrateKbps: 0, canStartNewSession: true },
      stopModeASession: async () => true,
      verifyModeAStopped: async () => false,
      hideHudIfNeeded: async () => {},
      stopModeBSession: async () => stopModeBStream(),
    });
    assertEqual(blockedAToBCompanionRunning.switched, false, 'Mode A -> B aborts if Companion/TikTok fails to stop cleanly');
    assertEqual(blockedAToBCompanionRunning.nextMode, 'MODE_A_TIKTOK_COMPANION', 'keeps Mode A when Companion fails to stop');

    const blockedAToBModeBNotReady = await executeOperatingModeSwitch({
      currentMode: 'MODE_A_TIKTOK_COMPANION',
      targetMode: 'MODE_B_STREAMING_ENCODER',
      companionRunning: false,
      modeASessionMode: 'inactive',
      isTikTokActive: false,
      modeBStatus: { status: 'stopped', message: 'Cleaning', isStreaming: false, bitrateKbps: 0, canStartNewSession: false },
      stopModeASession: async () => true,
      hideHudIfNeeded: async () => {},
      stopModeBSession: async () => stopModeBStream(),
      waitForModeBReadiness: async () =>
        waitForModeBSessionReadiness({
          sleepFn: async () => {},
          intervalMs: 1,
          maxAttempts: 2,
          getStatusFn: async () => ({
            status: 'stopped',
            message: 'Cleanup pending',
            isStreaming: false,
            bitrateKbps: 0,
            canStartNewSession: false,
          }),
        }),
    });
    assertEqual(blockedAToBModeBNotReady.switched, false, 'Mode A -> B aborts while prior Mode B session cleanup is still pending');
    assertEqual(blockedAToBModeBNotReady.nextMode, 'MODE_A_TIKTOK_COMPANION', 'keeps Mode A when Mode B readiness is false');

    // 11. Group & Supergroup propagation for Go Live (prepareAndStartModeBStream) and Apply-to-LIVE (applyLiveSceneChangeToModeB)
    const makeEl = (overrides: Partial<StudioElement>): StudioElement => ({
      id: 'el_default',
      name: 'Elemen',
      type: 'text',
      x: 10,
      y: 10,
      width: 30,
      height: 10,
      layer: 2,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: { text: 'Hello' },
      ...overrides,
    });

    const screenEl = makeEl({
      id: 'el_screen',
      name: 'Screen Capture',
      type: 'screen_capture',
      x: 5,
      y: 10,
      width: 50,
      height: 30,
      layer: 1,
    });
    const textInHiddenGroup = makeEl({
      id: 'el_text_hidden_group',
      name: 'Overlay Hidden Group',
      x: 15,
      y: 15,
      width: 25,
      height: 8,
      layer: 2,
    });
    const textInSuperHiddenGroup = makeEl({
      id: 'el_text_super_hidden',
      name: 'Overlay Super Hidden',
      x: 10,
      y: 50,
      width: 30,
      height: 10,
      layer: 3,
    });
    const textInLockedVisibleGroup = makeEl({
      id: 'el_text_locked_group',
      name: 'Overlay Locked Visible',
      x: 20,
      y: 65,
      width: 35,
      height: 10,
      layer: 4,
    });
    const looseVisibleText = makeEl({
      id: 'el_loose_visible',
      name: 'Overlay Loose',
      x: 5,
      y: 80,
      width: 40,
      height: 10,
      layer: 5,
    });

    const groupScreenAndHidden = {
      id: 'grp_hidden',
      name: 'Grup Hidden',
      elementIds: ['el_screen', 'el_text_hidden_group'],
      visible: false,
      locked: false,
    };
    const groupSuperChild = {
      id: 'grp_super_child',
      name: 'Grup Anak Super',
      elementIds: ['el_text_super_hidden'],
      visible: true,
      locked: false,
    };
    const groupLockedVisible = {
      id: 'grp_locked_visible',
      name: 'Grup Terkunci',
      elementIds: ['el_text_locked_group'],
      visible: true,
      locked: true,
    };
    const superHidden = {
      id: 'sgrp_hidden',
      name: 'Supergroup Hidden',
      groupIds: ['grp_super_child'],
      visible: false,
      locked: false,
    };

    const groupedElements = [
      screenEl,
      textInHiddenGroup,
      textInSuperHiddenGroup,
      textInLockedVisibleGroup,
      looseVisibleText,
    ];
    const groupedPreset = createPreset({
      id: 'preset_grouped_hidden',
      elements: groupedElements,
      groups: [groupScreenAndHidden, groupSuperChild, groupLockedVisible],
      superGroups: [superHidden],
    });

    nativeStatus = {
      status: 'idle',
      message: 'Ready',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: true,
    };
    calls.length = 0;

    const goLiveHiddenRes = await prepareAndStartModeBStream({
      settings: {
        ...DEFAULT_SETTINGS,
        operatingMode: 'MODE_B_STREAMING_ENCODER',
        rtmpServer: 'rtmp://live.twitch.tv/app',
        streamKey: 'valid_user_stream_key',
      },
      elements: groupedElements,
      activePreset: groupedPreset,
      notificationAdapter: {
        isNativeAndroid: () => true,
        checkNotificationPermission: async () => ({ granted: true }),
        requestNotificationPermission: async () => ({ granted: true }),
      },
      resolveAssets: async () => [],
    });

    assertEqual(goLiveHiddenRes.snapshot.status, 'starting', 'Go Live with grouped preset enters starting cleanly');
    const goLiveStartCall = calls.find((c) => c.method === 'startStream');
    assert(Boolean(goLiveStartCall), 'Go Live invokes native startStream for grouped preset');
    const goLiveArgs = goLiveStartCall!.args as {
      overlayElements: Array<{ id: string; x: number; y: number }>;
      screenCaptureLayer: { enabled: boolean; grouped: boolean; x: number; y: number; width: number; height: number };
    };
    const goLiveOverlayIds = goLiveArgs.overlayElements.map((e) => e.id);
    assert(!goLiveOverlayIds.includes('el_text_hidden_group'), 'Group visible:false excludes child overlay from Go Live output');
    assert(!goLiveOverlayIds.includes('el_text_super_hidden'), 'Supergroup visible:false excludes child group overlay from Go Live output');
    assert(goLiveOverlayIds.includes('el_text_locked_group'), 'Group locked:true keeps visible child overlay in Go Live output');
    assert(goLiveOverlayIds.includes('el_loose_visible'), 'Non-group visible overlay remains in Go Live output');
    assertEqual(goLiveArgs.screenCaptureLayer.enabled, false, 'screen_capture in hidden Group disables screenCaptureLayer on Go Live');
    assertEqual(goLiveArgs.screenCaptureLayer.grouped, true, 'screen_capture in Group sets screenCaptureLayer.grouped=true even when hidden');

    // Group transform updates screen_capture & overlay coordinates in Go Live, and ungrouped screen_capture sets grouped=false
    const visibleScreenGroup = {
      id: 'grp_screen_visible',
      name: 'Grup Screen',
      elementIds: ['el_screen', 'el_text_locked_group'],
      visible: true,
      locked: false,
    };
    const ungroupedOverlayPresetElements = [screenEl, textInLockedVisibleGroup, looseVisibleText];
    const startBounds = getPresetGroupBounds(visibleScreenGroup, ungroupedOverlayPresetElements)!;
    const targetBounds = {
      x: startBounds.x + 12,
      y: startBounds.y + 8,
      width: Math.round(startBounds.width * 1.2 * 10) / 10,
      height: Math.round(startBounds.height * 1.1 * 10) / 10,
    };
    const transformedElements = transformPresetGroupElements(
      ungroupedOverlayPresetElements,
      visibleScreenGroup,
      ungroupedOverlayPresetElements,
      startBounds,
      targetBounds,
    );
    const transformedScreenEl = transformedElements.find((e) => e.id === 'el_screen')!;
    const transformedTextEl = transformedElements.find((e) => e.id === 'el_text_locked_group')!;

    nativeStatus = {
      status: 'idle',
      message: 'Ready',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: true,
    };
    calls.length = 0;

    await prepareAndStartModeBStream({
      settings: {
        ...DEFAULT_SETTINGS,
        operatingMode: 'MODE_B_STREAMING_ENCODER',
        rtmpServer: 'rtmp://live.twitch.tv/app',
        streamKey: 'valid_user_stream_key',
      },
      elements: transformedElements,
      activePreset: createPreset({
        id: 'preset_grouped_transformed',
        elements: transformedElements,
        groups: [visibleScreenGroup],
      }),
      notificationAdapter: {
        isNativeAndroid: () => true,
        checkNotificationPermission: async () => ({ granted: true }),
        requestNotificationPermission: async () => ({ granted: true }),
      },
      resolveAssets: async () => [],
    });

    const transformedStartCall = calls.find((c) => c.method === 'startStream');
    const transformedArgs = transformedStartCall!.args as {
      overlayElements: Array<{ id: string; x: number; y: number; width: number; height: number }>;
      screenCaptureLayer: { enabled: boolean; grouped: boolean; x: number; y: number; width: number; height: number };
    };
    assertEqual(transformedArgs.screenCaptureLayer.enabled, true, 'visible grouped screen_capture stays enabled on Go Live');
    assertEqual(transformedArgs.screenCaptureLayer.grouped, true, 'grouped screen_capture forwards grouped=true on Go Live');
    assertEqual(transformedArgs.screenCaptureLayer.x, transformedScreenEl.x, 'Go Live screenCaptureLayer receives transformed X');
    assertEqual(transformedArgs.screenCaptureLayer.y, transformedScreenEl.y, 'Go Live screenCaptureLayer receives transformed Y');
    assertEqual(transformedArgs.screenCaptureLayer.width, transformedScreenEl.width, 'Go Live screenCaptureLayer receives transformed width');
    assertEqual(transformedArgs.screenCaptureLayer.height, transformedScreenEl.height, 'Go Live screenCaptureLayer receives transformed height');
    const syncedOverlay = transformedArgs.overlayElements.find((e) => e.id === 'el_text_locked_group')!;
    assertEqual(syncedOverlay.x, transformedTextEl.x, 'Go Live overlay receives transformed X from Group transform');
    assertEqual(syncedOverlay.y, transformedTextEl.y, 'Go Live overlay receives transformed Y from Group transform');

    // Ungrouped screen_capture must produce grouped=false on Go Live
    nativeStatus = {
      status: 'idle',
      message: 'Ready',
      isStreaming: false,
      bitrateKbps: 0,
      canStartNewSession: true,
    };
    calls.length = 0;

    await prepareAndStartModeBStream({
      settings: {
        ...DEFAULT_SETTINGS,
        operatingMode: 'MODE_B_STREAMING_ENCODER',
        rtmpServer: 'rtmp://live.twitch.tv/app',
        streamKey: 'valid_user_stream_key',
      },
      elements: ungroupedOverlayPresetElements,
      activePreset: createPreset({
        id: 'preset_ungrouped_screen',
        elements: ungroupedOverlayPresetElements,
        groups: [
          {
            id: 'grp_overlay_only',
            name: 'Overlay Only',
            elementIds: ['el_text_locked_group', 'el_loose_visible'],
            visible: true,
            locked: false,
          },
        ],
      }),
      notificationAdapter: {
        isNativeAndroid: () => true,
        checkNotificationPermission: async () => ({ granted: true }),
        requestNotificationPermission: async () => ({ granted: true }),
      },
      resolveAssets: async () => [],
    });
    const ungroupedStartArgs = calls.find((c) => c.method === 'startStream')!.args as {
      screenCaptureLayer: { grouped: boolean };
    };
    assertEqual(ungroupedStartArgs.screenCaptureLayer.grouped, false, 'ungrouped screen_capture forwards grouped=false on Go Live');

    // Apply-to-LIVE (applyLiveSceneChangeToModeB) also honors Group/Supergroup visibility, lock, transforms, and grouped flag
    let capturedLiveReplaceArgs: {
      overlayElements: Array<{ id: string; x: number; y: number }>;
      screenCaptureLayer?: { enabled: boolean; grouped: boolean; x: number; y: number; width: number; height: number };
    } | null = null;

    const hiddenCamInGroup = makeEl({
      id: 'el_hidden_cam',
      name: 'Hidden Grouped Cam',
      type: 'camera',
      layer: 6,
    });
    const liveGroupTestPreset = createPreset({
      id: 'preset_live_group_test',
      elements: [
        transformedScreenEl,
        textInHiddenGroup,
        textInSuperHiddenGroup,
        transformedTextEl,
        looseVisibleText,
        hiddenCamInGroup,
      ],
      groups: [
        {
          id: 'grp_screen_live',
          name: 'Grup Screen Live',
          elementIds: ['el_screen', 'el_text_locked_group'],
          visible: true,
          locked: true,
        },
        {
          id: 'grp_hidden_live',
          name: 'Grup Hidden Live',
          elementIds: ['el_text_hidden_group', 'el_hidden_cam'],
          visible: false,
          locked: false,
        },
        groupSuperChild,
      ],
      superGroups: [superHidden],
      transitionIn: { type: 'fade', durationMs: 300 },
    });

    const liveApplyResult = await applyLiveSceneChangeToModeB({
      elements: liveGroupTestPreset.elements,
      targetPreset: liveGroupTestPreset,
      activePreset: createPreset({ id: 'preset_live_base', elements: [looseVisibleText], transitionOut: 'cut' }),
      modeBStatus: { status: 'live', message: 'LIVE', isStreaming: true, bitrateKbps: 4200, canStartNewSession: false },
      resolveAssets: async () => [],
      replaceSceneFn: async (opts) => {
        capturedLiveReplaceArgs = {
          overlayElements: opts.overlayElements,
          screenCaptureLayer: opts.screenCaptureLayer,
        };
        return { success: true, status: 'live', message: 'Scene LIVE diperbarui' };
      },
    });
    assertEqual(liveApplyResult.allowed, true, 'Apply-to-LIVE allows transition when camera is inside hidden Group');
    assertEqual(liveApplyResult.applied, true, 'Apply-to-LIVE applies grouped scene cleanly');
    assert(Boolean(capturedLiveReplaceArgs), 'replaceSceneFn receives live grouped scene payload');
    assert(Boolean(capturedLiveReplaceArgs!.screenCaptureLayer), 'replaceSceneFn receives screenCaptureLayer');
    const liveOverlayIds = capturedLiveReplaceArgs!.overlayElements.map((e) => e.id);
    assert(!liveOverlayIds.includes('el_text_hidden_group'), 'Apply-to-LIVE excludes Group visible:false overlay');
    assert(!liveOverlayIds.includes('el_text_super_hidden'), 'Apply-to-LIVE excludes Supergroup visible:false overlay');
    assert(liveOverlayIds.includes('el_text_locked_group'), 'Apply-to-LIVE includes Group locked:true visible overlay');
    assert(liveOverlayIds.includes('el_loose_visible'), 'Apply-to-LIVE includes non-grouped visible overlay');
    assertEqual(capturedLiveReplaceArgs!.screenCaptureLayer!.grouped, true, 'Apply-to-LIVE sets screenCaptureLayer.grouped=true when screen_capture is grouped');
    assertEqual(capturedLiveReplaceArgs!.screenCaptureLayer!.x, transformedScreenEl.x, 'Apply-to-LIVE propagates transformed screen_capture X');

    // Apply-to-LIVE with ungrouped screen_capture sets grouped=false
    let ungroupedLiveArgs: { screenCaptureLayer?: { grouped: boolean } } | null = null;
    await applyLiveSceneChangeToModeB({
      elements: [screenEl, looseVisibleText],
      targetPreset: createPreset({ id: 'preset_live_ungrouped', elements: [screenEl, looseVisibleText], groups: [] }),
      activePreset: null,
      modeBStatus: { status: 'live', message: 'LIVE', isStreaming: true, bitrateKbps: 4200, canStartNewSession: false },
      replaceSceneFn: async (opts) => {
        ungroupedLiveArgs = { screenCaptureLayer: opts.screenCaptureLayer };
        return { success: true, status: 'live', message: 'OK' };
      },
    });
    assertEqual(ungroupedLiveArgs!.screenCaptureLayer?.grouped, false, 'Apply-to-LIVE sets screenCaptureLayer.grouped=false when screen_capture is ungrouped');

    // Failure path: snapshot / native replace failure returns honest error and leaves coordinator state & revision intact
    const groupCoordinator = createModeBLifecycleCoordinator({
      status: 'live',
      message: 'LIVE aktif',
      isStreaming: true,
      bitrateKbps: 4200,
      canStartNewSession: false,
    });
    const initialRev = groupCoordinator.getRevision();

    const failedReplaceRes = await applyLiveSceneChangeToModeB({
      elements: [screenEl, looseVisibleText],
      targetPreset: createPreset({ id: 'preset_fail_replace', elements: [screenEl, looseVisibleText] }),
      activePreset: null,
      modeBStatus: groupCoordinator.getSnapshot(),
      replaceSceneFn: async () => ({
        success: false,
        status: 'live',
        message: 'Native scene swap ditolak',
      }),
    });
    assertEqual(failedReplaceRes.allowed, false, 'failed native replace returns allowed=false');
    assertEqual(failedReplaceRes.applied, false, 'failed native replace returns applied=false');
    assertEqual(failedReplaceRes.message, 'Native scene swap ditolak', 'failed native replace preserves error message');
    assertEqual(groupCoordinator.getRevision(), initialRev, 'failed Apply-to-LIVE does not mutate coordinator revision');
    assertEqual(groupCoordinator.getSnapshot().status, 'live', 'failed Apply-to-LIVE does not corrupt coordinator snapshot');

    const invalidLayerOrderRes = await applyLiveSceneChangeToModeB({
      elements: [
        makeEl({ id: 'el_screen_bad', type: 'screen_capture', layer: 5 }),
        makeEl({ id: 'el_overlay_below', layer: 2 }),
      ],
      targetPreset: null,
      activePreset: null,
      modeBStatus: groupCoordinator.getSnapshot(),
    });
    assertEqual(invalidLayerOrderRes.allowed, false, 'snapshot validation error fails closed in Apply-to-LIVE');
    assertEqual(invalidLayerOrderRes.applied, false, 'snapshot validation error never marks applied=true');
    assert(Boolean(invalidLayerOrderRes.message), 'snapshot validation error returns descriptive message');
  } finally {
    __resetNativeStreamingBridgeForTests();
  }

  console.log(`modeBController.test.ts PASSED (${assertionCount} assertions)`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
