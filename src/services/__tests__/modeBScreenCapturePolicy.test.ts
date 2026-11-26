import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StudioElement, StudioPreset } from '../../types';
import {
  countVisibleModeBScreenCaptures,
  createModeBScreenCaptureLayer,
  isVisibleModeBScreenCaptureElement,
} from '../modeBComposition';
import {
  validateModeBScreenCaptureAddition,
  validateModeBScreenCaptureBatch,
  validateModeBScreenCapturePresetActivation,
  validateModeBScreenCaptureSceneTransition,
} from '../modeBScreenCapturePolicy';

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

function makeScreenCapture(
  id: string,
  overrides: Partial<StudioElement> = {},
): StudioElement {
  return {
    id,
    name: `Tangkapan Layar (${id})`,
    type: 'screen_capture',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: { cropMode: 'fit' },
    ...overrides,
  };
}

function makeCamera(id: string, overrides: Partial<StudioElement> = {}): StudioElement {
  return {
    id,
    name: `Kamera (${id})`,
    type: 'camera',
    x: 10,
    y: 10,
    width: 30,
    height: 25,
    layer: 2,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: {},
    ...overrides,
  };
}

function makePreset(
  id: string,
  elements: StudioElement[],
  extra: Partial<StudioPreset> = {},
): StudioPreset {
  return {
    id,
    name: `Preset ${id}`,
    category: 'hp_screen',
    canvasOrientation: '9:16',
    elements,
    createdAt: 1,
    isFavorite: false,
    description: 'test preset',
    ...extra,
  };
}

function runTests(): void {
  // 1. Satu Screen Capture terlihat boleh ditambahkan jika belum ada.
  {
    const current = [makeCamera('cam_1')];
    const incoming = makeScreenCapture('sc_1');
    const res = validateModeBScreenCaptureAddition(current, incoming, true);
    assertEqual(res.allowed, true, 'Test 1: first visible screen_capture allowed in Mode B');
  }

  // 2. Penambahan kedua yang terlihat ditolak.
  {
    const current = [makeScreenCapture('sc_1'), makeCamera('cam_1')];
    const incoming = makeScreenCapture('sc_2');
    const res = validateModeBScreenCaptureAddition(current, incoming, true);
    assertEqual(res.allowed, false, 'Test 2: second visible screen_capture rejected in Mode B');
    assert(
      !res.allowed && res.message.includes('Mode B hanya mendukung satu'),
      'Test 2: rejection message clearly states single Screen Capture Mode B rule',
    );
  }

  // 3. Duplikasi Screen Capture terlihat ditolak.
  {
    const activeSc = makeScreenCapture('sc_1');
    const clone = { ...activeSc, id: 'sc_1_copy', name: `${activeSc.name} (Salinan)`, x: 3, y: 3, layer: 2 };
    const res = validateModeBScreenCaptureAddition([activeSc], clone, true);
    assertEqual(res.allowed, false, 'Test 3: duplicating visible screen_capture is rejected in Mode B');
  }

  // 4. Duplikasi Screen Capture tersembunyi boleh dilakukan jika tidak melampaui batas.
  {
    const activeSc = makeScreenCapture('sc_1', { layer: 1 });
    const hiddenSc = makeScreenCapture('sc_hidden', { visible: false, layer: 2 });
    const hiddenClone = { ...hiddenSc, id: 'sc_hidden_copy', layer: 3 };
    const res = validateModeBScreenCaptureAddition([activeSc, hiddenSc], hiddenClone, true);
    assertEqual(res.allowed, true, 'Test 4: duplicating hidden screen_capture is allowed when visible count stays 1');
  }

  // 5. Screen Capture dengan visible=false tidak dihitung.
  {
    const hiddenOnly = [makeScreenCapture('sc_hidden', { visible: false })];
    assertEqual(countVisibleModeBScreenCaptures(hiddenOnly), 0, 'Test 5a: visible=false not counted');
    const res = validateModeBScreenCaptureAddition(hiddenOnly, makeScreenCapture('sc_new'), true);
    assertEqual(res.allowed, true, 'Test 5b: adding visible screen_capture allowed when existing has visible=false');
  }

  // 6. Screen Capture dengan width atau height nol (atau negatif) tidak dihitung.
  {
    const zeroWidth = makeScreenCapture('sc_w0', { width: 0 });
    const zeroHeight = makeScreenCapture('sc_h0', { height: 0 });
    const negativeHeight = makeScreenCapture('sc_hneg', { height: -10 });
    assertEqual(
      countVisibleModeBScreenCaptures([zeroWidth, zeroHeight, negativeHeight]),
      0,
      'Test 6a: zero/negative width and height not counted',
    );
    const res = validateModeBScreenCaptureAddition(
      [zeroWidth, zeroHeight],
      makeScreenCapture('sc_new'),
      true,
    );
    assertEqual(res.allowed, true, 'Test 6b: visible screen_capture allowed alongside zero-dimension captures');
  }

  // 7. Screen Capture dengan opacity nol (atau negatif) tidak dihitung.
  {
    const zeroOpacity = makeScreenCapture('sc_op0', { opacity: 0 });
    const negOpacity = makeScreenCapture('sc_op_neg', { opacity: -1 });
    assertEqual(
      countVisibleModeBScreenCaptures([zeroOpacity, negOpacity]),
      0,
      'Test 7a: zero/negative opacity not counted',
    );
    const res = validateModeBScreenCaptureAddition([zeroOpacity], makeScreenCapture('sc_new'), true);
    assertEqual(res.allowed, true, 'Test 7b: visible screen_capture allowed alongside zero-opacity capture');
  }

  // 8. Penambahan elemen selain Screen Capture tetap berjalan.
  {
    const current = [makeScreenCapture('sc_1')];
    const camRes = validateModeBScreenCaptureAddition(current, makeCamera('cam_2'), true);
    assertEqual(camRes.allowed, true, 'Test 8a: camera allowed when visible screen_capture exists');

    const safePackRes = validateModeBScreenCaptureBatch(
      current,
      [
        makeCamera('cam_pack'),
        makeScreenCapture('sc_pack_hidden', { visible: false }),
      ],
      true,
    );
    assertEqual(safePackRes.allowed, true, 'Test 8b: pack with non-screen-capture + hidden screen_capture allowed');
  }

  // 9. Marketplace pack yang melampaui batas ditolak secara atomik.
  {
    let installedCount = 0;
    const onInstall = () => {
      installedCount += 1;
    };

    // Case 9a: canvas already has 1 visible screen_capture, pack has 1 camera + 1 visible screen_capture
    const packWithExtraSc = [makeCamera('cam_pack'), makeScreenCapture('sc_pack')];
    const resA = validateModeBScreenCaptureBatch([makeScreenCapture('sc_1')], packWithExtraSc, true);
    if (resA.allowed) onInstall();
    assertEqual(resA.allowed, false, 'Test 9a: pack pushing total visible screen_capture > 1 rejected');
    assertEqual(installedCount, 0, 'Test 9a: atomic rejection prevents callback/partial install');

    // Case 9b: empty canvas, pack itself has 2 visible screen_capture elements
    const packWithTwoSc = [makeScreenCapture('sc_p1'), makeScreenCapture('sc_p2')];
    const resB = validateModeBScreenCaptureBatch([], packWithTwoSc, true);
    if (resB.allowed) onInstall();
    assertEqual(resB.allowed, false, 'Test 9b: pack containing 2 visible screen_captures rejected atomically');
    assertEqual(installedCount, 0, 'Test 9b: atomic rejection prevents callback');
  }

  // 10. Preset dengan lebih dari satu Screen Capture terlihat tidak boleh diaktifkan saat Mode B dipilih.
  {
    const invalidPreset = makePreset('p_invalid', [
      makeScreenCapture('sc_1', { layer: 1 }),
      makeScreenCapture('sc_2', { layer: 2 }),
      makeCamera('cam_1', { layer: 3 }),
    ]);
    const res = validateModeBScreenCapturePresetActivation(invalidPreset, true);
    assertEqual(res.allowed, false, 'Test 10a: preset with 2 visible screen_captures blocked in Mode B');
    assert(!res.allowed && res.visibleCount === 2, 'Test 10b: reports visibleCount=2');
    assertEqual(
      invalidPreset.elements.length,
      3,
      'Test 10c: preset elements are NOT auto-removed when blocked',
    );
  }

  // 11. Preset yang memiliki satu Screen Capture terlihat tetap bisa diaktifkan.
  {
    const validPreset = makePreset('p_valid', [
      makeScreenCapture('sc_1', { layer: 1 }),
      makeScreenCapture('sc_hidden', { visible: false, layer: 2 }),
      makeCamera('cam_1', { layer: 3 }),
    ]);
    const res = validateModeBScreenCapturePresetActivation(validPreset, true);
    assertEqual(res.allowed, true, 'Test 11a: preset with 1 visible + 1 hidden screen_capture allowed in Mode B');

    const groupedHiddenPreset = makePreset(
      'p_grouped',
      [
        makeScreenCapture('sc_main', { layer: 1 }),
        makeScreenCapture('sc_in_hidden_group', { layer: 2 }),
      ],
      {
        groups: [
          {
            id: 'g_hidden',
            name: 'Hidden Group',
            elementIds: ['sc_in_hidden_group'],
            visible: false,
            locked: false,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        ],
      },
    );
    assertEqual(
      validateModeBScreenCapturePresetActivation(groupedHiddenPreset, true).allowed,
      true,
      'Test 11b: preset with 1 visible + 1 group-hidden screen_capture allowed in Mode B (parity with resolveModeBGroupedScene)',
    );
  }

  // 12. Perilaku penambahan, duplikasi, marketplace, dan preset pada Mode A tidak berubah.
  {
    const twoVisible = [makeScreenCapture('sc_1'), makeScreenCapture('sc_2')];
    assertEqual(
      validateModeBScreenCaptureAddition([makeScreenCapture('sc_1')], makeScreenCapture('sc_2'), false).allowed,
      true,
      'Test 12a: adding 2nd visible screen_capture remains allowed in Mode A',
    );
    assertEqual(
      validateModeBScreenCaptureBatch([makeScreenCapture('sc_1')], twoVisible, false).allowed,
      true,
      'Test 12b: marketplace pack with multiple screen_captures allowed in Mode A',
    );
    assertEqual(
      validateModeBScreenCapturePresetActivation(makePreset('p_mode_a', twoVisible), false).allowed,
      true,
      'Test 12c: preset with multiple visible screen_captures allowed in Mode A',
    );
  }

  // 13. Validasi Studio menggunakan predicate yang sama dengan createModeBScreenCaptureLayer().
  {
    const matrix: StudioElement[] = [
      makeScreenCapture('sc_vis', { visible: true, width: 100, height: 100, opacity: 100, layer: 1 }),
      makeScreenCapture('sc_hidden', { visible: false, width: 100, height: 100, opacity: 100, layer: 2 }),
      makeScreenCapture('sc_w0', { visible: true, width: 0, height: 100, opacity: 100, layer: 3 }),
      makeScreenCapture('sc_h0', { visible: true, width: 100, height: 0, opacity: 100, layer: 4 }),
      makeScreenCapture('sc_op0', { visible: true, width: 100, height: 100, opacity: 0, layer: 5 }),
      makeCamera('cam_top', { layer: 10 }),
    ];

    // Exact predicate match for every element in the matrix
    for (const candidate of matrix) {
      let runtimeAcceptedSingle = false;
      try {
        const layer = createModeBScreenCaptureLayer([candidate]);
        runtimeAcceptedSingle = layer.enabled;
      } catch {
        runtimeAcceptedSingle = false;
      }
      assertEqual(
        isVisibleModeBScreenCaptureElement(candidate),
        candidate.type === 'screen_capture' && runtimeAcceptedSingle,
        `Test 13a: predicate matches createModeBScreenCaptureLayer().enabled for ${candidate.id}`,
      );
    }

    // Combined matrix: 1 visible + 4 non-visible screen captures -> createModeBScreenCaptureLayer accepts without throwing,
    // and countVisibleModeBScreenCaptures returns 1.
    assertEqual(countVisibleModeBScreenCaptures(matrix), 1, 'Test 13b: count matches 1 visible');
    const layer = createModeBScreenCaptureLayer(matrix);
    assertEqual(layer.enabled, true, 'Test 13c: runtime createModeBScreenCaptureLayer agrees there is only 1 active');

    // Adding one more visible -> both runtime createModeBScreenCaptureLayer throws AND policy rejects
    const extraVisible = [...matrix, makeScreenCapture('sc_vis_2', { layer: 6 })];
    let runtimeThrew = false;
    try {
      createModeBScreenCaptureLayer(extraVisible);
    } catch {
      runtimeThrew = true;
    }
    assertEqual(runtimeThrew, true, 'Test 13d: runtime throws when 2nd visible screen_capture present');
    assertEqual(
      validateModeBScreenCaptureAddition(matrix, makeScreenCapture('sc_vis_2'), true).allowed,
      false,
      'Test 13e: Studio addition policy rejects exact same 2nd visible screen_capture',
    );
  }

  // 14. Scene transition guard blocks unhiding a hidden duplicate while allowing hiding/deleting.
  {
    const before = [
      makeScreenCapture('sc_1', { visible: true }),
      makeScreenCapture('sc_2', { visible: false }),
    ];
    const unhideSecond = [
      makeScreenCapture('sc_1', { visible: true }),
      makeScreenCapture('sc_2', { visible: true }),
    ];
    assertEqual(
      validateModeBScreenCaptureSceneTransition(before, unhideSecond, true).allowed,
      false,
      'Test 14a: unhiding 2nd screen_capture blocked in Mode B',
    );

    const brokenLegacy = [
      makeScreenCapture('sc_1', { visible: true }),
      makeScreenCapture('sc_2', { visible: true }),
    ];
    const hideOne = [
      makeScreenCapture('sc_1', { visible: true }),
      makeScreenCapture('sc_2', { visible: false }),
    ];
    assertEqual(
      validateModeBScreenCaptureSceneTransition(brokenLegacy, hideOne, true).allowed,
      true,
      'Test 14b: hiding a duplicate screen_capture in a legacy scene remains allowed',
    );
  }

  // 15. Static wiring check in StudioView.tsx confirming all 4 pathways validate before mutating/selecting.
  {
    const studioSource = readFileSync(
      join(process.cwd(), 'src/components/StudioView.tsx'),
      'utf-8',
    );
    const compositionSource = readFileSync(
      join(process.cwd(), 'src/services/modeBComposition.ts'),
      'utf-8',
    );

    assert(
      compositionSource.includes('export function isVisibleModeBScreenCaptureElement') &&
        compositionSource.includes('captures.filter((element) => isVisibleModeBScreenCaptureElement(element))'),
      'Test 15a: modeBComposition.ts shares isVisibleModeBScreenCaptureElement with createModeBScreenCaptureLayer',
    );

    const checkOrdered = (sectionName: string, startMarker: string, endMarker: string, guardCall: string, sideEffectCall: string) => {
      const start = studioSource.indexOf(startMarker);
      const end = studioSource.indexOf(endMarker, start);
      assert(start !== -1 && end !== -1 && start < end, `Test 15 (${sectionName}): section located`);
      const slice = studioSource.slice(start, end);
      const guardIdx = slice.indexOf(guardCall);
      const returnIdx = slice.indexOf('return;', guardIdx);
      const sideEffectIdx = slice.indexOf(sideEffectCall);
      assert(
        guardIdx !== -1 && returnIdx !== -1 && sideEffectIdx !== -1 && guardIdx < returnIdx && returnIdx < sideEffectIdx,
        `Test 15 (${sectionName}): validates and returns before side effect (${sideEffectCall})`,
      );
      assert(
        slice.includes('showInAppNotice('),
        `Test 15 (${sectionName}): emits showInAppNotice on rejection`,
      );
    };

    checkOrdered(
      'handleAddQuickElement',
      'const handleAddQuickElement =',
      'const handleDuplicate =',
      'validateModeBScreenCaptureAddition(',
      'commitElements(',
    );
    checkOrdered(
      'handleDuplicate',
      'const handleDuplicate =',
      'const handleDelete =',
      'validateModeBScreenCaptureAddition(',
      'commitElements(',
    );
    checkOrdered(
      'handleApplyPresetToScene',
      'const handleApplyPresetToScene =',
      'const filteredSourcesList =',
      'validateModeBScreenCapturePresetActivation(',
      'onSelectPreset(',
    );
    checkOrdered(
      'handleInstallMarketplacePack',
      'const handleInstallMarketplacePack =',
      'const resolveStudioElementMediaSrc =',
      'validateModeBScreenCaptureBatch(',
      'onInstallMarketplaceElements(',
    );
    checkOrdered(
      'handleSelectorSelectPreset',
      'const handleSelectorSelectPreset =',
      'const rollbackImportedMedia =',
      'validateModeBScreenCapturePresetActivation(',
      'onSelectPreset(',
    );
  }

  console.log(`modeBScreenCapturePolicy.test.ts: PASS (${assertionCount} assertions)`);
}

runTests();
