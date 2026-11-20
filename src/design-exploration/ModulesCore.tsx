import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  Cpu,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Globe,
  Headphones,
  KeyRound,
  Layers,
  Lock,
  Mic,
  Monitor,
  Music2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Sliders,
  Sparkles,
  Star,
  Volume2,
  Waves,
} from 'lucide-react';
import {
  EXPLORATION_IMAGES,
  MOCK_DECK_MACROS,
  MOCK_INTEGRATIONS,
  MOCK_LIVE_EVENTS,
  MOCK_PRESETS,
  MOCK_SONG_QUEUE,
} from './mockData';
import { OPTION_SYSTEMS } from './tokens';
import type { ExplorationSharedState } from './types';

interface ModuleProps {
  shared: ExplorationSharedState;
}

/* ==========================================================================
   1. DASHBOARD MODULE (Mode A & Mode B)
   ========================================================================== */
export const DashboardModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const [hostWait, setHostWait] = useState(false);
  const [avatarErr, setAvatarErr] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const triggerNote = (msg: string) => {
    setActionToast(msg);
    window.setTimeout(() => setActionToast(null), 2400);
  };

  const isQuietA = shared.optionId === 'A';
  const isBroadcastB = shared.optionId === 'B';
  const isDPlus = shared.optionId === 'D_PLUS';
  const isMobile = shared.isMobileViewport;

  const metrics =
    shared.operatingMode === 'mode_a'
      ? [
          { label: 'Active Viewers', value: shared.isLiveActive ? '1,284' : '0', note: 'Peak 1,410 tonight' },
          { label: 'Gift Diamonds', value: shared.isLiveActive ? '4,820' : '0', note: '18 contributors' },
          { label: 'Event Transport', value: shared.isLiveActive ? 'Direct WS' : 'Standby', note: 'Room 741982014' },
          { label: 'HUD Service', value: shared.isLiveActive ? 'Running' : 'Idle', note: 'Android Foreground' },
        ]
      : [
          { label: 'Video Bitrate', value: shared.isLiveActive ? '6,040 kbps' : '0 kbps', note: 'CBR · H.264 HW' },
          { label: 'Frame Cadence', value: shared.isLiveActive ? '30.0 fps' : '0.0 fps', note: '0 dropped frames' },
          { label: 'Audio Pipeline', value: 'Mix · 48 kHz', note: 'Mic + Media active' },
          { label: 'Encoder Output', value: shared.isLiveActive ? 'RTMP Live' : 'Ready', note: '1080×1920 Portrait' },
        ];

  return (
    <div className={isDPlus ? 'space-y-7' : 'space-y-6'}>
      {/* Mode & Session Primary Anchor */}
      <section
        className={isQuietA ? 'pb-6' : isDPlus ? 'p-5 sm:p-7' : 'p-5 sm:p-6'}
        style={{
          backgroundColor: isQuietA ? 'transparent' : p.surface,
          borderBottom: isQuietA ? `1px solid ${p.border}` : undefined,
          border: isQuietA ? undefined : `1px solid ${p.border}`,
          borderRadius: isQuietA ? 0 : sys.radiusPanel,
          boxShadow: shared.optionId === 'C' || isDPlus ? p.shadow : 'none',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2.5 min-w-0">
            <div className="flex items-center gap-3">
              {!avatarErr && (
                <img
                  src={EXPLORATION_IMAGES.hostAvatar}
                  alt="Host profile"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarErr(true)}
                  className="w-10 h-10 object-cover shrink-0"
                  style={{ borderRadius: sys.radiusControl, border: `1px solid ${p.borderStrong}` }}
                />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium" style={{ color: p.textMuted }}>
                  {shared.operatingMode === 'mode_a'
                    ? 'Mode A · TikTok LIVE Companion'
                    : 'Mode B · Native RTMP Encoder'}
                  <span aria-hidden="true"> · </span>
                  <span style={{ color: shared.isLiveActive ? p.ok : p.warn }}>
                    {shared.isLiveActive ? 'Broadcast Active' : 'Standby Ready'}
                  </span>
                </div>
                <h1
                  className="text-2xl sm:text-3xl font-semibold tracking-tight truncate"
                  style={{ fontFamily: sys.displayFont, color: p.text }}
                >
                  {shared.operatingMode === 'mode_a'
                    ? '@syntxrr.atelier Companion'
                    : 'RTMP Production Output'}
                </h1>
              </div>
            </div>

            <p className="text-xs sm:text-sm max-w-xl leading-relaxed" style={{ color: p.textSecondary }}>
              {shared.operatingMode === 'mode_a'
                ? 'Run TikTok LIVE directly inside the official TikTok app while SYNTXRR streams live chat, gifts, TTS, and soundboard cues through your floating Android HUD.'
                : 'Hardware-accelerated camera, screen projection, and composited studio overlays encoded cleanly to your configured RTMP ingest endpoint.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            {/* Mode A / Mode B Switcher */}
            <div
              className="inline-flex p-1 self-start sm:self-auto"
              style={{
                backgroundColor: p.surfaceMuted,
                border: `1px solid ${p.border}`,
                borderRadius: sys.radiusControl,
              }}
            >
              {([
                { id: 'mode_a', label: 'Mode A · Companion' },
                { id: 'mode_b', label: 'Mode B · RTMP' },
              ] as const).map((m) => {
                const active = shared.operatingMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => shared.onChangeOperatingMode(m.id)}
                    className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                    style={{
                      borderRadius: `calc(${sys.radiusControl} - 2px)`,
                      backgroundColor: active ? p.surface : 'transparent',
                      color: active ? p.text : p.textMuted,
                      boxShadow: active ? p.shadow : 'none',
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={shared.onToggleLiveActive}
                className="px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-transform active:scale-[0.98]"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: shared.isLiveActive ? p.errorSoft : p.accent,
                  color: shared.isLiveActive ? p.error : p.accentInk,
                  border: shared.isLiveActive ? `1px solid ${p.error}` : '1px solid transparent',
                }}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>
                  {shared.isLiveActive
                    ? shared.operatingMode === 'mode_a'
                      ? 'Stop Companion Session'
                      : 'End RTMP Broadcast'
                    : shared.operatingMode === 'mode_a'
                    ? 'Connect & Start Mode A'
                    : 'Go Live via RTMP'}
                </span>
              </button>

              {shared.operatingMode === 'mode_b' && (
                <button
                  type="button"
                  onClick={() => {
                    setHostWait((w) => !w);
                    triggerNote(!hostWait ? 'Host Wait screensaver enabled' : 'Returned to live scene');
                  }}
                  className="px-3.5 py-2.5 text-xs font-medium whitespace-nowrap"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: hostWait ? p.warnSoft : p.surfaceMuted,
                    border: `1px solid ${hostWait ? p.warn : p.border}`,
                    color: hostWait ? p.warn : p.text,
                  }}
                >
                  {hostWait ? 'Exit Host Wait' : 'Host Wait'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Row — Hairline Table/Grid Discipline */}
      <section
        className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}
      >
        {metrics.map((m) => (
          <div
            key={m.label}
            className={isQuietA ? 'py-3 px-1' : isDPlus ? 'p-4 sm:p-5' : 'p-4'}
            style={{
              backgroundColor: isQuietA ? 'transparent' : p.surface,
              borderBottom: isQuietA ? `1px solid ${p.border}` : undefined,
              border: isQuietA ? undefined : `1px solid ${p.border}`,
              borderRadius: isQuietA ? 0 : sys.radiusPanel,
            }}
          >
            <div className="text-xs font-medium" style={{ color: p.textMuted }}>
              {m.label}
            </div>
            <div
              className="text-xl sm:text-2xl font-semibold font-mono tabular-nums mt-1.5"
              style={{ color: p.text }}
            >
              {m.value}
            </div>
            <div className="text-[11px] mt-1" style={{ color: p.textSecondary }}>
              {m.note}
            </div>
          </div>
        ))}
      </section>

      {/* Broadcast Audio Bus (Distinctive to Option B, sleek on all) & Mode Warnings */}
      <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-12'}`}>
        <div
          className={isMobile ? 'col-span-1 p-4 space-y-3' : 'col-span-7 p-5 space-y-3'}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: p.text }}>
              {isBroadcastB ? 'Master Program Telemetry & Preflight' : 'Active Production Summary'}
            </h2>
            <span className="text-xs font-mono tabular-nums" style={{ color: p.textMuted }}>
              {MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId)?.name}
            </span>
          </div>

          <div className="space-y-2">
            {[
              {
                name: 'TikTok LIVE Transport',
                detail:
                  shared.tiktokMethod === 'direct'
                    ? 'Direct WebSocket · Optional Euler Fallback Ready'
                    : 'EulerStream Authenticated Transport',
                status: shared.isLiveActive ? 'Connected' : 'Standby',
                ok: true,
              },
              {
                name: 'Android Overlay & Foreground Service',
                detail: 'Display over other apps granted · Audio capture non-invasive',
                status: 'Verified',
                ok: true,
              },
              {
                name: 'Screen Projection Source',
                detail: 'Prompt required only when Screen Capture source is enabled in Studio',
                status: 'Permission Prompt',
                ok: false,
              },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between gap-3 py-2.5 px-3"
                style={{
                  backgroundColor: p.surfaceMuted,
                  borderRadius: sys.radiusControl,
                  border: `1px solid ${p.border}`,
                }}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: p.text }}>
                    {row.name}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: p.textMuted }}>
                    {row.detail}
                  </div>
                </div>
                <span
                  className="text-[11px] font-medium whitespace-nowrap shrink-0"
                  style={{ color: row.ok ? p.ok : p.warn }}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mode-Specific Quick Controls + Calibrated Meters */}
        <div
          className={isMobile ? 'col-span-1 p-4 space-y-3' : 'col-span-5 p-5 space-y-3'}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: p.text }}>
              Mode Controls & Audio Bus
            </h2>
            <span className="text-xs font-mono tabular-nums" style={{ color: p.textMuted }}>
              -14 LUFS
            </span>
          </div>

          <div className="space-y-2.5">
            {[
              { label: 'Microphone (MV7)', level: Math.min(100, Math.round(shared.micGain * 0.72)) },
              { label: 'Program Master Out', level: shared.masterVol },
              { label: 'Soundboard SFX', level: shared.sfxVol },
            ].map((ch) => (
              <div key={ch.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: p.textSecondary }}>{ch.label}</span>
                  <span className="font-mono tabular-nums" style={{ color: p.textMuted }}>
                    {ch.level}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden" style={{ backgroundColor: p.surfaceMuted, borderRadius: '3px' }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${ch.level}%`,
                      backgroundColor: ch.level > 88 ? p.warn : p.accent,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => shared.onNavigate('studio')}
              className="flex-1 px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: p.surfaceMuted,
                border: `1px solid ${p.border}`,
                color: p.text,
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Open Studio</span>
            </button>
            <button
              type="button"
              onClick={() => shared.onNavigate('hud')}
              className="flex-1 px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: p.surfaceMuted,
                border: `1px solid ${p.border}`,
                color: p.text,
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Inspect HUD</span>
            </button>
          </div>

          {actionToast && (
            <div className="text-[11px] font-medium pt-1" style={{ color: p.accentText }}>
              {actionToast}
            </div>
          )}
        </div>
      </div>

      {/* Relevant Advisory Notice */}
      <div
        className="flex items-start justify-between gap-3 px-4 py-3"
        style={{
          backgroundColor: isDPlus ? p.surface : p.warnSoft,
          border: `1px solid ${isDPlus ? p.borderStrong : p.warn}`,
          borderRadius: sys.radiusControl,
        }}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: p.warn }} />
          <div className="text-xs leading-relaxed" style={{ color: p.text }}>
            <span className="font-semibold">Transport Notice:</span> Direct TikTok WebSocket works without API keys or JWT. Only configure an EulerStream credential under Integrations if you require authenticated fallback.
          </div>
        </div>
        <button
          type="button"
          onClick={() => shared.onNavigate('integrations')}
          className="text-xs font-semibold whitespace-nowrap shrink-0 underline"
          style={{ color: isDPlus ? p.accentText : p.text }}
        >
          Review
        </button>
      </div>
    </div>
  );
};

/* ==========================================================================
   2. LIVE CENTER MODULE
   ========================================================================== */
export const LiveCenterModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const isMobile = shared.isMobileViewport;

  const filteredEvents = MOCK_LIVE_EVENTS.filter((e) =>
    shared.liveFilter === 'all' ? true : e.type === shared.liveFilter
  );

  return (
    <div className="space-y-4">
      {/* Top Broadcast Activity Strip */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pb-3"
        style={{ borderBottom: `1px solid ${p.border}` }}
      >
        <div>
          <h2
            className="text-xl sm:text-2xl font-semibold tracking-tight"
            style={{ fontFamily: sys.displayFont, color: p.text }}
          >
            Live Center
          </h2>
          <div className="text-xs mt-0.5 flex flex-wrap items-center gap-2" style={{ color: p.textMuted }}>
            <span>{shared.isLiveActive ? 'Connected Direct' : 'Standby'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">1,284 viewers</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">4,820 diamonds</span>
          </div>
        </div>

        <button
          type="button"
          onClick={shared.onToggleTts}
          className="px-3.5 py-2 text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
          style={{
            borderRadius: sys.radiusControl,
            backgroundColor: shared.ttsEnabled ? p.accent : p.surface,
            color: shared.ttsEnabled ? p.accentInk : p.text,
            border: `1px solid ${shared.ttsEnabled ? p.accent : p.border}`,
          }}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>TTS Auto-Reader: {shared.ttsEnabled ? 'On' : 'Paused'}</span>
        </button>
      </div>

      <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-12'}`}>
        {/* Event Feed Stream */}
        <div
          className={`${isMobile ? 'col-span-1' : 'col-span-8'} p-4 space-y-3`}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="flex items-center gap-1 overflow-x-auto pb-2" style={{ borderBottom: `1px solid ${p.border}` }}>
            {([
              { id: 'all', label: 'All Activity' },
              { id: 'chat', label: 'Chat' },
              { id: 'gift', label: 'Gifts' },
              { id: 'follow', label: 'Follows' },
              { id: 'join', label: 'Viewer Joins' },
            ] as const).map((tab) => {
              const active = shared.liveFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => shared.onChangeLiveFilter(tab.id)}
                  className="px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: active ? p.accent : p.surfaceMuted,
                    color: active ? p.accentInk : p.textSecondary,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="divide-y" style={{ borderColor: p.border }}>
            {filteredEvents.map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold" style={{ color: p.text }}>
                      @{ev.user}
                    </span>
                    <span style={{ color: p.textMuted }}>·</span>
                    <span
                      className="text-[11px] font-medium uppercase tracking-wider"
                      style={{
                        color:
                          ev.type === 'gift'
                            ? p.accentText
                            : ev.type === 'follow'
                            ? p.ok
                            : ev.type === 'system'
                            ? p.warn
                            : p.textMuted,
                      }}
                    >
                      {ev.type}
                    </span>
                    {ev.readByTts && (
                      <span className="text-[11px]" style={{ color: p.textMuted }}>
                        · TTS queued
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm mt-0.5 leading-snug" style={{ color: p.textSecondary }}>
                    {ev.message}
                  </div>
                </div>
                <div className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: p.textMuted }}>
                  {ev.time}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fast Soundboard + TTS Status Rail */}
        <div
          className={`${isMobile ? 'col-span-1' : 'col-span-4'} p-4 space-y-4`}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
              Instant Soundboard
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              {shared.sounds.slice(0, 4).map((slot) => {
                const playing = shared.playingSoundId === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => shared.onPlaySound(slot.id)}
                    className="p-2.5 text-left transition-transform active:scale-95"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: playing ? p.accent : p.surfaceMuted,
                      color: playing ? p.accentInk : p.text,
                      border: `1px solid ${playing ? p.accent : p.border}`,
                    }}
                  >
                    <div className="text-xs font-semibold truncate">{slot.name}</div>
                    <div
                      className="text-[11px] font-mono tabular-nums mt-0.5 opacity-75"
                    >
                      {playing ? 'Playing' : slot.duration}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 space-y-2" style={{ borderTop: `1px solid ${p.border}` }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
              TTS & Queue Status
            </div>
            <div className="text-xs flex items-center justify-between">
              <span style={{ color: p.textSecondary }}>Voice Engine</span>
              <span className="font-mono text-[11px]" style={{ color: p.text }}>id-ID · Ardi Neural</span>
            </div>
            <div className="text-xs flex items-center justify-between">
              <span style={{ color: p.textSecondary }}>Minimum Gift TTS</span>
              <span className="font-mono tabular-nums text-[11px]" style={{ color: p.text }}>10 Coins</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   3. SOURCES MODULE
   ========================================================================== */
export const SourcesModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];

  const iconFor = (kind: string) => {
    if (kind === 'camera') return <Camera className="w-4 h-4" />;
    if (kind === 'microphone') return <Mic className="w-4 h-4" />;
    if (kind === 'screen') return <Monitor className="w-4 h-4" />;
    return <FolderOpen className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
          Sources & Permissions
        </h2>
        <p className="text-xs mt-0.5" style={{ color: p.textMuted }}>
          Inspect Android hardware capture sources, runtime permissions, and studio routing availability.
        </p>
      </div>

      <div className={`grid gap-3 ${shared.isMobileViewport ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {shared.sources.map((src) => (
          <div
            key={src.id}
            className="p-4 flex flex-col justify-between gap-4"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="p-2.5 shrink-0"
                  style={{
                    backgroundColor: p.surfaceMuted,
                    border: `1px solid ${p.border}`,
                    borderRadius: sys.radiusControl,
                    color: src.connected ? p.accent : p.textMuted,
                  }}
                >
                  {iconFor(src.kind)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: p.text }}>
                    {src.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: p.textMuted }}>
                    {src.detail}
                  </div>
                </div>
              </div>
              <span
                className="text-[11px] font-medium whitespace-nowrap shrink-0"
                style={{ color: src.permission === 'granted' ? p.ok : p.warn }}
              >
                {src.permission === 'granted' ? 'Permission Granted' : 'Prompt Required'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${p.border}` }}>
              <span className="text-xs" style={{ color: p.textSecondary }}>
                {src.connected ? 'Active in pipeline' : 'Standby / Disconnected'}
              </span>
              <button
                type="button"
                onClick={() => shared.onToggleSourceConnected(src.id)}
                className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: src.connected ? p.surfaceMuted : p.accent,
                  color: src.connected ? p.text : p.accentInk,
                  border: `1px solid ${src.connected ? p.border : 'transparent'}`,
                }}
              >
                {src.connected ? 'Disconnect' : src.permission === 'granted' ? 'Activate' : 'Grant & Connect'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ==========================================================================
   4. SOUNDBOARD, AUDIO, MUSIC & TTS MODULE
   ========================================================================== */
export const AudioModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const [audioTab, setAudioTab] = useState<'soundboard' | 'music' | 'tts'>('soundboard');
  const [onlyFav, setOnlyFav] = useState(false);
  const [songQueue, setSongQueue] = useState(MOCK_SONG_QUEUE);
  const [ttsRate, setTtsRate] = useState(1.0);

  const visibleSounds = onlyFav ? shared.sounds.filter((s) => s.favorite) : shared.sounds;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
            Soundboard & Audio Suite
          </h2>
          <div className="text-xs mt-0.5" style={{ color: p.textMuted }}>
            Low-latency SFX · Local Audio Pool · Song Request Queue · Background Keep-Alive
          </div>
        </div>

        <div
          className="inline-flex p-1"
          style={{
            backgroundColor: p.surfaceMuted,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          {([
            { id: 'soundboard', label: 'Soundboard' },
            { id: 'music', label: 'Music & Requests' },
            { id: 'tts', label: 'TTS Voice' },
          ] as const).map((t) => {
            const active = audioTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setAudioTab(t.id)}
                className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                style={{
                  borderRadius: `calc(${sys.radiusControl} - 2px)`,
                  backgroundColor: active ? p.surface : 'transparent',
                  color: active ? p.text : p.textMuted,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio Mixer Strip (Always reachable) */}
      <div
        className={`grid gap-3.5 p-4 ${shared.isMobileViewport ? 'grid-cols-1' : 'grid-cols-3'}`}
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
        }}
      >
        {([
          { key: 'master', label: 'Master Output', val: shared.masterVol, max: 100 },
          { key: 'sfx', label: 'Soundboard Bus', val: shared.sfxVol, max: 100 },
          { key: 'mic', label: 'Mic Gain (Preamp)', val: shared.micGain, max: 200 },
        ] as const).map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium" style={{ color: p.textSecondary }}>{f.label}</span>
              <span className="font-mono tabular-nums font-semibold" style={{ color: p.text }}>{f.val}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={f.max}
              value={f.val}
              onChange={(e) => shared.onChangeAudioLevel(f.key, Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: p.accent }}
            />
            {shared.optionId === 'D_PLUS' && (
              <div className="flex justify-between text-[9.5px] font-mono tabular-nums" style={{ color: p.textMuted }}>
                <span>-24</span>
                <span>-12</span>
                <span>-6</span>
                <span>0 dB</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {audioTab === 'soundboard' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyFav((f) => !f)}
                className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: onlyFav ? p.accentSoft : p.surface,
                  border: `1px solid ${onlyFav ? p.accent : p.border}`,
                  color: onlyFav ? p.accent : p.textSecondary,
                }}
              >
                <Star className="w-3.5 h-3.5" />
                <span>Favorites Only</span>
              </button>
            </div>
            <span className="text-xs" style={{ color: p.textMuted }}>
              Background Audio Engine: Active
            </span>
          </div>

          <div className={`grid gap-2.5 ${shared.isMobileViewport ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {visibleSounds.map((slot) => {
              const playing = shared.playingSoundId === slot.id;
              return (
                <div
                  key={slot.id}
                  className="p-3.5 flex flex-col justify-between gap-3"
                  style={{
                    backgroundColor: playing ? p.accentSoft : p.surface,
                    border: `1px solid ${playing ? p.accent : p.border}`,
                    borderRadius: sys.radiusPanel,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: p.text }}>
                        {slot.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums mt-0.5" style={{ color: p.textMuted }}>
                        {slot.category} · {slot.duration}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => shared.onToggleSoundFavorite(slot.id)}
                      className="p-1 shrink-0"
                      style={{ color: slot.favorite ? p.accent : p.textMuted }}
                      aria-label="Toggle favorite"
                    >
                      <Star className="w-3.5 h-3.5" fill={slot.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => shared.onPlaySound(slot.id)}
                    className="w-full py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: playing ? p.accent : p.surfaceMuted,
                      color: playing ? p.accentInk : p.text,
                    }}
                  >
                    <Waves className="w-3.5 h-3.5" />
                    <span>{playing ? 'Playing...' : 'Trigger'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {audioTab === 'music' && (
        <div className="space-y-3">
          <div
            className="p-4 flex items-center justify-between gap-3"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium" style={{ color: p.accentText }}>
                NOW PLAYING · SONG REQUEST
              </div>
              <div className="text-sm font-semibold truncate mt-0.5" style={{ color: p.text }}>
                {songQueue[0]?.title} — {songQueue[0]?.artist}
              </div>
              <div className="text-xs mt-0.5" style={{ color: p.textMuted }}>
                Requested by @{songQueue[0]?.requester} · {songQueue[0]?.duration}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={shared.onToggleMusicPlaying}
                className="p-2.5"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: p.accent,
                  color: p.accentInk,
                }}
                aria-label="Play pause"
              >
                {shared.musicPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setSongQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q))}
                className="p-2.5"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: p.surfaceMuted,
                  border: `1px solid ${p.border}`,
                  color: p.text,
                }}
                aria-label="Next track"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="divide-y px-4"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
              borderColor: p.border,
            }}
          >
            {songQueue.map((song) => (
              <div key={song.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: p.text }}>
                    {song.title}
                  </div>
                  <div className="text-[11px]" style={{ color: p.textMuted }}>
                    {song.artist} · @{song.requester} · {song.duration}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {shared.optionId === 'D_PLUS' && song.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() =>
                        setSongQueue((prev) =>
                          prev.map((item) => (item.id === song.id ? { ...item, status: 'approved' } : item))
                        )
                      }
                      className="px-2 py-1 text-[11px] font-semibold"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: p.accent,
                        color: p.accentInk,
                      }}
                    >
                      Approve
                    </button>
                  )}
                  <span
                    className="text-[11px] font-medium shrink-0"
                    style={{
                      color: song.status === 'playing' ? p.accentText : song.status === 'approved' ? p.ok : p.warn,
                    }}
                  >
                    {song.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {audioTab === 'tts' && (
        <div
          className="p-4 space-y-4"
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold" style={{ color: p.text }}>Text-to-Speech Configuration</div>
              <div className="text-xs" style={{ color: p.textMuted }}>Reads verified viewer comments and gift alerts</div>
            </div>
            <button
              type="button"
              onClick={shared.onToggleTts}
              className="px-3 py-1.5 text-xs font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.ttsEnabled ? p.accent : p.surfaceMuted,
                color: shared.ttsEnabled ? p.accentInk : p.text,
              }}
            >
              {shared.ttsEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: p.textSecondary }}>Speech Cadence</span>
              <span className="font-mono tabular-nums" style={{ color: p.text }}>{ttsRate.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.75}
              max={1.5}
              step={0.05}
              value={ttsRate}
              onChange={(e) => setTtsRate(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: p.accent }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   5. FLOATING HUD MODULE (Android Overlay Compact + Expanded States)
   ========================================================================== */
export const FloatingHudModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
            Android Floating HUD
          </h2>
          <p className="text-xs mt-0.5" style={{ color: p.textMuted }}>
            Non-intrusive native overlay rendered above TikTok LIVE in both Compact Bubble and Expanded Panel states.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shared.onToggleHudExpanded}
            className="px-3.5 py-2 text-xs font-semibold"
            style={{
              borderRadius: sys.radiusControl,
              backgroundColor: p.accent,
              color: p.accentInk,
            }}
          >
            {shared.hudExpanded ? 'Show Compact Bubble' : 'Expand HUD Panel'}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 items-start ${shared.isMobileViewport ? 'grid-cols-1' : 'grid-cols-12'}`}>
        {/* Interactive Android Overlay Backdrop Mockup */}
        <div
          className={`${shared.isMobileViewport ? 'col-span-1' : 'col-span-7'} p-4 flex justify-center`}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div
            className="relative w-full max-w-[320px] h-[540px] overflow-hidden"
            style={{
              borderRadius: '26px',
              border: `2px solid ${p.borderStrong}`,
              backgroundColor: '#0A0B0F',
            }}
          >
            {/* Host TikTok App Simulation Backdrop */}
            <img
              src={EXPLORATION_IMAGES.studioStage}
              alt="Host app simulation under overlay"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/60" />

            <div className="relative z-10 p-3.5 flex items-center justify-between text-[11px] text-white/85">
              <span>TikTok LIVE Host Screen</span>
              <span className="font-mono tabular-nums">1,284</span>
            </div>

            {/* Compact Bubble */}
            {!shared.hudExpanded && (
              <button
                type="button"
                onClick={shared.onToggleHudExpanded}
                style={{
                  position: 'absolute',
                  top: '42%',
                  left: shared.hudSide === 'left' ? '12px' : undefined,
                  right: shared.hudSide === 'right' ? '12px' : undefined,
                  opacity: shared.hudOpacity / 100,
                  backgroundColor: p.surface,
                  border: `1.5px solid ${p.accent}`,
                  color: p.text,
                  borderRadius: shared.optionId === 'B' ? '10px' : '999px',
                  boxShadow: p.shadow,
                }}
                className="z-20 w-12 h-12 flex flex-col items-center justify-center transition-transform active:scale-95"
              >
                <Radio className="w-4 h-4" style={{ color: p.accent }} />
                <span className="text-[9px] font-mono tabular-nums">12</span>
              </button>
            )}

            {/* Expanded Compact Panel */}
            {shared.hudExpanded && (
              <div
                style={{
                  position: 'absolute',
                  top: '76px',
                  left: shared.hudSide === 'left' ? '12px' : undefined,
                  right: shared.hudSide === 'right' ? '12px' : undefined,
                  width: '256px',
                  opacity: shared.hudOpacity / 100,
                  backgroundColor: p.surface,
                  border: `1px solid ${p.borderStrong}`,
                  borderRadius: sys.radiusPanel,
                  boxShadow: p.shadow,
                }}
                className="z-20 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between pb-2" style={{ borderBottom: `1px solid ${p.border}` }}>
                  <span className="text-xs font-semibold" style={{ color: p.text }}>
                    SYNTXRR HUD
                  </span>
                  <button
                    type="button"
                    onClick={shared.onToggleHudExpanded}
                    className="text-[11px] font-medium"
                    style={{ color: p.accentText }}
                  >
                    Collapse
                  </button>
                </div>

                {/* HUD Tabs */}
                <div className="grid grid-cols-4 gap-1">
                  {(['chat', 'soundboard', 'music', 'mixer'] as const).map((tab) => {
                    const active = shared.hudTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => shared.onChangeHudTab(tab)}
                        className="py-1 text-[10px] font-semibold capitalize"
                        style={{
                          borderRadius: sys.radiusControl,
                          backgroundColor: active ? p.accent : p.surfaceMuted,
                          color: active ? p.accentInk : p.textMuted,
                        }}
                      >
                        {tab === 'soundboard' ? 'SFX' : tab}
                      </button>
                    );
                  })}
                </div>

                {shared.hudTab === 'chat' && (
                  <div className="space-y-1.5 text-[11px]">
                    {MOCK_LIVE_EVENTS.slice(0, 3).map((ev) => (
                      <div key={ev.id} className="truncate" style={{ color: p.textSecondary }}>
                        <span className="font-semibold" style={{ color: p.text }}>{ev.user}: </span>
                        <span>{ev.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {shared.hudTab === 'soundboard' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {shared.sounds.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => shared.onPlaySound(s.id)}
                        className="px-2 py-1.5 text-[10px] font-medium truncate text-left"
                        style={{
                          borderRadius: sys.radiusControl,
                          backgroundColor: p.surfaceMuted,
                          color: p.text,
                          border: `1px solid ${p.border}`,
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}

                {shared.hudTab === 'music' && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="truncate font-medium" style={{ color: p.text }}>Midnight Velvet</span>
                    <button
                      type="button"
                      onClick={shared.onToggleMusicPlaying}
                      className="px-2 py-1 text-[10px] font-semibold"
                      style={{ backgroundColor: p.accent, color: p.accentInk, borderRadius: sys.radiusControl }}
                    >
                      {shared.musicPlaying ? 'Pause' : 'Play'}
                    </button>
                  </div>
                )}

                {shared.hudTab === 'mixer' && (
                  <div className="text-[11px] space-y-1" style={{ color: p.textSecondary }}>
                    <div className="flex justify-between"><span>Master</span><span className="font-mono tabular-nums">{shared.masterVol}%</span></div>
                    <div className="flex justify-between"><span>Mic Mode</span><span>Non-invasive</span></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* HUD Geometry & Behavior Controls */}
        <div
          className={`${shared.isMobileViewport ? 'col-span-1' : 'col-span-5'} p-4 space-y-4`}
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="text-sm font-semibold" style={{ color: p.text }}>
            Overlay Ergonomics
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium" style={{ color: p.textSecondary }}>Anchor Edge</div>
            <div className="grid grid-cols-2 gap-2">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => shared.onChangeHudSide(side)}
                  className="py-2 text-xs font-semibold capitalize"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: shared.hudSide === side ? p.accent : p.surfaceMuted,
                    color: shared.hudSide === side ? p.accentInk : p.textSecondary,
                    border: `1px solid ${shared.hudSide === side ? p.accent : p.border}`,
                  }}
                >
                  {side} Edge
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: p.textSecondary }}>Overlay Opacity</span>
              <span className="font-mono tabular-nums font-semibold" style={{ color: p.text }}>{shared.hudOpacity}%</span>
            </div>
            <input
              type="range"
              min={45}
              max={100}
              value={shared.hudOpacity}
              onChange={(e) => shared.onChangeHudOpacity(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: p.accent }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   6. INTEGRATIONS, REMOTE DECK & SETTINGS MODULES
   ========================================================================== */
export const IntegrationsModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];

  return (
    <div className="space-y-5">
      <div className="pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
          Integrations & Transport Credentials
        </h2>
        <p className="text-xs mt-0.5" style={{ color: p.textMuted }}>
          Direct TikTok works with zero API keys; EulerStream accepts exactly one credential (API Key or JWT).
        </p>
      </div>

      {/* TikTok Transport Card */}
      <div
        className="p-4 sm:p-5 space-y-4"
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold" style={{ color: p.text }}>
              TikTok LIVE Transport Configuration
            </div>
            <div className="text-xs" style={{ color: p.textMuted }}>
              Target: @syntxrr.atelier · OAuth Optional · Credentials excluded from backup exports
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: p.ok }}>
            {shared.tiktokMethod === 'direct' ? 'Direct TikTok Primary' : 'EulerStream Selected'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {([
            { id: 'direct', title: 'Direct TikTok WebSocket', desc: 'Native device transport · No key or JWT required' },
            { id: 'euler', title: 'EulerStream Transport', desc: 'Uses API Key or JWT exclusively (never both)' },
          ] as const).map((opt) => {
            const active = shared.tiktokMethod === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => shared.onChangeTiktokMethod(opt.id)}
                className="p-3 text-left transition-colors"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                  border: `1px solid ${active ? p.accent : p.border}`,
                }}
              >
                <div className="text-xs font-semibold" style={{ color: p.text }}>{opt.title}</div>
                <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>{opt.desc}</div>
              </button>
            );
          })}
        </div>

        <div
          className="p-3.5 space-y-3"
          style={{
            backgroundColor: p.surfaceMuted,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: p.text }}>
              <KeyRound className="w-3.5 h-3.5" style={{ color: p.accent }} />
              <span>EulerStream Credential (Exclusive)</span>
            </div>
            <div className="inline-flex p-0.5" style={{ backgroundColor: p.surface, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl }}>
              {([
                { id: 'api_key', label: 'API Key' },
                { id: 'jwt', label: 'JWT Key' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => shared.onChangeEulerAuthType(t.id)}
                  className="px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderRadius: `calc(${sys.radiusControl} - 2px)`,
                    backgroundColor: shared.eulerAuthType === t.id ? p.accent : 'transparent',
                    color: shared.eulerAuthType === t.id ? p.accentInk : p.textMuted,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-3 py-2 font-mono" style={{ backgroundColor: p.surface, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl, color: p.textSecondary }}>
            <span>
              {shared.eulerAuthType === 'api_key' ? 'API Key stored (••••4F92)' : 'JWT Key stored (••••8B10)'}
            </span>
            <Lock className="w-3.5 h-3.5" style={{ color: p.textMuted }} />
          </div>
        </div>
      </div>

      {/* Other Providers */}
      <div className={`grid gap-3 ${shared.isMobileViewport ? 'grid-cols-1' : 'grid-cols-3'}`}>
        {MOCK_INTEGRATIONS.slice(1).map((item) => (
          <div
            key={item.id}
            className="p-4 space-y-2"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: p.text }}>{item.name}</span>
              <span className="text-[11px] font-medium" style={{ color: p.textSecondary }}>{item.status}</span>
            </div>
            <div className="text-xs" style={{ color: p.textMuted }}>{item.role}</div>
            <div className="text-[11px] pt-2" style={{ borderTop: `1px solid ${p.border}`, color: p.textSecondary }}>
              {item.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const RemoteDeckModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
            Remote Production Deck
          </h2>
          <p className="text-xs mt-0.5" style={{ color: p.textMuted }}>
            One-tap scene transitions, simulator triggers, and audio cues during live shows.
          </p>
        </div>
        {lastTriggered && (
          <span className="text-xs font-medium" style={{ color: p.accentText }}>
            Executed: {lastTriggered}
          </span>
        )}
      </div>

      <div className={`grid gap-3 ${shared.isMobileViewport ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {MOCK_DECK_MACROS.map((macro) => (
          <button
            key={macro.id}
            type="button"
            onClick={() => setLastTriggered(macro.title)}
            className="p-4 text-left transition-transform active:scale-[0.98] flex flex-col justify-between gap-4 min-h-[110px]"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${lastTriggered === macro.title ? p.accent : p.border}`,
              borderRadius: sys.radiusPanel,
              boxShadow: shared.optionId === 'D_PLUS' ? p.shadow : 'none',
            }}
          >
            <div className="flex items-center justify-between text-[11px]" style={{ color: p.textMuted }}>
              <span>{macro.group}</span>
              <Gamepad2 className="w-3.5 h-3.5" style={{ color: p.accentText }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: p.text }}>{macro.title}</div>
              <div className="text-xs mt-0.5" style={{ color: p.textSecondary }}>{macro.subtitle}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export const SettingsModule: React.FC<ModuleProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const [lang, setLang] = useState<'id-ID' | 'en-US'>('id-ID');
  const [ns, setNs] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(true);

  return (
    <div className="space-y-4">
      <div className="pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
          Application Settings
        </h2>
        <p className="text-xs mt-0.5" style={{ color: p.textMuted }}>
          Adaptive theme, audio DSP pipeline, Floating HUD defaults, language, and local privacy safeguards.
        </p>
      </div>

      <div className={`grid gap-4 ${shared.isMobileViewport ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div
          className="p-4 space-y-3"
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="text-sm font-semibold" style={{ color: p.text }}>Appearance & Language</div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div>
              <div className="text-xs font-medium" style={{ color: p.text }}>Adaptive Theme</div>
              <div className="text-[11px]" style={{ color: p.textMuted }}>Evaluates both Dark & Light contrast</div>
            </div>
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="px-3 py-1.5 text-xs font-semibold capitalize"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: p.accent,
                color: p.accentInk,
              }}
            >
              {shared.theme} Mode
            </button>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-medium" style={{ color: p.text }}>Interface Language</span>
            <div className="inline-flex p-0.5" style={{ backgroundColor: p.surfaceMuted, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl }}>
              {(['id-ID', 'en-US'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className="px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderRadius: `calc(${sys.radiusControl} - 2px)`,
                    backgroundColor: lang === l ? p.surface : 'transparent',
                    color: lang === l ? p.text : p.textMuted,
                  }}
                >
                  {l === 'id-ID' ? 'Bahasa ID' : 'English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="p-4 space-y-3"
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          <div className="text-sm font-semibold" style={{ color: p.text }}>Audio DSP & Safety Guards</div>
          <label className="flex items-center justify-between py-1.5 text-xs cursor-pointer">
            <span style={{ color: p.textSecondary }}>Noise Suppression & Echo Cancellation</span>
            <input type="checkbox" checked={ns} onChange={(e) => setNs(e.target.checked)} style={{ accentColor: p.accent }} />
          </label>
          <label className="flex items-center justify-between py-1.5 text-xs cursor-pointer">
            <span style={{ color: p.textSecondary }}>Confirm Before Ending Live Session</span>
            <input type="checkbox" checked={confirmEnd} onChange={(e) => setConfirmEnd(e.target.checked)} style={{ accentColor: p.accent }} />
          </label>
          <div className="pt-2 text-[11px] flex items-center gap-2" style={{ borderTop: `1px solid ${p.border}`, color: p.ok }}>
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Stream keys, API keys & JWTs are excluded from JSON backups.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
