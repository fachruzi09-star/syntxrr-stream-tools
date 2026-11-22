import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CanvasOrientation } from '../types';

export type StudioDeviceOrientation = 'portrait' | 'landscape';

export interface StudioOrientationSetResult {
  applied: boolean;
  native: boolean;
  orientation: StudioDeviceOrientation;
  requestedOrientation?: number;
  savedInitialOrientation?: number;
  reason?: string;
}

export interface StudioOrientationRestoreResult {
  restored: boolean;
  native: boolean;
  alreadyRestored?: boolean;
  restoredOrientation?: number;
  reason?: string;
}

export interface StudioOrientationPluginInterface {
  setOrientation(options: { orientation: StudioDeviceOrientation }): Promise<{
    applied: boolean;
    orientation: StudioDeviceOrientation;
    requestedOrientation?: number;
    savedInitialOrientation?: number;
    reason?: string;
  }>;
  restoreOrientation(): Promise<{
    restored: boolean;
    alreadyRestored?: boolean;
    restoredOrientation?: number;
    reason?: string;
  }>;
}

const StudioOrientationPlugin =
  registerPlugin<StudioOrientationPluginInterface>('StudioOrientation');

interface StudioOrientationTestAdapter {
  plugin?: StudioOrientationPluginInterface;
  isNativeAvailable?: boolean;
}

let testAdapter: StudioOrientationTestAdapter | null = null;

export function __setStudioOrientationBridgeTestAdapter(
  adapter: StudioOrientationTestAdapter | null,
): void {
  testAdapter = adapter;
}

export function isNativeStudioOrientationAvailable(): boolean {
  if (testAdapter?.isNativeAvailable !== undefined) {
    return testAdapter.isNativeAvailable;
  }
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Resolves physical device orientation target for a Studio preset orientation:
 * - 16:9 -> landscape
 * - 9:16 -> portrait
 * - 1:1  -> portrait (never rotate device to landscape for square canvas)
 */
export function resolveDeviceOrientationForPreset(
  canvasOrientation: CanvasOrientation,
): StudioDeviceOrientation {
  return canvasOrientation === '16:9' ? 'landscape' : 'portrait';
}

function getOrientationPlugin(): StudioOrientationPluginInterface {
  return testAdapter?.plugin ?? StudioOrientationPlugin;
}

export async function requestStudioDeviceOrientation(
  orientation: StudioDeviceOrientation,
): Promise<StudioOrientationSetResult> {
  if (!isNativeStudioOrientationAvailable()) {
    return {
      applied: false,
      native: false,
      orientation,
      reason: 'web_responsive_fallback',
    };
  }

  try {
    const res = await getOrientationPlugin().setOrientation({ orientation });
    return {
      applied: Boolean(res?.applied),
      native: true,
      orientation: res?.orientation ?? orientation,
      requestedOrientation: res?.requestedOrientation,
      savedInitialOrientation: res?.savedInitialOrientation,
      reason: res?.reason,
    };
  } catch (error) {
    return {
      applied: false,
      native: true,
      orientation,
      reason: error instanceof Error && error.message ? error.message : 'native_orientation_error',
    };
  }
}

export async function restoreStudioDeviceOrientation(): Promise<StudioOrientationRestoreResult> {
  if (!isNativeStudioOrientationAvailable()) {
    return {
      restored: false,
      native: false,
      reason: 'web_responsive_fallback',
    };
  }

  try {
    const res = await getOrientationPlugin().restoreOrientation();
    return {
      restored: Boolean(res?.restored),
      native: true,
      alreadyRestored: res?.alreadyRestored,
      restoredOrientation: res?.restoredOrientation,
      reason: res?.reason,
    };
  } catch (error) {
    return {
      restored: false,
      native: true,
      reason: error instanceof Error && error.message ? error.message : 'native_restore_error',
    };
  }
}
