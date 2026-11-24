// Unit tests for Studio Fase 1B Tahap 3.1: Basic Visual & Media Inspector
// Run in the project environment with: bun run src/services/__tests__/studioInspectorControls.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { percentToUnitVolume, type StudioElement } from '../../types';
import {
  createStudioElementFromSource,
  getStudioSourceCatalogEntry,
  normalizeCameraProperties,
  normalizeStudioElementProperties,
} from '../studioElementCatalog';
import {
  SUPPORTED_SOUNDBOARD_SFX,
  buildChatMessageBgOpacityPatch,
  clampChatMessageOpacity,
  createCameraPreviewController,
  createScreenCapturePreviewController,
  resolveChatMessageBackground,
  resolveSeparatorStyle,
  resolveSoundboardControlModel,
  resolveStickerVisualModel,
  type CameraFacingMode,
  type CameraPreviewStreamLike,
  type ScreenCapturePreviewRequestState,
  type ScreenCaptureStreamLike,
  type ScreenCaptureTrackLike,
  validateSafeBrowserEmbedUrl,
} from '../studioElementRenderModel';
import {
  STUDIO_TAP_MOVE_THRESHOLD_PX,
  canMutateStudioElementField,
  classifyCanvasElementPointerMove,
  hasExceededTapThreshold,
  isInteractiveCanvasChildTarget,
  isStudioElementReadOnly,
  resolveCanvasElementPointerUp,
  shouldClosePropertiesOnCanvasBackgroundClick,
  type PendingCanvasElementGesture,
} from '../studioCanvasGesture';

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

function extractBetween(source: string, startMarker: string, endMarker: string, label: string): string {
  const startIdx = source.indexOf(startMarker);
  assert(startIdx !== -1, `Missing start marker for ${label}: ${startMarker}`);
  const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
  assert(endIdx !== -1, `Missing end marker for ${label}: ${endMarker}`);
  return source.slice(startIdx, endIdx);
}

function updatesProp(section: string, prop: string): boolean {
  const pattern = new RegExp(`updateElementProperty\\(\\s*selectedElement\\.id\\s*,\\s*'${prop}'`);
  return pattern.test(section);
}

async function runStudioInspectorControlsTests(): Promise<void> {
  const studioViewPath = join(process.cwd(), 'src', 'components', 'StudioView.tsx');
  const studioSource = readFileSync(studioViewPath, 'utf8');

  const inspectorSection = extractBetween(
    studioSource,
    "{activeSidePanel === 'properties' && (",
    '{/* Common Geometry & Transform',
    'Contextual Properties Inspector',
  );

  // 1. text Inspector controls
  const textSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'text'",
    "selectedElement.type === 'shape'",
    'text inspector',
  );
  assert(textSection.includes('<textarea'), 'text inspector provides textarea for text');
  for (const prop of ['text', 'fontSize', 'textColor', 'fontWeight', 'backgroundColor']) {
    assert(
      updatesProp(textSection, prop),
      `text inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    textSection.includes("'normal'") && textSection.includes("'bold'"),
    'text inspector supports normal and bold fontWeight',
  );
  assert(
    textSection.includes('selectedElement.properties.textColor || selectedElement.properties.color'),
    'text inspector preserves fallback read from legacy color alias',
  );

  // 2. shape Inspector controls
  const shapeSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'shape'",
    "selectedElement.type === 'separator'",
    'shape inspector',
  );
  for (const prop of ['backgroundColor', 'borderColor', 'borderWidth', 'borderRadius']) {
    assert(
      updatesProp(shapeSection, prop),
      `shape inspector updates '${prop}' via updateElementProperty`,
    );
  }

  // 3. separator Inspector controls
  const separatorSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'separator'",
    "selectedElement.type === 'browser_embed'",
    'separator inspector',
  );
  for (const prop of ['orientation', 'lineColor', 'thickness', 'glow']) {
    assert(
      updatesProp(separatorSection, prop),
      `separator inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    separatorSection.includes("'horizontal'") && separatorSection.includes("'vertical'"),
    'separator inspector supports horizontal and vertical orientation',
  );

  // 4. browser_embed Inspector controls
  const browserSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'browser_embed'",
    "selectedElement.type === 'soundboard'",
    'browser_embed inspector',
  );
  assert(
    updatesProp(browserSection, 'url'),
    'browser_embed inspector updates url via updateElementProperty',
  );
  assert(
    browserSection.includes('validateSafeBrowserEmbedUrl(selectedElement.properties.url)'),
    'browser_embed inspector uses validateSafeBrowserEmbedUrl for status indicator',
  );
  assert(
    !browserSection.includes('refreshRate'),
    'browser_embed inspector does not introduce unused refreshRate control in 3.1',
  );

  // 5. soundboard Inspector controls
  const soundboardSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'soundboard'",
    "selectedElement.type === 'image' || selectedElement.type === 'sticker' || selectedElement.type === 'video'",
    'soundboard inspector',
  );
  for (const prop of ['presetSfx', 'volume', 'audioUrl', 'title']) {
    assert(
      updatesProp(soundboardSection, prop),
      `soundboard inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    soundboardSection.includes('INSPECTOR_SOUNDBOARD_OPTIONS'),
    'soundboard inspector renders supported presetSfx options',
  );
  for (const sfx of SUPPORTED_SOUNDBOARD_SFX) {
    assert(
      studioSource.includes(`value: '${sfx}'`),
      `soundboard inspector options include '${sfx}'`,
    );
  }
  assert(
    !soundboardSection.includes('soundboardEngine.play'),
    'soundboard inspector does not auto-play SFX on property changes',
  );
  assert(
    soundboardSection.includes('unitVolumeToPercent(selectedElement.properties.volume, 0.9)'),
    'soundboard inspector displays slider value via unitVolumeToPercent',
  );
  assert(
    /percentToUnitVolume\(\s*clampNumericRange\(/.test(soundboardSection),
    'soundboard volume slider converts clamped percentage via percentToUnitVolume(clampNumericRange(...))',
  );

  // 6, 7, 8. image, video, sticker Inspector controls
  const mediaSection = extractBetween(
    inspectorSection,
    "(selectedElement.type === 'image' || selectedElement.type === 'sticker' || selectedElement.type === 'video')",
    "selectedElement.type === 'song_request'",
    'image/video/sticker inspector',
  );
  assert(
    updatesProp(mediaSection, 'imageUrl') &&
      updatesProp(mediaSection, 'videoUrl') &&
      mediaSection.includes("setActiveSidePanel('media')"),
    'media inspector preserves imageUrl, videoUrl, and Media Library picker',
  );

  const imageSubSection = extractBetween(
    mediaSection,
    '{/* Image Display Options */}',
    '{/* Video Playback Options */}',
    'image sub-inspector',
  );
  for (const prop of ['fit', 'borderRadius']) {
    assert(
      updatesProp(imageSubSection, prop),
      `image inspector updates '${prop}' via updateElementProperty`,
    );
  }
  for (const fitMode of ['contain', 'cover', 'fill']) {
    assert(imageSubSection.includes(`value="${fitMode}"`), `image inspector includes fit="${fitMode}"`);
  }

  const videoSubSection = extractBetween(
    mediaSection,
    '{/* Video Playback Options */}',
    '{/* Sticker Visual Options */}',
    'video sub-inspector',
  );
  for (const prop of ['autoplay', 'loop', 'muted']) {
    assert(
      updatesProp(videoSubSection, prop) &&
        videoSubSection.includes(`!(selectedElement.properties.${prop} !== false)`),
      `video inspector toggles boolean '${prop}' properly with !== false default`,
    );
  }

  const stickerSubSection = mediaSection.slice(mediaSection.indexOf('{/* Sticker Visual Options */}'));
  for (const prop of ['stickerId', 'floatEffect']) {
    assert(
      updatesProp(stickerSubSection, prop),
      `sticker inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    stickerSubSection.includes('!(selectedElement.properties.floatEffect !== false)'),
    'sticker inspector toggles boolean floatEffect properly with !== false default',
  );
  for (const stickerKey of ['fire', 'heart', 'love', 'star', 'clap', 'rocket', 'laugh', 'crown', 'gift']) {
    assert(
      studioSource.includes(`value: '${stickerKey}'`),
      `sticker inspector options include '${stickerKey}'`,
    );
  }

  // Verify canvas renderer security & interaction contracts remain intact
  assert(
    studioSource.includes('onPointerDown={(e) => e.stopPropagation()}'),
    'canvas soundboard button preserves pointerdown stopPropagation',
  );
  assert(
    studioSource.includes('sandbox="allow-scripts"'),
    'browser_embed renderer preserves iframe sandbox',
  );
  assert(
    !studioSource.includes('dangerouslySetInnerHTML'),
    'StudioView does not use dangerouslySetInnerHTML',
  );

  // Verify round-trip property compatibility between Inspector outputs and Renderer helpers
  const sepElement: StudioElement = {
    ...createStudioElementFromSource('separator'),
    properties: {
      orientation: 'vertical',
      lineColor: '#38BDF8',
      thickness: 6,
      glow: false,
    },
  };
  const sepResolved = resolveSeparatorStyle(sepElement, normalizeStudioElementProperties(sepElement).properties);
  assertEqual(sepResolved.orientation, 'vertical', 'separator orientation updates renderer');
  assertEqual(sepResolved.lineColor, '#38BDF8', 'separator lineColor updates renderer');
  assertEqual(sepResolved.thickness, 6, 'separator thickness updates renderer');
  assertEqual(sepResolved.glow, false, 'separator glow=false disables glow');

  assertEqual(validateSafeBrowserEmbedUrl('https://syntxrr.com/live').isValid, true, 'https URL valid');
  assertEqual(validateSafeBrowserEmbedUrl('javascript:alert(1)').isValid, false, 'javascript URL blocked');

  const sbSynth = resolveSoundboardControlModel({ presetSfx: 'tada', volume: 65, audioUrl: '', title: '' });
  assertEqual(sbSynth.mode, 'synth', 'soundboard without audioUrl uses synth mode');
  assertEqual(sbSynth.volumePercent, 65, 'soundboard 0-100 volume reflected accurately');

  // Boundary check: 0%, 1%, 65%, and 100% stored via percentToUnitVolume
  assertEqual(percentToUnitVolume(0), 0, 'percentToUnitVolume(0) stores 0');
  assertEqual(percentToUnitVolume(1), 0.01, 'percentToUnitVolume(1) stores 0.01');
  assertEqual(percentToUnitVolume(65), 0.65, 'percentToUnitVolume(65) stores 0.65');
  assertEqual(percentToUnitVolume(100), 1, 'percentToUnitVolume(100) stores 1');

  const sbZero = resolveSoundboardControlModel({
    presetSfx: 'horn',
    volume: percentToUnitVolume(0),
    audioUrl: '',
    title: '',
  });
  assertEqual(sbZero.volumeUnit, 0, 'soundboard 0% resolves to volumeUnit 0');
  assertEqual(sbZero.volumePercent, 0, 'soundboard 0% resolves to volumePercent 0');

  const sbOnePercent = resolveSoundboardControlModel({
    presetSfx: 'horn',
    volume: percentToUnitVolume(1),
    audioUrl: '',
    title: '',
  });
  assertEqual(sbOnePercent.volumeUnit, 0.01, 'soundboard 1% resolves to volumeUnit 0.01 (not 100%)');
  assertEqual(sbOnePercent.volumePercent, 1, 'soundboard 1% resolves to volumePercent 1');

  const sbFull = resolveSoundboardControlModel({
    presetSfx: 'horn',
    volume: percentToUnitVolume(100),
    audioUrl: '',
    title: '',
  });
  assertEqual(sbFull.volumeUnit, 1, 'soundboard 100% resolves to volumeUnit 1');
  assertEqual(sbFull.volumePercent, 100, 'soundboard 100% resolves to volumePercent 100');

  const sbCustom = resolveSoundboardControlModel({
    presetSfx: 'horn',
    volume: 80,
    audioUrl: 'https://example.com/sfx.mp3',
    title: 'Intro Boom',
  });
  assertEqual(sbCustom.mode, 'custom_url', 'soundboard with audioUrl uses custom_url mode');
  assertEqual(sbCustom.label, 'Intro Boom', 'soundboard custom title displayed');

  const stickerModel = resolveStickerVisualModel('crown', false);
  assertEqual(stickerModel.stickerId, 'crown', 'stickerId crown resolved');
  assertEqual(stickerModel.floatEffect, false, 'sticker floatEffect=false resolved');

  // 9. dynamic_text Inspector controls & preview binding
  const dynamicTextSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'dynamic_text'",
    "selectedElement.type === 'username'",
    'dynamic_text inspector',
  );
  assert(dynamicTextSection.includes('<textarea'), 'dynamic_text inspector provides textarea for template');
  for (const prop of ['template', 'fallback', 'fontSize', 'textColor', 'backgroundColor']) {
    assert(
      updatesProp(dynamicTextSection, prop),
      `dynamic_text inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    dynamicTextSection.includes("'transparent'"),
    'dynamic_text inspector supports transparent backgroundColor option',
  );
  for (const token of ['{username}', '{target}', '{waktu}', '{durasi}', '{top_donor_name}']) {
    assert(
      dynamicTextSection.includes(token),
      `dynamic_text inspector documents supported token ${token}`,
    );
  }
  assert(
    dynamicTextSection.includes('durationText: null') &&
      dynamicTextSection.includes('resolveDynamicTextOutput('),
    'dynamic_text inspector preview keeps durationText=null and resolves via resolveDynamicTextOutput',
  );

  // Verify dynamic_text canvas renderer also reads backgroundColor & keeps durationText: null
  const dynamicTextRendererSection = extractBetween(
    studioSource,
    "case 'dynamic_text': {",
    "case 'username': {",
    'dynamic_text renderer',
  );
  assert(
    dynamicTextRendererSection.includes('props.backgroundColor') &&
      dynamicTextRendererSection.includes("'transparent'") &&
      dynamicTextRendererSection.includes('durationText: null'),
    'dynamic_text canvas renderer reflects backgroundColor (including transparent) and keeps durationText=null',
  );

  // 10. username Inspector controls
  const usernameSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'username'",
    "selectedElement.type === 'avatar'",
    'username inspector',
  );
  for (const prop of ['prefix', 'badge']) {
    assert(
      updatesProp(usernameSection, prop),
      `username inspector updates '${prop}' via updateElementProperty`,
    );
  }

  // 11. avatar Inspector controls
  const avatarIdx = inspectorSection.indexOf("selectedElement.type === 'avatar'");
  assert(avatarIdx !== -1, 'avatar inspector section exists');
  const avatarSection = inspectorSection.slice(avatarIdx);
  for (const prop of ['shape', 'borderGlow']) {
    assert(
      updatesProp(avatarSection, prop),
      `avatar inspector updates '${prop}' via updateElementProperty`,
    );
  }
  for (const shapeOpt of ['circle', 'rounded', 'square']) {
    assert(avatarSection.includes(`value="${shapeOpt}"`), `avatar inspector includes shape="${shapeOpt}"`);
  }
  assert(
    avatarSection.includes('!(selectedElement.properties.borderGlow !== false)'),
    'avatar inspector toggles boolean borderGlow properly with !== false default',
  );

  // 12. A1.3 Canvas Tap-to-Inspect gesture separation & behavioral policies
  assertEqual(STUDIO_TAP_MOVE_THRESHOLD_PX, 8, 'Canvas tap threshold is strictly 8px');
  assertEqual(hasExceededTapThreshold(100, 100, 100, 100), false, '0px move stays within tap threshold');
  assertEqual(hasExceededTapThreshold(100, 100, 104.8, 106.4), false, 'exact 8px diagonal stays tap');
  assertEqual(hasExceededTapThreshold(100, 100, 106, 106.1), true, '>8px move crosses drag threshold');

  const unlockedTapGesture: PendingCanvasElementGesture = {
    kind: 'pending_tap',
    elementId: 'elem_1',
    pointerId: 1,
    startX: 100,
    startY: 120,
    origX: 10,
    origY: 20,
    origW: 30,
    origH: 15,
    canDrag: true,
    resizeHandle: null,
  };
  assertEqual(
    classifyCanvasElementPointerMove({ gesture: unlockedTapGesture, clientX: 103, clientY: 124 }).outcome,
    'still_pending',
    'small jitter <= 8px keeps pending tap',
  );
  assertEqual(
    resolveCanvasElementPointerUp({ gesture: unlockedTapGesture, clientX: 103, clientY: 124 }).outcome,
    'open_inspector',
    'tap release within 8px opens Inspector',
  );

  const dragTrigger = classifyCanvasElementPointerMove({
    gesture: unlockedTapGesture,
    clientX: 112,
    clientY: 120,
  });
  assertEqual(dragTrigger.outcome, 'confirm_drag', '>8px move confirms drag');
  assertEqual(dragTrigger.shouldClosePropertiesInspector, true, 'confirming drag requests closing open Properties panel');
  const confirmedDragGesture: PendingCanvasElementGesture = { ...unlockedTapGesture, kind: 'dragging' };
  assertEqual(
    resolveCanvasElementPointerUp({ gesture: confirmedDragGesture, clientX: 112, clientY: 120 }).outcome,
    'commit_drag_or_resize',
    'drag release commits drag without opening Inspector',
  );

  const resizeGesture: PendingCanvasElementGesture = {
    ...unlockedTapGesture,
    kind: 'resizing',
    resizeHandle: 'bottom-right',
  };
  assertEqual(
    resolveCanvasElementPointerUp({ gesture: resizeGesture, clientX: 100, clientY: 120 }).outcome,
    'commit_drag_or_resize',
    'resize gesture never triggers tap-to-inspect',
  );

  const lockedTapGesture: PendingCanvasElementGesture = { ...unlockedTapGesture, canDrag: false };
  assertEqual(
    resolveCanvasElementPointerUp({ gesture: lockedTapGesture, clientX: 102, clientY: 122 }).outcome,
    'open_inspector',
    'locked element tap within 8px opens read-only Inspector',
  );
  assertEqual(
    classifyCanvasElementPointerMove({ gesture: lockedTapGesture, clientX: 120, clientY: 120 }).outcome,
    'ignore',
    'locked element move > 8px never starts drag',
  );
  assertEqual(
    resolveCanvasElementPointerUp({
      gesture: { ...lockedTapGesture, kind: 'cancelled_locked_move' },
      clientX: 100,
      clientY: 120,
    }).outcome,
    'noop',
    'locked element moved >8px and dragged back never fires accidental tap on release',
  );

  const containerNode = { tagName: 'DIV' };
  const buttonInside = { tagName: 'BUTTON', parentElement: containerNode };
  const spanInsideButton = { tagName: 'SPAN', parentElement: buttonInside };
  const plainSpan = { tagName: 'SPAN', parentElement: containerNode };
  const roleButtonDiv = {
    tagName: 'DIV',
    getAttribute: (name: string) => (name === 'role' ? 'button' : null),
    parentElement: containerNode,
  };
  assertEqual(
    isInteractiveCanvasChildTarget(spanInsideButton, containerNode),
    true,
    'nested child inside <button> is treated as interactive control',
  );
  assertEqual(
    isInteractiveCanvasChildTarget(roleButtonDiv, containerNode),
    true,
    'role="button" child is treated as interactive control',
  );
  assertEqual(
    isInteractiveCanvasChildTarget(plainSpan, containerNode),
    false,
    'ordinary display span triggers canvas tap/drag normally',
  );

  assertEqual(isStudioElementReadOnly({ elementLocked: true }), true, 'locked element sets Inspector read-only');
  assertEqual(
    canMutateStudioElementField({ elementLocked: true, field: 'x' }),
    false,
    'locked element blocks geometry/property field mutation',
  );
  assertEqual(
    canMutateStudioElementField({ elementLocked: true, field: 'locked' }),
    true,
    'locked element allows toggling unlock from Inspector header when group/ModeB allow',
  );
  assertEqual(
    canMutateStudioElementField({ elementLocked: true, isElementGroupLocked: true, field: 'locked' }),
    false,
    'group-locked element blocks unlock toggle',
  );
  assertEqual(
    shouldClosePropertiesOnCanvasBackgroundClick({
      isCanvasLivePreview: false,
      isMobilePanelOpen: true,
      activeSidePanel: 'properties',
    }),
    true,
    'canvas background click closes open contextual Properties panel',
  );

  // StudioView integration contracts for Tap-to-Inspect, bubbling guard, cancel, cleanup, & left contextual panel
  assert(
    studioSource.includes('if (!isCanvasLivePreview) e.stopPropagation();'),
    'StudioView stops click bubbling on element wrappers during editing',
  );
  assert(
    studioSource.includes('onPointerCancel={handlePointerCancel}') &&
      studioSource.includes('const handlePointerCancel ='),
    'StudioView wires dedicated handlePointerCancel without faking undo/tap',
  );
  assert(
    studioSource.includes('<fieldset') && studioSource.includes('disabled={isSelectedElementReadOnly}'),
    'StudioView wraps Inspector form body in fieldset disabled={isSelectedElementReadOnly}',
  );
  assert(
    studioSource.includes('disabled={!canToggleSelectedElementLock}'),
    'StudioView keeps Inspector header Lock/Unlock button interactive for element-locked elements',
  );
  assert(
    studioSource.includes("activeSidePanel === 'properties' ? 'landscape:hidden md:hidden' : ''") &&
      studioSource.includes('landscape:left-0 landscape:right-auto') &&
      studioSource.includes('md:left-0 md:right-auto'),
    'StudioView positions contextual Properties Inspector on the left in landscape/desktop without blocking backdrop',
  );
  assert(
    studioSource.includes("setIsMobilePanelOpen((open) => (activeSidePanel === 'properties' ? false : open))"),
    'StudioView closes contextual Properties panel on element deletion or stale selection removal',
  );

  // 13. A2.0 Inspector Focus Mode: hide Main Module Tabs while inspecting selected element
  const moduleTabsSection = extractBetween(
    studioSource,
    '{/* Main Module Tabs */}',
    '{/* TAB 1: CONTEXTUAL PROPERTIES PANEL */}',
    'Main Module Tabs section',
  );
  assert(
    moduleTabsSection.includes("!(activeSidePanel === 'properties' && selectedElement)"),
    'Main Module Tabs use conditional rendering !(activeSidePanel === properties && selectedElement)',
  );

  const shouldRenderModuleTabs = (panel: string, hasSelectedElement: boolean): boolean =>
    !(panel === 'properties' && hasSelectedElement);
  assertEqual(
    shouldRenderModuleTabs('properties', true),
    false,
    'Module tabs are unmounted when activeSidePanel is properties with selectedElement',
  );
  assertEqual(
    shouldRenderModuleTabs('properties', false),
    true,
    'Module tabs stay visible when activeSidePanel is properties without selectedElement',
  );
  for (const nonInspectorPanel of ['elements', 'sources', 'presets', 'media', 'layers', 'simulator', 'marketplace']) {
    assertEqual(
      shouldRenderModuleTabs(nonInspectorPanel, true),
      true,
      `Module tabs stay visible when activeSidePanel is '${nonInspectorPanel}' even with selectedElement`,
    );
  }

  for (const tabExpectation of [
    { key: 'properties', label: 'Properti' },
    { key: 'elements', label: 'Elemen' },
    { key: 'sources', label: 'Sumber' },
    { key: 'presets', label: 'Preset' },
    { key: 'media', label: 'Media' },
    { key: 'layers', label: 'Lapisan' },
    { key: 'simulator', label: 'Uji Live' },
    { key: 'marketplace', label: 'Marketplace' },
  ]) {
    assert(
      moduleTabsSection.includes(`setActiveSidePanel('${tabExpectation.key}')`) &&
        moduleTabsSection.includes(`<span>${tabExpectation.label}</span>`),
      `Main Module Tabs keep '${tabExpectation.label}' tab wired to setActiveSidePanel('${tabExpectation.key}')`,
    );
  }

  // Quick Canvas toolbar, preset access, close button, and Inspector title stay intact
  const quickDockSection = extractBetween(
    studioSource,
    '{/* COMPACT FLOATING BOTTOM-LEFT WORKSPACE DOCK',
    '{/* Overlay Backdrop',
    'Canvas quick toolbar dock',
  );
  assert(
    quickDockSection.includes("openStudioPanel('elements')") &&
      quickDockSection.includes("openStudioPanel('marketplace')") &&
      quickDockSection.includes("openStudioPanel('layers')") &&
      quickDockSection.includes('aria-label="Buka panel alat Studio"') &&
      quickDockSection.includes('>Alat</span>'),
    'Canvas quick dock preserves Elemen, Marketplace, Lapisan, and Alat shortcuts',
  );
  assert(
    studioSource.includes("openStudioPanel('presets')") &&
      studioSource.includes('onClick={handleOpenPresetSelector}'),
    'Preset panel and preset manager remain reachable outside Inspector module tabs',
  );
  assert(
    studioSource.includes('`Properti: ${selectedElement.name}`') &&
      studioSource.includes('aria-label="Tutup panel Studio"'),
    'Inspector header preserves selected element title and close panel button',
  );

  // 14. A2.1 Dynamic Inspector: event_feed & live_viewer_counter
  const eventFeedSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'event_feed'",
    "selectedElement.type === 'live_viewer_counter'",
    'event_feed inspector',
  );
  for (const prop of ['maxItems', 'slideAnimation']) {
    assert(
      updatesProp(eventFeedSection, prop),
      `event_feed inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    eventFeedSection.includes('min={1}') &&
      eventFeedSection.includes('max={20}') &&
      eventFeedSection.includes('step={1}') &&
      eventFeedSection.includes('clampNumericRange(e.target.value, 1, 20, 4)'),
    'event_feed inspector enforces maxItems integer bounds 1..20 with default 4',
  );
  assert(
    eventFeedSection.includes('!(selectedElement.properties.slideAnimation !== false)'),
    'event_feed inspector toggles boolean slideAnimation with active default (!== false)',
  );
  assert(
    eventFeedSection.includes('Transisi CSS Item') &&
      !eventFeedSection.includes('auto-scroll'),
    'event_feed inspector describes CSS item transition honestly without promising auto-scroll',
  );

  const eventFeedRendererSection = extractBetween(
    studioSource,
    "case 'event_feed': {",
    "case 'progress_bar': {",
    'event_feed renderer',
  );
  assert(
    eventFeedRendererSection.includes('buildEventFeedItems(studioEventHistory, props.maxItems)') &&
      eventFeedRendererSection.includes('props.slideAnimation !== false'),
    'event_feed renderer stays bound to real studioEventHistory and slideAnimation property',
  );

  const viewerIdx = inspectorSection.indexOf("selectedElement.type === 'live_viewer_counter'");
  assert(viewerIdx !== -1, 'live_viewer_counter inspector section exists');
  const viewerCounterSection = inspectorSection.slice(viewerIdx);
  for (const prop of ['viewerCount', 'liveBadge']) {
    assert(
      updatesProp(viewerCounterSection, prop),
      `live_viewer_counter inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    viewerCounterSection.includes('min={0}') &&
      viewerCounterSection.includes('step={1}') &&
      viewerCounterSection.includes('clampNumericRange(e.target.value, 0, 999999999, 1420)'),
    'live_viewer_counter inspector enforces non-negative integer viewerCount fallback with default 1420',
  );
  assert(
    viewerCounterSection.includes('!(selectedElement.properties.liveBadge !== false)'),
    'live_viewer_counter inspector toggles boolean liveBadge with active default (!== false)',
  );
  assert(
    viewerCounterSection.includes('Angka Cadangan') &&
      viewerCounterSection.includes('Data penonton LIVE aktual tetap diprioritaskan') &&
      viewerCounterSection.includes('resolveViewerCounterDisplay(') &&
      viewerCounterSection.includes('shouldShowViewerLiveBadge(') &&
      !viewerCounterSection.includes('setLatestViewerCount('),
    'live_viewer_counter inspector documents LIVE priority and never mutates latestViewerCount',
  );

  // 15. A2.2 Dynamic Inspector: counter & progress_bar
  const counterSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'counter'",
    "selectedElement.type === 'progress_bar'",
    'counter inspector',
  );
  for (const prop of ['targetGoal', 'label']) {
    assert(
      updatesProp(counterSection, prop),
      `counter inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    !updatesProp(counterSection, 'current') &&
      !counterSection.includes('setSimulatedLikes('),
    'counter inspector does NOT expose fake properties.current input or mutate simulatedLikes directly',
  );
  assert(
    counterSection.includes('selectedElement.properties.targetGoal ?? selectedElement.properties.target') &&
      counterSection.includes('clampNumericRange(e.target.value, 1, 999999999, 2000)') &&
      counterSection.includes('min={1}') &&
      counterSection.includes("'Target Follower Hari Ini'"),
    'counter inspector preserves targetGoal ?? target fallback, positive integer bounds, and default 2000/label',
  );
  assert(
    counterSection.includes('simulatedLikes.toLocaleString') &&
      counterSection.includes('event like/tap LIVE'),
    'counter inspector displays live event running counter honestly as read-only',
  );

  const counterRendererSection = extractBetween(
    studioSource,
    "case 'counter': {",
    "case 'live_viewer_counter': {",
    'counter renderer',
  );
  assert(
    counterRendererSection.includes('simulatedLikes.toLocaleString') &&
      counterRendererSection.includes('props.targetGoal ?? props.target') &&
      !counterRendererSection.includes('props.current'),
    'counter canvas renderer reads running count from simulatedLikes and target from targetGoal ?? target',
  );

  const progressBarIdx = inspectorSection.indexOf("selectedElement.type === 'progress_bar'");
  assert(progressBarIdx !== -1, 'progress_bar inspector section exists');
  const progressBarSection = inspectorSection.slice(progressBarIdx);
  for (const prop of ['currentAmount', 'targetAmount', 'currency', 'barColor']) {
    assert(
      updatesProp(progressBarSection, prop),
      `progress_bar inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    progressBarSection.includes('clampNumericRange(e.target.value, 0, 999999999999, 0)') &&
      progressBarSection.includes('min={0}') &&
      progressBarSection.includes('350000'),
    'progress_bar inspector allows >= 0 integer currentAmount with default 350000',
  );
  assert(
    progressBarSection.includes('clampNumericRange(e.target.value, 1, 999999999999, 1000000)') &&
      progressBarSection.includes('min={1}') &&
      progressBarSection.includes('1000000'),
    'progress_bar inspector enforces > 0 integer targetAmount with default 1000000',
  );
  assert(
    progressBarSection.includes("typeof propsObj.currency === 'string' ? propsObj.currency : 'Rp'") &&
      progressBarSection.includes('type="color"') &&
      progressBarSection.includes("toSafeHexColor(propsObj.barColor, '#F2C230')") &&
      progressBarSection.includes("toSafeHexColor(e.target.value, '#F2C230')"),
    'progress_bar inspector handles currency prefix default Rp and hex-validated barColor picker with safe fallback',
  );
  assert(
    progressBarSection.includes('computeProgressBarModel(propsObj)') &&
      progressBarSection.includes('progressPreview.formattedCurrent') &&
      progressBarSection.includes('progressPreview.formattedTarget') &&
      progressBarSection.includes('progressPreview.percentLabel'),
    'progress_bar inspector delegates percentage and nominal formatting strictly to computeProgressBarModel',
  );

  // 16. A2.3 Combo Counter & Leaderboard Inspector & Renderer Alignment
  const comboInspectorSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'combo_counter'",
    "selectedElement.type === 'leaderboard'",
    'combo_counter inspector section',
  );
  for (const prop of ['comboLabel', 'themeColor']) {
    assert(
      updatesProp(comboInspectorSection, prop),
      `combo_counter inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    !updatesProp(comboInspectorSection, 'multiplier') &&
      !updatesProp(comboInspectorSection, 'giftName'),
    'combo_counter inspector does not add disconnected multiplier or giftName inputs',
  );
  assert(
    comboInspectorSection.includes("'x25 COMBO MAWAR MERAH!'") &&
      comboInspectorSection.includes("toSafeHexColor(propsObj.themeColor, '#EA580C')") &&
      comboInspectorSection.includes("toSafeHexColor(e.target.value, '#EA580C')") &&
      comboInspectorSection.includes('type="color"'),
    'combo_counter inspector enforces default comboLabel and hex-validated themeColor (#EA580C)',
  );

  const comboRendererSection = extractBetween(
    studioSource,
    "case 'combo_counter': {",
    "case 'counter': {",
    'combo_counter renderer',
  );
  assert(
    comboRendererSection.includes("props.comboLabel || 'x25 COMBO LOVE!'") &&
      comboRendererSection.includes('props.themeColor') &&
      comboRendererSection.includes("'#EA580C'") &&
      comboRendererSection.includes('linear-gradient(90deg, ${themeColor}, #F59E0B)'),
    'combo_counter canvas renderer reads comboLabel and themeColor gradient directly',
  );

  const leaderboardIdx = inspectorSection.indexOf("selectedElement.type === 'leaderboard'");
  assert(leaderboardIdx !== -1, 'leaderboard inspector section exists');
  const leaderboardInspectorSection = inspectorSection.slice(leaderboardIdx);
  for (const prop of ['topCount', 'showAmounts']) {
    assert(
      updatesProp(leaderboardInspectorSection, prop),
      `leaderboard inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    leaderboardInspectorSection.includes('min={1}') &&
      leaderboardInspectorSection.includes('max={10}') &&
      leaderboardInspectorSection.includes('step={1}') &&
      leaderboardInspectorSection.includes('clampNumericRange(e.target.value, 1, 10, 3)'),
    'leaderboard inspector clamps topCount integer between 1 and 10 with default 3',
  );
  assert(
    leaderboardInspectorSection.includes('!(selectedElement.properties.showAmounts !== false)') &&
      leaderboardInspectorSection.includes('buildLeaderboardEntries(') &&
      leaderboardInspectorSection.includes('studioEventHistory'),
    'leaderboard inspector toggles showAmounts and references actual studioEventHistory via buildLeaderboardEntries',
  );
  assert(
    !leaderboardInspectorSection.includes("updateElementProperty(selectedElement.id, 'entries'") &&
      !leaderboardInspectorSection.includes("updateElementProperty(selectedElement.id, 'donors'"),
    'leaderboard inspector contains no manual donor/entry property mutation controls',
  );

  const leaderboardRendererSection = extractBetween(
    studioSource,
    "case 'leaderboard': {",
    "case 'live_text': {",
    'leaderboard renderer',
  );
  assert(
    leaderboardRendererSection.includes('buildLeaderboardEntries(studioEventHistory, props.topCount)') &&
      leaderboardRendererSection.includes('props.showAmounts !== false') &&
      leaderboardRendererSection.includes('Belum ada gift / donasi sesi ini'),
    'leaderboard canvas renderer uses buildLeaderboardEntries(studioEventHistory, props.topCount) and showAmounts toggle',
  );

  // 17. A2.4 Live Text Inspector & Renderer Alignment
  const liveTextIdx = inspectorSection.indexOf("selectedElement.type === 'live_text'");
  assert(liveTextIdx !== -1, 'live_text inspector section exists');
  const liveTextInspectorSection = inspectorSection.slice(liveTextIdx);
  for (const prop of ['showFps', 'showBitrate']) {
    assert(
      updatesProp(liveTextInspectorSection, prop),
      `live_text inspector updates '${prop}' via updateElementProperty`,
    );
  }
  assert(
    liveTextInspectorSection.includes("propsObj.showFps !== false") &&
      liveTextInspectorSection.includes("propsObj.showBitrate !== false") &&
      liveTextInspectorSection.includes('!(selectedElement.properties.showFps !== false)') &&
      liveTextInspectorSection.includes('!(selectedElement.properties.showBitrate !== false)'),
    'live_text inspector defaults showFps and showBitrate to active and toggles via selectedElement.id',
  );
  assert(
    !liveTextInspectorSection.includes('<input') &&
      !liveTextInspectorSection.includes('<select') &&
      !liveTextInspectorSection.includes('<textarea') &&
      !updatesProp(liveTextInspectorSection, 'showResolution') &&
      !updatesProp(liveTextInspectorSection, 'showDuration'),
    'live_text inspector has no manual telemetry inputs and adds no unsupported showResolution/showDuration props',
  );
  assert(
    liveTextInspectorSection.includes('buildLiveTextRenderModel(') &&
      liveTextInspectorSection.includes('modeBStatus') &&
      liveTextInspectorSection.includes('isModeBSelected') &&
      liveTextInspectorSection.includes('belum dipasok') &&
      liveTextInspectorSection.includes('&mdash;'),
    'live_text inspector binds preview to runtime Mode B helper and states FPS/resolution telemetry limitation honestly',
  );

  const liveTextRendererSection = extractBetween(
    studioSource,
    "case 'live_text': {",
    "case 'image': {",
    'live_text renderer',
  );
  assert(
    liveTextRendererSection.includes('buildLiveTextRenderModel({') &&
      liveTextRendererSection.includes('isModeBSelected,') &&
      liveTextRendererSection.includes('modeBStatus,') &&
      liveTextRendererSection.includes('showFps: props.showFps !== false') &&
      liveTextRendererSection.includes('showBitrate: props.showBitrate !== false') &&
      !liveTextRendererSection.includes('fps:') &&
      !liveTextRendererSection.includes('resolution:'),
    'live_text canvas renderer connects to buildLiveTextRenderModel and modeBStatus without fabricating fps/resolution',
  );

  // 18. A2.5 Targeted P2 Regression Fixes (Media Lock & Chat Message Background Opacity)
  const applyMediaFnSection = extractBetween(
    studioSource,
    'const handleApplyMediaToSelectedElement = (url: string, assetId?: string) => {',
    '// Event Simulator Emitter',
    'handleApplyMediaToSelectedElement',
  );
  assert(
    applyMediaFnSection.includes('isStudioElementReadOnly({') &&
      applyMediaFnSection.includes('elementLocked: selectedElement.locked') &&
      applyMediaFnSection.includes('isElementGroupLocked: isGroupLocked') &&
      applyMediaFnSection.includes('isStrictModeBLocked') &&
      applyMediaFnSection.includes('applyMediaReplacementToElements('),
    'handleApplyMediaToSelectedElement enforces isStudioElementReadOnly (element, group, strict Mode B) and delegates to applyMediaReplacementToElements',
  );

  const mediaReplaceBtnSection = extractBetween(
    studioSource,
    'Pasang Sebagai Elemen Baru',
    'Daftar Media Tersimpan',
    'Tab Media replace selected element button',
  );
  assert(
    mediaReplaceBtnSection.includes('disabled={isSelectedElementReadOnly}') &&
      !mediaReplaceBtnSection.includes('disabled={isStrictModeBLocked}'),
    'Tab Media Ganti Elemen Terpilih button uses disabled={isSelectedElementReadOnly} consistently',
  );

  const chatInspectorSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'chat_message'",
    "selectedElement.type === 'text'",
    'chat_message inspector',
  );
  assert(
    chatInspectorSection.includes('<ChatMessageOpacityInput') &&
      chatInspectorSection.includes('key={selectedElement.id}') &&
      chatInspectorSection.includes('elementId={selectedElement.id}') &&
      chatInspectorSection.includes('properties={selectedElement.properties}') &&
      chatInspectorSection.includes('onCommit={updateElementProperties}'),
    'chat_message inspector mounts ChatMessageOpacityInput keyed by selectedElement.id and commits atomically via updateElementProperties',
  );

  // Ensure chat_message Inspector sits inside <fieldset disabled={isSelectedElementReadOnly}>
  const inspectorFieldsetSection = extractBetween(
    studioSource,
    '<fieldset',
    '</fieldset>',
    'Inspector read-only fieldset',
  );
  assert(
    inspectorFieldsetSection.includes('disabled={isSelectedElementReadOnly}') &&
      inspectorFieldsetSection.includes('<ChatMessageOpacityInput'),
    'ChatMessageOpacityInput remains governed by Inspector <fieldset disabled={isSelectedElementReadOnly}>',
  );

  // 19. A2.5.1 ChatMessageOpacityInput Local Draft State & Blur/Enter Commit Contract
  const opacityComponentSection = extractBetween(
    studioSource,
    'const ChatMessageOpacityInput:',
    'export const StudioView:',
    'ChatMessageOpacityInput component',
  );
  assert(
    opacityComponentSection.includes('resolveChatMessageBackground(properties).bgOpacity') &&
      opacityComponentSection.includes('useState(false)') &&
      opacityComponentSection.includes('useState<string>') &&
      opacityComponentSection.includes('isEditingRef'),
    'ChatMessageOpacityInput manages local draft state seeded from resolveChatMessageBackground(properties).bgOpacity',
  );

  const focusHandlerSection = extractBetween(
    opacityComponentSection,
    'const handleFocus = () => {',
    'const handleChange =',
    'ChatMessageOpacityInput handleFocus',
  );
  assert(
    focusHandlerSection.includes('isEditingRef.current = true') &&
      focusHandlerSection.includes('setIsEditing(true)') &&
      focusHandlerSection.includes('setDraftValue(String(resolvedOpacity))'),
    'ChatMessageOpacityInput copies current resolvedOpacity into local draft on focus',
  );

  const changeHandlerSection = extractBetween(
    opacityComponentSection,
    'const handleChange =',
    'const commitDraft =',
    'ChatMessageOpacityInput handleChange',
  );
  assert(
    changeHandlerSection.includes('setDraftValue(e.target.value)') &&
      !changeHandlerSection.includes('buildChatMessageBgOpacityPatch') &&
      !changeHandlerSection.includes('onCommit') &&
      !changeHandlerSection.includes('updateElementProperties') &&
      !changeHandlerSection.includes('updateElementProperty'),
    'ChatMessageOpacityInput onChange only updates local draft without mutating element properties per keystroke',
  );

  const commitDraftSection = extractBetween(
    opacityComponentSection,
    'const commitDraft = () => {',
    'const handleBlur =',
    'ChatMessageOpacityInput commitDraft',
  );
  assert(
    commitDraftSection.includes('if (!isEditingRef.current) return;') &&
      commitDraftSection.includes('isEditingRef.current = false;') &&
      commitDraftSection.includes('buildChatMessageBgOpacityPatch(properties, draftValue)') &&
      commitDraftSection.includes('onCommit(elementId, patch)'),
    'ChatMessageOpacityInput commitDraft guards against double commit and applies buildChatMessageBgOpacityPatch via onCommit',
  );

  const blurAndKeyDownSection = extractBetween(
    opacityComponentSection,
    'const handleBlur = () => {',
    'return (',
    'ChatMessageOpacityInput blur and keydown handlers',
  );
  assert(
    blurAndKeyDownSection.includes('commitDraft();') &&
      blurAndKeyDownSection.includes("e.key === 'Enter'") &&
      blurAndKeyDownSection.includes('e.preventDefault();') &&
      blurAndKeyDownSection.includes('e.currentTarget.blur();'),
    'ChatMessageOpacityInput commits on blur and Enter using the same guarded commitDraft flow without double commit',
  );

  assert(
    opacityComponentSection.includes('value={isEditing ? draftValue : String(resolvedOpacity)}') &&
      opacityComponentSection.includes('onFocus={handleFocus}') &&
      opacityComponentSection.includes('onChange={handleChange}') &&
      opacityComponentSection.includes('onBlur={handleBlur}') &&
      opacityComponentSection.includes('onKeyDown={handleKeyDown}'),
    'ChatMessageOpacityInput wires controlled draft/resolved value and focus/change/blur/keydown handlers',
  );

  // Helper behavior preservation checks for A2.5 + A2.5.1 draft-commit sequence
  const chatDefaultElem = createStudioElementFromSource('chat_message', []);
  assertEqual(resolveChatMessageBackground(chatDefaultElem.properties).bgOpacity, 82, 'catalog chat opacity defaults to 82');
  const draftCommit50 = buildChatMessageBgOpacityPatch(chatDefaultElem.properties, '50');
  assertEqual(draftCommit50.bgOpacity, 50, 'blur commit of two-digit "50" produces bgOpacity 50');
  assertEqual(draftCommit50.backgroundColor, 'rgba(15, 19, 27, 0.5)', 'blur commit preserves RGB and updates alpha to 0.5');
  assertEqual(clampChatMessageOpacity('5', 82), 10, 'post-edit clamp turns "5" into minimum 10');
  assertEqual(clampChatMessageOpacity('150', 82), 100, 'post-edit clamp turns "150" into maximum 100');
  assertEqual(buildChatMessageBgOpacityPatch(chatDefaultElem.properties, '').bgOpacity, 82, 'empty draft falls back to previous valid opacity 82');
  assertEqual(buildChatMessageBgOpacityPatch(chatDefaultElem.properties, 'invalid').bgOpacity, 82, 'invalid draft falls back safely without NaN');

  const chatRendererSection = extractBetween(
    studioSource,
    "case 'chat_message': {",
    "case 'combo_counter': {",
    'chat_message renderer',
  );
  assert(
    chatRendererSection.includes('resolveChatMessageBackground(props).backgroundColor') &&
      chatRendererSection.includes('style={{ backgroundColor: chatBg }}'),
    'chat_message canvas renderer uses resolveChatMessageBackground(props).backgroundColor',
  );

  // 20. A2.6 Default-True Toggle Regression Fix (chat_message.showBadges & song_request.showRequester)
  assert(
    chatInspectorSection.includes(
      "updateElementProperty(selectedElement.id, 'showBadges', !(selectedElement.properties.showBadges !== false))",
    ) &&
      !chatInspectorSection.includes("'showBadges', !selectedElement.properties.showBadges)") &&
      chatInspectorSection.includes('selectedElement.properties.showBadges !== false') &&
      chatInspectorSection.includes("'Aktif' : 'Nonaktif'"),
    'chat_message inspector uses !(selectedElement.properties.showBadges !== false) handler and !== false button display',
  );
  assert(
    chatRendererSection.includes('props.showBadges !== false'),
    'chat_message canvas renderer preserves props.showBadges !== false check',
  );

  const songRequestInspectorSection = extractBetween(
    inspectorSection,
    "selectedElement.type === 'song_request'",
    "selectedElement.type === 'lyrics'",
    'song_request inspector',
  );
  assert(
    songRequestInspectorSection.includes(
      "updateElementProperty(selectedElement.id, 'showRequester', !(selectedElement.properties.showRequester !== false))",
    ) &&
      !songRequestInspectorSection.includes("'showRequester', !selectedElement.properties.showRequester)") &&
      songRequestInspectorSection.includes('selectedElement.properties.showRequester !== false') &&
      songRequestInspectorSection.includes("'Aktif' : 'Nonaktif'"),
    'song_request inspector uses !(selectedElement.properties.showRequester !== false) handler and !== false button display',
  );

  const songRequestRendererSection = extractBetween(
    studioSource,
    "case 'song_request':",
    "case 'lyrics': {",
    'song_request renderer',
  );
  assert(
    songRequestRendererSection.includes('props.showRequester !== false'),
    'song_request canvas renderer preserves props.showRequester !== false check',
  );

  assert(
    inspectorFieldsetSection.includes("selectedElement.type === 'chat_message'") &&
      inspectorFieldsetSection.includes("selectedElement.type === 'song_request'"),
    'chat_message and song_request toggle buttons remain inside <fieldset disabled={isSelectedElementReadOnly}>',
  );

  // Verify boolean transition semantics for default-true (!== false) properties:
  // undefined -> effective true -> 1st tap false -> 2nd tap true; true -> false; false -> true
  const isDefaultTrueEffective = (value: unknown): boolean => value !== false;
  const computeDefaultTrueNextToggle = (value: unknown): boolean => !(value !== false);

  // 20a. chat_message.showBadges state machine
  let chatProps: Record<string, unknown> = {};
  assertEqual(isDefaultTrueEffective(chatProps.showBadges), true, 'chat_message.showBadges undefined defaults to effective Aktif (true)');
  chatProps = { ...chatProps, showBadges: computeDefaultTrueNextToggle(chatProps.showBadges) };
  assertEqual(chatProps.showBadges, false, 'chat_message.showBadges first tap from undefined produces false');
  assertEqual(isDefaultTrueEffective(chatProps.showBadges), false, 'chat_message.showBadges becomes Nonaktif after first tap');
  chatProps = { ...chatProps, showBadges: computeDefaultTrueNextToggle(chatProps.showBadges) };
  assertEqual(chatProps.showBadges, true, 'chat_message.showBadges second tap from false produces true');
  assertEqual(isDefaultTrueEffective(chatProps.showBadges), true, 'chat_message.showBadges becomes Aktif after second tap');
  assertEqual(computeDefaultTrueNextToggle(true), false, 'chat_message.showBadges explicit true toggles to false');
  assertEqual(computeDefaultTrueNextToggle(false), true, 'chat_message.showBadges explicit false toggles to true');

  // 20b. song_request.showRequester state machine
  let srProps: Record<string, unknown> = {};
  assertEqual(isDefaultTrueEffective(srProps.showRequester), true, 'song_request.showRequester undefined defaults to effective Aktif (true)');
  srProps = { ...srProps, showRequester: computeDefaultTrueNextToggle(srProps.showRequester) };
  assertEqual(srProps.showRequester, false, 'song_request.showRequester first tap from undefined produces false');
  assertEqual(isDefaultTrueEffective(srProps.showRequester), false, 'song_request.showRequester becomes Nonaktif after first tap');
  srProps = { ...srProps, showRequester: computeDefaultTrueNextToggle(srProps.showRequester) };
  assertEqual(srProps.showRequester, true, 'song_request.showRequester second tap from false produces true');
  assertEqual(isDefaultTrueEffective(srProps.showRequester), true, 'song_request.showRequester becomes Aktif after second tap');
  assertEqual(computeDefaultTrueNextToggle(true), false, 'song_request.showRequester explicit true toggles to false');
  assertEqual(computeDefaultTrueNextToggle(false), true, 'song_request.showRequester explicit false toggles to true');

  // 21. A2.7 Layer Controls Disabled-State Consistency (Tab Lapisan: Elemen Lepas)
  const looseLayerSection = extractBetween(
    studioSource,
    '>Elemen Lepas</div>',
    '</section>',
    'Tab Lapisan Elemen Lepas',
  );
  assert(
    looseLayerSection.includes('const isGroupLocked = isElementLockedByGroup(elem.id);') &&
      looseLayerSection.includes('canMutateStudioElementField({') &&
      looseLayerSection.includes('elementLocked: elem.locked') &&
      looseLayerSection.includes('isElementGroupLocked: isGroupLocked') &&
      looseLayerSection.includes('isStrictModeBLocked') &&
      looseLayerSection.includes("field: 'visible'") &&
      looseLayerSection.includes("field: 'locked'") &&
      !looseLayerSection.includes('isSelectedElementReadOnly'),
    'Elemen Lepas computes visible and locked mutability via canMutateStudioElementField without using isSelectedElementReadOnly',
  );

  const visibleBtnSection = extractBetween(
    looseLayerSection,
    'disabled={!canMutateVisible}',
    'disabled={!canMutateLocked}',
    'Elemen Lepas visible button',
  );
  assert(
    visibleBtnSection.includes("onClick={() => updateElementField(elem.id, 'visible', !elem.visible)}") &&
      visibleBtnSection.includes('disabled:opacity-40') &&
      visibleBtnSection.includes('disabled:cursor-not-allowed'),
    'Elemen Lepas visible button binds disabled={!canMutateVisible}, disabled styling, and updateElementField visible handler',
  );

  const lockBtnSection = looseLayerSection.slice(looseLayerSection.indexOf('disabled={!canMutateLocked}'));
  assert(
    lockBtnSection.includes("onClick={() => updateElementField(elem.id, 'locked', !elem.locked)}") &&
      lockBtnSection.includes('disabled:opacity-40') &&
      lockBtnSection.includes('disabled:cursor-not-allowed'),
    'Elemen Lepas locked button binds disabled={!canMutateLocked}, disabled styling, and updateElementField locked handler',
  );

  const updateElementFieldFnSection = extractBetween(
    studioSource,
    'const updateElementField = (id: string, field: keyof StudioElement, value: any) => {',
    'const updateElementProperties =',
    'updateElementField guard',
  );
  assert(
    updateElementFieldFnSection.includes('!canMutateStudioElementField({'),
    'updateElementField preserves canMutateStudioElementField guard',
  );

  // Policy matrix against actual canMutateStudioElementField helper
  const policyCases: Array<{
    label: string;
    elementLocked: boolean;
    isElementGroupLocked: boolean;
    isStrictModeBLocked: boolean;
    expectedVisible: boolean;
    expectedLocked: boolean;
  }> = [
    {
      label: 'Unlocked normal',
      elementLocked: false,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      expectedVisible: true,
      expectedLocked: true,
    },
    {
      label: 'Individual locked',
      elementLocked: true,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      expectedVisible: false,
      expectedLocked: true,
    },
    {
      label: 'Group locked (unlocked child)',
      elementLocked: false,
      isElementGroupLocked: true,
      isStrictModeBLocked: false,
      expectedVisible: false,
      expectedLocked: false,
    },
    {
      label: 'Group locked (locked child)',
      elementLocked: true,
      isElementGroupLocked: true,
      isStrictModeBLocked: false,
      expectedVisible: false,
      expectedLocked: false,
    },
    {
      label: 'Strict Mode B locked (unlocked element)',
      elementLocked: false,
      isElementGroupLocked: false,
      isStrictModeBLocked: true,
      expectedVisible: false,
      expectedLocked: false,
    },
    {
      label: 'Strict Mode B locked (locked element)',
      elementLocked: true,
      isElementGroupLocked: false,
      isStrictModeBLocked: true,
      expectedVisible: false,
      expectedLocked: false,
    },
  ];

  for (const c of policyCases) {
    assertEqual(
      canMutateStudioElementField({
        elementLocked: c.elementLocked,
        isElementGroupLocked: c.isElementGroupLocked,
        isStrictModeBLocked: c.isStrictModeBLocked,
        field: 'visible',
      }),
      c.expectedVisible,
      `${c.label}: visible mutability`,
    );
    assertEqual(
      canMutateStudioElementField({
        elementLocked: c.elementLocked,
        isElementGroupLocked: c.isElementGroupLocked,
        isStrictModeBLocked: c.isStrictModeBLocked,
        field: 'locked',
      }),
      c.expectedLocked,
      `${c.label}: locked mutability`,
    );
  }

  // --- A2.8.1 Camera Preview Restart, Sequencing & Runtime Limitation Tests ---
  {
    type MockTrack = { stopped: boolean; stop: () => void };
    type MockStream = CameraPreviewStreamLike & { id: string; facing: CameraFacingMode; tracks: MockTrack[] };
    const makeStream = (id: string, facing: CameraFacingMode): MockStream => {
      const tracks: MockTrack[] = [
        {
          stopped: false,
          stop() {
            this.stopped = true;
          },
        },
      ];
      return {
        id,
        facing,
        tracks,
        getTracks: () => tracks,
      };
    };

    const streams: Record<string, MockStream> = {};
    const videoAttachments: Array<{ elemId: string; streamId: string | null }> = [];
    const requestedFacings: CameraFacingMode[] = [];
    const errors: unknown[] = [];
    let unsupportedCount = 0;
    let mounted = true;
    let elementPresent = true;
    let storedFacing: CameraFacingMode = 'user';
    const seqMap: Record<string, number> = {};

    type DeferredStream = {
      facing: CameraFacingMode;
      resolve: (s: MockStream) => void;
      reject: (e: unknown) => void;
    };
    const pendingRequests: DeferredStream[] = [];

    const controller = createCameraPreviewController<MockStream>({
      isMounted: () => mounted,
      hasCameraElement: (elemId) => elemId === 'cam_1' && elementPresent,
      getFacingMode: (_elemId, requested) => requested ?? storedFacing,
      getActiveStream: (elemId) => streams[elemId],
      setActiveStream: (elemId, stream) => {
        if (stream) {
          streams[elemId] = stream;
        } else {
          delete streams[elemId];
        }
      },
      attachStreamToVideo: (elemId, stream) => {
        videoAttachments.push({ elemId, streamId: stream ? stream.id : null });
      },
      hasMediaDevices: () => true,
      requestMediaStream: (facing) => {
        requestedFacings.push(facing);
        return new Promise<MockStream>((resolve, reject) => {
          pendingRequests.push({ facing, resolve, reject });
        });
      },
      onUnsupported: () => {
        unsupportedCount += 1;
      },
      onError: (err) => {
        errors.push(err);
      },
      requestSeqMap: seqMap,
    });

    // 1) Start camera preview via toggle ON
    const startPromise = controller.toggleCameraPreview('cam_1', 'user');
    assertEqual(requestedFacings.length, 1, 'toggle ON calls requestMediaStream once');
    assertEqual(requestedFacings[0], 'user', 'toggle ON uses user facingMode');
    const frontStream = makeStream('s_front_1', 'user');
    pendingRequests.shift()!.resolve(frontStream);
    const startRes = await startPromise;
    assertEqual(startRes.started, true, 'toggle ON succeeds');
    assertEqual(streams.cam_1?.id, 's_front_1', 'active stream stored for cam_1');
    assertEqual(frontStream.tracks[0].stopped, false, 'front stream track stays active');

    // 2) Switch facingMode while preview is active -> restarts with new facingMode and stops old stream
    storedFacing = 'environment';
    const restartPromise = controller.restartCameraPreview('cam_1', 'environment');
    assertEqual(frontStream.tracks[0].stopped, true, 'old stream tracks stopped when restarting lens');
    assertEqual(streams.cam_1, undefined, 'stale active stream cleared before new getUserMedia resolves');
    assertEqual(requestedFacings.length, 2, 'restart issues second requestMediaStream');
    assertEqual(requestedFacings[1], 'environment', 'restart requests environment facingMode');
    const backStream = makeStream('s_back_1', 'environment');
    pendingRequests.shift()!.resolve(backStream);
    const restartRes = await restartPromise;
    assertEqual(restartRes.started, true, 'restart succeeds with new lens');
    assertEqual(streams.cam_1?.id, 's_back_1', 'new environment stream becomes active');
    assertEqual(backStream.tracks[0].stopped, false, 'new environment stream track stays active');

    // 3) Toggle OFF stops active stream cleanly
    const stopRes = await controller.toggleCameraPreview('cam_1');
    assertEqual(stopRes.started, false, 'toggle OFF returns started=false');
    assertEqual(stopRes.reason, 'stopped', 'toggle OFF returns reason=stopped');
    assertEqual(backStream.tracks[0].stopped, true, 'toggle OFF stops active stream tracks');
    assertEqual(streams.cam_1, undefined, 'toggle OFF removes active stream');

    // 4) Request sequencing: rapid lens switch ignores stale pending getUserMedia and stops stale tracks
    const rapid1 = controller.restartCameraPreview('cam_1', 'user');
    const rapid2 = controller.restartCameraPreview('cam_1', 'environment');
    assertEqual(pendingRequests.length, 2, 'rapid switch queues two sequential media requests');
    const req1 = pendingRequests.shift()!;
    const req2 = pendingRequests.shift()!;
    const latestEnvStream = makeStream('s_env_latest', 'environment');
    const staleUserStream = makeStream('s_user_stale', 'user');
    req2.resolve(latestEnvStream);
    const rapid2Res = await rapid2;
    assertEqual(rapid2Res.started, true, 'latest request wins');
    req1.resolve(staleUserStream);
    const rapid1Res = await rapid1;
    assertEqual(rapid1Res.started, false, 'stale request does not activate');
    assertEqual(rapid1Res.reason, 'stale', 'stale request reports reason=stale');
    assertEqual(staleUserStream.tracks[0].stopped, true, 'stale resolved stream tracks are stopped immediately');
    assertEqual(streams.cam_1?.id, 's_env_latest', 'latest stream remains undisturbed');

    // 5) Stop while getUserMedia is pending prevents late resolve from re-opening camera
    const pendingBeforeStop = controller.restartCameraPreview('cam_1', 'user');
    assertEqual(latestEnvStream.tracks[0].stopped, true, 'previous active stream stopped before new restart');
    controller.stopCameraPreview('cam_1');
    const postStopStream = makeStream('s_after_stop', 'user');
    pendingRequests.shift()!.resolve(postStopStream);
    const postStopRes = await pendingBeforeStop;
    assertEqual(postStopRes.started, false, 'request resolved after stop is rejected as stale');
    assertEqual(postStopStream.tracks[0].stopped, true, 'tracks resolved after stop are stopped immediately');
    assertEqual(streams.cam_1, undefined, 'no active stream remains after stop');

    // 6) Failure on getUserMedia reports error and leaves zero unmanaged active streams
    const errPromise = controller.restartCameraPreview('cam_1', 'environment');
    pendingRequests.shift()!.reject(new Error('Permission denied'));
    const errRes = await errPromise;
    assertEqual(errRes.started, false, 'failed getUserMedia returns started=false');
    assertEqual(errRes.reason, 'error', 'failed getUserMedia returns reason=error');
    assertEqual(errors.length, 1, 'onError invoked once for current failed request');
    assertEqual(streams.cam_1, undefined, 'no unmanaged active stream left on failure');
    assertEqual(unsupportedCount, 0, 'unsupported callback not triggered when mediaDevices exists');

    // 7) Unmount while getUserMedia is pending stops late stream and skips error/state updates
    const unmountPending = controller.startCameraPreview('cam_1', 'user');
    mounted = false;
    const unmountLateStream = makeStream('s_unmount_late', 'user');
    pendingRequests.shift()!.resolve(unmountLateStream);
    const unmountRes = await unmountPending;
    assertEqual(unmountRes.started, false, 'unmounted resolve does not activate stream');
    assertEqual(unmountLateStream.tracks[0].stopped, true, 'unmounted resolve stops tracks immediately');
    assertEqual(streams.cam_1, undefined, 'unmounted resolve leaves stream map clean');
    mounted = true;

    // 8) Element deleted while getUserMedia is pending stops late stream
    const deletedElemPending = controller.startCameraPreview('cam_1', 'user');
    elementPresent = false;
    const deletedElemStream = makeStream('s_deleted_elem', 'user');
    pendingRequests.shift()!.resolve(deletedElemStream);
    const deletedRes = await deletedElemPending;
    assertEqual(deletedRes.started, false, 'missing camera element rejects pending stream');
    assertEqual(deletedElemStream.tracks[0].stopped, true, 'missing camera element stops pending stream tracks');
    elementPresent = true;
    assert(videoAttachments.length > 0, 'video attachment hook exercised');

    // StudioView wiring & honest runtime limitation checks
    const cameraSection = extractBetween(
      studioSource,
      "{selectedElement.type === 'camera' && (",
      "{selectedElement.type === 'screen_capture' && (",
      'camera inspector section',
    );
    assert(
      !cameraSection.includes('Multi-Camera Ready'),
      'Camera inspector removes misleading "Multi-Camera Ready" label',
    );
    assert(
      cameraSection.includes('Canvas Multi-Cam') &&
        cameraSection.includes('1 kamera fisik aktif') &&
        cameraSection.includes('1 arah lensa') &&
        cameraSection.includes('mulai ulang LIVE'),
      'Camera inspector communicates Canvas multi-cam vs Mode B 1-camera/1-lens limitation honestly',
    );
    assert(
      cameraSection.includes('restartCameraPreview(selectedElement.id, facing)') &&
        (cameraSection.includes('activeCameraStreams[selectedElement.id]') ||
          cameraSection.includes('activeCameraStreamsRef.current[selectedElement.id]')) &&
        !cameraSection.includes('handleToggleCameraForElement(selectedElement.id, facing)'),
      'Camera facingMode <select> calls restartCameraPreview only when preview is active instead of toggle',
    );
    assert(
      cameraSection.includes('handleToggleCameraForElement(selectedElement.id, selectedElement.properties.facingMode)'),
      'Camera Aktifkan/Matikan button preserves ON/OFF toggle wiring',
    );

    const screenCaptureSection = extractBetween(
      studioSource,
      "{selectedElement.type === 'screen_capture' && (",
      "{selectedElement.type === 'event_alert' && (",
      'screen_capture inspector section',
    );
    assert(
      screenCaptureSection.includes('getDisplayMedia') &&
        screenCaptureSection.includes('MediaProjection native') &&
        screenCaptureSection.includes('Go Live Mode B'),
      'Screen capture inspector distinguishes browser getDisplayMedia preview from native Mode B MediaProjection',
    );
    assert(
      !screenCaptureSection.includes('Menangkap feed game Android atau tampilan layar dengan MediaProjection 60 FPS.'),
      'Screen capture inspector no longer conflates browser button with native MediaProjection',
    );
    assert(
      !screenCaptureSection.includes('Layer #1') &&
        screenCaptureSection.includes('lebih rendah daripada setiap overlay aktif') &&
        screenCaptureSection.includes('frame rate encoder global') &&
        screenCaptureSection.includes('0° / 90° / 180° / 270°'),
      'Screen capture inspector uses accurate layer rule, global FPS copy, and quarter-turn info',
    );
  }

  // --- A2.8.2 Screen Capture Preview Lifecycle, Rotation Policy, FPS & Layer Copy Tests ---
  {
    type MockScreenTrack = ScreenCaptureTrackLike & { kind: 'video' | 'audio'; stopped: boolean };
    type MockScreenStream = ScreenCaptureStreamLike & { id: string; tracks: MockScreenTrack[] };

    const makeScreenStream = (id: string): MockScreenStream => {
      const videoTrack: MockScreenTrack = {
        kind: 'video',
        stopped: false,
        onended: null,
        stop() {
          this.stopped = true;
        },
      };
      const audioTrack: MockScreenTrack = {
        kind: 'audio',
        stopped: false,
        onended: null,
        stop() {
          this.stopped = true;
        },
      };
      return {
        id,
        tracks: [videoTrack, audioTrack],
        getTracks: () => [videoTrack, audioTrack],
        getVideoTracks: () => [videoTrack],
      };
    };

    let activeStream: MockScreenStream | null = null;
    let activeOwnerId: string | null = null;
    let videoSrcObject: MockScreenStream | null = null;
    const readActiveStream = (): MockScreenStream | null => activeStream;
    const readVideoSrc = (): MockScreenStream | null => videoSrcObject;
    let mounted = true;
    let displayMediaSupported = true;
    let currentPresetId = 'preset_a';
    let elementsInScene: Array<{ id: string; type: string }> = [
      { id: 'screen_1', type: 'screen_capture' },
      { id: 'text_1', type: 'text' },
    ];
    const reqState: ScreenCapturePreviewRequestState = { seq: 0 };

    type DeferredScreenRequest = {
      resolve: (s: MockScreenStream) => void;
      reject: (e: unknown) => void;
    };
    const pendingScreenRequests: DeferredScreenRequest[] = [];
    let unsupportedCalls = 0;
    let cancelledCalls = 0;
    const errorCalls: unknown[] = [];

    const screenController = createScreenCapturePreviewController<MockScreenStream>({
      isMounted: () => mounted,
      getActivePresetId: () => currentPresetId,
      resolveOwnerElementId: (requestedElemId) => {
        if (
          requestedElemId &&
          elementsInScene.some((e) => e.id === requestedElemId && e.type === 'screen_capture')
        ) {
          return requestedElemId;
        }
        return elementsInScene.find((e) => e.type === 'screen_capture')?.id;
      },
      hasScreenCaptureElement: (elemId) =>
        elemId
          ? elementsInScene.some((e) => e.id === elemId && e.type === 'screen_capture')
          : elementsInScene.some((e) => e.type === 'screen_capture'),
      getActiveStream: () => activeStream,
      setActiveStream: (stream, ownerElemId) => {
        activeStream = stream;
        activeOwnerId = stream ? (ownerElemId ?? null) : null;
      },
      attachStreamToVideo: (stream) => {
        videoSrcObject = stream;
      },
      hasDisplayMedia: () => displayMediaSupported,
      requestDisplayMedia: () =>
        new Promise<MockScreenStream>((resolve, reject) => {
          pendingScreenRequests.push({ resolve, reject });
        }),
      onUnsupported: () => {
        unsupportedCalls += 1;
      },
      onCancelled: () => {
        cancelledCalls += 1;
      },
      onError: (err) => {
        errorCalls.push(err);
      },
      requestState: reqState,
    });

    // 1) Start succeeds and attaches stream/ref/owner
    const startP1 = screenController.handleToggleScreenCapture('screen_1');
    const s1 = makeScreenStream('screen_stream_1');
    pendingScreenRequests.shift()!.resolve(s1);
    const startR1 = await startP1;
    assertEqual(startR1.started, true, 'screen capture start succeeds');
    assertEqual(readActiveStream()?.id, 'screen_stream_1', 'active stream ref set on start');
    assertEqual(activeOwnerId, 'screen_1', 'owner element tracked on start');
    assertEqual(readVideoSrc()?.id, 'screen_stream_1', 'video srcObject attached on start');

    // 2) Stop stops all tracks (video & audio) and clears state/ref/video
    const stopR1 = await screenController.handleToggleScreenCapture('screen_1');
    assertEqual(stopR1.started, false, 'toggle stop returns started=false');
    assertEqual(stopR1.reason, 'stopped', 'toggle stop returns reason=stopped');
    assertEqual(s1.tracks[0].stopped, true, 'video track stopped on Stop');
    assertEqual(s1.tracks[1].stopped, true, 'audio track stopped on Stop');
    assertEqual(activeStream, null, 'active stream cleared on Stop');
    assertEqual(activeOwnerId, null, 'active owner cleared on Stop');
    assertEqual(videoSrcObject, null, 'video srcObject cleared on Stop');

    // 3) Natural track onended clears state/ref/UI and stops remaining tracks
    const startP2 = screenController.startScreenCapturePreview('screen_1');
    const s2 = makeScreenStream('screen_stream_2');
    pendingScreenRequests.shift()!.resolve(s2);
    await startP2;
    assert(typeof s2.tracks[0].onended === 'function', 'onended callback registered on primary video track');
    s2.tracks[0].onended!({} as Event);
    assertEqual(activeStream, null, 'onended clears active stream');
    assertEqual(activeOwnerId, null, 'onended clears owner');
    assertEqual(videoSrcObject, null, 'onended clears video srcObject');
    assertEqual(s2.tracks[1].stopped, true, 'onended stops remaining tracks in stream');

    // 4) Stale onended from old stream must NOT clear newer active stream
    const startP3 = screenController.startScreenCapturePreview('screen_1');
    const s3Old = makeScreenStream('screen_stream_3_old');
    pendingScreenRequests.shift()!.resolve(s3Old);
    await startP3;
    const oldOnEnded = s3Old.tracks[0].onended!;

    const startP4 = screenController.startScreenCapturePreview('screen_1');
    const s4New = makeScreenStream('screen_stream_4_new');
    pendingScreenRequests.shift()!.resolve(s4New);
    await startP4;
    assertEqual(s3Old.tracks[0].stopped, true, 'previous stream stopped when starting newer stream');
    oldOnEnded({} as Event);
    assertEqual(readActiveStream()?.id, 'screen_stream_4_new', 'old stream onended does not clear newer active stream');
    assertEqual(readVideoSrc()?.id, 'screen_stream_4_new', 'old stream onended leaves newer video srcObject intact');
    assertEqual(s4New.tracks[0].stopped, false, 'newer stream tracks remain active');
    screenController.stopScreenCapturePreview();

    // 5) getDisplayMedia unsupported notifies user cleanly
    displayMediaSupported = false;
    const unsupportedRes = await screenController.startScreenCapturePreview('screen_1');
    assertEqual(unsupportedRes.started, false, 'unsupported getDisplayMedia does not start');
    assertEqual(unsupportedRes.reason, 'unsupported', 'unsupported returns reason=unsupported');
    assertEqual(unsupportedCalls, 1, 'onUnsupported called once when getDisplayMedia unavailable');
    displayMediaSupported = true;

    // 6) Permission denied / request failure calls onError without leaving unmanaged stream
    const errP = screenController.startScreenCapturePreview('screen_1');
    pendingScreenRequests.shift()!.reject(
      Object.assign(new Error('Permission denied by system'), { name: 'NotAllowedError' }),
    );
    const errRes = await errP;
    assertEqual(errRes.started, false, 'failed request does not start');
    assertEqual(errRes.reason, 'error', 'permission denied returns reason=error');
    assertEqual(errorCalls.length, 1, 'onError called for latest failed request');
    assertEqual(activeStream, null, 'no active stream left after failure');

    // 7) User cancellation is not treated as fatal error
    const cancelP = screenController.startScreenCapturePreview('screen_1');
    pendingScreenRequests.shift()!.reject(
      Object.assign(new Error('User cancelled screen share'), { name: 'AbortError' }),
    );
    const cancelRes = await cancelP;
    assertEqual(cancelRes.started, false, 'cancelled picker does not start');
    assertEqual(cancelRes.reason, 'cancelled', 'cancelled picker returns reason=cancelled');
    assertEqual(cancelledCalls, 1, 'onCancelled invoked for user cancel');
    assertEqual(errorCalls.length, 1, 'onError NOT incremented on picker cancel');

    // 8) Pending request resolved after Stop stops its tracks immediately
    const pendingStopP = screenController.startScreenCapturePreview('screen_1');
    screenController.stopScreenCapturePreview();
    const sAfterStop = makeScreenStream('screen_after_stop');
    pendingScreenRequests.shift()!.resolve(sAfterStop);
    const afterStopRes = await pendingStopP;
    assertEqual(afterStopRes.reason, 'stale', 'request resolved after Stop is stale');
    assertEqual(sAfterStop.tracks[0].stopped, true, 'tracks resolved after Stop are stopped immediately');
    assertEqual(activeStream, null, 'no active stream after late Stop resolve');

    // 9) Pending request resolved after preset switch stops its tracks & stays stale
    const pendingPresetP = screenController.startScreenCapturePreview('screen_1');
    currentPresetId = 'preset_b';
    const sAfterPreset = makeScreenStream('screen_after_preset');
    pendingScreenRequests.shift()!.resolve(sAfterPreset);
    const afterPresetRes = await pendingPresetP;
    assertEqual(afterPresetRes.reason, 'stale', 'request resolved after preset switch is stale');
    assertEqual(sAfterPreset.tracks[0].stopped, true, 'tracks resolved after preset switch are stopped');
    assertEqual(activeStream, null, 'preset switch prevents stale stream activation');

    // 10) Element deleted while request is pending stops late stream
    const pendingDeleteP = screenController.startScreenCapturePreview('screen_1');
    elementsInScene = [{ id: 'text_1', type: 'text' }];
    const sAfterDelete = makeScreenStream('screen_after_delete');
    pendingScreenRequests.shift()!.resolve(sAfterDelete);
    const afterDeleteRes = await pendingDeleteP;
    assertEqual(afterDeleteRes.reason, 'stale', 'deleted screen_capture element makes pending request stale');
    assertEqual(sAfterDelete.tracks[0].stopped, true, 'deleted element stops late stream tracks');
    elementsInScene = [{ id: 'screen_1', type: 'screen_capture' }];

    // 11) Component unmount while request is pending stops late stream
    const pendingUnmountP = screenController.startScreenCapturePreview('screen_1');
    mounted = false;
    const sAfterUnmount = makeScreenStream('screen_after_unmount');
    pendingScreenRequests.shift()!.resolve(sAfterUnmount);
    const afterUnmountRes = await pendingUnmountP;
    assertEqual(afterUnmountRes.reason, 'stale', 'unmount makes pending request stale');
    assertEqual(sAfterUnmount.tracks[0].stopped, true, 'unmount stops late stream tracks');
    mounted = true;

    // 12) Rapid sequential requests: only latest request activates stream
    const rapidScreen1 = screenController.startScreenCapturePreview('screen_1');
    const rapidScreen2 = screenController.startScreenCapturePreview('screen_1');
    const reqScreen1 = pendingScreenRequests.shift()!;
    const reqScreen2 = pendingScreenRequests.shift()!;
    const latestScreenStream = makeScreenStream('screen_latest');
    const staleScreenStream = makeScreenStream('screen_stale');
    reqScreen2.resolve(latestScreenStream);
    const rapidRes2 = await rapidScreen2;
    assertEqual(rapidRes2.started, true, 'latest screen capture request activates');
    reqScreen1.resolve(staleScreenStream);
    const rapidRes1 = await rapidScreen1;
    assertEqual(rapidRes1.reason, 'stale', 'superseded screen capture request returns stale');
    assertEqual(staleScreenStream.tracks[0].stopped, true, 'superseded screen capture stops its tracks');
    assertEqual(readActiveStream()?.id, 'screen_latest', 'superseded request never overwrites latest stream');
    screenController.stopScreenCapturePreview();

    // 13) Stale error (after preset switch / superseded / unmount) does NOT trigger onError/onCancelled
    const errorBeforeCount = errorCalls.length;
    const cancelBeforeCount = cancelledCalls;
    const staleErrP = screenController.startScreenCapturePreview('screen_1');
    currentPresetId = 'preset_c';
    pendingScreenRequests.shift()!.reject(new Error('Stale permission failure'));
    const staleErrRes = await staleErrP;
    assertEqual(staleErrRes.reason, 'stale', 'error after preset switch is treated as stale');
    assertEqual(errorCalls.length, errorBeforeCount, 'stale failure never emits misleading onError');
    assertEqual(cancelledCalls, cancelBeforeCount, 'stale failure never emits onCancelled');

    // Catalog & StudioView wiring checks for A2.8.2
    const screenCatalog = getStudioSourceCatalogEntry('screen_capture');
    assert(
      !screenCatalog.description.includes('60FPS') &&
        !screenCatalog.description.includes('60 FPS') &&
        screenCatalog.description.includes('encoder global'),
      'screen_capture catalog description truthfully notes FPS follows global encoder setting',
    );
    assert(
      screenCatalog.defaultProperties.fps === 60,
      'screen_capture catalog preserves legacy fps property for preset backward compatibility',
    );

    assert(
      studioSource.includes('createScreenCapturePreviewController<MediaStream>(') &&
        !studioSource.includes('frameRate: { ideal: 60 }'),
      'StudioView uses createScreenCapturePreviewController and does not force ideal 60 FPS on getDisplayMedia',
    );

    const presetSwitchEffect = extractBetween(
      studioSource,
      'if (previousPresetIdRef.current === activePresetId) return;',
      '}, [activePresetId]);',
      'preset switch cleanup effect',
    );
    assert(
      presetSwitchEffect.includes('stopScreenCapturePreview()'),
      'Preset switch effect stops active/pending screen capture preview',
    );

    const unmountCleanupEffect = extractBetween(
      studioSource,
      '// Cleanup all remaining camera, screen tracks, and object URLs strictly on component unmount',
      '// EVENT-TO-ELEMENT ENGINE',
      'unmount cleanup effect',
    );
    assert(
      unmountCleanupEffect.includes('screenCaptureRequestStateRef.current.seq += 1') &&
        unmountCleanupEffect.includes('screenCaptureStreamRef.current.getTracks().forEach'),
      'Unmount cleanup invalidates pending screen capture requests and stops tracks',
    );

    const deleteHandlerSection = extractBetween(
      studioSource,
      'const handleDelete = (id: string) => {',
      'const handleMoveLayer =',
      'handleDelete cleanup',
    );
    assert(
      deleteHandlerSection.includes("target.type === 'screen_capture'") &&
        deleteHandlerSection.includes('stopScreenCapturePreview()'),
      'Deleting owning screen_capture element stops active/pending preview',
    );

    const screenCanvasSection = extractBetween(
      studioSource,
      "case 'screen_capture': {",
      "case 'event_alert': {",
      'screen_capture canvas renderer',
    );
    assert(
      !screenCanvasSection.includes('MediaProjection {fpsVal} FPS') &&
        screenCanvasSection.includes('FPS Encoder Global') &&
        screenCanvasSection.includes('handleToggleScreenCapture(normalizedElem.id)'),
      'Canvas screen_capture placeholder does not promise per-element/60 FPS and passes element ID',
    );

    const rotationControlSection = extractBetween(
      studioSource,
      'const isScreenCapture = selectedElement.type === \'screen_capture\';',
      '{/* Layer order buttons */}',
      'geometry rotation control',
    );
    assert(
      rotationControlSection.includes('max={isScreenCapture ? 270 : 360}') &&
        rotationControlSection.includes('step={isScreenCapture ? 90 : 1}') &&
        rotationControlSection.includes('normalizeScreenCaptureRotation('),
      'Rotation slider restricts screen_capture to step=90 quarter-turns while keeping 0-360 for other elements',
    );

    const quickAddSection = extractBetween(
      studioSource,
      "onClick={() => handleAddQuickElement('screen_capture', 'Tangkapan Layar (Game)')}",
      '</button>',
      'quick add screen_capture button',
    );
    assert(
      !quickAddSection.includes('60 FPS') && quickAddSection.includes('FPS global'),
      'Quick-add screen_capture card does not promise 60 FPS',
    );
  }

  // A2.8.3 Camera Inspector, Canvas Camera Renderer & Native drawCamera Parity
  {
    const cameraInspectorSection = extractBetween(
      inspectorSection,
      "selectedElement.type === 'camera'",
      "selectedElement.type === 'screen_capture'",
      'camera inspector',
    );
    assert(
      updatesProp(cameraInspectorSection, 'facingMode') &&
        updatesProp(cameraInspectorSection, 'aspectFit') &&
        updatesProp(cameraInspectorSection, 'mirror') &&
        updatesProp(cameraInspectorSection, 'borderColor') &&
        updatesProp(cameraInspectorSection, 'borderWidth') &&
        updatesProp(cameraInspectorSection, 'borderRadius'),
      'Camera inspector updates facingMode, aspectFit, mirror, borderColor, borderWidth, and borderRadius via updateElementProperty',
    );
    assert(
      cameraInspectorSection.includes('Cover (Penuh)') &&
        cameraInspectorSection.includes('Contain (Utuh)') &&
        cameraInspectorSection.includes('Cermin Kamera Depan') &&
        cameraInspectorSection.includes('Kamera belakang tidak dicerminkan') &&
        cameraInspectorSection.includes('!cameraProps.mirror') &&
        !cameraInspectorSection.includes('!(selectedElement.properties.mirror !== false)'),
      'Camera inspector includes aspectFit options and normalized !cameraProps.mirror toggle with front-only note',
    );

    // Camera mirror toggle sequence via normalized cameraProps.mirror
    const defaultCamProps = normalizeCameraProperties({});
    assertEqual(defaultCamProps.mirror, true, 'unsaved mirror defaults to true');
    const firstClickValue = !defaultCamProps.mirror;
    assertEqual(firstClickValue, false, 'first click on default mirror toggles true -> false');

    const afterFirstClickProps = normalizeCameraProperties({ mirror: firstClickValue });
    assertEqual(afterFirstClickProps.mirror, false, 'saved false mirror stays false');
    const secondClickValue = !afterFirstClickProps.mirror;
    assertEqual(secondClickValue, true, 'second click toggles false -> true');

    const explicitFalseProps = normalizeCameraProperties({ mirror: false, facingMode: 'environment' });
    assertEqual(explicitFalseProps.mirror, false, 'explicit mirror: false is preserved');
    assertEqual(!explicitFalseProps.mirror, true, 'first click on explicit false toggles false -> true');
    assertEqual(explicitFalseProps.facingMode, 'environment', 'back camera facingMode remains unaffected');
    assert(
      cameraInspectorSection.includes('toSafeHexColor(') &&
        cameraInspectorSection.includes('clampNumericRange(\n                                      e.target.value,\n                                      1,\n                                      20,\n                                      CAMERA_CANONICAL_DEFAULTS.borderWidth') &&
        cameraInspectorSection.includes('clampNumericRange(\n                                      e.target.value,\n                                      0,\n                                      100,\n                                      CAMERA_CANONICAL_DEFAULTS.borderRadius') &&
        !cameraInspectorSection.includes('|| 14') &&
        !cameraInspectorSection.includes('|| 16'),
      'Camera inspector uses toSafeHexColor and safe numeric clamping preserving borderRadius=0',
    );

    const cameraCanvasSection = extractBetween(
      studioSource,
      "case 'camera': {",
      "case 'screen_capture': {",
      'camera canvas renderer',
    );
    assert(
      cameraCanvasSection.includes('normalizeCameraProperties(props)') &&
        cameraCanvasSection.includes("cameraProps.facingMode !== 'environment' && cameraProps.mirror !== false") &&
        cameraCanvasSection.includes("transform: 'scaleX(-1)'") &&
        cameraCanvasSection.includes('cameraProps.borderColor') &&
        cameraCanvasSection.includes('cameraProps.borderRadius') &&
        cameraCanvasSection.includes('cameraProps.borderWidth') &&
        !cameraCanvasSection.includes('?? 14') &&
        !cameraCanvasSection.includes('?? 2'),
      'Canvas camera renderer uses normalized properties, canonical fallbacks, and front-only scaleX(-1) mirroring',
    );

    const overlayJavaPath = join(
      process.cwd(),
      'android',
      'app',
      'src',
      'main',
      'java',
      'com',
      'syntxrr',
      'streamtools',
      'StudioOverlayView.java',
    );
    const overlayJavaSource = readFileSync(overlayJavaPath, 'utf8');
    const drawCameraSection = extractBetween(
      overlayJavaSource,
      'private void drawCamera(',
      '/** Start local MP4 timelines',
      'StudioOverlayView drawCamera',
    );
    assert(
      drawCameraSection.includes('number(properties, "borderRadius", 16f)') &&
        drawCameraSection.includes('parseColor(properties.optString("borderColor", "#F2C230"), 0xFFF2C230)') &&
        drawCameraSection.includes('number(properties, "borderWidth", 3f)') &&
        drawCameraSection.includes('if (cameraFrontFacing && properties.optBoolean("mirror", true))') &&
        drawCameraSection.includes('properties.optString("aspectFit"') &&
        drawCameraSection.includes('properties.optString("cameraFit"'),
      'StudioOverlayView.drawCamera uses canonical visual fallbacks (#F2C230, 16f, 3f), front-only mirror, and aspectFit/cameraFit parity',
    );
  }

  console.log(`studioInspectorControls.test.ts: PASS (${assertionCount} assertions)`);
}

runStudioInspectorControlsTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
