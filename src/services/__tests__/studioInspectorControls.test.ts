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

  console.log(`studioInspectorControls.test.ts: PASS (${assertionCount} assertions)`);
}

runStudioInspectorControlsTests();
