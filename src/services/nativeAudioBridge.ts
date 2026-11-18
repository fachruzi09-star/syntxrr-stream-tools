/**
 * nativeAudioBridge.ts
 *
 * TypeScript wrapper for SYNTXRR STREAM Native Audio & TTS Core.
 * Interfaces with NativeAudioPlugin on Android devices running under Capacitor.
 * Provides safe, truthful fallbacks for desktop and standard browser environments.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface PlaySfxOptions {
  soundId: string;
  filePath?: string;
  volume?: number; // 0.0 - 1.0
  rate?: number; // 0.5 - 2.0
  loop?: boolean;
}

export interface PlaySfxResult {
  success: boolean;
  streamId?: number;
  soundId?: string;
  isNative: boolean;
  message?: string;
}

export interface StopSfxResult {
  success: boolean;
  streamId?: number;
  isNative: boolean;
  message?: string;
}

export interface SpeakOptions {
  rate?: number; // 0.5 - 2.0
  pitch?: number; // 0.5 - 2.0
  language?: string; // e.g. 'id-ID'
  queue?: boolean;
  utteranceId?: string;
}

export interface SpeakResult {
  success: boolean;
  utteranceId?: string;
  queued?: boolean;
  isNative: boolean;
  message?: string;
}

export interface AudioStatusResult {
  soundPoolReady: boolean;
  ttsReady: boolean;
  ttsInitializing: boolean;
  ttsLanguage: string;
  masterVolume: number;
  isNative: boolean;
  message?: string;
}

export interface TtsEventData {
  utteranceId: string;
  timestamp: number;
  error?: string;
}

export type NativeMusicStatusValue =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error';

export interface PlayMusicTrackOptions {
  trackId: string;
  title: string;
  artist: string;
  sourceUri?: string;
  base64Audio?: string;
  mimeType?: string;
  volume?: number; // 0.0 - 1.0
}

export interface PlayMusicTrackResult {
  success: boolean;
  trackId?: string;
  status?: NativeMusicStatusValue;
  isNative: boolean;
  message?: string;
}

export interface MusicStateEvent {
  trackId: string;
  status: NativeMusicStatusValue;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  errorMessage?: string;
  timestamp: number;
}

export interface MusicTransportEvent {
  command: 'play' | 'pause' | 'next' | 'stop';
  timestamp: number;
}

export interface MusicStatusResult {
  trackId: string;
  title: string;
  artist: string;
  status: NativeMusicStatusValue;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  errorMessage?: string;
  isNative: boolean;
}

export interface NativeAudioPluginInterface {
  playSfx(options: PlaySfxOptions): Promise<{
    success: boolean;
    streamId?: number;
    soundId?: string;
    message?: string;
  }>;
  stopSfx(options?: { streamId?: number }): Promise<{
    success: boolean;
    streamId?: number;
    message?: string;
  }>;
  setMasterVolume(options: { volume: number }): Promise<{
    success: boolean;
    volume: number;
  }>;
  speak(options: {
    text: string;
    rate?: number;
    pitch?: number;
    language?: string;
    queue?: boolean;
    utteranceId?: string;
  }): Promise<{
    success: boolean;
    utteranceId: string;
    queued: boolean;
    message: string;
  }>;
  stopSpeaking(): Promise<{
    success: boolean;
    message: string;
  }>;
  getAudioStatus(): Promise<{
    soundPoolReady: boolean;
    ttsReady: boolean;
    ttsInitializing: boolean;
    ttsLanguage: string;
    masterVolume: number;
  }>;
  playMusicTrack(options: PlayMusicTrackOptions): Promise<{
    success: boolean;
    trackId?: string;
    status?: NativeMusicStatusValue;
    message?: string;
  }>;
  pauseMusicTrack(): Promise<{
    success: boolean;
    status?: NativeMusicStatusValue;
    isPlaying?: boolean;
    positionMs?: number;
    durationMs?: number;
  }>;
  resumeMusicTrack(): Promise<{
    success: boolean;
    status?: NativeMusicStatusValue;
    isPlaying?: boolean;
    positionMs?: number;
    durationMs?: number;
  }>;
  stopMusicTrack(): Promise<{
    success: boolean;
    status?: NativeMusicStatusValue;
  }>;
  setMusicVolume(options: { volume: number }): Promise<{
    success: boolean;
    volume: number;
  }>;
  getMusicStatus(): Promise<{
    trackId: string;
    title: string;
    artist: string;
    status: NativeMusicStatusValue;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    errorMessage?: string;
  }>;
  addListener(
    eventName: 'ttsStart' | 'ttsDone' | 'ttsError',
    listenerFunc: (data: TtsEventData) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'musicState',
    listenerFunc: (data: MusicStateEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'musicTransport',
    listenerFunc: (data: MusicTransportEvent) => void
  ): Promise<PluginListenerHandle>;
}

// Register the custom Capacitor native audio plugin
const NativeAudio = registerPlugin<NativeAudioPluginInterface>('NativeAudio');

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
 * Play a sound via native Android SoundPool.
 * Falls back cleanly in web browser.
 */
export async function playSfx(options: PlaySfxOptions): Promise<PlaySfxResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isNative: false,
      message: 'Native SoundPool hanya tersedia pada aplikasi Android (APK). Menggunakan Web Audio fallback.',
    };
  }

  try {
    const res = await NativeAudio.playSfx(options);
    return {
      success: !!res?.success,
      streamId: res?.streamId,
      soundId: res?.soundId || options.soundId,
      isNative: true,
      message: res?.message || 'Pemutaran SFX native berhasil.',
    };
  } catch (error: any) {
    return {
      success: false,
      isNative: true,
      message: error?.message || 'Gagal memanggil native SoundPool.',
    };
  }
}

/**
 * Stop a specific sound stream or all sound streams.
 */
export async function stopSfx(streamId?: number): Promise<StopSfxResult> {
  if (!isNativeAndroid()) {
    return {
      success: true,
      isNative: false,
      message: 'Native SoundPool tidak aktif pada browser.',
    };
  }

  try {
    const res = await NativeAudio.stopSfx(streamId ? { streamId } : undefined);
    return {
      success: !!res?.success,
      streamId: res?.streamId,
      isNative: true,
      message: res?.message || 'Stream SFX dihentikan.',
    };
  } catch (error: any) {
    return {
      success: false,
      isNative: true,
      message: error?.message || 'Gagal menghentikan SFX native.',
    };
  }
}

/**
 * Set master volume in native SoundPool engine.
 */
export async function setMasterVolume(volume: number): Promise<{ success: boolean; volume: number; isNative: boolean }> {
  const clamped = Math.max(0, Math.min(1, volume));
  if (!isNativeAndroid()) {
    return {
      success: true,
      volume: clamped,
      isNative: false,
    };
  }

  try {
    const res = await NativeAudio.setMasterVolume({ volume: clamped });
    return {
      success: !!res?.success,
      volume: res?.volume ?? clamped,
      isNative: true,
    };
  } catch {
    return {
      success: false,
      volume: clamped,
      isNative: true,
    };
  }
}

/**
 * Speak text using native Android TextToSpeech engine.
 * Immune to WebView background suspension when TikTok is in the foreground.
 */
export async function speak(text: string, options?: SpeakOptions): Promise<SpeakResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isNative: false,
      message: 'Native TTS hanya tersedia pada aplikasi Android (APK). Menggunakan Web Speech fallback.',
    };
  }

  try {
    const res = await NativeAudio.speak({
      text,
      rate: options?.rate ?? 1.0,
      pitch: options?.pitch ?? 1.0,
      language: options?.language ?? 'id-ID',
      queue: options?.queue ?? true,
      utteranceId: options?.utteranceId,
    });
    return {
      success: !!res?.success,
      utteranceId: res?.utteranceId,
      queued: !!res?.queued,
      isNative: true,
      message: res?.message || 'TTS native berhasil dikirim ke antrean.',
    };
  } catch (error: any) {
    return {
      success: false,
      isNative: true,
      message: error?.message || 'Gagal memanggil native TextToSpeech.',
    };
  }
}

/**
 * Stop any ongoing or queued native speech.
 */
export async function stopSpeaking(): Promise<{ success: boolean; isNative: boolean; message?: string }> {
  if (!isNativeAndroid()) {
    return {
      success: true,
      isNative: false,
      message: 'Native TTS tidak aktif pada browser.',
    };
  }

  try {
    const res = await NativeAudio.stopSpeaking();
    return {
      success: !!res?.success,
      isNative: true,
      message: res?.message || 'TTS native dihentikan.',
    };
  } catch (error: any) {
    return {
      success: false,
      isNative: true,
      message: error?.message || 'Gagal menghentikan TTS native.',
    };
  }
}

/**
 * Inspect the current native audio engine status.
 */
export async function getAudioStatus(): Promise<AudioStatusResult> {
  if (!isNativeAndroid()) {
    return {
      soundPoolReady: false,
      ttsReady: false,
      ttsInitializing: false,
      ttsLanguage: 'id-ID',
      masterVolume: 0.9,
      isNative: false,
      message: 'Browser environment: native audio engine tidak berjalan.',
    };
  }

  try {
    const res = await NativeAudio.getAudioStatus();
    return {
      soundPoolReady: !!res?.soundPoolReady,
      ttsReady: !!res?.ttsReady,
      ttsInitializing: !!res?.ttsInitializing,
      ttsLanguage: res?.ttsLanguage || 'id-ID',
      masterVolume: res?.masterVolume ?? 0.9,
      isNative: true,
    };
  } catch (error: any) {
    return {
      soundPoolReady: false,
      ttsReady: false,
      ttsInitializing: false,
      ttsLanguage: 'id-ID',
      masterVolume: 0.9,
      isNative: true,
      message: error?.message || 'Gagal membaca status native audio.',
    };
  }
}

/**
 * Subscribe to native TTS utterance started events.
 */
export async function onTtsStart(
  callback: (data: TtsEventData) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await NativeAudio.addListener('ttsStart', callback);
  } catch {
    return null;
  }
}

/**
 * Subscribe to native TTS utterance completed events.
 */
export async function onTtsDone(
  callback: (data: TtsEventData) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await NativeAudio.addListener('ttsDone', callback);
  } catch {
    return null;
  }
}

/**
 * Subscribe to native TTS utterance error events.
 */
export async function onTtsError(
  callback: (data: TtsEventData) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await NativeAudio.addListener('ttsError', callback);
  } catch {
    return null;
  }
}

export async function playMusicTrack(options: PlayMusicTrackOptions): Promise<PlayMusicTrackResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isNative: false,
      message: 'NativeMediaPlayer hanya tersedia pada Android (APK).',
    };
  }
  try {
    const res = await NativeAudio.playMusicTrack(options);
    return {
      success: !!res?.success,
      trackId: res?.trackId ?? options.trackId,
      status: res?.status,
      isNative: true,
      message: res?.message,
    };
  } catch (error: any) {
    return {
      success: false,
      isNative: true,
      status: 'error',
      message: error?.message || 'Gagal memulai pemutar musik native.',
    };
  }
}

export async function pauseMusicTrack(): Promise<{
  success: boolean;
  isPlaying: boolean;
  status: NativeMusicStatusValue;
  positionMs: number;
  durationMs: number;
  isNative: boolean;
}> {
  if (!isNativeAndroid()) {
    return { success: false, isPlaying: false, status: 'idle', positionMs: 0, durationMs: 0, isNative: false };
  }
  try {
    const res = await NativeAudio.pauseMusicTrack();
    return {
      success: !!res?.success,
      isPlaying: !!res?.isPlaying,
      status: res?.status ?? 'paused',
      positionMs: res?.positionMs ?? 0,
      durationMs: res?.durationMs ?? 0,
      isNative: true,
    };
  } catch {
    return { success: false, isPlaying: false, status: 'error', positionMs: 0, durationMs: 0, isNative: true };
  }
}

export async function resumeMusicTrack(): Promise<{
  success: boolean;
  isPlaying: boolean;
  status: NativeMusicStatusValue;
  positionMs: number;
  durationMs: number;
  isNative: boolean;
}> {
  if (!isNativeAndroid()) {
    return { success: false, isPlaying: false, status: 'idle', positionMs: 0, durationMs: 0, isNative: false };
  }
  try {
    const res = await NativeAudio.resumeMusicTrack();
    return {
      success: !!res?.success,
      isPlaying: !!res?.isPlaying,
      status: res?.status ?? 'playing',
      positionMs: res?.positionMs ?? 0,
      durationMs: res?.durationMs ?? 0,
      isNative: true,
    };
  } catch {
    return { success: false, isPlaying: false, status: 'error', positionMs: 0, durationMs: 0, isNative: true };
  }
}

export async function stopMusicTrack(): Promise<{ success: boolean; isNative: boolean }> {
  if (!isNativeAndroid()) {
    return { success: true, isNative: false };
  }
  try {
    const res = await NativeAudio.stopMusicTrack();
    return { success: !!res?.success, isNative: true };
  } catch {
    return { success: false, isNative: true };
  }
}

export async function setMusicVolume(volume: number): Promise<{ success: boolean; volume: number; isNative: boolean }> {
  const clamped = Math.max(0, Math.min(1, volume));
  if (!isNativeAndroid()) {
    return { success: true, volume: clamped, isNative: false };
  }
  try {
    const res = await NativeAudio.setMusicVolume({ volume: clamped });
    return { success: !!res?.success, volume: res?.volume ?? clamped, isNative: true };
  } catch {
    return { success: false, volume: clamped, isNative: true };
  }
}

export async function getMusicStatus(): Promise<MusicStatusResult> {
  if (!isNativeAndroid()) {
    return {
      trackId: '',
      title: '',
      artist: '',
      status: 'idle',
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      isNative: false,
    };
  }
  try {
    const res = await NativeAudio.getMusicStatus();
    return {
      trackId: res?.trackId ?? '',
      title: res?.title ?? '',
      artist: res?.artist ?? '',
      status: res?.status ?? 'idle',
      isPlaying: !!res?.isPlaying,
      positionMs: res?.positionMs ?? 0,
      durationMs: res?.durationMs ?? 0,
      errorMessage: res?.errorMessage,
      isNative: true,
    };
  } catch (error: any) {
    return {
      trackId: '',
      title: '',
      artist: '',
      status: 'error',
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      errorMessage: error?.message || 'Gagal membaca status musik native.',
      isNative: true,
    };
  }
}

export async function onMusicState(
  callback: (data: MusicStateEvent) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await NativeAudio.addListener('musicState', callback);
  } catch {
    return null;
  }
}

export async function onMusicTransport(
  callback: (data: MusicTransportEvent) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await NativeAudio.addListener('musicTransport', callback);
  } catch {
    return null;
  }
}

export const nativeAudioBridge = {
  isNativeAndroid,
  playSfx,
  stopSfx,
  setMasterVolume,
  speak,
  stopSpeaking,
  getAudioStatus,
  onTtsStart,
  onTtsDone,
  onTtsError,
  playMusicTrack,
  pauseMusicTrack,
  resumeMusicTrack,
  stopMusicTrack,
  setMusicVolume,
  getMusicStatus,
  onMusicState,
  onMusicTransport,
};

export default nativeAudioBridge;
