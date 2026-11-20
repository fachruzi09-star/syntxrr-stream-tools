import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Mic,
  Monitor,
  PauseCircle,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Smartphone,
  Square,
  Wifi,
} from 'lucide-react';
import { OPTION_SYSTEMS } from './tokens';
import {
  computeModeAHonestIndicators,
  computeModeBStateMeta,
  type DashboardAlternativeId,
  type DashboardScenarioState,
  type ModeBAudioSource,
} from './dashboardTypes';
import type { OperatingMode, ThemeMode } from './types';

export interface DashboardActionHandlers {
  onChangeMode: (mode: OperatingMode) => void;
  onStartModeAConnect: () => void;
  onStartModeAWithoutLive: () => void;
  onStopModeA: () => void;
  onToggleModeAMethod: () => void;
  onShowHud: () => void;
  onHideHud: () => void;
  onGrantOverlayPermission: () => void;
  onStartModeB: () => void;
  onStopModeB: () => void;
  onToggleHostWait: () => void;
  onRequestScreenReshare: () => void;
  onChangeAudioSource: (source: ModeBAudioSource) => void;
  onRunHardwareCheck: () => void;
  onConfigureTargetUsername: () => void;
  onCompleteRtmpConfig: () => void;
  onGrantNotificationPermission: () => void;
}

export interface DashboardAlternativeProps {
  variant: DashboardAlternativeId;
  theme: ThemeMode;
  isMobile: boolean;
  operatingMode: OperatingMode;
  scenario: DashboardScenarioState;
  actions: DashboardActionHandlers;
}

const toneColor = (
  tone: 'neutral' | 'ok' | 'warn' | 'error',
  p: (typeof OPTION_SYSTEMS)['D_PLUS']['palettes']['dark'],
): string => {
  switch (tone) {
    case 'ok':
      return p.ok;
    case 'warn':
      return p.warn;
    case 'error':
      return p.error;
    default:
      return p.textSecondary;
  }
};

const toneBg = (
  tone: 'neutral' | 'ok' | 'warn' | 'error',
  p: (typeof OPTION_SYSTEMS)['D_PLUS']['palettes']['dark'],
): string => {
  switch (tone) {
    case 'ok':
      return p.okSoft;
    case 'warn':
      return p.warnSoft;
    case 'error':
      return p.errorSoft;
    default:
      return p.surfaceMuted;
  }
};

const audioSourceLabel = (s: ModeBAudioSource) =>
  s === 'mix' ? 'Mix (Internal + Mic)' : s === 'internal' ? 'Internal Audio' : 'Microphone';

const buildReadinessRows = (scenario: DashboardScenarioState) => {
  const unchecked = scenario.hardwareCheckState === 'unchecked';
  return [
    {
      id: 'cam',
      label: 'Kamera Video',
      icon: Camera,
      status: unchecked ? 'Belum diperiksa' : 'Siap (Depan/Belakang)',
      tone: unchecked ? ('neutral' as const) : ('ok' as const),
    },
    {
      id: 'mic',
      label: 'Mikrofon & Audio',
      icon: Mic,
      status: unchecked ? 'Belum diperiksa' : 'Izin Audio Aktif',
      tone: unchecked ? ('neutral' as const) : ('ok' as const),
    },
    {
      id: 'screen',
      label: 'Screen Capture (MediaProjection)',
      icon: Monitor,
      status:
        scenario.screenPermission === 'granted'
          ? 'Diizinkan'
          : unchecked
          ? 'Belum diperiksa'
          : 'Memerlukan Prompt Sistem',
      tone:
        scenario.screenPermission === 'granted'
          ? ('ok' as const)
          : unchecked
          ? ('neutral' as const)
          : ('warn' as const),
    },
    {
      id: 'overlay',
      label: 'Izin Floating Overlay (Android)',
      icon: Smartphone,
      status:
        scenario.overlayPermissionGranted === null
          ? 'Belum diperiksa'
          : scenario.overlayPermissionGranted
          ? 'Diizinkan'
          : 'Belum diizinkan',
      tone:
        scenario.overlayPermissionGranted === null
          ? ('neutral' as const)
          : scenario.overlayPermissionGranted
          ? ('ok' as const)
          : ('warn' as const),
    },
    {
      id: 'notif',
      label: 'Izin Notifikasi (Android 13+)',
      icon: ShieldAlert,
      status:
        scenario.notificationPermissionGranted === null
          ? 'Belum diperiksa'
          : scenario.notificationPermissionGranted
          ? 'Diizinkan'
          : 'Diperlukan',
      tone:
        scenario.notificationPermissionGranted === null
          ? ('neutral' as const)
          : scenario.notificationPermissionGranted
          ? ('ok' as const)
          : ('error' as const),
    },
  ];
};

/* ============================================================================
   SHARED OPERATIONAL BUTTON STRIPS (Mode A & Mode B)
   ============================================================================ */
const ModeSwitchSegment: React.FC<{
  operatingMode: OperatingMode;
  onChangeMode: (m: OperatingMode) => void;
  p: (typeof OPTION_SYSTEMS)['D_PLUS']['palettes']['dark'];
  radius: string;
  compact?: boolean;
}> = ({ operatingMode, onChangeMode, p, radius, compact = false }) => (
  <div
    className="inline-flex p-0.5 max-w-full"
    style={{
      backgroundColor: p.surfaceMuted,
      border: `1px solid ${p.border}`,
      borderRadius: radius,
    }}
  >
    {([
      { id: 'mode_a', label: compact ? 'Mode A · Companion' : 'Mode A · TikTok Companion' },
      { id: 'mode_b', label: compact ? 'Mode B · RTMP' : 'Mode B · Native RTMP' },
    ] as const).map((item) => {
      const active = operatingMode === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onChangeMode(item.id)}
          className={`${compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'} font-semibold whitespace-nowrap transition-colors`}
          style={{
            borderRadius: `calc(${radius} - 2px)`,
            backgroundColor: active ? p.surface : 'transparent',
            color: active ? p.text : p.textMuted,
            border: active ? `1px solid ${p.borderStrong}` : '1px solid transparent',
          }}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);

/* ============================================================================
   DASHBOARD A — EXECUTIVE COMMAND
   Editorial focal hierarchy, authoritative hero command center, generous breathing space
   ============================================================================ */
const ExecutiveCommandDashboard: React.FC<Omit<DashboardAlternativeProps, 'variant'>> = ({
  theme,
  isMobile,
  operatingMode,
  scenario,
  actions,
}) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[theme];
  const modeA = computeModeAHonestIndicators(scenario);
  const modeB = computeModeBStateMeta(scenario);
  const readiness = buildReadinessRows(scenario);

  const isModeA = operatingMode === 'mode_a';
  const modeARunning = scenario.modeASessionMode !== 'inactive';
  const modeALiveTransport =
    scenario.modeATransportState === 'connected_direct' || scenario.modeATransportState === 'connected_euler';

  const viewersDisplay =
    modeALiveTransport && scenario.viewerCount !== null ? scenario.viewerCount.toLocaleString('en-US') : '—';
  const likesDisplay =
    modeALiveTransport && scenario.likeCount !== null ? scenario.likeCount.toLocaleString('en-US') : '—';

  const hasModeABlocking = !modeA.hasValidTarget || scenario.overlayPermissionGranted === false || scenario.modeATransportState === 'error';
  const hasModeBBlocking =
    !modeB.rtmpValid ||
    scenario.notificationPermissionGranted === false ||
    modeB.needsScreenReshare ||
    scenario.modeBStatus === 'error' ||
    scenario.modeBStatus === 'disconnected';

  return (
    <div className={`${isMobile ? 'space-y-5' : 'max-w-4xl mx-auto space-y-7'}`}>
      {/* Top Quiet Mode Switcher & Preset Line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeSwitchSegment
          operatingMode={operatingMode}
          onChangeMode={actions.onChangeMode}
          p={p}
          radius={sys.radiusControl}
          compact={isMobile}
        />
        <div className="text-xs font-mono tabular-nums" style={{ color: p.textMuted }}>
          Scene: <span style={{ color: p.textSecondary }}>{scenario.activePresetName}</span> · {scenario.activePresetOrientation} ·{' '}
          {scenario.visibleElementsCount} elemen
        </div>
      </div>

      {/* Inline Alert Rail (Only when actionable blocking/recovery exists) */}
      {isModeA && hasModeABlocking && (
        <div
          className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: p.warnSoft,
            border: `1px solid ${p.warn}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: p.warn }} />
            <div className="text-xs leading-relaxed" style={{ color: p.text }}>
              {!modeA.hasValidTarget
                ? 'Username target TikTok belum diatur. Tetapkan @username sebelum menghubungkan event LIVE.'
                : scenario.overlayPermissionGranted === false
                ? 'Izin Floating Overlay Android belum aktif untuk menampilkan HUD di atas TikTok.'
                : scenario.modeAMessage}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!modeA.hasValidTarget && (
              <button
                type="button"
                onClick={actions.onConfigureTargetUsername}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Gunakan @syntxrr.atelier
              </button>
            )}
            {scenario.overlayPermissionGranted === false && (
              <button
                type="button"
                onClick={actions.onGrantOverlayPermission}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Aktifkan Izin Overlay
              </button>
            )}
          </div>
        </div>
      )}

      {!isModeA && hasModeBBlocking && (
        <div
          className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: modeB.needsScreenReshare || !modeB.rtmpValid ? p.errorSoft : p.warnSoft,
            border: `1px solid ${modeB.needsScreenReshare || !modeB.rtmpValid ? p.error : p.warn}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: modeB.needsScreenReshare || !modeB.rtmpValid ? p.error : p.warn }}
            />
            <div className="text-xs leading-relaxed" style={{ color: p.text }}>
              {!modeB.rtmpValid
                ? 'Konfigurasi Server RTMP & Stream Key belum lengkap. Siaran RTMP dikunci sampai siap.'
                : scenario.notificationPermissionGranted === false
                ? 'Izin notifikasi Android 13+ diperlukan agar foreground encoder berjalan aman.'
                : scenario.modeBMessage}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {modeB.needsScreenReshare && (
              <button
                type="button"
                onClick={actions.onRequestScreenReshare}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Minta Ulang Share Layar
              </button>
            )}
            {!modeB.rtmpValid && (
              <button
                type="button"
                onClick={actions.onCompleteRtmpConfig}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Lengkapi Key RTMP
              </button>
            )}
            {scenario.notificationPermissionGranted === false && (
              <button
                type="button"
                onClick={actions.onGrantNotificationPermission}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderRadius: sys.radiusControl,
                  border: `1px solid ${p.borderStrong}`,
                  backgroundColor: p.surface,
                  color: p.text,
                }}
              >
                Izinkan Notifikasi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Authoritative Executive Hero Command Block */}
      <section
        className={isMobile ? 'p-5 space-y-5' : 'p-8 space-y-6'}
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
          boxShadow: p.shadow,
        }}
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2.5 min-w-0">
            <div className="text-xs font-medium tracking-wide" style={{ color: p.textMuted }}>
              {isModeA ? (
                <>
                  <span>TikTok LIVE Companion · Bersama aplikasi TikTok resmi</span>
                  <span> · </span>
                  <span style={{ color: toneColor(modeA.modeASession.tone, p) }}>{modeA.modeASession.label}</span>
                </>
              ) : (
                <>
                  <span>Native RTMP Encoder · MediaProjection & H.264/AAC</span>
                  <span> · </span>
                  <span style={{ color: toneColor(modeB.tone, p) }}>{modeB.statusLabel}</span>
                </>
              )}
            </div>

            <h1
              className={isMobile ? 'text-2xl font-semibold tracking-tight' : 'text-3xl font-semibold tracking-tight'}
              style={{ fontFamily: sys.displayFont, color: p.text }}
            >
              {isModeA
                ? modeA.hasValidTarget
                  ? `@${scenario.targetUsername.replace(/^@+/, '')}`
                  : 'Target TikTok Belum Diatur'
                : modeB.statusLabel}
            </h1>

            <p className="text-xs sm:text-sm max-w-xl leading-relaxed" style={{ color: p.textSecondary }}>
              {isModeA ? scenario.modeAMessage : scenario.modeBMessage}
            </p>
          </div>

          {/* Primary & Immediate Operational Actions */}
          <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2.5 shrink-0">
            {isModeA ? (
              <>
                {!modeARunning ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={actions.onStartModeAConnect}
                      disabled={!modeA.hasValidTarget}
                      className="min-h-[44px] px-5 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: p.accent,
                        color: p.accentInk,
                      }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Mulai Sesi & Hubungkan Event</span>
                    </button>
                    <button
                      type="button"
                      onClick={actions.onStartModeAWithoutLive}
                      className="min-h-[44px] px-3.5 py-2.5 text-xs font-medium"
                      style={{
                        borderRadius: sys.radiusControl,
                        border: `1px solid ${p.borderStrong}`,
                        backgroundColor: p.surfaceMuted,
                        color: p.text,
                      }}
                    >
                      Tanpa Koneksi LIVE
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={actions.onStopModeA}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.errorSoft,
                      border: `1px solid ${p.error}`,
                      color: p.error,
                    }}
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Hentikan Sesi Companion</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {!modeB.canStop ? (
                  <button
                    type="button"
                    onClick={actions.onStartModeB}
                    disabled={!modeB.canStart}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.accent,
                      color: p.accentInk,
                    }}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Mulai Siaran RTMP</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={actions.onStopModeB}
                      className="min-h-[44px] px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: p.errorSoft,
                        border: `1px solid ${p.error}`,
                        color: p.error,
                      }}
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Hentikan Siaran</span>
                    </button>
                    {modeB.canToggleHostWait && (
                      <button
                        type="button"
                        onClick={actions.onToggleHostWait}
                        className="min-h-[44px] px-4 py-2.5 text-xs font-medium inline-flex items-center justify-center gap-2"
                        style={{
                          borderRadius: sys.radiusControl,
                          backgroundColor: scenario.modeBStatus === 'host_wait' ? p.warnSoft : p.surfaceMuted,
                          border: `1px solid ${scenario.modeBStatus === 'host_wait' ? p.warn : p.borderStrong}`,
                          color: scenario.modeBStatus === 'host_wait' ? p.warn : p.text,
                        }}
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>{scenario.modeBStatus === 'host_wait' ? 'Keluar Host Wait' : 'Host Wait'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hairline 3-Column Operational Metric Strip */}
        <div
          className={`grid pt-5 ${isMobile ? 'grid-cols-1 divide-y' : 'grid-cols-3 divide-x'}`}
          style={{ borderTop: `1px solid ${p.border}`, borderColor: p.border }}
        >
          {isModeA ? (
            <>
              <div className={isMobile ? 'pb-3' : 'pr-5'} style={{ borderColor: p.border }}>
                <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
                  Event Transport · Room
                </div>
                <div className="text-base font-semibold mt-1" style={{ color: toneColor(modeA.eventTransport.tone, p) }}>
                  {modeA.eventTransport.label}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  {modeA.roomStatus.label} · {scenario.connectionMethod === 'euler' ? 'EulerStream' : 'Direct TikTok'}
                </div>
              </div>

              <div className={isMobile ? 'py-3' : 'px-5'} style={{ borderColor: p.border }}>
                <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
                  Penonton LIVE
                </div>
                <div className="text-xl font-semibold font-mono tabular-nums mt-1" style={{ color: p.text }}>
                  {viewersDisplay}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  {modeALiveTransport ? 'Data room langsung' : 'Tidak tersedia sebelum terhubung'}
                </div>
              </div>

              <div className={isMobile ? 'pt-3' : 'pl-5'} style={{ borderColor: p.border }}>
                <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
                  Total Like
                </div>
                <div className="text-xl font-semibold font-mono tabular-nums mt-1" style={{ color: p.text }}>
                  {likesDisplay}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  OAuth: {modeA.accountLinked.label}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={isMobile ? 'pb-3' : 'pr-5'} style={{ borderColor: p.border }}>
                <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
                  Bitrate Encoder
                </div>
                <div className="text-xl font-semibold font-mono tabular-nums mt-1" style={{ color: p.text }}>
                  {modeB.bitrateDisplay}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  {scenario.modeBStreaming ? 'H.264 HW · AAC' : 'Tidak tersedia saat idle'}
                </div>
              </div>

              <div className={isMobile ? 'py-3' : 'px-5'} style={{ borderColor: p.border }}>
                <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
                  Sumber Audio Mode B
                </div>
                <div className="text-base font-semibold mt-1" style={{ color: p.text }}>
                  {audioSourceLabel(scenario.audioSource)}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  {scenario.screenCaptureLayerInPreset ? 'Layer Screen Capture aktif' : 'Hanya kamera/overlay'}
                </div>
              </div>

              <div className={isMobile ? 'pt-3' : 'pl-5'} style={{ borderColor: p.border }}>
                <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
                  Endpoint RTMP
                </div>
                <div className="text-sm font-mono truncate mt-1" style={{ color: modeB.rtmpValid ? p.text : p.error }}>
                  {modeB.rtmpValid ? scenario.rtmpEndpointLabel : 'Belum lengkap'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  Notifikasi: {scenario.notificationPermissionGranted ? 'Aktif' : scenario.notificationPermissionGranted === null ? 'Belum diperiksa' : 'Perlu izin'}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Quiet Supporting Operational Bar (HUD or Audio Source + Readiness Check) */}
      <section className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-12'}`}>
        <div
          className={`${isMobile ? '' : 'col-span-7'} p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3`}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          {isModeA ? (
            <>
              <div className="min-w-0">
                <div className="text-xs font-semibold" style={{ color: p.text }}>
                  Floating HUD Android · {scenario.hudVisible ? 'Sedang Tampil' : 'Tersembunyi'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  Overlay permission:{' '}
                  <span style={{ color: scenario.overlayPermissionGranted ? p.ok : p.warn }}>
                    {scenario.overlayPermissionGranted === null
                      ? 'Belum diperiksa'
                      : scenario.overlayPermissionGranted
                      ? 'Diizinkan'
                      : 'Belum diizinkan'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={actions.onShowHud}
                  disabled={scenario.hudVisible}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: p.accentSoft,
                    border: `1px solid ${p.accent}`,
                    color: p.accentText,
                  }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Tampilkan HUD</span>
                </button>
                <button
                  type="button"
                  onClick={actions.onHideHud}
                  disabled={!scenario.hudVisible}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-45"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${p.border}`,
                    backgroundColor: p.surfaceMuted,
                    color: p.text,
                  }}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Sembunyikan</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-xs font-semibold" style={{ color: p.text }}>
                  Pilih Audio Siaran RTMP
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
                  Mengatur sumber audio encoder Android saat live
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['mix', 'internal', 'microphone'] as ModeBAudioSource[]).map((src) => {
                  const active = scenario.audioSource === src;
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => actions.onChangeAudioSource(src)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                        border: `1px solid ${active ? p.accent : p.border}`,
                        color: active ? p.accentText : p.textSecondary,
                      }}
                    >
                      {src === 'mix' ? 'Mix' : src === 'internal' ? 'Internal' : 'Mic'}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Quiet Hardware Readiness Summary */}
        <div
          className={`${isMobile ? '' : 'col-span-5'} p-4 sm:p-5 flex items-center justify-between gap-3`}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: p.text }}>
              Kesiapan Hardware & Izin
            </div>
            <div className="text-[11px] mt-0.5 truncate" style={{ color: p.textMuted }}>
              {scenario.hardwareCheckState === 'unchecked'
                ? 'Kamera, Mic & Capture: Belum diperiksa'
                : `${readiness.filter((r) => r.tone === 'ok').length}/${readiness.length} terverifikasi`}
            </div>
          </div>
          <button
            type="button"
            onClick={actions.onRunHardwareCheck}
            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold shrink-0 inline-flex items-center gap-1.5"
            style={{
              borderRadius: sys.radiusControl,
              border: `1px solid ${p.borderStrong}`,
              backgroundColor: p.surfaceMuted,
              color: p.text,
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{scenario.hardwareCheckState === 'unchecked' ? 'Periksa' : 'Uji Ulang'}</span>
          </button>
        </div>
      </section>
    </div>
  );
};

/* ============================================================================
   DASHBOARD B — BROADCAST OVERVIEW
   Control-console grid, compact technical master bus, structured telemetry & readiness bays
   ============================================================================ */
const BroadcastOverviewDashboard: React.FC<Omit<DashboardAlternativeProps, 'variant'>> = ({
  theme,
  isMobile,
  operatingMode,
  scenario,
  actions,
}) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[theme];
  const modeA = computeModeAHonestIndicators(scenario);
  const modeB = computeModeBStateMeta(scenario);
  const readiness = buildReadinessRows(scenario);

  const isModeA = operatingMode === 'mode_a';
  const modeARunning = scenario.modeASessionMode !== 'inactive';
  const modeALiveTransport =
    scenario.modeATransportState === 'connected_direct' || scenario.modeATransportState === 'connected_euler';

  return (
    <div className="space-y-4">
      {/* Compact Master Console Bus Bar */}
      <section
        className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.borderStrong}`,
          borderRadius: sys.radiusControl,
        }}
      >
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <ModeSwitchSegment
            operatingMode={operatingMode}
            onChangeMode={actions.onChangeMode}
            p={p}
            radius={sys.radiusControl}
            compact
          />
          <div className="text-xs font-mono tabular-nums" style={{ color: p.textSecondary }}>
            {isModeA ? (
              <>
                <span style={{ color: toneColor(modeA.modeASession.tone, p) }}>{modeA.modeASession.label}</span>
                <span> / </span>
                <span style={{ color: toneColor(modeA.eventTransport.tone, p) }}>{modeA.eventTransport.label}</span>
              </>
            ) : (
              <>
                <span style={{ color: toneColor(modeB.tone, p) }}>{modeB.statusLabel}</span>
                <span> / </span>
                <span>{modeB.bitrateDisplay}</span>
              </>
            )}
          </div>
        </div>

        {/* Immediate Console Execution Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isModeA ? (
            !modeARunning ? (
              <>
                <button
                  type="button"
                  onClick={actions.onStartModeAConnect}
                  disabled={!modeA.hasValidTarget}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold disabled:opacity-45"
                  style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                >
                  Start & Connect
                </button>
                <button
                  type="button"
                  onClick={actions.onStartModeAWithoutLive}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-medium"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${p.borderStrong}`,
                    backgroundColor: p.surfaceMuted,
                    color: p.text,
                  }}
                >
                  Companion Only
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={actions.onStopModeA}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: p.errorSoft,
                  border: `1px solid ${p.error}`,
                  color: p.error,
                }}
              >
                Stop Companion
              </button>
            )
          ) : !modeB.canStop ? (
            <button
              type="button"
              onClick={actions.onStartModeB}
              disabled={!modeB.canStart}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold disabled:opacity-45"
              style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
            >
              Start RTMP
            </button>
          ) : (
            <>
              {modeB.needsScreenReshare && (
                <button
                  type="button"
                  onClick={actions.onRequestScreenReshare}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                  style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                >
                  Reshare Screen
                </button>
              )}
              {modeB.canToggleHostWait && (
                <button
                  type="button"
                  onClick={actions.onToggleHostWait}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-medium"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${scenario.modeBStatus === 'host_wait' ? p.warn : p.borderStrong}`,
                    backgroundColor: scenario.modeBStatus === 'host_wait' ? p.warnSoft : p.surfaceMuted,
                    color: scenario.modeBStatus === 'host_wait' ? p.warn : p.text,
                  }}
                >
                  {scenario.modeBStatus === 'host_wait' ? 'Resume Live' : 'Host Wait'}
                </button>
              )}
              <button
                type="button"
                onClick={actions.onStopModeB}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: p.errorSoft,
                  border: `1px solid ${p.error}`,
                  color: p.error,
                }}
              >
                Stop RTMP
              </button>
            </>
          )}
        </div>
      </section>

      {/* Main 12-Column Broadcast Console Grid */}
      <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-12'}`}>
        {/* Left 7 Columns: Pipeline State + Live Telemetry Matrix + Recovery Log */}
        <div className={`${isMobile ? '' : 'col-span-7'} space-y-4`}>
          <section
            className="p-4 space-y-3"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusControl,
            }}
          >
            <div className="flex items-center justify-between pb-2" style={{ borderBottom: `1px solid ${p.border}` }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
                {isModeA ? 'Mode A · Transport & Room Matrix' : 'Mode B · RTMP Encoder Pipeline'}
              </div>
              <div className="text-[11px] font-mono" style={{ color: p.textSecondary }}>
                {scenario.activePresetName} ({scenario.activePresetOrientation})
              </div>
            </div>

            {isModeA ? (
              <div className="space-y-2">
                <div className="text-xs leading-relaxed" style={{ color: p.textSecondary }}>
                  Mode A berjalan <strong style={{ color: p.text }}>bersama aplikasi TikTok resmi</strong> (bukan menggantikan tombol Go Live TikTok).
                </div>
                <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {[
                    { k: 'TARGET LIVE', v: modeA.hasValidTarget ? `@${scenario.targetUsername.replace(/^@+/, '')}` : 'Belum diatur', sub: modeA.accountLinked.label, tone: modeA.hasValidTarget ? ('ok' as const) : ('error' as const) },
                    { k: 'COMPANION SERVICE', v: modeA.modeASession.label, sub: modeA.modeASession.detail, tone: modeA.modeASession.tone },
                    { k: 'ROOM STATUS', v: modeA.roomStatus.label, sub: scenario.connectionMethod === 'euler' ? 'Via EulerStream' : 'Direct TikTok WS', tone: modeA.roomStatus.tone },
                    { k: 'EVENT TRANSPORT', v: modeA.eventTransport.label, sub: modeA.eventTransport.detail, tone: modeA.eventTransport.tone },
                  ].map((cell) => (
                    <div
                      key={cell.k}
                      className="p-2.5"
                      style={{
                        backgroundColor: p.surfaceMuted,
                        border: `1px solid ${p.border}`,
                        borderRadius: sys.radiusControl,
                      }}
                    >
                      <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                        {cell.k}
                      </div>
                      <div className="text-xs font-semibold mt-0.5 truncate" style={{ color: toneColor(cell.tone, p) }}>
                        {cell.v}
                      </div>
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: p.textMuted }}>
                        {cell.sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {[
                  { k: 'ENCODER STATE', v: modeB.statusLabel, sub: scenario.modeBMessage, tone: modeB.tone },
                  { k: 'BITRATE STREAM', v: modeB.bitrateDisplay, sub: scenario.modeBStreaming ? 'Output aktif' : 'Tidak tersedia saat idle', tone: scenario.modeBStreaming ? ('ok' as const) : ('neutral' as const) },
                  { k: 'INGEST ENDPOINT', v: modeB.rtmpValid ? scenario.rtmpEndpointLabel : 'Server / Key belum lengkap', sub: modeB.rtmpValid ? 'Stream Key terisi' : 'Lengkapi URL & Stream Key', tone: modeB.rtmpValid ? ('ok' as const) : ('error' as const) },
                  { k: 'COMPOSITOR LAYER', v: scenario.screenCaptureLayerInPreset ? 'Screen Capture + Overlay' : 'Kamera + Overlay', sub: `${scenario.visibleElementsCount} elemen aktif`, tone: 'neutral' as const },
                ].map((cell) => (
                  <div
                    key={cell.k}
                    className="p-2.5"
                    style={{
                      backgroundColor: p.surfaceMuted,
                      border: `1px solid ${p.border}`,
                      borderRadius: sys.radiusControl,
                    }}
                  >
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      {cell.k}
                    </div>
                    <div className="text-xs font-semibold font-mono truncate mt-0.5" style={{ color: toneColor(cell.tone, p) }}>
                      {cell.v}
                    </div>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: p.textMuted }}>
                      {cell.sub}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Live Numeric Readout Row */}
            <div
              className="grid grid-cols-3 pt-2.5 text-xs"
              style={{ borderTop: `1px solid ${p.border}` }}
            >
              {isModeA ? (
                <>
                  <div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      VIEWERS
                    </div>
                    <div className="text-sm font-mono font-semibold tabular-nums mt-0.5" style={{ color: p.text }}>
                      {modeALiveTransport && scenario.viewerCount !== null ? scenario.viewerCount.toLocaleString('en-US') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      TOTAL LIKES
                    </div>
                    <div className="text-sm font-mono font-semibold tabular-nums mt-0.5" style={{ color: p.text }}>
                      {modeALiveTransport && scenario.likeCount !== null ? scenario.likeCount.toLocaleString('en-US') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      TRANSPORT
                    </div>
                    <button
                      type="button"
                      onClick={actions.onToggleModeAMethod}
                      className="text-xs font-mono font-semibold mt-0.5 underline underline-offset-2"
                      style={{ color: p.accentText }}
                    >
                      {scenario.connectionMethod === 'direct' ? 'Direct WS' : 'EulerStream'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      OUTPUT
                    </div>
                    <div className="text-sm font-mono font-semibold tabular-nums mt-0.5" style={{ color: p.text }}>
                      {scenario.activePresetOrientation}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      AUDIO BUS
                    </div>
                    <div className="text-sm font-semibold mt-0.5" style={{ color: p.text }}>
                      {audioSourceLabel(scenario.audioSource)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                      ELEMEN
                    </div>
                    <div className="text-sm font-mono font-semibold tabular-nums mt-0.5" style={{ color: p.text }}>
                      {scenario.visibleElementsCount} aktif
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Transport / Encoder Diagnostic Notice Bay */}
          <section
            className="p-3.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
            style={{
              backgroundColor:
                (!isModeA && (modeB.needsScreenReshare || !modeB.rtmpValid)) ||
                (isModeA && (!modeA.hasValidTarget || scenario.modeATransportState === 'error'))
                  ? p.errorSoft
                  : p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusControl,
            }}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase" style={{ color: p.textMuted }}>
                LOG STATUS OPERASIONAL
              </div>
              <div className="mt-0.5" style={{ color: p.text }}>
                {isModeA ? scenario.modeAMessage : scenario.modeBMessage}
              </div>
            </div>
            {!modeA.hasValidTarget && isModeA && (
              <button
                type="button"
                onClick={actions.onConfigureTargetUsername}
                className="px-3 py-1.5 text-xs font-semibold shrink-0"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Set @syntxrr.atelier
              </button>
            )}
            {!modeB.rtmpValid && !isModeA && (
              <button
                type="button"
                onClick={actions.onCompleteRtmpConfig}
                className="px-3 py-1.5 text-xs font-semibold shrink-0"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Isi RTMP Key
              </button>
            )}
          </section>
        </div>

        {/* Right 5 Columns: Android Permissions, Source Readiness & HUD / Audio Console */}
        <div className={`${isMobile ? '' : 'col-span-5'} space-y-4`}>
          {/* HUD or Audio Source Console Bay */}
          <section
            className="p-4 space-y-3"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusControl,
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
              {isModeA ? 'Floating HUD Console' : 'Mode B Audio Source Selector'}
            </div>

            {isModeA ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: p.textSecondary }}>Status HUD</span>
                  <span className="font-mono font-semibold" style={{ color: scenario.hudVisible ? p.ok : p.textMuted }}>
                    {scenario.hudVisible ? 'VISIBLE' : 'HIDDEN'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={actions.onShowHud}
                    disabled={scenario.hudVisible}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold disabled:opacity-45"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.accent,
                      color: p.accentInk,
                    }}
                  >
                    Show HUD
                  </button>
                  <button
                    type="button"
                    onClick={actions.onHideHud}
                    disabled={!scenario.hudVisible}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium disabled:opacity-45"
                    style={{
                      borderRadius: sys.radiusControl,
                      border: `1px solid ${p.borderStrong}`,
                      backgroundColor: p.surfaceMuted,
                      color: p.text,
                    }}
                  >
                    Hide HUD
                  </button>
                </div>
                {scenario.overlayPermissionGranted === false && (
                  <button
                    type="button"
                    onClick={actions.onGrantOverlayPermission}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.warnSoft,
                      border: `1px solid ${p.warn}`,
                      color: p.warn,
                    }}
                  >
                    Beri Izin Overlay Android
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {(['mix', 'internal', 'microphone'] as ModeBAudioSource[]).map((src) => {
                  const active = scenario.audioSource === src;
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => actions.onChangeAudioSource(src)}
                      className="min-h-[40px] px-2 py-1.5 text-xs font-semibold"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                        border: `1px solid ${active ? p.accent : p.border}`,
                        color: active ? p.accentText : p.textSecondary,
                      }}
                    >
                      {src === 'mix' ? 'Mix' : src === 'internal' ? 'Internal' : 'Mic'}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Tabular Source & Permission Readiness Inspector */}
          <section
            className="p-4 space-y-2.5"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusControl,
            }}
          >
            <div className="flex items-center justify-between pb-2" style={{ borderBottom: `1px solid ${p.border}` }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
                Source & Android Izin
              </div>
              <button
                type="button"
                onClick={actions.onRunHardwareCheck}
                className="text-[11px] font-semibold underline underline-offset-2"
                style={{ color: p.accentText }}
              >
                {scenario.hardwareCheckState === 'unchecked' ? 'Periksa Sekarang' : 'Periksa Ulang'}
              </button>
            </div>

            <div className="divide-y" style={{ borderColor: p.border }}>
              {readiness.map((row) => (
                <div key={row.id} className="py-2 flex items-center justify-between gap-2 text-xs" style={{ borderColor: p.border }}>
                  <span className="truncate" style={{ color: p.textSecondary }}>
                    {row.label}
                  </span>
                  <span
                    className="font-mono text-[11px] font-medium shrink-0"
                    style={{ color: toneColor(row.tone, p) }}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   DASHBOARD C — MINIMAL FOCUS
   Shows strictly active mode's core controls & readouts; secondary panels collapsed cleanly
   ============================================================================ */
const MinimalFocusDashboard: React.FC<Omit<DashboardAlternativeProps, 'variant'>> = ({
  theme,
  isMobile,
  operatingMode,
  scenario,
  actions,
}) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[theme];
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);

  const modeA = computeModeAHonestIndicators(scenario);
  const modeB = computeModeBStateMeta(scenario);
  const readiness = buildReadinessRows(scenario);

  const isModeA = operatingMode === 'mode_a';
  const modeARunning = scenario.modeASessionMode !== 'inactive';
  const modeALiveTransport =
    scenario.modeATransportState === 'connected_direct' || scenario.modeATransportState === 'connected_euler';

  const blockingNote = isModeA
    ? !modeA.hasValidTarget
      ? 'Username target TikTok belum diisi'
      : scenario.overlayPermissionGranted === false
      ? 'Izin Floating Overlay belum diaktifkan'
      : scenario.modeATransportState === 'error'
      ? scenario.modeAMessage
      : null
    : !modeB.rtmpValid
    ? 'Konfigurasi RTMP URL / Stream Key belum lengkap'
    : modeB.needsScreenReshare
    ? 'Capture layar Android terputus — perlu share layar ulang'
    : scenario.notificationPermissionGranted === false
    ? 'Izin Notifikasi Android 13+ diperlukan'
    : scenario.modeBStatus === 'error'
    ? scenario.modeBMessage
    : null;

  return (
    <div className={`${isMobile ? 'space-y-4' : 'max-w-2xl mx-auto space-y-6'}`}>
      {/* Calm Mode Switcher */}
      <div className="flex items-center justify-between gap-2">
        <ModeSwitchSegment
          operatingMode={operatingMode}
          onChangeMode={actions.onChangeMode}
          p={p}
          radius={sys.radiusControl}
          compact
        />
        <span className="text-[11px] font-mono tabular-nums" style={{ color: p.textMuted }}>
          {scenario.activePresetName}
        </span>
      </div>

      {/* Serene Single-Focus Operational Card */}
      <section
        className={isMobile ? 'p-5 space-y-5' : 'p-7 space-y-6'}
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
          boxShadow: p.shadow,
        }}
      >
        <div className="space-y-2">
          <div className="text-xs font-medium" style={{ color: p.textMuted }}>
            {isModeA
              ? `Companion di aplikasi TikTok resmi · ${modeA.eventTransport.label}`
              : `Encoder RTMP Native · ${audioSourceLabel(scenario.audioSource)}`}
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1
              className={isMobile ? 'text-2xl font-semibold tracking-tight' : 'text-3xl font-semibold tracking-tight'}
              style={{ fontFamily: sys.displayFont, color: p.text }}
            >
              {isModeA ? modeA.modeASession.label : modeB.statusLabel}
            </h1>

            <span className="text-lg font-mono font-semibold tabular-nums" style={{ color: p.accentText }}>
              {isModeA
                ? modeALiveTransport && scenario.viewerCount !== null
                  ? `${scenario.viewerCount.toLocaleString('en-US')} viewers`
                  : '— viewers'
                : modeB.bitrateDisplay}
            </span>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: p.textSecondary }}>
            {isModeA ? scenario.modeAMessage : scenario.modeBMessage}
          </p>
        </div>

        {/* Single Concise Blocking Notice only when triggered */}
        {blockingNote && (
          <div
            className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{
              backgroundColor: p.warnSoft,
              border: `1px solid ${p.warn}`,
              borderRadius: sys.radiusControl,
              color: p.text,
            }}
          >
            <span>{blockingNote}</span>
            {isModeA && !modeA.hasValidTarget && (
              <button
                type="button"
                onClick={actions.onConfigureTargetUsername}
                className="font-semibold underline underline-offset-2"
                style={{ color: p.accentText }}
              >
                Set @syntxrr.atelier
              </button>
            )}
            {isModeA && scenario.overlayPermissionGranted === false && (
              <button
                type="button"
                onClick={actions.onGrantOverlayPermission}
                className="font-semibold underline underline-offset-2"
                style={{ color: p.accentText }}
              >
                Buka Izin Overlay
              </button>
            )}
            {!isModeA && modeB.needsScreenReshare && (
              <button
                type="button"
                onClick={actions.onRequestScreenReshare}
                className="font-semibold underline underline-offset-2"
                style={{ color: p.accentText }}
              >
                Share Layar Ulang
              </button>
            )}
            {!isModeA && !modeB.rtmpValid && (
              <button
                type="button"
                onClick={actions.onCompleteRtmpConfig}
                className="font-semibold underline underline-offset-2"
                style={{ color: p.accentText }}
              >
                Isi Stream Key
              </button>
            )}
          </div>
        )}

        {/* Primary Thumb-Friendly Actions (Strictly Active Mode) */}
        {isModeA ? (
          <div className="space-y-2.5">
            {!modeARunning ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={actions.onStartModeAConnect}
                  disabled={!modeA.hasValidTarget}
                  className="min-h-[46px] px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                  style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                >
                  <Play className="w-4 h-4" />
                  <span>Mulai Sesi Companion</span>
                </button>
                <button
                  type="button"
                  onClick={actions.onStartModeAWithoutLive}
                  className="min-h-[46px] px-4 py-2.5 text-xs font-medium"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${p.borderStrong}`,
                    backgroundColor: p.surfaceMuted,
                    color: p.text,
                  }}
                >
                  Tanpa Koneksi LIVE
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={scenario.hudVisible ? actions.onHideHud : actions.onShowHud}
                  className="min-h-[46px] px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2"
                  style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                >
                  {scenario.hudVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{scenario.hudVisible ? 'Sembunyikan HUD' : 'Tampilkan HUD'}</span>
                </button>
                <button
                  type="button"
                  onClick={actions.onStopModeA}
                  className="min-h-[46px] px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: p.errorSoft,
                    border: `1px solid ${p.error}`,
                    color: p.error,
                  }}
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Hentikan Sesi</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {!modeB.canStop ? (
                <button
                  type="button"
                  onClick={actions.onStartModeB}
                  disabled={!modeB.canStart}
                  className="flex-1 min-h-[46px] px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                  style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                >
                  <Radio className="w-4 h-4" />
                  <span>Mulai Siaran RTMP</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={actions.onStopModeB}
                    className="flex-1 min-h-[46px] px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.errorSoft,
                      border: `1px solid ${p.error}`,
                      color: p.error,
                    }}
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Hentikan Siaran</span>
                  </button>
                  {modeB.canToggleHostWait && (
                    <button
                      type="button"
                      onClick={actions.onToggleHostWait}
                      className="min-h-[46px] px-4 py-2.5 text-xs font-medium"
                      style={{
                        borderRadius: sys.radiusControl,
                        border: `1px solid ${scenario.modeBStatus === 'host_wait' ? p.warn : p.borderStrong}`,
                        backgroundColor: scenario.modeBStatus === 'host_wait' ? p.warnSoft : p.surfaceMuted,
                        color: scenario.modeBStatus === 'host_wait' ? p.warn : p.text,
                      }}
                    >
                      {scenario.modeBStatus === 'host_wait' ? 'Keluar Host Wait' : 'Host Wait'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Minimal Audio Source Strip */}
            <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: `1px solid ${p.border}` }}>
              <span className="text-xs" style={{ color: p.textMuted }}>
                Audio RTMP
              </span>
              <div className="flex items-center gap-1.5">
                {(['mix', 'internal', 'microphone'] as ModeBAudioSource[]).map((src) => {
                  const active = scenario.audioSource === src;
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => actions.onChangeAudioSource(src)}
                      className="px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                        border: `1px solid ${active ? p.accent : p.border}`,
                        color: active ? p.accentText : p.textSecondary,
                      }}
                    >
                      {src === 'mix' ? 'Mix' : src === 'internal' ? 'Internal' : 'Mic'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Progressive Disclosure Drawers (Collapsed by Default) */}
      <div className="space-y-2">
        <div
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <button
            type="button"
            onClick={() => setShowDiagnostics((v) => !v)}
            className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-xs font-medium"
            style={{ color: p.text }}
          >
            <span>
              {isModeA ? 'Detail Room, Transport & HUD' : 'Detail RTMP, Scene & Output'}
            </span>
            {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDiagnostics && (
            <div className="px-4 pb-3.5 pt-1 space-y-2 text-xs" style={{ borderTop: `1px solid ${p.border}` }}>
              {isModeA ? (
                <>
                  <div className="flex justify-between py-1">
                    <span style={{ color: p.textMuted }}>Target LIVE</span>
                    <span className="font-mono" style={{ color: p.text }}>
                      {modeA.hasValidTarget ? `@${scenario.targetUsername.replace(/^@+/, '')}` : 'Belum diatur'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span style={{ color: p.textMuted }}>Status Room</span>
                    <span style={{ color: toneColor(modeA.roomStatus.tone, p) }}>{modeA.roomStatus.label}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span style={{ color: p.textMuted }}>Total Like</span>
                    <span className="font-mono tabular-nums" style={{ color: p.text }}>
                      {modeALiveTransport && scenario.likeCount !== null ? scenario.likeCount.toLocaleString('en-US') : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span style={{ color: p.textMuted }}>Metode Event</span>
                    <button
                      type="button"
                      onClick={actions.onToggleModeAMethod}
                      className="underline underline-offset-2 font-medium"
                      style={{ color: p.accentText }}
                    >
                      {scenario.connectionMethod === 'direct' ? 'Direct TikTok WS' : 'EulerStream WS'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between py-1">
                    <span style={{ color: p.textMuted }}>Server RTMP</span>
                    <span className="font-mono truncate max-w-[60%]" style={{ color: p.text }}>
                      {modeB.rtmpValid ? scenario.rtmpEndpointLabel : 'Belum lengkap'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span style={{ color: p.textMuted }}>Orientasi & Elemen</span>
                    <span className="font-mono tabular-nums" style={{ color: p.text }}>
                      {scenario.activePresetOrientation} · {scenario.visibleElementsCount} elemen
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <button
            type="button"
            onClick={() => setShowReadiness((v) => !v)}
            className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-xs font-medium"
            style={{ color: p.text }}
          >
            <span>
              Kesiapan Hardware & Izin Android ·{' '}
              <span style={{ color: p.textMuted }}>
                {scenario.hardwareCheckState === 'unchecked' ? 'Belum diperiksa' : 'Terperiksa'}
              </span>
            </span>
            {showReadiness ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showReadiness && (
            <div className="px-4 pb-3.5 pt-2 space-y-2.5 text-xs" style={{ borderTop: `1px solid ${p.border}` }}>
              {readiness.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2">
                  <span style={{ color: p.textSecondary }}>{row.label}</span>
                  <span className="font-mono text-[11px]" style={{ color: toneColor(row.tone, p) }}>
                    {row.status}
                  </span>
                </div>
              ))}
              <button
                type="button"
                onClick={actions.onRunHardwareCheck}
                className="w-full min-h-[38px] mt-1 px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderRadius: sys.radiusControl,
                  border: `1px solid ${p.borderStrong}`,
                  backgroundColor: p.surfaceMuted,
                  color: p.text,
                }}
              >
                Periksa Kesiapan Perangkat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   DASHBOARD D — ADAPTIVE OPERATIONS
   Context-aware D+ flagship balance: promotes recovery when degraded; calm asymmetric 8/4 desktop & rhythmic mobile
   ============================================================================ */
const AdaptiveOperationsDashboard: React.FC<Omit<DashboardAlternativeProps, 'variant'>> = ({
  theme,
  isMobile,
  operatingMode,
  scenario,
  actions,
}) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[theme];
  const [mobileReadinessOpen, setMobileReadinessOpen] = useState(false);

  const modeA = computeModeAHonestIndicators(scenario);
  const modeB = computeModeBStateMeta(scenario);
  const readiness = buildReadinessRows(scenario);

  const isModeA = operatingMode === 'mode_a';
  const modeARunning = scenario.modeASessionMode !== 'inactive';
  const modeALiveTransport =
    scenario.modeATransportState === 'connected_direct' || scenario.modeATransportState === 'connected_euler';

  const needsAttention = isModeA
    ? !modeA.hasValidTarget ||
      scenario.overlayPermissionGranted === false ||
      scenario.modeASessionMode === 'without_live_connection' ||
      scenario.modeATransportState === 'error'
    : !modeB.rtmpValid ||
      scenario.notificationPermissionGranted === false ||
      modeB.needsScreenReshare ||
      scenario.modeBStatus === 'error' ||
      scenario.modeBStatus === 'disconnected';

  return (
    <div className="space-y-5">
      {/* Context-Aware Recovery / Warning Slot (Auto-promotes ONLY when needed) */}
      {needsAttention && (
        <section
          className="p-4 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor:
              (!isModeA && (modeB.needsScreenReshare || !modeB.rtmpValid)) ||
              (isModeA && (!modeA.hasValidTarget || scenario.modeATransportState === 'error'))
                ? p.errorSoft
                : p.warnSoft,
            border: `1px solid ${
              (!isModeA && (modeB.needsScreenReshare || !modeB.rtmpValid)) ||
              (isModeA && (!modeA.hasValidTarget || scenario.modeATransportState === 'error'))
                ? p.error
                : p.warn
            }`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{
                color:
                  (!isModeA && (modeB.needsScreenReshare || !modeB.rtmpValid)) ||
                  (isModeA && (!modeA.hasValidTarget || scenario.modeATransportState === 'error'))
                    ? p.error
                    : p.warn,
              }}
            />
            <div className="text-xs leading-relaxed" style={{ color: p.text }}>
              {isModeA
                ? !modeA.hasValidTarget
                  ? 'Target @username TikTok belum dikonfigurasi. Lengkapi sebelum menghubungkan transport LIVE.'
                  : scenario.overlayPermissionGranted === false
                  ? 'Izin SYSTEM_ALERT_WINDOW belum aktif — Floating HUD tidak dapat tampil di atas TikTok.'
                  : scenario.modeASessionMode === 'without_live_connection'
                  ? 'Mode A berjalan tanpa koneksi event LIVE: chat, gift & follow tidak masuk ke HUD.'
                  : scenario.modeAMessage
                : !modeB.rtmpValid
                ? 'Server RTMP & Stream Key belum lengkap — tombol Mulai Siaran dinonaktifkan.'
                : modeB.needsScreenReshare
                ? 'Capture layar Android terputus. Tekan Minta Ulang Share Layar untuk memulihkan visual.'
                : scenario.notificationPermissionGranted === false
                ? 'Izin notifikasi Android 13+ belum aktif untuk foreground RTMP service.'
                : scenario.modeBMessage}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isModeA && !modeA.hasValidTarget && (
              <button
                type="button"
                onClick={actions.onConfigureTargetUsername}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Atur @syntxrr.atelier
              </button>
            )}
            {isModeA && scenario.overlayPermissionGranted === false && (
              <button
                type="button"
                onClick={actions.onGrantOverlayPermission}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Aktifkan Izin Overlay
              </button>
            )}
            {!isModeA && modeB.needsScreenReshare && (
              <button
                type="button"
                onClick={actions.onRequestScreenReshare}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Minta Ulang Share Layar
              </button>
            )}
            {!isModeA && !modeB.rtmpValid && (
              <button
                type="button"
                onClick={actions.onCompleteRtmpConfig}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                Lengkapi RTMP
              </button>
            )}
            {!isModeA && scenario.notificationPermissionGranted === false && (
              <button
                type="button"
                onClick={actions.onGrantNotificationPermission}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderRadius: sys.radiusControl,
                  border: `1px solid ${p.borderStrong}`,
                  backgroundColor: p.surface,
                  color: p.text,
                }}
              >
                Izinkan Notifikasi
              </button>
            )}
          </div>
        </section>
      )}

      {/* Main Balanced Asymmetric Layout: 8 cols Operational Deck + 4 cols Scene & Readiness Context */}
      <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-12'}`}>
        <div className={`${isMobile ? '' : 'col-span-8'} space-y-5`}>
          {/* Hero Mode Control Deck */}
          <section
            className="p-5 sm:p-6 space-y-5"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
              boxShadow: p.shadow,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ModeSwitchSegment
                operatingMode={operatingMode}
                onChangeMode={actions.onChangeMode}
                p={p}
                radius={sys.radiusControl}
                compact={isMobile}
              />
              <span
                className="text-xs font-medium"
                style={{
                  color: isModeA ? toneColor(modeA.modeASession.tone, p) : toneColor(modeB.tone, p),
                }}
              >
                {isModeA ? modeA.modeASession.label : modeB.statusLabel}
              </span>
            </div>

            <div className="space-y-1.5">
              <h1
                className="text-xl sm:text-2xl font-semibold tracking-tight"
                style={{ fontFamily: sys.displayFont, color: p.text }}
              >
                {isModeA
                  ? 'Mode A — TikTok LIVE Companion'
                  : 'Mode B — Native RTMP Encoder'}
              </h1>
              <p className="text-xs leading-relaxed" style={{ color: p.textSecondary }}>
                {isModeA
                  ? 'Berjalan bersama aplikasi TikTok resmi: mengelola Floating HUD, event listener chat/gift/follow, TTS, dan soundboard tanpa menggantikan proses Go Live TikTok.'
                  : 'Encoder native Android (MediaProjection + H.264/AAC) mengirim video komposisi Studio langsung ke endpoint RTMP.'}
              </p>
            </div>

            {/* Primary Actions */}
            {isModeA ? (
              <div className="flex flex-wrap items-center gap-2.5">
                {!modeARunning ? (
                  <>
                    <button
                      type="button"
                      onClick={actions.onStartModeAConnect}
                      disabled={!modeA.hasValidTarget}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-45"
                      style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Mulai Sesi & Hubungkan Event</span>
                    </button>
                    <button
                      type="button"
                      onClick={actions.onStartModeAWithoutLive}
                      className="min-h-[44px] px-3.5 py-2 text-xs font-medium"
                      style={{
                        borderRadius: sys.radiusControl,
                        border: `1px solid ${p.borderStrong}`,
                        backgroundColor: p.surfaceMuted,
                        color: p.text,
                      }}
                    >
                      Tanpa Koneksi LIVE
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={actions.onStopModeA}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold inline-flex items-center gap-2"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.errorSoft,
                      border: `1px solid ${p.error}`,
                      color: p.error,
                    }}
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Hentikan Sesi Companion</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={actions.onToggleModeAMethod}
                  className="min-h-[44px] px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${p.border}`,
                    backgroundColor: p.surfaceMuted,
                    color: p.textSecondary,
                  }}
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{scenario.connectionMethod === 'direct' ? 'Direct WS' : 'EulerStream'}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                {!modeB.canStop ? (
                  <button
                    type="button"
                    onClick={actions.onStartModeB}
                    disabled={!modeB.canStart}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-45"
                    style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Mulai Siaran RTMP</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={actions.onStopModeB}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold inline-flex items-center gap-2"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: p.errorSoft,
                        border: `1px solid ${p.error}`,
                        color: p.error,
                      }}
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Hentikan Siaran</span>
                    </button>
                    {modeB.canToggleHostWait && (
                      <button
                        type="button"
                        onClick={actions.onToggleHostWait}
                        className="min-h-[44px] px-3.5 py-2 text-xs font-medium inline-flex items-center gap-2"
                        style={{
                          borderRadius: sys.radiusControl,
                          border: `1px solid ${scenario.modeBStatus === 'host_wait' ? p.warn : p.borderStrong}`,
                          backgroundColor: scenario.modeBStatus === 'host_wait' ? p.warnSoft : p.surfaceMuted,
                          color: scenario.modeBStatus === 'host_wait' ? p.warn : p.text,
                        }}
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>{scenario.modeBStatus === 'host_wait' ? 'Keluar Host Wait' : 'Host Wait'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Honest 4-Cell Indicator Matrix (Mode A) or RTMP Pipeline Strip (Mode B) */}
            {isModeA ? (
              <div className={`grid gap-2.5 pt-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`} style={{ borderTop: `1px solid ${p.border}` }}>
                {[
                  { label: 'Target LIVE', value: modeA.hasValidTarget ? `@${scenario.targetUsername.replace(/^@+/, '')}` : 'Belum diatur', tone: modeA.hasValidTarget ? ('ok' as const) : ('error' as const) },
                  { label: 'Mode A Session', value: modeA.modeASession.label, tone: modeA.modeASession.tone },
                  { label: 'Room Status', value: modeA.roomStatus.label, tone: modeA.roomStatus.tone },
                  { label: 'Event Transport', value: modeA.eventTransport.label, tone: modeA.eventTransport.tone },
                ].map((cell) => (
                  <div
                    key={cell.label}
                    className="p-2.5"
                    style={{
                      backgroundColor: p.surfaceMuted,
                      border: `1px solid ${p.border}`,
                      borderRadius: sys.radiusControl,
                    }}
                  >
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: p.textMuted }}>
                      {cell.label}
                    </div>
                    <div className="text-xs font-semibold mt-1 truncate" style={{ color: toneColor(cell.tone, p) }}>
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid gap-2.5 pt-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`} style={{ borderTop: `1px solid ${p.border}` }}>
                <div
                  className="p-2.5"
                  style={{ backgroundColor: p.surfaceMuted, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl }}
                >
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: p.textMuted }}>
                    Bitrate
                  </div>
                  <div className="text-sm font-mono font-semibold tabular-nums mt-1" style={{ color: p.text }}>
                    {modeB.bitrateDisplay}
                  </div>
                </div>
                <div
                  className="p-2.5"
                  style={{ backgroundColor: p.surfaceMuted, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl }}
                >
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: p.textMuted }}>
                    Audio Source
                  </div>
                  <div className="text-xs font-semibold mt-1 truncate" style={{ color: p.text }}>
                    {audioSourceLabel(scenario.audioSource)}
                  </div>
                </div>
                <div
                  className={`${isMobile ? 'col-span-2' : ''} p-2.5`}
                  style={{ backgroundColor: p.surfaceMuted, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl }}
                >
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: p.textMuted }}>
                    RTMP Endpoint
                  </div>
                  <div className="text-xs font-mono truncate mt-1" style={{ color: modeB.rtmpValid ? p.text : p.error }}>
                    {modeB.rtmpValid ? scenario.rtmpEndpointLabel : 'Belum lengkap'}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Secondary Mode Operations Card (HUD Controls for Mode A / Audio Selector & Telemetry for Mode B) */}
          <section
            className="p-5 space-y-4"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            {isModeA ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: p.text }}>
                      Floating HUD & Metrik LIVE
                    </h2>
                    <p className="text-[11px]" style={{ color: p.textMuted }}>
                      Kontrol bubble & jendela HUD di atas aplikasi TikTok
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                    <span>
                      <span style={{ color: p.textMuted }}>Viewers </span>
                      <strong style={{ color: p.text }}>
                        {modeALiveTransport && scenario.viewerCount !== null
                          ? scenario.viewerCount.toLocaleString('en-US')
                          : '—'}
                      </strong>
                    </span>
                    <span>
                      <span style={{ color: p.textMuted }}>Likes </span>
                      <strong style={{ color: p.text }}>
                        {modeALiveTransport && scenario.likeCount !== null
                          ? scenario.likeCount.toLocaleString('en-US')
                          : '—'}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={actions.onShowHud}
                    disabled={scenario.hudVisible}
                    className="min-h-[42px] px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.accentSoft,
                      border: `1px solid ${p.accent}`,
                      color: p.accentText,
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Tampilkan HUD</span>
                  </button>
                  <button
                    type="button"
                    onClick={actions.onHideHud}
                    disabled={!scenario.hudVisible}
                    className="min-h-[42px] px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-45"
                    style={{
                      borderRadius: sys.radiusControl,
                      border: `1px solid ${p.borderStrong}`,
                      backgroundColor: p.surfaceMuted,
                      color: p.text,
                    }}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Sembunyikan HUD</span>
                  </button>
                  <span className="text-[11px] ml-auto" style={{ color: p.textMuted }}>
                    Overlay: {scenario.overlayPermissionGranted ? 'Diizinkan' : scenario.overlayPermissionGranted === null ? 'Belum diperiksa' : 'Perlu izin'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: p.text }}>
                      Sumber Audio Siaran RTMP
                    </h2>
                    <p className="text-[11px]" style={{ color: p.textMuted }}>
                      Pilih jalur audio yang masuk ke encoder AAC native
                    </p>
                  </div>
                  <Sliders className="w-4 h-4" style={{ color: p.textMuted }} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['mix', 'internal', 'microphone'] as ModeBAudioSource[]).map((src) => {
                    const active = scenario.audioSource === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => actions.onChangeAudioSource(src)}
                        className="min-h-[42px] px-3 py-2 text-xs font-semibold"
                        style={{
                          borderRadius: sys.radiusControl,
                          backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                          border: `1px solid ${active ? p.accent : p.border}`,
                          color: active ? p.accentText : p.textSecondary,
                        }}
                      >
                        {src === 'mix' ? 'Mix' : src === 'internal' ? 'Internal' : 'Microphone'}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        {/* Right 4 Columns: Active Studio Scene Context + Honest Hardware Readiness */}
        <aside className={`${isMobile ? '' : 'col-span-4'} space-y-5`}>
          <section
            className="p-5 space-y-3"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold" style={{ color: p.text }}>
                Preset Studio Aktif
              </div>
              <Layers className="w-4 h-4" style={{ color: p.accentText }} />
            </div>
            <div>
              <div className="text-base font-semibold" style={{ fontFamily: sys.displayFont, color: p.text }}>
                {scenario.activePresetName}
              </div>
              <div className="text-[11px] font-mono tabular-nums mt-0.5" style={{ color: p.textMuted }}>
                {scenario.activePresetOrientation} · {scenario.visibleElementsCount} elemen aktif ·{' '}
                {scenario.screenCaptureLayerInPreset ? 'Layer Screen Capture' : 'Tanpa Screen Capture'}
              </div>
            </div>
          </section>

          <section
            className="p-5 space-y-3"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => isMobile && setMobileReadinessOpen((v) => !v)}
                className="text-left min-w-0 flex items-center gap-1.5"
              >
                <span className="text-xs font-semibold" style={{ color: p.text }}>
                  Kesiapan Perangkat & Izin
                </span>
                {isMobile && (mobileReadinessOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
              </button>
              <button
                type="button"
                onClick={actions.onRunHardwareCheck}
                className="px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  borderRadius: sys.radiusControl,
                  border: `1px solid ${p.borderStrong}`,
                  backgroundColor: p.surfaceMuted,
                  color: p.text,
                }}
              >
                {scenario.hardwareCheckState === 'unchecked' ? 'Periksa' : 'Periksa Ulang'}
              </button>
            </div>

            {(!isMobile || mobileReadinessOpen) && (
              <div className="divide-y" style={{ borderColor: p.border }}>
                {readiness.map((row) => (
                  <div key={row.id} className="py-2 flex items-center justify-between gap-2 text-xs" style={{ borderColor: p.border }}>
                    <span className="truncate" style={{ color: p.textSecondary }}>
                      {row.label}
                    </span>
                    <span className="font-mono text-[11px] shrink-0" style={{ color: toneColor(row.tone, p) }}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {isMobile && !mobileReadinessOpen && (
              <div className="text-[11px]" style={{ color: p.textMuted }}>
                {scenario.hardwareCheckState === 'unchecked'
                  ? 'Status sumber & izin: Belum diperiksa (ketuk judul untuk detail)'
                  : `${readiness.filter((r) => r.tone === 'ok').length}/${readiness.length} sumber & izin terverifikasi`}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

/* ============================================================================
   PUBLIC DISPATCHER COMPONENT
   ============================================================================ */
export const DashboardAlternativeRenderer: React.FC<DashboardAlternativeProps> = ({
  variant,
  ...rest
}) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[rest.theme];

  return (
    <div className="space-y-4">
      {rest.scenario.lastFeedback && (
        <div
          className="px-3.5 py-2 text-xs flex items-center gap-2"
          style={{
            backgroundColor: toneBg('ok', p),
            border: `1px solid ${p.ok}`,
            borderRadius: sys.radiusControl,
            color: p.text,
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: p.ok }} />
          <span>{rest.scenario.lastFeedback}</span>
        </div>
      )}

      {variant === 'A' && <ExecutiveCommandDashboard {...rest} />}
      {variant === 'B' && <BroadcastOverviewDashboard {...rest} />}
      {variant === 'C' && <MinimalFocusDashboard {...rest} />}
      {variant === 'D' && <AdaptiveOperationsDashboard {...rest} />}
    </div>
  );
};
