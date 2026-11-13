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

// =========================================================================
// Floating HUD model (native overlay panel content)
// =========================================================================

export type HudPanelId = 'chat' | 'soundboard' | 'music' | 'mixer';
export type HudChatTab = 'chat' | 'gift' | 'like' | 'follow';
export type HudStatusTone = 'ok' | 'warn' | 'off';

export interface HudRowModel {
  label: string;
  sub?: string;
  trailing?: string;
  /** Aksi yang dikirim balik lewat hudCommand. Kosong = baris pasif. */
  action?: string;
  id?: string;
}

export interface HudTabModel {
  id: string;
  label: string;
}

export interface HudSliderModel {
  id: string;
  label: string;
  value: number;
  max?: number;
  action: string;
}

export interface HudMeterModel {
  label: string;
  value: number;
  muted: boolean;
  available: boolean;
}

/** Tombol aksi ringkas di panel (mis. Play/Pause, Next). Teks saja, tanpa emoji. */
export interface HudButtonModel {
  label: string;
  action: string;
  id?: string;
  active?: boolean;
}

/** Grid tombol persegi (mis. Soundboard 4 kolom). */
export interface HudGridModel {
  columns: number;
  items: HudButtonModel[];
}

export interface HudStateModel {
  panel: HudPanelId;
  title: string;
  status: { text: string; tone: HudStatusTone };
  tabs?: HudTabModel[];
  activeTab?: string;
  buttons?: HudButtonModel[];
  grid?: HudGridModel;
  sliders?: HudSliderModel[];
  meter?: HudMeterModel;
  rows?: HudRowModel[];
  /** Cache baris untuk tiap tab chat agar native HUD dapat berpindah tab instan tanpa menunggu JS. */
  rowsByTab?: Partial<Record<HudChatTab, HudRowModel[]>>;
  /** Teks kosong per tab chat untuk fallback cache native. */
  emptyTextByTab?: Partial<Record<HudChatTab, string>>;
  /** Tinggi area daftar (dp) agar panel tidak berubah ukuran saat event baru masuk. */
  listHeightDp?: number;
  emptyText?: string;
}

export interface HudCommandPayload {
  action: string;
  id?: string;
  value?: number;
}

export interface HudPanelChangedPayload {
  panel?: HudPanelId;
}

/** Dikirim native saat aplikasi kembali ke foreground agar panel menyegarkan status. */
export interface HudResyncPayload {
  panel?: HudPanelId | null;
  isVisible?: boolean;
  timestamp?: number;
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
  showFloatingHud(options?: FloatingHudOptions): Promise<FloatingHudStatusResult>;
  updateFloatingHud(options?: FloatingHudOptions): Promise<FloatingHudStatusResult>;
  hideFloatingHud(): Promise<FloatingHudStatusResult>;
  isFloatingHudVisible(): Promise<{ isVisible: boolean }>;
  // Phase 4.4: HUD model + command channel
  pushHudState(options: { model: string }): Promise<{ accepted: boolean }>;
  collapseHudContent(): Promise<{ success: boolean }>;
  getHudState(): Promise<{ isVisible: boolean; activePanel?: HudPanelId }>;
  addListener(
    eventName: 'floatingHudClick',
    listenerFunc: (data: { timestamp: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'hudCommand',
    listenerFunc: (data: HudCommandPayload) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'hudPanelChanged',
    listenerFunc: (data: HudPanelChangedPayload) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'hudResync',
    listenerFunc: (data: HudResyncPayload) => void
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
export interface FloatingHudOptions {
  /** Ukuran bubble dalam dp (native men-clamp ke 40-64). */
  sizeDp?: number;
  /** Opacity 30-100 (%). */
  opacity?: number;
  /** Sisi layar tempat bubble menempel. */
  position?: 'left' | 'right';
}

export async function showFloatingHud(
  options?: FloatingHudOptions
): Promise<FloatingHudStatusResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isVisible: false,
      message: 'Floating HUD native hanya didukung saat dijalankan di aplikasi Android (APK).',
    };
  }

  try {
    const res = await FloatingCompanion.showFloatingHud(options ?? {});
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
 * Terapkan ukuran/opacity/sisi pada bubble yang SEDANG tampil, tanpa hide/show.
 * Native memakai updateViewLayout pada view yang sama, jadi tidak ada overlay ganda.
 * Di luar Android (atau saat bubble belum tampil) panggilan ini aman dan tidak
 * mengubah apa pun.
 */
export async function updateFloatingHud(
  options?: FloatingHudOptions
): Promise<FloatingHudStatusResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isVisible: false,
      message: 'Floating HUD native hanya didukung saat dijalankan di aplikasi Android (APK).',
    };
  }

  try {
    const res = await FloatingCompanion.updateFloatingHud(options ?? {});
    return {
      success: !!res?.success,
      isVisible: !!res?.isVisible,
      message: res?.message || 'Tampilan Floating HUD diperbarui.',
    };
  } catch (error: any) {
    return {
      success: false,
      isVisible: false,
      message: error?.message || 'Gagal memperbarui Floating HUD.',
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

/**
 * Snapshot semua panel untuk overlay native (lihat buildHudSnapshot di hudController).
 * Native menyimpan tiap panel agar tetap dapat digambar saat WebView ditangguhkan.
 */
export interface HudSnapshotPayload {
  panels: Partial<Record<HudPanelId, HudStateModel>>;
  generatedAt: number;
}

/**
 * Kirim model panel (atau snapshot semua panel) HUD ke overlay native.
 * Native hanya menggambar; semua nilai berasal dari state aplikasi.
 */
export async function pushHudState(
  model: HudStateModel | HudSnapshotPayload
): Promise<{ accepted: boolean }> {
  if (!isNativeAndroid()) {
    return { accepted: false };
  }

  try {
    const res = await FloatingCompanion.pushHudState({ model: JSON.stringify(model) });
    return { accepted: !!res?.accepted };
  } catch (error: any) {
    console.warn('Gagal mengirim model HUD:', error);
    return { accepted: false };
  }
}

/** Tutup toolbar/panel HUD tanpa menyembunyikan bubble. */
export async function collapseHudContent(): Promise<{ success: boolean }> {
  if (!isNativeAndroid()) {
    return { success: false };
  }

  try {
    const res = await FloatingCompanion.collapseHudContent();
    return { success: !!res?.success };
  } catch (error: any) {
    console.warn('Gagal menutup panel HUD:', error);
    return { success: false };
  }
}

/** Status HUD sebenarnya (terpasang atau tidak, panel aktif). */
export async function getHudState(): Promise<{ isVisible: boolean; activePanel: HudPanelId | null }> {
  if (!isNativeAndroid()) {
    return { isVisible: false, activePanel: null };
  }

  try {
    const res = await FloatingCompanion.getHudState();
    return {
      isVisible: !!res?.isVisible,
      activePanel: (res?.activePanel as HudPanelId | undefined) ?? null,
    };
  } catch (error: any) {
    console.warn('Gagal membaca status HUD:', error);
    return { isVisible: false, activePanel: null };
  }
}

/** Perintah dari toolbar/panel HUD native. */
export async function onHudCommand(
  callback: (data: HudCommandPayload) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) {
    return null;
  }

  try {
    return await FloatingCompanion.addListener('hudCommand', callback);
  } catch (error: any) {
    console.warn('Gagal mendaftarkan listener hudCommand:', error);
    return null;
  }
}

/** Panel HUD dibuka/ditutup di sisi native. */
export async function onHudPanelChanged(
  callback: (data: HudPanelChangedPayload) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) {
    return null;
  }

  try {
    return await FloatingCompanion.addListener('hudPanelChanged', callback);
  } catch (error: any) {
    console.warn('Gagal mendaftarkan listener hudPanelChanged:', error);
    return null;
  }
}

/**
 * Aplikasi kembali ke foreground. Dipakai untuk menyegarkan model panel HUD agar status
 * tidak tertinggal setelah proses dibekukan sistem selama aplikasi di background.
 */
export async function onHudResync(
  callback: (data: HudResyncPayload) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) {
    return null;
  }

  try {
    return await FloatingCompanion.addListener('hudResync', callback);
  } catch (error: any) {
    console.warn('Gagal mendaftarkan listener hudResync:', error);
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
  updateFloatingHud,
  hideFloatingHud,
  isFloatingHudVisible,
  onFloatingHudClick,
  // Phase 4.4 HUD model + command channel
  pushHudState,
  collapseHudContent,
  getHudState,
  onHudCommand,
  onHudPanelChanged,
  onHudResync,
};

export default nativeCompanionBridge;
