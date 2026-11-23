// Unit tests for Studio Fase 1B Tahap 3.1: Basic Visual & Media Inspector
// Run in the project environment with: bun run src/services/__tests__/studioInspectorControls.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { percentToUnitVolume, type StudioElement } from '../../types';
import {
  createStudioElementFromSource,
  normalizeStudioElementProperties,
} from '../studioElementCatalog';
import {
  SUPPORTED_SOUNDBOARD_SFX,
  resolveSeparatorStyle,
  resolveSoundboardControlModel,
  resolveStickerVisualModel,
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

function runStudioInspectorControlsTests(): void {
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

  console.log(`studioInspectorControls.test.ts: PASS (${assertionCount} assertions)`);
}

runStudioInspectorControlsTests();
