import { StudioPreset } from '../../types';
import { createModeBScreenCaptureLayer } from '../modeBComposition';
import {
  applyPresetGroupStateToElements,
  createGroupForElements,
  createSuperGroupForGroups,
  getPresetGroupBounds,
  transformPresetGroupElements,
  normalizeStudioPreset,
  createStudioMediaAssetUri,
  getStudioMediaAssetIdFromUri,
} from '../presetModel';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) throw new Error(`Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`);
}

const elements: StudioPreset['elements'] = [
  { id: 'camera_1', name: 'Camera', type: 'camera', x: 10, y: 20, width: 30, height: 20, layer: 1, visible: true, locked: false, opacity: 100, rotation: 0, properties: {} },
  { id: 'logo_1', name: 'Logo', type: 'image', x: 50, y: 10, width: 15, height: 15, layer: 2, visible: true, locked: false, opacity: 100, rotation: 0, properties: {} },
  { id: 'chat_1', name: 'Chat', type: 'chat_message', x: 5, y: 70, width: 50, height: 20, layer: 3, visible: true, locked: false, opacity: 100, rotation: 0, properties: {} },
];

const group = createGroupForElements(elements, ['camera_1', 'logo_1'], 'Branding');
assertEqual(group.elementIds.length, 2, 'group includes the selected elements');
assertEqual(group.x, 10, 'group bounds use the leftmost child');
assertEqual(group.y, 10, 'group bounds use the topmost child');
assertEqual(group.width, 55, 'group bounds cover the rightmost child');
assertEqual(group.height, 30, 'group bounds cover the lowest child');

const liveBounds = getPresetGroupBounds(group, elements);
assertEqual(liveBounds?.x, 10, 'live group bounds derive the left edge from child elements');
assertEqual(liveBounds?.width, 55, 'live group bounds derive the width from child elements');
const movedGroupElements = transformPresetGroupElements(
  elements, group, elements,
  { x: 10, y: 10, width: 55, height: 30 },
  { x: 15, y: 13, width: 55, height: 30 },
);
assertEqual(movedGroupElements[0].x, 15, 'group move translates the first child horizontally');
assertEqual(movedGroupElements[0].y, 23, 'group move translates the first child vertically');
assertEqual(movedGroupElements[1].x, 55, 'group move preserves the second child relative position');
assertEqual(movedGroupElements[2].x, 5, 'group move leaves non-member elements unchanged');
const resizedGroupElements = transformPresetGroupElements(
  elements, group, elements,
  { x: 10, y: 10, width: 55, height: 30 },
  { x: 10, y: 10, width: 110, height: 60 },
);
assertEqual(resizedGroupElements[0].y, 30, 'group resize scales child offset vertically');
assertEqual(resizedGroupElements[0].width, 60, 'group resize scales child width');
assertEqual(resizedGroupElements[1].x, 90, 'group resize scales child offset horizontally');
assertEqual(resizedGroupElements[1].height, 30, 'group resize scales child height');
assertEqual(elements[0].x, 10, 'group transforms do not mutate the original elements');

const groupedCaptureElements: StudioPreset['elements'] = [
  { id: 'group_screen', name: 'Screen Capture', type: 'screen_capture', x: 10, y: 10, width: 40, height: 40, layer: 1, visible: true, locked: false, opacity: 100, rotation: 0, properties: { cropMode: 'fit' } },
  { id: 'group_overlay', name: 'Camera', type: 'camera', x: 50, y: 10, width: 20, height: 30, layer: 2, visible: true, locked: false, opacity: 100, rotation: 0, properties: {} },
];
const groupedCapture = createGroupForElements(groupedCaptureElements, ['group_screen', 'group_overlay'], 'Capture Scene');
const transformedCaptureElements = transformPresetGroupElements(
  groupedCaptureElements, groupedCapture, groupedCaptureElements,
  { x: 10, y: 10, width: 60, height: 40 },
  { x: 20, y: 20, width: 90, height: 80 },
);
const effectiveCaptureElements = applyPresetGroupStateToElements({
  elements: transformedCaptureElements,
  groups: [{ ...groupedCapture, visible: true, locked: false }],
  superGroups: [],
});
const groupedCaptureLayer = createModeBScreenCaptureLayer(effectiveCaptureElements);
assertEqual(groupedCaptureLayer.x, 20, 'Mode B receives the screen child x after Group move/resize');
assertEqual(groupedCaptureLayer.y, 20, 'Mode B receives the screen child y after Group move/resize');
assertEqual(groupedCaptureLayer.width, 60, 'Mode B receives the screen child width after Group resize');
assertEqual(groupedCaptureLayer.height, 80, 'Mode B receives the screen child height after Group resize');
const superGroup = createSuperGroupForGroups([group], [group.id], 'Main');
assertEqual(superGroup.groupIds[0], group.id, 'supergroup references the selected group');

const preset: StudioPreset = {
  id: 'preset_1', name: 'Test', category: 'hp_screen', canvasOrientation: '9:16', elements,
  createdAt: 1, isFavorite: false, description: 'test',
  groups: [group], superGroups: [{ ...superGroup, visible: false, locked: true }],
};
const normalized = normalizeStudioPreset(preset);
const movedNormalizedPreset = normalizeStudioPreset({ ...preset, elements: movedGroupElements });
assertEqual(movedNormalizedPreset.groups?.[0].x, 15, 'preset normalization persists live group x bounds');
assertEqual(movedNormalizedPreset.groups?.[0].y, 13, 'preset normalization persists live group y bounds');
const restoredNormalizedPreset = normalizeStudioPreset({ ...preset, elements });
assertEqual(restoredNormalizedPreset.groups?.[0].x, 10, 'undo/redo element snapshots recalculate the original group bounds');
assertEqual(normalized.canvas?.kind, 'portrait', 'legacy preset receives portrait canvas metadata');
assertEqual(normalized.canvas?.width, 1080, 'legacy preset receives canonical canvas width');
assertEqual(normalized.groups?.length, 1, 'valid group survives normalization');
assertEqual(normalized.superGroups?.length, 1, 'valid supergroup survives normalization');

const effective = applyPresetGroupStateToElements(normalized);
const camera = effective.find((element) => element.id === 'camera_1');
const chat = effective.find((element) => element.id === 'chat_1');
assertEqual(camera?.visible, false, 'hidden supergroup hides child element in the effective render state');
assertEqual(camera?.locked, true, 'locked supergroup locks child element in the effective render state');
assertEqual(chat?.visible, true, 'elements outside the group remain visible');
assertEqual(chat?.locked, false, 'elements outside the group remain editable');
assertEqual(preset.elements[0].visible, true, 'group state application does not mutate stored element visibility');

const withDanglingReferences = normalizeStudioPreset({
  ...preset,
  groups: [
    { ...group, elementIds: ['camera_1', 'missing_element'] },
    { ...group, id: 'group_duplicate', elementIds: ['camera_1'] },
  ],
  superGroups: [{ ...superGroup, groupIds: [group.id, 'missing_group'] }],
});
assertEqual(withDanglingReferences.groups?.length, 1, 'duplicate element membership is removed safely');
assertEqual(withDanglingReferences.groups?.[0].elementIds.length, 1, 'dangling element references are removed');
assertEqual(withDanglingReferences.superGroups?.[0].groupIds.length, 1, 'dangling supergroup references are removed');

const legacy = normalizeStudioPreset({
  id: 'legacy', name: 'Legacy', category: 'landscape', canvasOrientation: '16:9',
  elements: [], createdAt: 1, isFavorite: false, description: 'legacy',
});
assertEqual(legacy.groups?.length, 0, 'legacy flat preset migrates with no groups');
assertEqual(legacy.superGroups?.length, 0, 'legacy flat preset migrates with no supergroups');
assertEqual(legacy.canvas?.kind, 'landscape', 'legacy canvas orientation is retained');
assertEqual(createStudioMediaAssetUri('media_background_1'), 'studio-media://media_background_1', 'local background media receives a stable URI');
assertEqual(getStudioMediaAssetIdFromUri('studio-media://media_background_1'), 'media_background_1', 'stable background URI resolves to its media ID');
assertEqual(getStudioMediaAssetIdFromUri('studio-media://bad/id'), undefined, 'invalid local background URI is rejected');

console.log(`Preset model tests passed: ${assertionCount} assertions.`);
