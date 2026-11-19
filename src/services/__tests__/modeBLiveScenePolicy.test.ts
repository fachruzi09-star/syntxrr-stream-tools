import { isLiveOverlaySceneReplaceable } from '../modeBLiveScenePolicy';
import type { NativeModeBOverlayElement } from '../modeBComposition';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

const base = {
  id: 'scene_element',
  name: 'Scene element',
  x: 10,
  y: 10,
  width: 40,
  height: 20,
  layer: 1,
  visible: true,
  opacity: 100,
  rotation: 0,
  properties: {},
};

const element = (type: string): NativeModeBOverlayElement => ({ ...base, type });

assertEqual(isLiveOverlaySceneReplaceable([]), true, 'empty overlay scene can be swapped');
assertEqual(
  isLiveOverlaySceneReplaceable([
    element('text'),
    element('shape'),
    element('separator'),
    element('chat_message'),
    element('progress_bar'),
  ]),
  true,
  'static and event-driven overlay elements can be swapped',
);
assertEqual(isLiveOverlaySceneReplaceable([element('image')]), true, 'image assets may be staged in a per-scene namespace');
assertEqual(isLiveOverlaySceneReplaceable([element('sticker')]), true, 'sticker assets may be staged in a per-scene namespace');
assertEqual(
  isLiveOverlaySceneReplaceable([element('video')]),
  true,
  'video decoder handoff uses the session visual worker and isolated namespace',
);
assertEqual(
  isLiveOverlaySceneReplaceable([element('camera')]),
  true,
  'camera reaches native owner-compatibility validation without opening a second Camera2 session',
);
assertEqual(isLiveOverlaySceneReplaceable([element('unknown_source')]), false, 'unknown source types fail closed');
assertEqual(
  isLiveOverlaySceneReplaceable([{ ...element('camera'), visible: false }]),
  true,
  'hidden camera layers are omitted by native snapshot and do not block replacement',
);
assertEqual(isLiveOverlaySceneReplaceable(null), false, 'missing scene fails closed');
assertEqual(
  isLiveOverlaySceneReplaceable([element('image'), element('video'), element('text')]),
  true,
  'mixed static and media overlays are supported',
);

console.log('Live overlay scene policy tests passed: 10 assertions.');
