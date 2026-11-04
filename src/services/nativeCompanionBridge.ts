/**
 * nativeCompanionBridge.ts
 *
 * TypeScript wrapper for SYNTXRR STREAM Mode A (TikTok LIVE Companion) native bridge.
 * Interfaces with FloatingCompanionPlugin on Android devices running under Capacitor.
 * Provides safe, truthful fallbacks for desktop and standard browser environments.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface OverlayPermissionResult {
  granted: boolean;
  openedSettings?: boolean;
  message?: string;
}

export interface NotificationPermissionResult {
  granted: boolean;
  message?: string;
}

export interface StartCompanionOptions {
  requireOverlay?: boolean;
}

export interface CompanionStatusResult {
  isRunning: boolean;
  success?: boolean;
  overlayActive?: boolean;
  overlayPermissionGranted?: boolean;
  message?: string;
}

export interface FloatingHudStatusResult {
  success?: boolean;
  isVisible: boolean;
  message?: string;
}

export interface FloatingCompanionPluginInterface {
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ granted: boolean; openedSettings: boolean }>;
  checkNotificationPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  startCompanion(options?: { requireOverlay?: boolean }): Promise<{
    success: boolean;
    isRunning: boolean;
    overlayActive?: boolean;
    overlayPermissionGranted?: boolean;
    message: string;
  }>;
  stopCompanion(): Promise<{
    success: boolean;
    isRunning: boolean;
    overlayActive?: boolean;
    message: string;
  }>;
  isCompanionRunning(): Promise<{ isRunning: boolean }>;
  // Phase 4.3B: Native Floating HUD Methods
  showFloatingHud(): Promise<FloatingHudStatusResult>;
  hideFloatingHud(): Promise<FloatingHudStatusResult>;
  isFloatingHudVisible(): Promise<{ isVisible: boolean }>;
  addListener(
    eventName: 'floatingHudClick',
    listenerFunc: (data: { timestamp: number }) => void
  ): Promise<PluginListenerHandle>;
}

// Register the custom Capacitor native plugin
const FloatingCompanion = registerPlugin<FloatingCompanionPluginInterface>('FloatingCompanion');

/**
 * Check if the current execution runtime is a native Android environment.
 */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Check whether SYSTEM_ALERT_WINDOW (display over other apps) permission is granted.
 */
export async function checkOverlayPermission(): Promise<OverlayPermissionResult> {
  if (!isNativeAndroid()) {
    return {
      granted: false,
      message: 'Izin Overlay hanya berlaku pada aplikasi Android (APK). Di browser web/desktop, fitur overlay native tidak didukung.',
    };
  }

  try {
    const res = await FloatingCompanion.checkOverlayPermission();
    return {
      granted: !!res?.granted,
    };
  } catch (error: any) {
    return {
      granted: false,
      message: error?.message || 'Gagal memeriksa izin overlay Android.',
    };
  }
}

/**
 * Request SYSTEM_ALERT_WINDOW permission by directing the user to Android Settings.
 */
export async function requestOverlayPermission(): Promise<OverlayPermissionResult> {
  if (!isNativeAndroid()) {
    return {
      granted: false,
      openedSettings: false,
      message: 'Permintaan izin overlay tidak didukung di luar aplikasi Android (APK).',
    };
  }

  try {
    const res = await FloatingCompanion.requestOverlayPermission();
    return {
      granted: !!res?.granted,
      openedSettings: !!res?.openedSettings,
    };
  } catch (error: any) {
    return {
      granted: false,
      openedSettings: false,
      message: error?.message || 'Gagal membuka halaman izin overlay sistem Android.',
    };
  }
}

/**
 * Check whether POST_NOTIFICATIONS permission is granted for persistent status display.
 */
export async function checkNotificationPermission(): Promise<NotificationPermissionResult> {
  if (!isNativeAndroid()) {
    return {
      granted: false,
      message: 'Izin notifikasi native Android hanya dapat diperiksa pada runtime APK.',
    };
  }

  try {
    const res = await FloatingCompanion.checkNotificationPermission();
    return {
      granted: !!res?.granted,
    };
  } catch (error: any) {
    return {
      granted: false,
      message: error?.message || 'Gagal memeriksa izin notifikasi Android.',
    };
  }
}

/**
 * Request POST_NOTIFICATIONS permission from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (!isNativeAndroid()) {
    return {
      granted: false,
      message: 'Izin notifikasi native Android tidak dapat diminta di browser web.',
    };
  }

  try {
    const res = await FloatingCompanion.requestNotificationPermission();
    return {
      granted: !!res?.granted,
    };
  } catch (error: any) {
    return {
      granted: false,
      message: error?.message || 'Gagal meminta izin notifikasi Android.',
    };
  }
}

/**
 * Start the native Android Companion Service.
 * Does NOT fake success in non-Android environments.
 */
export async function startCompanion(options?: StartCompanionOptions): Promise<CompanionStatusResult> {
  if (!isNativeAndroid()) {
    return {
      isRunning: false,
      success: false,
      overlayActive: false,
      overlayPermissionGranted: false,
      message: 'Companion Service hanya dapat dijalankan pada perangkat Android (Mode A). Di browser desktop atau OBS, gunakan Mode B.',
    };
  }

  try {
    const res = await FloatingCompanion.startCompanion({
      requireOverlay: options?.requireOverlay ?? false,
    });
    return {
      isRunning: !!res?.isRunning,
      success: !!res?.success,
      overlayActive: !!res?.overlayActive,
      overlayPermissionGranted: !!res?.overlayPermissionGranted,
      message: res?.message || 'Companion Service berhasil diaktifkan.',
    };
  } catch (error: any) {
    return {
      isRunning: false,
      success: false,
      overlayActive: false,
      overlayPermissionGranted: false,
      message: error?.message || 'Gagal menjalankan Companion Service.',
    };
  }
}

/**
 * Stop the native Android Companion Service.
 */
export async function stopCompanion(): Promise<CompanionStatusResult> {
  if (!isNativeAndroid()) {
    return {
      isRunning: false,
      success: false,
      overlayActive: false,
      message: 'Companion Service tidak aktif pada browser.',
    };
  }

  try {
    const res = await FloatingCompanion.stopCompanion();
    return {
      isRunning: !!res?.isRunning,
      success: !!res?.success,
      overlayActive: false,
      message: res?.message || 'Companion Service telah dihentikan.',
    };
  } catch (error: any) {
    return {
      isRunning: false,
      success: false,
      overlayActive: false,
      message: error?.message || 'Gagal menghentikan Companion Service.',
    };
  }
}

/**
 * Check whether the native Companion Service is currently running.
 */
export async function isCompanionRunning(): Promise<CompanionStatusResult> {
  if (!isNativeAndroid()) {
    return {
      isRunning: false,
      message: 'Native Companion Service tidak berjalan di lingkungan browser.',
    };
  }

  try {
    const res = await FloatingCompanion.isCompanionRunning();
    return {
      isRunning: !!res?.isRunning,
    };
  } catch (error: any) {
    return {
      isRunning: false,
      message: error?.message || 'Gagal membaca status Companion Service.',
    };
  }
}

/**
 * Display the native Android Floating HUD bubble overlay over other apps.
 * Fallback gracefully in web/browser environment.
 */
export async function showFloatingHud(): Promise<FloatingHudStatusResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isVisible: false,
      message: 'Floating HUD native hanya didukung saat dijalankan di aplikasi Android (APK).',
    };
  }

  try {
    const res = await FloatingCompanion.showFloatingHud();
    return {
      success: !!res?.success,
      isVisible: !!res?.isVisible,
      message: res?.message || 'Floating HUD berhasil ditampilkan.',
    };
  } catch (error: any) {
    return {
      success: false,
      isVisible: false,
      message: error?.message || 'Gagal menampilkan Floating HUD.',
    };
  }
}

/**
 * Hide and remove the native Android Floating HUD bubble overlay from screen.
 */
export async function hideFloatingHud(): Promise<FloatingHudStatusResult> {
  if (!isNativeAndroid()) {
    return {
      success: true,
      isVisible: false,
      message: 'Floating HUD tidak aktif pada browser.',
    };
  }

  try {
    const res = await FloatingCompanion.hideFloatingHud();
    return {
      success: !!res?.success,
      isVisible: false,
      message: res?.message || 'Floating HUD disembunyikan.',
    };
  } catch (error: any) {
    return {
      success: false,
      isVisible: false,
      message: error?.message || 'Gagal menyembunyikan Floating HUD.',
    };
  }
}

/**
 * Check whether the native Android Floating HUD is currently attached and visible.
 */
export async function isFloatingHudVisible(): Promise<FloatingHudStatusResult> {
  if (!isNativeAndroid()) {
    return {
      success: true,
      isVisible: false,
      message: 'Floating HUD tidak berjalan di lingkungan browser.',
    };
  }

  try {
    const res = await FloatingCompanion.isFloatingHudVisible();
    return {
      success: true,
      isVisible: !!res?.isVisible,
    };
  } catch (error: any) {
    return {
      success: false,
      isVisible: false,
      message: error?.message || 'Gagal memeriksa status Floating HUD.',
    };
  }
}

/**
 * Subscribe to native Floating HUD click events.
 * Returns a PluginListenerHandle for unsubscribing, or null in non-native environments.
 */
export async function onFloatingHudClick(
  callback: (data: { timestamp: number }) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) {
    return null;
  }

  try {
    return await FloatingCompanion.addListener('floatingHudClick', callback);
  } catch (error: any) {
    console.warn('Gagal mendaftarkan listener floatingHudClick:', error);
    return null;
  }
}

export const nativeCompanionBridge = {
  isNativeAndroid,
  checkOverlayPermission,
  requestOverlayPermission,
  checkNotificationPermission,
  requestNotificationPermission,
  startCompanion,
  stopCompanion,
  isCompanionRunning,
  // Phase 4.3B HUD Methods
  showFloatingHud,
  hideFloatingHud,
  isFloatingHudVisible,
  onFloatingHudClick,
};

export default nativeCompanionBridge;
