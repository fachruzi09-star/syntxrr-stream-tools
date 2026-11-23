/** Studio overlays are rendered above the dedicated MediaProjection object layer. */

export interface NativeModeBScreenCaptureLayer {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  layer: number;
  cropMode: 'fit';
  grouped: boolean;
}

export interface NativeModeBOverlayElement {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  visible: boolean;
  opacity: number;
  rotation: number;
  properties: Record<string, string | number | boolean>;
  triggerConfig?: { eventType?: string; durationSec?: number };
}

export interface ModeBOverlaySourceElement {
  id?: string;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layer?: number;
  visible?: boolean;
  opacity?: number;
  rotation?: number;
  properties?: Record<string, unknown>;
  triggerConfig?: { eventType?: string; durationSec?: number };
}

const NATIVE_OVERLAY_PROPERTY_KEYS = [
  'text', 'content', 'sampleText', 'label', 'template', 'fallback',
  'fontSize', 'fontWeight', 'textColor', 'color',
  'backgroundColor', 'bgColor', 'fillColor', 'borderColor', 'borderWidth', 'borderRadius',
  'shapeType', 'shape', 'textAlign', 'value', 'progress', 'maxMessages', 'eventType',
  'durationSec', 'countType', 'prefix', 'suffix', 'badge', 'showBadges', 'title', 'maxItems', 'speed',
  'alertTitle', 'accentColor', 'badgeColor', 'comboLabel', 'giftName', 'targetGoal',
  'targetAmount', 'target', 'currency', 'barColor', 'imageAssetId', 'imageFit', 'objectFit',
  'videoAssetId', 'videoFit', 'loop', 'facingMode', 'cameraFit', 'mirror',
] as const;

/**
 * Resolve the single Mode B MediaProjection layer. It is intentionally separate from the
 * ViewFilterRender overlay snapshot so the captured display cannot be hidden by a later
 * opaque full-frame source. Fit crop is the only supported crop semantic; rotations are
 * limited to quarter turns for the current GL sprite.
 */
export function createModeBScreenCaptureLayer(
  elements: ModeBOverlaySourceElement[] | undefined | null,
  grouped = false,
): NativeModeBScreenCaptureLayer {
  const source = Array.isArray(elements) ? elements : [];
  const captures = source.filter((element) => element?.type === 'screen_capture');
  const visible = captures.filter(
    (element) =>
      element.visible !== false &&
      (typeof element.width !== 'number' || element.width > 0) &&
      (typeof element.height !== 'number' || element.height > 0) &&
      (typeof element.opacity !== 'number' || element.opacity > 0),
  );

  if (visible.length > 1) {
    throw new Error('Mode B hanya mendukung satu elemen Tangkapan Layar aktif per sesi MediaProjection.');
  }
  if (captures.length > 0 && visible.length === 0) {
    return {
      enabled: false,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 0,
      layer: Number.MAX_SAFE_INTEGER,
      cropMode: 'fit',
      grouped,
    };
  }
  if (visible.length === 0) {
    return {
      enabled: true,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 100,
      layer: Number.MIN_SAFE_INTEGER,
      cropMode: 'fit',
      grouped: false,
    };
  }

  const capture = visible[0];
  const finite = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const layer = finite(capture.layer, 0);
  const laterOverlayConflict = source.some(
    (element) =>
      element &&
      element.visible !== false &&
      element.type !== 'screen_capture' &&
      finite(element.layer, 0) <= layer,
  );
  if (laterOverlayConflict) {
    throw new Error(
      'Pindahkan elemen Tangkapan Layar ke layer paling bawah sebelum LIVE Mode B. Elemen overlay harus berada di atasnya.',
    );
  }

  const cropMode = capture.properties?.cropMode;
  if (cropMode !== undefined && cropMode !== 'fit') {
    throw new Error('Mode B saat ini mendukung Crop Mode “Fit” untuk layer Tangkapan Layar.');
  }

  const rotation = ((Math.round(finite(capture.rotation, 0)) % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error('Rotasi Tangkapan Layar Mode B saat ini hanya mendukung 0°, 90°, 180°, atau 270°.');
  }

  return {
    enabled: true,
    x: Math.max(0, Math.min(100, finite(capture.x, 0))),
    y: Math.max(0, Math.min(100, finite(capture.y, 0))),
    width: Math.max(1, Math.min(100, finite(capture.width, 100))),
    height: Math.max(1, Math.min(100, finite(capture.height, 100))),
    rotation,
    opacity: Math.max(0, Math.min(100, finite(capture.opacity, 100))),
    layer,
    cropMode: 'fit',
    grouped,
  };
}

/** Create a bounded JSON-safe snapshot; never send blobs, media URLs, or arbitrary props. */
export function createModeBOverlaySnapshot(
  elements: ModeBOverlaySourceElement[] | undefined | null,
): NativeModeBOverlayElement[] {
  if (!Array.isArray(elements)) return [];
  const visibleElements = elements.filter(
    (element) => element && element.visible !== false && element.type !== 'screen_capture',
  );
  if (visibleElements.length > 60) {
    throw new Error('Preset Mode B melebihi batas 60 elemen Studio. Kurangi elemen sebelum LIVE.');
  }

  const snapshot: NativeModeBOverlayElement[] = visibleElements.map((element) => {
    const source = element.properties || {};
    const properties: Record<string, string | number | boolean> = {};
    for (const key of NATIVE_OVERLAY_PROPERTY_KEYS) {
      const value = source[key];
      if (typeof value === 'string' && value.length > 0 && value.length <= 1000) {
        properties[key] = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        properties[key] = value;
      } else if (typeof value === 'boolean') {
        properties[key] = value;
      }
    }

    const finite = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;

    return {
      id: String(element.id || '').slice(0, 100),
      name: String(element.name || '').slice(0, 120),
      type: String(element.type || '').slice(0, 60),
      x: Math.max(0, Math.min(100, finite(element.x, 0))),
      y: Math.max(0, Math.min(100, finite(element.y, 0))),
      width: Math.max(0, Math.min(100, finite(element.width, 0))),
      height: Math.max(0, Math.min(100, finite(element.height, 0))),
      layer: finite(element.layer, 0),
      visible: element.visible !== false,
      opacity: Math.max(0, Math.min(100, finite(element.opacity, 100))),
      rotation: finite(element.rotation, 0),
      properties,
      triggerConfig: element.triggerConfig
        ? {
            eventType: String(element.triggerConfig.eventType || '').slice(0, 40),
            durationSec: Math.max(1, Math.min(60, finite(element.triggerConfig.durationSec, 5))),
          }
        : undefined,
    };
  });

  return snapshot.sort((left, right) => left.layer - right.layer);
}
