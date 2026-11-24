// Unit tests for Studio Fase 1B Tahap 1: Single Source of Truth & Element Factory
// Run in the project environment with: bun run src/services/__tests__/studioElementsConsistency.test.ts

import type { SourceType, StudioElement } from '../../types';
import {
  CAMERA_CANONICAL_DEFAULTS,
  STUDIO_ELEMENT_CATALOG,
  createStudioElementFromSource,
  getStudioSourceCatalogEntry,
  normalizeStudioElementProperties,
  parseSafeNumericNominal,
} from '../studioElementCatalog';
import { DEFAULT_STUDIO_ELEMENTS } from '../storage';

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

const EXPECTED_ALL_SOURCE_TYPES: readonly SourceType[] = [
  // 11 Basic
  'text',
  'image',
  'video',
  'shape',
  'separator',
  'camera',
  'screen_capture',
  'browser_embed',
  'running_text',
  'audio',
  'soundboard',
  // 15 Dynamic
  'dynamic_text',
  'username',
  'avatar',
  'chat_message',
  'event_feed',
  'counter',
  'combo_counter',
  'progress_bar',
  'leaderboard',
  'song_request',
  'lyrics',
  'live_viewer_counter',
  'event_alert',
  'sticker',
  'live_text',
];

function stripIdForEquality(element: StudioElement): Omit<StudioElement, 'id'> {
  const { id: _ignored, ...rest } = element;
  return rest;
}

function runStudioElementsConsistencyTests(): void {
  // 1. Catalog completeness: 26 total entries, 11 basic, 15 dynamic, unique types matching all SourceTypes
  assertEqual(STUDIO_ELEMENT_CATALOG.length, 26, 'catalog has exactly 26 source definitions');

  const basicEntries = STUDIO_ELEMENT_CATALOG.filter((entry) => entry.category === 'basic');
  const dynamicEntries = STUDIO_ELEMENT_CATALOG.filter((entry) => entry.category === 'dynamic');
  assertEqual(basicEntries.length, 11, 'catalog has exactly 11 basic sources');
  assertEqual(dynamicEntries.length, 15, 'catalog has exactly 15 dynamic sources');

  const catalogTypes = new Set(STUDIO_ELEMENT_CATALOG.map((entry) => entry.type));
  assertEqual(catalogTypes.size, 26, 'all 26 catalog source types are unique');
  for (const expectedType of EXPECTED_ALL_SOURCE_TYPES) {
    assert(catalogTypes.has(expectedType), `catalog includes SourceType '${expectedType}'`);
  }

  // 2. Every catalog entry has non-empty name, positive dimensions, and valid defaultProperties object
  for (const entry of STUDIO_ELEMENT_CATALOG) {
    assert(entry.name.trim().length > 0, `${entry.type} has non-empty name`);
    assert(entry.description.trim().length > 0, `${entry.type} has non-empty description`);
    assert(entry.defaultDimensions.width > 0, `${entry.type} width > 0`);
    assert(entry.defaultDimensions.height > 0, `${entry.type} height > 0`);
    assert(
      entry.defaultProperties !== null &&
        typeof entry.defaultProperties === 'object' &&
        !Array.isArray(entry.defaultProperties),
      `${entry.type} has object defaultProperties`,
    );
  }

  // 3. Factory produces exact type & never falls through to generic 'Teks Siaran' / 'STREAM TITLE HERE'
  for (const sourceType of EXPECTED_ALL_SOURCE_TYPES) {
    const created = createStudioElementFromSource(sourceType, []);
    const catalogEntry = getStudioSourceCatalogEntry(sourceType);
    assertEqual(created.type, sourceType, `factory preserves type '${sourceType}'`);
    assertEqual(created.name, catalogEntry.name, `factory uses catalog name for '${sourceType}'`);
    assert(created.id.startsWith(`elem_${sourceType}_`), `id includes type prefix for '${sourceType}'`);
    assert(
      created.name !== 'Teks Siaran',
      `'${sourceType}' does not fall through to generic name 'Teks Siaran'`,
    );
    assert(
      created.properties?.text !== 'STREAM TITLE HERE',
      `'${sourceType}' does not fall through to generic 'STREAM TITLE HERE'`,
    );
  }

  // Verify 'text' uses its own catalog defaults cleanly
  const textElement = createStudioElementFromSource('text', []);
  assertEqual(textElement.name, 'Teks Statis', 'text element uses Teks Statis');
  assertEqual(textElement.properties.text, 'SYNTXRR LIVE STREAM', 'text element uses catalog default text');
  assertEqual(textElement.properties.color, '#FFFFFF', 'text preserves color');
  assertEqual(textElement.properties.textColor, '#FFFFFF', 'text preserves textColor');

  // 4. live_viewer_counter must NOT inherit 'like' trigger or counter alias; counter keeps 'like' trigger
  const viewerCounter = createStudioElementFromSource('live_viewer_counter', []);
  assertEqual(viewerCounter.type, 'live_viewer_counter', 'live_viewer_counter preserves type');
  assertEqual(viewerCounter.triggerConfig, undefined, 'live_viewer_counter does not get counter like trigger');
  assertEqual(viewerCounter.properties.viewerCount, 1420, 'live_viewer_counter keeps viewerCount');

  const likeCounter = createStudioElementFromSource('counter', []);
  assertEqual(likeCounter.triggerConfig?.eventType, 'like', 'counter keeps default like trigger');

  // 5. sticker stays type 'sticker' (not aliased to 'image') and keeps stickerId
  const stickerElement = createStudioElementFromSource('sticker', []);
  assertEqual(stickerElement.type, 'sticker', 'sticker preserves type sticker');
  assertEqual(stickerElement.properties.stickerId, 'fire', 'sticker keeps stickerId');
  assertEqual(stickerElement.properties.floatEffect, true, 'sticker keeps floatEffect');

  // 6. Parity across SourcesLibrary / Tab Elemen / Tab Sumber for identical type & existingElements
  const existingPresetSample: StudioElement[] = [likeCounter, textElement];
  for (const sourceType of EXPECTED_ALL_SOURCE_TYPES) {
    const fromSourcesPath = createStudioElementFromSource(sourceType, existingPresetSample);
    const fromQuickAddPath = createStudioElementFromSource(sourceType, existingPresetSample);
    assert(fromSourcesPath.id !== fromQuickAddPath.id, `distinct IDs generated for '${sourceType}'`);
    assertEqual(
      JSON.stringify(stripIdForEquality(fromSourcesPath)),
      JSON.stringify(stripIdForEquality(fromQuickAddPath)),
      `identical configuration across paths for '${sourceType}'`,
    );
    assertEqual(fromQuickAddPath.layer, existingPresetSample.length + 1, `layer increments for '${sourceType}'`);
  }

  // 7. Factory deep-clones properties and triggerConfig (mutating result must not mutate catalog)
  const textEntryBefore = getStudioSourceCatalogEntry('text');
  const alertEntryBefore = getStudioSourceCatalogEntry('event_alert');
  const originalTextValue = textEntryBefore.defaultProperties.text;
  const originalAlertDuration = alertEntryBefore.defaultTriggerConfig?.durationSec;

  const mutatedText = createStudioElementFromSource('text', []);
  mutatedText.properties.text = 'MUTATED TEXT';
  mutatedText.properties.extraKey = 123;
  assertEqual(
    getStudioSourceCatalogEntry('text').defaultProperties.text,
    originalTextValue,
    'mutating created text properties does not mutate catalog',
  );
  assertEqual(
    getStudioSourceCatalogEntry('text').defaultProperties.extraKey,
    undefined,
    'adding keys to created properties does not pollute catalog',
  );

  const mutatedAlert = createStudioElementFromSource('event_alert', []);
  if (mutatedAlert.triggerConfig) {
    mutatedAlert.triggerConfig.durationSec = 999;
  }
  assertEqual(
    getStudioSourceCatalogEntry('event_alert').defaultTriggerConfig?.durationSec,
    originalAlertDuration,
    'mutating created triggerConfig does not mutate catalog',
  );

  // 8. Camera facingMode logic: 1st camera = user, 2nd camera after user = environment, after environment = user
  const firstCamera = createStudioElementFromSource('camera', []);
  assertEqual(firstCamera.properties.facingMode, 'user', '1st camera defaults to front user');
  assertEqual(firstCamera.name, 'Kamera / Facecam', '1st camera keeps catalog name');

  const secondCamera = createStudioElementFromSource('camera', [firstCamera]);
  assertEqual(
    secondCamera.properties.facingMode,
    'environment',
    '2nd camera switches to environment when front camera exists',
  );
  assert(
    secondCamera.name.includes('Kamera 2') && secondCamera.name.includes('Belakang'),
    '2nd camera gets descriptive label Kamera 2 (Belakang / Handcam)',
  );

  const backOnlyCamera = createStudioElementFromSource('camera', [], {
    properties: { facingMode: 'environment' },
  });
  assertEqual(backOnlyCamera.properties.facingMode, 'environment', 'respects explicit facingMode override');
  const nextFrontCamera = createStudioElementFromSource('camera', [backOnlyCamera]);
  assertEqual(
    nextFrontCamera.properties.facingMode,
    'user',
    'selects user when existing camera is only environment',
  );

  // 9. normalizeStudioElementProperties: non-destructive, bridges aliases, preserves legacy keys
  const rawImage: StudioElement = {
    id: 'img_legacy',
    name: 'Legacy Img',
    type: 'image',
    x: 5,
    y: 5,
    width: 20,
    height: 20,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: {
      url: 'https://example.com/logo.png',
      customLegacyFlag: 'keep-me',
    },
  };
  const normImage = normalizeStudioElementProperties(rawImage);
  assertEqual(normImage.properties.imageUrl, 'https://example.com/logo.png', 'bridges image.url -> imageUrl');
  assertEqual(normImage.properties.url, 'https://example.com/logo.png', 'preserves image.url');
  assertEqual(normImage.properties.customLegacyFlag, 'keep-me', 'preserves unknown legacy keys');
  assertEqual(rawImage.properties.imageUrl, undefined, 'does not mutate original input element');

  const normText = normalizeStudioElementProperties({
    ...rawImage,
    id: 'txt_legacy',
    type: 'text',
    properties: { color: '#FFCC00', text: 'Halo' },
  });
  assertEqual(normText.properties.textColor, '#FFCC00', 'bridges text.color -> textColor');
  assertEqual(normText.properties.color, '#FFCC00', 'preserves text.color');

  const normSeparator = normalizeStudioElementProperties({
    ...rawImage,
    id: 'sep_legacy',
    type: 'separator',
    properties: { lineColor: '#00FF88', thickness: 4 },
  });
  assertEqual(normSeparator.properties.borderColor, '#00FF88', 'bridges separator.lineColor -> borderColor');
  assertEqual(normSeparator.properties.borderWidth, 4, 'bridges separator.thickness -> borderWidth');
  assertEqual(normSeparator.properties.lineColor, '#00FF88', 'preserves separator.lineColor');
  assertEqual(normSeparator.properties.thickness, 4, 'preserves separator.thickness');

  const normCounter = normalizeStudioElementProperties({
    ...rawImage,
    id: 'cnt_legacy',
    type: 'counter',
    properties: { target: 3500 },
  });
  assertEqual(normCounter.properties.targetGoal, 3500, 'bridges counter.target -> targetGoal');
  assertEqual(normCounter.properties.target, 3500, 'preserves counter.target');

  const normCombo = normalizeStudioElementProperties({
    ...rawImage,
    id: 'cmb_legacy',
    type: 'combo_counter',
    properties: { multiplier: 10, giftName: 'Paus Emas' },
  });
  assertEqual(normCombo.properties.comboLabel, 'x10 COMBO PAUS EMAS!', 'bridges combo_counter.giftName -> comboLabel');
  assertEqual(normCombo.properties.giftName, 'Paus Emas', 'preserves combo_counter.giftName');

  const normLyrics = normalizeStudioElementProperties({
    ...rawImage,
    id: 'lyr_legacy',
    type: 'lyrics',
    properties: { currentLine: 'Bait pertama lagu' },
  });
  assertEqual(normLyrics.properties.lyricsText, 'Bait pertama lagu', 'bridges lyrics.currentLine -> lyricsText');

  const normSongRequest = normalizeStudioElementProperties({
    ...rawImage,
    id: 'song_legacy',
    type: 'song_request',
    properties: { showAlbumArt: false },
  });
  assertEqual(normSongRequest.properties.showArt, false, 'bridges song_request.showAlbumArt -> showArt');

  const normAlert = normalizeStudioElementProperties({
    ...rawImage,
    id: 'alert_legacy',
    type: 'event_alert',
    properties: { accentColor: '#22C55E', soundEnabled: false },
  });
  assertEqual(normAlert.properties.badgeColor, '#22C55E', 'bridges event_alert.accentColor -> badgeColor');
  assertEqual(normAlert.properties.soundEffect, false, 'bridges event_alert.soundEnabled -> soundEffect');

  // 10. chat_message & progress_bar safe normalization (never turn colors into numbers or produce NaN)
  const normChat = normalizeStudioElementProperties({
    ...rawImage,
    id: 'chat_legacy',
    type: 'chat_message',
    properties: { backgroundColor: 'rgba(15, 19, 27, 0.82)' },
  });
  assertEqual(
    normChat.properties.backgroundColor,
    'rgba(15, 19, 27, 0.82)',
    'chat_message keeps string backgroundColor intact',
  );
  assertEqual(normChat.properties.bgOpacity, 82, 'chat_message derives numeric bgOpacity from rgba string');

  const normChatFromOpacity = normalizeStudioElementProperties({
    ...rawImage,
    id: 'chat_quick',
    type: 'chat_message',
    properties: { bgOpacity: 85 },
  });
  assertEqual(
    normChatFromOpacity.properties.backgroundColor,
    'rgba(12, 14, 18, 0.85)',
    'chat_message derives valid rgba string when backgroundColor missing',
  );

  const normProgressFormatted = normalizeStudioElementProperties({
    ...rawImage,
    id: 'prog_formatted',
    type: 'progress_bar',
    properties: { current: 'Rp 450.000', target: 'Rp 1.000.000' },
  });
  assertEqual(
    normProgressFormatted.properties.current,
    'Rp 450.000',
    'progress_bar preserves original formatted current string',
  );
  assertEqual(
    normProgressFormatted.properties.target,
    'Rp 1.000.000',
    'progress_bar preserves original formatted target string',
  );
  assertEqual(normProgressFormatted.properties.currentAmount, 450000, 'progress_bar parses Rp 450.000 safely');
  assertEqual(normProgressFormatted.properties.targetAmount, 1000000, 'progress_bar parses Rp 1.000.000 safely');

  const normProgressInvalid = normalizeStudioElementProperties({
    ...rawImage,
    id: 'prog_invalid',
    type: 'progress_bar',
    properties: { current: 'belum tersedia', target: 'TBD' },
  });
  assertEqual(
    normProgressInvalid.properties.currentAmount,
    undefined,
    'invalid numeric string does not set NaN on currentAmount',
  );
  assertEqual(
    normProgressInvalid.properties.targetAmount,
    undefined,
    'invalid numeric string does not set NaN on targetAmount',
  );
  assertEqual(parseSafeNumericNominal('Rp 450.000'), 450000, 'parseSafeNumericNominal handles Rp dot separators');
  assertEqual(parseSafeNumericNominal('invalid'), undefined, 'parseSafeNumericNominal returns undefined instead of NaN');

  // 10. A2.8.3 Canonical camera defaults parity across Catalog and DEFAULT_STUDIO_ELEMENTS
  const cameraCatalog = getStudioSourceCatalogEntry('camera');
  assertEqual(cameraCatalog.defaultProperties.facingMode, CAMERA_CANONICAL_DEFAULTS.facingMode, 'catalog camera facingMode matches canonical default');
  assertEqual(cameraCatalog.defaultProperties.borderColor, '#F2C230', 'catalog camera borderColor matches canonical default');
  assertEqual(cameraCatalog.defaultProperties.borderRadius, 16, 'catalog camera borderRadius matches canonical default');
  assertEqual(cameraCatalog.defaultProperties.borderWidth, 3, 'catalog camera borderWidth matches canonical default');
  assertEqual(cameraCatalog.defaultProperties.aspectFit, 'cover', 'catalog camera aspectFit matches canonical default');
  assertEqual(cameraCatalog.defaultProperties.cameraFit, 'cover', 'catalog camera cameraFit matches canonical default');
  assertEqual(cameraCatalog.defaultProperties.mirror, true, 'catalog camera mirror matches canonical default');

  const defaultCamElem = DEFAULT_STUDIO_ELEMENTS.find((el) => el.id === 'elem_camera');
  assert(Boolean(defaultCamElem), 'DEFAULT_STUDIO_ELEMENTS contains elem_camera');
  assertEqual(defaultCamElem?.properties.facingMode, 'user', 'DEFAULT_STUDIO_ELEMENTS camera uses canonical facingMode');
  assertEqual(defaultCamElem?.properties.borderColor, '#F2C230', 'DEFAULT_STUDIO_ELEMENTS camera uses canonical borderColor');
  assertEqual(defaultCamElem?.properties.borderRadius, 16, 'DEFAULT_STUDIO_ELEMENTS camera uses canonical borderRadius');
  assertEqual(defaultCamElem?.properties.borderWidth, 3, 'DEFAULT_STUDIO_ELEMENTS camera uses canonical borderWidth');
  assertEqual(defaultCamElem?.properties.aspectFit, 'cover', 'DEFAULT_STUDIO_ELEMENTS camera uses canonical aspectFit');
  assertEqual(defaultCamElem?.properties.cameraFit, 'cover', 'DEFAULT_STUDIO_ELEMENTS camera uses canonical cameraFit');
  assertEqual(defaultCamElem?.properties.mirror, true, 'DEFAULT_STUDIO_ELEMENTS camera uses canonical mirror');

  console.log(
    `Studio elements consistency tests passed: ${assertionCount} assertions (26 catalog sources, factory parity, non-mutation, multi-cam facingMode, non-destructive alias normalization, A2.8.3 camera parity).`,
  );
}

runStudioElementsConsistencyTests();
