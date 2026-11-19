import type { NativeModeBOverlayElement } from './modeBComposition';

/**
 * Current live scene replacement type allowlist. Images, stickers, and local MP4 files are
 * staged in immutable per-scene namespaces. Camera2 passes this coarse bridge check only;
 * the native service validates and transfers the active same-facing physical owner.
 */
const LIVE_REPLACEABLE_OVERLAY_TYPES = new Set([
  'shape', 'separator', 'text', 'running_text', 'dynamic_text', 'live_text',
  'username', 'counter', 'live_viewer_counter', 'combo_counter', 'chat_message',
  'event_feed', 'event_alert', 'progress_bar', 'image', 'sticker', 'video', 'camera',
]);

export function isLiveOverlaySceneReplaceable(
  elements: NativeModeBOverlayElement[] | null | undefined,
): boolean {
  if (!Array.isArray(elements)) return false;
  return elements.every(
    (element) =>
      element?.visible === false ||
      LIVE_REPLACEABLE_OVERLAY_TYPES.has(String(element?.type || '').trim().toLowerCase()),
  );
}
