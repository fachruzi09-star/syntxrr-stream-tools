import React from 'react';
import {
  Activity,
  Eye,
  Layers,
  Radio,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { StatusDot } from '../ui/StatusDot';
import { InfoBanner, MetricTile, StatusRow } from './parts';

export interface ModeAStatusView {
  accountLinked: { label: string; detail?: string };
  modeASession: { label: string; detail?: string };
  roomStatus: { label: string; detail?: string };
  eventTransport: { label: string; detail?: string };
}

interface ModeAPanelProps {
  isEnglish: boolean;
  honestStatus: ModeAStatusView;
  targetUsername: string;
  hasValidTargetUsername: boolean;
  isLiveTransportConnected: boolean;
  isCompanionActive: boolean;
  viewerCount: number;
  likeCount: number;
  presetName: string | null;
  visibleElementsCount: number;
  isHudVisible: boolean;
  isOverlayGranted: boolean;
  isHudActionPending: boolean;
  isSessionActionPending: boolean;
  hudFeedback: { type: 'success' | 'error' | 'info'; message: string } | null;
  lastHudClickTime: string | null;
  sessionValidationError: string | null;
  onPressStartSession: () => void;
  onStopSession: () => void;
  onOpenTikTokConnection?: () => void;
  onShowHud: () => void;
  onHideHud: () => void;
  onRefreshHud: () => void;
  onRequestOverlay: () => void;
}

/**
 * Mode A operational panel — companion only.
 *
 * Mode A never starts or stops the official TikTok LIVE broadcast; the labels
 * here are deliberately about the companion, the connector and the HUD.
 */
export function ModeAPanel({
  isEnglish,
  honestStatus,
  targetUsername,
  hasValidTargetUsername,
  isLiveTransportConnected,
  isCompanionActive,
  viewerCount,
  likeCount,
  presetName,
  visibleElementsCount,
  isHudVisible,
  isOverlayGranted,
  isHudActionPending,
  isSessionActionPending,
  hudFeedback,
  lastHudClickTime,
  sessionValidationError,
  onPressStartSession,
  onStopSession,
  onOpenTikTokConnection,
  onShowHud,
  onHideHud,
  onRefreshHud,
  onRequestOverlay,
}: ModeAPanelProps) {
  const transportTone = isLiveTransportConnected ? 'success' : 'warning';
  const hudTone = !isOverlayGranted ? 'danger' : isHudVisible ? 'success' : 'neutral';

  return (
    <section id="mode-a-details" aria-labelledby="mode-a-heading" className="space-y-3">
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface p-3.5 shadow-sx-raised">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="mode-a-heading" className="text-[15px] font-semibold tracking-tight text-sx-text">
              {isEnglish ? 'TikTok LIVE Companion' : 'Kompanion TikTok LIVE'}
            </h2>
            <p className="mt-0.5 text-sx-caption leading-relaxed text-sx-text-muted">
              {isEnglish
                ? 'SYNTXRR reads LIVE activity and runs its own companion tools. Broadcasting stays in the official TikTok app.'
                : 'SYNTXRR membaca aktivitas LIVE dan menjalankan alat kompanion. Siaran tetap di aplikasi TikTok resmi.'}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-sx-full border border-sx-border bg-sx-surface-2 px-2 py-1">
            <StatusDot tone={isCompanionActive ? 'ready' : 'idle'} />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sx-text-secondary">
              {isCompanionActive
                ? isEnglish
                  ? 'Active'
                  : 'Aktif'
                : isEnglish
                  ? 'Standby'
                  : 'Siaga'}
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile
            icon={Radio}
            label={isEnglish ? 'Connector' : 'Konektor'}
            value={honestStatus.eventTransport.label}
            tone={isLiveTransportConnected ? 'success' : 'warning'}
          />
          <MetricTile
            icon={Activity}
            label={isEnglish ? 'Room' : 'Ruang'}
            value={honestStatus.roomStatus.label}
            tone={isLiveTransportConnected ? 'success' : 'neutral'}
          />
          <MetricTile
            icon={Users}
            label={isEnglish ? 'Viewers' : 'Penonton'}
            value={isLiveTransportConnected ? String(viewerCount) : '—'}
            hint={isLiveTransportConnected ? undefined : isEnglish ? 'No source' : 'Tanpa sumber'}
          />
          <MetricTile
            icon={Eye}
            label={isEnglish ? 'Likes' : 'Suka'}
            value={isLiveTransportConnected ? String(likeCount) : '—'}
            hint={isLiveTransportConnected ? undefined : isEnglish ? 'No source' : 'Tanpa sumber'}
          />
        </div>

        <div className="mt-3 divide-y divide-sx-border-subtle rounded-sx-md border border-sx-border-subtle bg-sx-surface-2 px-2.5 py-1">
          <StatusRow
            label={isEnglish ? 'TikTok account' : 'Akun TikTok'}
            value={honestStatus.accountLinked.label}
            detail={honestStatus.accountLinked.detail}
            tone={honestStatus.accountLinked.label ? 'neutral' : 'neutral'}
          />
          <StatusRow
            label={isEnglish ? 'Target username' : 'Target username'}
            value={hasValidTargetUsername ? `@${targetUsername}` : isEnglish ? 'Not set' : 'Belum diatur'}
            tone={hasValidTargetUsername ? 'success' : 'warning'}
          />
          <StatusRow
            label={isEnglish ? 'Companion service' : 'Layanan kompanion'}
            value={honestStatus.modeASession.label}
            detail={honestStatus.modeASession.detail}
            tone={isCompanionActive ? 'success' : 'neutral'}
          />
          <StatusRow
            label={isEnglish ? 'Event transport' : 'Transport event'}
            value={honestStatus.eventTransport.label}
            detail={honestStatus.eventTransport.detail}
            tone={transportTone}
          />
          <StatusRow
            label="Floating HUD"
            value={
              !isOverlayGranted
                ? isEnglish
                  ? 'Permission required'
                  : 'Izin diperlukan'
                : isHudVisible
                  ? isEnglish
                    ? 'Visible'
                    : 'Tampil'
                  : isEnglish
                    ? 'Hidden'
                    : 'Tersembunyi'
            }
            tone={hudTone}
          />
        </div>

        {sessionValidationError ? (
          <InfoBanner tone="danger" title={isEnglish ? 'Cannot activate yet' : 'Belum bisa diaktifkan'} className="mt-3">
            {sessionValidationError}
          </InfoBanner>
        ) : null}

        {hudFeedback ? (
          <InfoBanner
            tone={hudFeedback.type === 'success' ? 'success' : hudFeedback.type === 'error' ? 'danger' : 'info'}
            className="mt-3"
          >
            {hudFeedback.message}
          </InfoBanner>
        ) : null}

        {lastHudClickTime ? (
          <p className="mt-2 font-mono text-[10px] text-sx-text-muted">
            {isEnglish ? 'Last HUD tap' : 'Tap HUD terakhir'}: {lastHudClickTime}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          {isCompanionActive ? (
            <Button
              variant="danger"
              fullWidth
              onClick={onStopSession}
              disabled={isSessionActionPending}
              loading={isSessionActionPending}
            >
              {isEnglish ? 'Stop Companion' : 'Hentikan Kompanion'}
            </Button>
          ) : (
            <Button
              variant="primary"
              fullWidth
              onClick={onPressStartSession}
              disabled={isSessionActionPending}
              loading={isSessionActionPending}
            >
              {isEnglish ? 'Activate Companion' : 'Aktifkan Kompanion'}
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenTikTokConnection?.()}>
              {isEnglish ? 'Connect TikTok' : 'Hubungkan TikTok'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={isHudVisible ? onHideHud : onShowHud}
              disabled={isHudActionPending}
              loading={isHudActionPending}
            >
              {isHudVisible
                ? isEnglish
                  ? 'Hide HUD'
                  : 'Sembunyikan HUD'
                : isEnglish
                  ? 'Open Floating HUD'
                  : 'Buka Floating HUD'}
            </Button>
          </div>

          {!isOverlayGranted ? (
            <InfoBanner
              tone="warning"
              title={isEnglish ? 'Overlay permission needed' : 'Izin overlay diperlukan'}
              action={
                <Button variant="secondary" size="sm" onClick={onRequestOverlay}>
                  {isEnglish ? 'Open' : 'Buka'}
                </Button>
              }
            >
              {isEnglish
                ? 'Allow “Display over other apps” so the HUD can appear above TikTok LIVE.'
                : 'Aktifkan “Tampilkan di atas aplikasi lain” agar HUD muncul di atas TikTok LIVE.'}
            </InfoBanner>
          ) : null}

          <button
            type="button"
            onClick={onRefreshHud}
            className="mx-auto flex min-h-[36px] items-center gap-1.5 rounded-sx-md px-3 text-[11px] font-semibold text-sx-text-muted transition-colors hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus"
          >
            <Icon icon={RefreshCw} size="xs" tone="inherit" />
            {isEnglish ? 'Refresh HUD status' : 'Segarkan status HUD'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-sx-lg border border-sx-border bg-sx-surface p-3">
          <div className="flex items-center gap-1.5">
            <Icon icon={Layers} size="xs" tone="muted" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
              {isEnglish ? 'Active preset' : 'Preset aktif'}
            </span>
          </div>
          <div className="mt-1 truncate text-sx-caption font-semibold text-sx-text">
            {presetName || (isEnglish ? 'No preset' : 'Belum ada preset')}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-sx-text-muted">
            {visibleElementsCount} {isEnglish ? 'visible elements' : 'elemen terlihat'}
          </div>
        </div>

        <div className="rounded-sx-lg border border-sx-border bg-sx-surface p-3">
          <div className="flex items-center gap-1.5">
            <Icon icon={ShieldAlert} size="xs" tone="muted" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
              {isEnglish ? 'Companion boundary' : 'Batas kompanion'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-sx-text-secondary">
            {isEnglish
              ? 'SYNTXRR cannot start, pause or stop the official TikTok LIVE broadcast. Use the TikTok app for that.'
              : 'SYNTXRR tidak dapat memulai, menjeda, atau menghentikan siaran LIVE TikTok resmi. Gunakan aplikasi TikTok untuk itu.'}
          </p>
        </div>
      </div>
    </section>
  );
}
