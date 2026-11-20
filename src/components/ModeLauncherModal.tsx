import React from 'react';
import { X } from 'lucide-react';
import { AppSettings, OperatingMode, isModeAOperatingMode } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { StatusDot } from './ui/StatusDot';

interface ModeLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: OperatingMode;
  /** Retained for API compatibility — this sheet explains, it no longer switches. */
  settings?: AppSettings;
  onSelectMode?: (mode: OperatingMode) => void;
}

/**
 * Informational sheet explaining the two operating modes.
 *
 * It is no longer a second mode selector: switching happens only through the
 * Dashboard selector, so this sheet reports the current mode and closes.
 */
export const ModeLauncherModal: React.FC<ModeLauncherModalProps> = ({
  isOpen,
  onClose,
  currentMode,
}) => {
  const { isEnglish } = useTranslation();
  if (!isOpen) return null;

  const isModeA = isModeAOperatingMode(currentMode);

  const modes = [
    {
      id: 'a' as const,
      name: 'Mode A',
      title: isEnglish ? 'TikTok LIVE Companion' : 'Kompanion TikTok LIVE',
      active: isModeA,
      summary: isEnglish
        ? 'You broadcast with the official TikTok app. SYNTXRR reads LIVE activity and runs companion tools on top of it.'
        : 'Anda menyiarkan dengan aplikasi TikTok resmi. SYNTXRR membaca aktivitas LIVE dan menjalankan alat kompanion di atasnya.',
      needs: isEnglish
        ? ['TikTok target @username', 'Optional account link', 'Overlay permission for the HUD']
        : ['Target @username TikTok', 'Penautan akun (opsional)', 'Izin overlay untuk HUD'],
      doesNot: isEnglish
        ? 'SYNTXRR cannot start, pause or stop the official TikTok LIVE broadcast.'
        : 'SYNTXRR tidak dapat memulai, menjeda, atau menghentikan siaran LIVE TikTok resmi.',
    },
    {
      id: 'b' as const,
      name: 'Mode B',
      title: isEnglish ? 'RTMP Streaming Encoder' : 'Encoder Streaming RTMP',
      active: !isModeA,
      summary: isEnglish
        ? 'SYNTXRR captures the screen, encodes video and audio, and pushes RTMP to your own destination.'
        : 'SYNTXRR menangkap layar, meng-encode video dan audio, lalu mengirim RTMP ke tujuan Anda sendiri.',
      needs: isEnglish
        ? ['RTMP server URL', 'Your own stream key', 'Screen capture consent', 'Notification permission for the foreground service']
        : ['URL server RTMP', 'Stream key milik Anda', 'Persetujuan tangkap layar', 'Izin notifikasi untuk foreground service'],
      doesNot: isEnglish
        ? 'Encoded quality depends on your device. Unavailable or simulated metrics are never shown as live telemetry.'
        : 'Kualitas encoding bergantung pada perangkat. Metrik yang tidak tersedia tidak pernah ditampilkan sebagai telemetri langsung.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-info-title"
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-sx-lg border border-sx-border bg-sx-bg p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-sx-overlay sm:rounded-sx-lg sm:pb-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="mode-info-title" className="text-[15px] font-semibold tracking-tight text-sx-text">
              {isEnglish ? 'How the two modes differ' : 'Perbedaan kedua mode'}
            </h3>
            <p className="mt-0.5 text-sx-caption text-sx-text-muted">
              {isEnglish
                ? 'Switch modes from the selector on the Dashboard.'
                : 'Ganti mode lewat selektor di Dashboard.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEnglish ? 'Close' : 'Tutup'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-md text-sx-text-secondary transition-colors hover:bg-sx-surface-2 hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus"
          >
            <Icon icon={X} size="md" tone="inherit" />
          </button>
        </div>

        <div className="mt-3 space-y-2.5">
          {modes.map((mode) => (
            <div
              key={mode.id}
              className={
                mode.active
                  ? 'rounded-sx-lg border border-sx-accent/40 bg-sx-accent-soft p-3'
                  : 'rounded-sx-lg border border-sx-border bg-sx-surface p-3'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      mode.active
                        ? 'rounded-sx-sm bg-sx-accent px-1.5 py-0.5 text-[10px] font-bold text-sx-accent-fg'
                        : 'rounded-sx-sm border border-sx-border bg-sx-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-sx-text-secondary'
                    }
                  >
                    {mode.name}
                  </span>
                  <span className="text-sx-caption font-semibold text-sx-text">{mode.title}</span>
                </div>
                {mode.active ? (
                  <span className="flex items-center gap-1.5">
                    <StatusDot tone="ready" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sx-text-secondary">
                      {isEnglish ? 'Selected' : 'Dipilih'}
                    </span>
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-sx-text-secondary">{mode.summary}</p>

              <div className="mt-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-sx-text-muted">
                  {isEnglish ? 'Requires' : 'Membutuhkan'}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {mode.needs.map((need) => (
                    <li key={need} className="flex gap-1.5 text-[11px] leading-relaxed text-sx-text-secondary">
                      <span className="mt-[5px] h-1 w-1 shrink-0 rounded-sx-full bg-sx-accent" />
                      <span>{need}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-2 border-t border-sx-border-subtle pt-2 text-[11px] leading-relaxed text-sx-text-muted">
                {mode.doesNot}
              </p>
            </div>
          ))}
        </div>

        <Button variant="secondary" fullWidth className="mt-3" onClick={onClose}>
          {isEnglish ? 'Close' : 'Tutup'}
        </Button>
      </div>
    </div>
  );
};
