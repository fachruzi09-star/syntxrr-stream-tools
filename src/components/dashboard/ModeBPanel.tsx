import React from 'react';
import { AlertTriangle, Mic, MonitorPlay, Radio, Settings2, Wifi } from 'lucide-react';
import type { AppSettings, ModeBAudioSource } from '../../types';
import type { ModeBStreamSnapshot } from '../../services/nativeStreamingBridge';
import { isModeBStoppableStatus } from '../../services/modeBController';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { StatusDot } from '../ui/StatusDot';
import { InfoBanner, MetricTile, StatusRow } from './parts';
import type { PanelTone } from './parts';

interface ModeBPanelProps {
  isEnglish: boolean;
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

/**
 * Mode B operational panel — independent RTMP encoder.
 *
 * Every metric here is labelled either as configured (a target the user set)
 * or as measured (only when the encoder actually reports it). No estimated
 * hardware telemetry is invented.
 */
export function ModeBPanel({
  isEnglish,
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
  const isLiveVerified = modeBStatus.status === 'live' && modeBStatus.isStreaming;
  const isBusy = BUSY_STATUSES.includes(modeBStatus.status);
  const isHostWait = modeBStatus.status === 'host_wait';
  const canStop = isModeBStoppableStatus(modeBStatus.status);
  // Capture truth: a lost capture is a failure state, and asking the user to
  // re-share means the previous screen is gone — not attached.
  const isCaptureLost = modeBStatus.status === 'capture_lost';
  const isAwaitingScreen = modeBStatus.status === 'reshare_waiting';

  const statusTone: PanelTone = isLiveVerified
    ? 'success'
    : modeBStatus.status === 'error' || modeBStatus.status === 'capture_lost'
      ? 'danger'
      : isBusy || isHostWait || modeBStatus.status === 'reshare_waiting'
        ? 'warning'
        : modeBStatus.status === 'disconnected'
          ? 'warning'
          : 'neutral';

  const statusLabel = isLiveVerified
    ? isEnglish
      ? 'Encoding'
      : 'Meng-encode'
    : modeBStatus.status === 'host_wait'
      ? isEnglish
        ? 'Waiting screen'
        : 'Layar tunggu'
      : modeBStatus.status === 'reshare_waiting'
        ? isEnglish
          ? 'Waiting for screen'
          : 'Menunggu layar'
        : modeBStatus.status === 'resharing'
          ? isEnglish
            ? 'Reconnecting screen'
            : 'Menyambung layar'
          : modeBStatus.status === 'starting' || modeBStatus.status === 'connecting'
            ? isEnglish
              ? 'Starting encoder'
              : 'Memulai encoder'
            : modeBStatus.status === 'stopping'
              ? isEnglish
                ? 'Stopping'
                : 'Menghentikan'
              : modeBStatus.status === 'capture_lost'
                ? isEnglish
                  ? 'Capture lost'
                  : 'Capture terputus'
                : modeBStatus.status === 'error'
                  ? isEnglish
                    ? 'Encoder error'
                    : 'Error encoder'
                  : modeBStatus.status === 'disconnected'
                    ? isEnglish
                      ? 'RTMP disconnected'
                      : 'RTMP terputus'
                    : modeBStatus.status === 'stopped'
                      ? isEnglish
                        ? 'Stopped'
                        : 'Berhenti'
                      : isEnglish
                        ? 'Standby'
                        : 'Siaga';

  const audioSource: ModeBAudioSource =
    settings.modeBAudioSource === 'internal' || settings.modeBAudioSource === 'microphone'
      ? settings.modeBAudioSource
      : 'mix';

  const audioSourceLabel =
    audioSource === 'internal'
      ? isEnglish
        ? 'Internal audio'
        : 'Audio internal'
      : audioSource === 'microphone'
        ? isEnglish
          ? 'Microphone only'
          : 'Mikrofon saja'
        : isEnglish
          ? 'Mix (mic + internal)'
          : 'Campur (mik + internal)';

  const startLabel =
    modeBStatus.status === 'reshare_waiting' || (modeBStatus.status === 'capture_lost' && modeBStatus.isStreaming)
      ? isEnglish
        ? 'Share Screen Again'
        : 'Bagikan Layar Lagi'
      : isLiveVerified || isHostWait
        ? isEnglish
          ? 'Stop Encoder'
          : 'Hentikan Encoder'
        : isEnglish
          ? 'Start Encoder'
          : 'Mulai Encoder';

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
              {isEnglish ? 'RTMP Streaming Encoder' : 'Encoder Streaming RTMP'}
            </h2>
            <p className="mt-0.5 text-sx-caption leading-relaxed text-sx-text-muted">
              {isEnglish
                ? 'SYNTXRR captures, encodes and pushes the stream itself. No TikTok app involved.'
                : 'SYNTXRR menangkap, meng-encode, dan mengirim siaran sendiri. Tanpa aplikasi TikTok.'}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-sx-full border border-sx-border bg-sx-surface-2 px-2 py-1">
            <StatusDot
              tone={
                isLiveVerified
                  ? 'connected'
                  : isCaptureLost || modeBStatus.status === 'error'
                    ? 'disconnected'
                    : isBusy || isHostWait || isAwaitingScreen
                      ? 'connecting'
                      : 'idle'
              }
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sx-text-secondary">
              {statusLabel}
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile
            icon={MonitorPlay}
            label={isEnglish ? 'Resolution' : 'Resolusi'}
            value={settings.targetResolution || '—'}
            hint={isEnglish ? 'Configured' : 'Dikonfigurasi'}
          />
          <MetricTile
            icon={Radio}
            label="FPS"
            value={settings.frameRate ? String(settings.frameRate) : '—'}
            hint={isEnglish ? 'Configured' : 'Dikonfigurasi'}
          />
          <MetricTile
            icon={Wifi}
            label={isEnglish ? 'Bitrate' : 'Bitrate'}
            value={
              isLiveVerified && modeBStatus.bitrateKbps > 0
                ? `${modeBStatus.bitrateKbps} kbps`
                : settings.videoBitrateKbps
                  ? `${settings.videoBitrateKbps} kbps`
                  : '—'
            }
            hint={isLiveVerified && modeBStatus.bitrateKbps > 0 ? (isEnglish ? 'Measured' : 'Terukur') : isEnglish ? 'Target' : 'Target'}
            tone={isLiveVerified ? 'success' : 'neutral'}
          />
          <MetricTile
            icon={Mic}
            label={isEnglish ? 'Audio' : 'Audio'}
            value={audioSourceLabel}
            hint={isEnglish ? 'Configured' : 'Dikonfigurasi'}
          />
        </div>

        <div className="mt-3 divide-y divide-sx-border-subtle rounded-sx-md border border-sx-border-subtle bg-sx-surface-2 px-2.5 py-1">
          <StatusRow
            label={isEnglish ? 'Encoder state' : 'Status encoder'}
            value={statusLabel}
            detail={modeBStatus.message || undefined}
            tone={statusTone}
          />
          <StatusRow
            label="RTMP"
            value={rtmpHost}
            tone={rtmpIssue ? 'warning' : settings.rtmpServer ? 'success' : 'neutral'}
          />
          <StatusRow
            label={isEnglish ? 'Stream key' : 'Stream key'}
            value={hasStreamKey ? (isEnglish ? 'Configured' : 'Tersimpan') : isEnglish ? 'Not set' : 'Belum diatur'}
            tone={hasStreamKey ? 'success' : 'warning'}
          />
          <StatusRow
            label={isEnglish ? 'Screen capture' : 'Tangkap layar'}
            value={
              isCaptureLost
                ? isEnglish
                  ? 'Lost'
                  : 'Terputus'
                : isAwaitingScreen
                  ? isEnglish
                    ? 'Waiting for screen'
                    : 'Menunggu layar'
                  : isLiveVerified || isHostWait
                    ? isEnglish
                      ? 'Attached'
                      : 'Terpasang'
                    : isEnglish
                      ? 'Idle'
                      : 'Siaga'
            }
            tone={isCaptureLost ? 'danger' : isAwaitingScreen ? 'warning' : isLiveVerified ? 'success' : 'neutral'}
          />
        </div>

        {rtmpIssue ? (
          <InfoBanner tone="warning" title={isEnglish ? 'RTMP configuration incomplete' : 'Konfigurasi RTMP belum lengkap'} className="mt-3">
            {rtmpIssue}
          </InfoBanner>
        ) : null}

        {modeBNotificationWarning ? (
          <InfoBanner tone="warning" title={isEnglish ? 'Background limit' : 'Batasan latar belakang'} className="mt-3">
            {modeBNotificationWarning}
          </InfoBanner>
        ) : null}

        {modeBStatus.status === 'error' && modeBStatus.message ? (
          <InfoBanner tone="danger" title={isEnglish ? 'Encoder reported an error' : 'Encoder melaporkan error'} className="mt-3">
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
              {isEnglish ? 'Stop' : 'Hentikan'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onToggleHostWait?.()}
              disabled={isModeBActionPending || !(isLiveVerified || isHostWait)}
            >
              {isHostWait
                ? isEnglish
                  ? 'Exit host wait'
                  : 'Keluar layar tunggu'
                : isEnglish
                  ? 'Host wait'
                  : 'Layar tunggu'}
            </Button>
          </div>

          <label className="mt-1 block">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
              <Icon icon={Settings2} size="xs" tone="muted" />
              {isEnglish ? 'Audio source' : 'Sumber audio'}
            </span>
            <select
              value={audioSource}
              onChange={(event) => {
                const next = event.target.value as ModeBAudioSource;
                void onUpdateSettings?.({ ...settings, modeBAudioSource: next });
              }}
              className="min-h-[44px] w-full rounded-sx-md border border-sx-border bg-sx-input px-2.5 text-sx-caption font-semibold text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus"
            >
              <option value="mix">{isEnglish ? 'Mix (mic + internal)' : 'Campur (mik + internal)'}</option>
              <option value="microphone">{isEnglish ? 'Microphone only' : 'Mikrofon saja'}</option>
              <option value="internal">{isEnglish ? 'Internal audio' : 'Audio internal'}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-sx-lg border border-sx-border bg-sx-surface p-3">
        <div className="flex items-center gap-1.5">
          <Icon icon={AlertTriangle} size="xs" tone="muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
            {isEnglish ? 'Configured vs measured' : 'Konfigurasi vs terukur'}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-sx-text-secondary">
          {isEnglish
            ? 'Resolution, FPS and bitrate above are targets you configured. A live bitrate is shown only when the encoder reports it. Thermal and encoder benchmarks are not available yet.'
            : 'Resolusi, FPS, dan bitrate di atas adalah target yang Anda konfigurasi. Bitrate langsung hanya ditampilkan bila encoder melaporkannya. Benchmark termal dan encoder belum tersedia.'}
        </p>
      </div>
    </section>
  );
}
