import React from 'react';
import { AlertTriangle, Mic, MonitorPlay, Radio, Settings2, Wifi } from 'lucide-react';
import type { AppSettings, ModeBAudioSource } from '../../types';
import type { ModeBStreamSnapshot } from '../../services/nativeStreamingBridge';
import { isModeBStoppableStatus } from '../../services/modeBController';
import { useTranslation } from '../../i18n/I18nContext';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { StatusDot } from '../ui/StatusDot';
import type { StatusTone } from '../ui/StatusDot';
import { InfoBanner, MetricTile, StatusRow } from './parts';
import type { PanelTone } from './parts';

interface ModeBPanelProps {
  /** Retained for API compatibility — copy now resolves through the i18n dictionary. */
  isEnglish?: boolean;
  settings: AppSettings;
  modeBStatus: ModeBStreamSnapshot;
  isModeBActionPending: boolean;
  modeBNotificationWarning: string | null;
  rtmpIssue: string | null;
  hasStreamKey: boolean;
  onStartStream?: () => Promise<void> | void;
  onStopStream?: () => Promise<void> | void;
  onRequestReshare?: () => Promise<void> | void;
  onToggleHostWait?: () => Promise<void> | void;
  onUpdateSettings?: (settings: AppSettings) => Promise<boolean> | void;
}

const BUSY_STATUSES = ['starting', 'connecting', 'stopping', 'resharing'];

/** One derived view per lifecycle state so chip dot, chip text and row agree. */
interface StatusView {
  dot: StatusTone;
  tone: PanelTone;
  label: string;
}

/**
 * Mode B operational panel — independent RTMP encoder.
 *
 * Every metric here is labelled either as configured (a target the user set)
 * or as measured (only when the encoder actually reports it). No estimated
 * hardware telemetry is invented, and no state claims success without the
 * controller confirming that the encoder is really streaming.
 */
export function ModeBPanel({
  settings,
  modeBStatus,
  isModeBActionPending,
  modeBNotificationWarning,
  rtmpIssue,
  hasStreamKey,
  onStartStream,
  onStopStream,
  onRequestReshare,
  onToggleHostWait,
  onUpdateSettings,
}: ModeBPanelProps) {
  const { t } = useTranslation();
  const isLiveVerified = modeBStatus.status === 'live' && modeBStatus.isStreaming;
  const isBusy = BUSY_STATUSES.includes(modeBStatus.status);
  const isHostWait = modeBStatus.status === 'host_wait';
  const canStop = isModeBStoppableStatus(modeBStatus.status);
  // Capture truth: a lost capture is a failure state, and asking the user to
  // re-share means the previous screen is gone — not attached.
  const isCaptureLost = modeBStatus.status === 'capture_lost';
  const isAwaitingScreen = modeBStatus.status === 'reshare_waiting';
  const isResharing = modeBStatus.status === 'resharing';

  const statusView: StatusView = (() => {
    if (isLiveVerified) {
      return { dot: 'connected', tone: 'success', label: t('dash.modeB.status.live') };
    }
    switch (modeBStatus.status) {
      case 'live':
        // The controller reports live but has not confirmed streaming: never
        // render this as a success state.
        return { dot: 'connecting', tone: 'warning', label: t('dash.modeB.status.awaitConfirm') };
      case 'host_wait':
        return { dot: 'connecting', tone: 'warning', label: t('dash.modeB.status.hostWait') };
      case 'reshare_waiting':
        return { dot: 'connecting', tone: 'warning', label: t('dash.modeB.status.reshareWait') };
      case 'resharing':
        return { dot: 'connecting', tone: 'warning', label: t('dash.modeB.status.resharing') };
      case 'starting':
      case 'connecting':
        return { dot: 'connecting', tone: 'warning', label: t('dash.modeB.status.starting') };
      case 'stopping':
        return { dot: 'connecting', tone: 'warning', label: t('dash.modeB.status.stopping') };
      case 'capture_lost':
        return { dot: 'disconnected', tone: 'danger', label: t('dash.modeB.status.captureLost') };
      case 'error':
        return { dot: 'disconnected', tone: 'danger', label: t('dash.modeB.status.error') };
      case 'disconnected':
        return { dot: 'disconnected', tone: 'danger', label: t('dash.modeB.status.disconnected') };
      case 'stopped':
        return { dot: 'idle', tone: 'neutral', label: t('dash.modeB.status.stopped') };
      default:
        return { dot: 'idle', tone: 'neutral', label: t('dash.modeB.status.standby') };
    }
  })();

  const captureView: { tone: PanelTone; label: string } = isCaptureLost
    ? { tone: 'danger', label: t('dash.modeB.value.lost') }
    : isAwaitingScreen
      ? { tone: 'warning', label: t('dash.modeB.value.waitingScreen') }
      : isResharing
        ? { tone: 'warning', label: t('dash.modeB.value.reAttaching') }
        : isLiveVerified || isHostWait
          ? { tone: 'success', label: t('dash.modeB.value.attached') }
          : { tone: 'neutral', label: t('dash.modeB.value.idle') };

  const audioSource: ModeBAudioSource =
    settings.modeBAudioSource === 'internal' || settings.modeBAudioSource === 'microphone'
      ? settings.modeBAudioSource
      : 'mix';

  const audioSourceLabel =
    audioSource === 'internal'
      ? t('dash.modeB.audio.internal')
      : audioSource === 'microphone'
        ? t('dash.modeB.audio.microphone')
        : t('dash.modeB.audio.mix');

  const startLabel =
    modeBStatus.status === 'reshare_waiting' || (modeBStatus.status === 'capture_lost' && modeBStatus.isStreaming)
      ? t('dash.modeB.action.reshare')
      : isLiveVerified || isHostWait
        ? t('dash.modeB.action.stopEncoder')
        : t('dash.modeB.action.startEncoder');

  const handlePrimaryAction = () => {
    if (modeBStatus.status === 'reshare_waiting' || (modeBStatus.status === 'capture_lost' && modeBStatus.isStreaming)) {
      void onRequestReshare?.();
      return;
    }
    if (isLiveVerified || isHostWait) {
      void onStopStream?.();
      return;
    }
    void onStartStream?.();
  };

  const rtmpHost = (() => {
    const raw = (settings.rtmpServer || '').trim();
    if (!raw) return '—';
    try {
      const withScheme = raw.includes('://') ? raw : `rtmp://${raw}`;
      return new URL(withScheme).host || raw;
    } catch {
      return raw.replace(/^rtmp:\/\//i, '').split('/')[0] || raw;
    }
  })();

  return (
    <section id="mode-b-details" aria-labelledby="mode-b-heading" className="space-y-3">
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface p-3.5 shadow-sx-raised">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="mode-b-heading" className="text-[15px] font-semibold tracking-tight text-sx-text">
              {t('dash.modeB.title')}
            </h2>
            <p className="mt-0.5 text-sx-caption leading-relaxed text-sx-text-muted">
              {t('dash.modeB.desc')}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-sx-full border border-sx-border bg-sx-surface-2 px-2 py-1">
            <StatusDot tone={statusView.dot} />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sx-text-secondary">
              {statusView.label}
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile
            icon={MonitorPlay}
            label={t('dash.modeB.metric.resolution')}
            value={settings.targetResolution || '—'}
            hint={t('dash.modeB.hint.configured')}
          />
          <MetricTile
            icon={Radio}
            label={t('dash.modeB.metric.fps')}
            value={settings.frameRate ? String(settings.frameRate) : '—'}
            hint={t('dash.modeB.hint.configured')}
          />
          <MetricTile
            icon={Wifi}
            label={t('dash.modeB.metric.bitrate')}
            value={
              isLiveVerified && modeBStatus.bitrateKbps > 0
                ? `${modeBStatus.bitrateKbps} kbps`
                : settings.videoBitrateKbps
                  ? `${settings.videoBitrateKbps} kbps`
                  : '—'
            }
            hint={
              isLiveVerified && modeBStatus.bitrateKbps > 0
                ? t('dash.modeB.hint.measured')
                : t('dash.modeB.hint.target')
            }
            tone={isLiveVerified ? 'success' : 'neutral'}
          />
          <MetricTile
            icon={Mic}
            label={t('dash.modeB.metric.audio')}
            value={audioSourceLabel}
            hint={t('dash.modeB.hint.configured')}
          />
        </div>

        <div className="mt-3 divide-y divide-sx-border-subtle rounded-sx-md border border-sx-border-subtle bg-sx-surface-2 px-2.5 py-1">
          <StatusRow
            label={t('dash.modeB.row.state')}
            value={statusView.label}
            detail={modeBStatus.message || undefined}
            tone={statusView.tone}
          />
          <StatusRow
            label="RTMP"
            value={rtmpHost}
            tone={rtmpIssue ? 'warning' : settings.rtmpServer ? 'success' : 'neutral'}
          />
          <StatusRow
            label={t('dash.modeB.row.streamKey')}
            value={hasStreamKey ? t('dash.modeB.value.saved') : t('dash.modeB.value.notSet')}
            tone={hasStreamKey ? 'success' : 'warning'}
          />
          <StatusRow
            label={t('dash.modeB.row.capture')}
            value={captureView.label}
            tone={captureView.tone}
          />
        </div>

        {rtmpIssue ? (
          <InfoBanner tone="warning" title={t('dash.modeB.banner.rtmpIncomplete')} className="mt-3">
            {rtmpIssue}
          </InfoBanner>
        ) : null}

        {modeBNotificationWarning ? (
          <InfoBanner tone="warning" title={t('dash.modeB.banner.background')} className="mt-3">
            {modeBNotificationWarning}
          </InfoBanner>
        ) : null}

        {modeBStatus.status === 'error' && modeBStatus.message ? (
          <InfoBanner tone="danger" title={t('dash.modeB.banner.error')} className="mt-3">
            {modeBStatus.message}
          </InfoBanner>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant={isLiveVerified || isHostWait ? 'danger' : 'primary'}
            fullWidth
            onClick={handlePrimaryAction}
            disabled={isModeBActionPending || isBusy}
            loading={isModeBActionPending}
          >
            {startLabel}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onStopStream?.()}
              disabled={isModeBActionPending || !canStop}
            >
              {t('dash.modeB.action.stop')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onToggleHostWait?.()}
              disabled={isModeBActionPending || !(isLiveVerified || isHostWait)}
            >
              {isHostWait ? t('dash.modeB.action.exitHostWait') : t('dash.modeB.action.hostWait')}
            </Button>
          </div>

          <label className="mt-1 block">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
              <Icon icon={Settings2} size="xs" tone="muted" />
              {t('dash.modeB.audioSource')}
            </span>
            <select
              value={audioSource}
              onChange={(event) => {
                const next = event.target.value as ModeBAudioSource;
                void onUpdateSettings?.({ ...settings, modeBAudioSource: next });
              }}
              className="min-h-[44px] w-full rounded-sx-md border border-sx-border bg-sx-input px-2.5 text-sx-caption font-semibold text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus"
            >
              <option value="mix">{t('dash.modeB.audio.mix')}</option>
              <option value="microphone">{t('dash.modeB.audio.microphone')}</option>
              <option value="internal">{t('dash.modeB.audio.internal')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-sx-lg border border-sx-border bg-sx-surface p-3">
        <div className="flex items-center gap-1.5">
          <Icon icon={AlertTriangle} size="xs" tone="muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
            {t('dash.modeB.honesty.title')}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-sx-text-secondary">
          {t('dash.modeB.honesty.body')}
        </p>
      </div>
    </section>
  );
}
