import React from 'react';
import {
  OperatingMode,
  AppSettings,
  isModeAOperatingMode,
  isModeBOperatingMode,
} from '../types';
import { useTranslation } from '../i18n/I18nContext';
import {
  X,
  Layers,
  Radio,
  Check,
  Video,
  Mic,
  Monitor,
  Cpu,
  Info,
  Gauge,
} from 'lucide-react';

interface ModeLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: OperatingMode;
  settings: AppSettings;
  onSelectMode: (mode: OperatingMode) => void;
}

export const ModeLauncherModal: React.FC<ModeLauncherModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  settings,
  onSelectMode,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const isModeA = isModeAOperatingMode(currentMode);
  const isModeB = isModeBOperatingMode(currentMode);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-launcher-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl shadow-[var(--app-shadow)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--app-border)]">
          <div>
            <h2
              id="mode-launcher-title"
              className="font-display text-base font-bold text-[var(--app-text)] flex items-center gap-2"
            >
              {t('mode.title', 'Pilih Mode Operasi Siaran')}
            </h2>
            <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
              {t('mode.subtitle', 'Pilih alur kerja yang sesuai dengan kebutuhan produksi Anda')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] transition-colors"
            aria-label={t('action.close', 'Tutup dialog')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Mode Selector Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode A */}
            <div
              onClick={() => onSelectMode('MODE_A_TIKTOK_COMPANION')}
              className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                isModeA
                  ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)] ring-1 ring-[var(--app-accent-border)]'
                  : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)]">
                  <Layers className="w-5 h-5" />
                </div>
                {isModeA && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--app-accent-text)] bg-[var(--app-accent-soft)] px-2 py-0.5 rounded border border-[var(--app-accent-border)]">
                    <Check className="w-3 h-3" /> {t('mode.activeBadge', 'Mode Aktif')}
                  </span>
                )}
              </div>
              <h3 className="font-display text-sm font-bold text-[var(--app-text)] mt-3">
                {t('mode.modeA.name', 'Mode A: TikTok LIVE Companion')}
              </h3>
              <p className="text-xs text-[var(--app-text-secondary)] mt-1 leading-relaxed">
                {t(
                  'mode.modeA.desc',
                  'Aplikasi TikTok resmi menyiarkan kamera Anda. SYNTXRR STREAM melayang di atasnya sebagai Floating HUD untuk memantau interaksi, audio, dan chat.',
                )}
              </p>

              <div className="mt-4 pt-3 border-t border-[var(--app-border)] space-y-2 text-[11px] text-[var(--app-text-muted)]">
                <div className="flex items-center justify-between gap-2">
                  <span>{t('mode.ramLoad', 'Beban RAM')}</span>
                  <span className="font-mono-num text-[var(--app-text-muted)]">
                    {t('mode.modeA.ramVal', 'Belum tersedia')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{t('mode.batteryImpact', 'Dampak Baterai')}</span>
                  <span className="font-mono-num text-[var(--app-text-muted)]">
                    {t('mode.modeA.batteryVal', 'Belum tersedia')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{t('mode.renderPipeline', 'Jalur Rendering')}</span>
                  <span className="text-[var(--app-text-secondary)]">
                    {t('mode.modeA.pipelineVal', 'Android Window Service')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_A_TIKTOK_COMPANION');
                }}
                className={`mt-4 w-full min-h-[44px] py-2 px-3 rounded-[9px] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isModeA
                    ? 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold'
                    : 'bg-[var(--app-surface-elevated)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] border border-[var(--app-border)]'
                }`}
              >
                {isModeA
                  ? t('mode.modeA.selected', 'Mode A Terpilih')
                  : t('mode.modeA.select', 'Pilih Mode A')}
              </button>
            </div>

            {/* Mode B */}
            <div
              onClick={() => onSelectMode('MODE_B_STREAMING_ENCODER')}
              className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                isModeB
                  ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)] ring-1 ring-[var(--app-accent-border)]'
                  : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)]">
                  <Radio className="w-5 h-5" />
                </div>
                {isModeB && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--app-accent-text)] bg-[var(--app-accent-soft)] px-2 py-0.5 rounded border border-[var(--app-accent-border)]">
                    <Check className="w-3 h-3" /> {t('mode.activeBadge', 'Mode Aktif')}
                  </span>
                )}
              </div>
              <h3 className="font-display text-sm font-bold text-[var(--app-text)] mt-3">
                {t('mode.modeB.name', 'Mode B: Standalone RTMP Encoder')}
              </h3>
              <p className="text-xs text-[var(--app-text-secondary)] mt-1 leading-relaxed">
                {t(
                  'mode.modeB.desc',
                  'SYNTXRR STREAM menyiarkan langsung audio/video ke server RTMP pilihan Anda (YouTube, Twitch, Kick) dengan kontrol encoder penuh.',
                )}
              </p>

              <div className="mt-4 pt-3 border-t border-[var(--app-border)] space-y-2 text-[11px] text-[var(--app-text-muted)]">
                <div className="flex items-center justify-between gap-2">
                  <span>{t('mode.ramLoad', 'Beban RAM')}</span>
                  <span className="font-mono-num text-[var(--app-text-muted)]">
                    {t('mode.modeB.ramVal', 'Belum tersedia')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{t('mode.encoderProfile', 'Profil Encoder')}</span>
                  <span className="font-mono-num text-[var(--app-text-secondary)] font-semibold">
                    {settings.targetResolution} @ {settings.frameRate} FPS
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>{t('mode.broadcastProtocol', 'Protokol Siaran')}</span>
                  <span className="text-[var(--app-text-secondary)]">
                    {t('mode.modeB.protocolVal', 'RTMP / RTMPS Langsung')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_B_STREAMING_ENCODER');
                }}
                className={`mt-4 w-full min-h-[44px] py-2 px-3 rounded-[9px] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isModeB
                    ? 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold'
                    : 'bg-[var(--app-surface-elevated)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] border border-[var(--app-border)]'
                }`}
              >
                {isModeB
                  ? t('mode.modeB.selected', 'Mode B Terpilih')
                  : t('mode.modeB.select', 'Pilih Mode B')}
              </button>
            </div>
          </div>

          {/* Pipeline & Architecture Preview */}
          <div className="bg-[var(--app-bg)] rounded-xl border border-[var(--app-border)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-text-muted)] flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-[var(--app-accent-text)]" />
                {isModeA
                  ? t('mode.previewA', 'Pratinjau Mode A: Floating Overlay HUD')
                  : t('mode.previewB', 'Pratinjau Mode B: Compositor Pipeline RTMP')}
              </span>
              <span className="text-[10px] font-semibold text-[var(--app-text-muted)] bg-[var(--app-surface)] border border-[var(--app-border)] px-2 py-0.5 rounded">
                {t('mode.simBadge', 'PRATINJAU ARSITEKTUR')}
              </span>
            </div>

            {isModeA ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--app-text-muted)] border-b border-[var(--app-border)] pb-1.5">
                    <span>{t('mode.permStatus', 'Izin Android SYSTEM_ALERT_WINDOW')}</span>
                    <span className="text-[var(--app-text-secondary)] font-semibold">
                      {t('mode.permSimulated', 'Periksa di Setelan Android')}
                    </span>
                  </div>
                  <p className="leading-relaxed">
                    {t(
                      'mode.previewADesc',
                      'Saat dijalankan di perangkat Android dengan service latar depan, SYNTXRR memunculkan jendela floating pill yang tetap melayang di atas game atau aplikasi TikTok LIVE.',
                    )}
                  </p>
                  <div className="my-2 p-2.5 rounded-lg bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] flex items-center justify-between max-w-sm mx-auto">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[var(--app-accent)]" />
                      <span className="text-xs font-bold text-[var(--app-text)]">
                        {t('mode.floatingHudTitle', 'SYNTXRR FLOATING HUD')}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)]">
                      {t('mode.floatingHudQueue', '6 Panel Kontrol Cepat')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)]">
                    <Video className="w-4 h-4 text-[var(--app-accent-text)] mx-auto mb-1" />
                    <div className="font-semibold text-[var(--app-text)]">
                      {t('mode.videoSource', 'Video Source')}
                    </div>
                    <div className="text-[10px] text-[var(--app-text-muted)]">
                      {t('mode.videoSourceSub', 'Camera / Screen')}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)]">
                    <Mic className="w-4 h-4 text-[var(--app-ok)] mx-auto mb-1" />
                    <div className="font-semibold text-[var(--app-text)]">
                      {t('mode.audioSource', 'Audio Source')}
                    </div>
                    <div className="text-[10px] text-[var(--app-text-muted)]">
                      {t('mode.audioSourceSub', 'Mic + Internal')}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)]">
                    <Cpu className="w-4 h-4 text-[var(--app-accent-text)] mx-auto mb-1" />
                    <div className="font-semibold text-[var(--app-text)]">
                      {t('mode.muxer', 'Hardware Muxer')}
                    </div>
                    <div className="text-[10px] text-[var(--app-text-muted)]">
                      {t('mode.muxerSub', 'H.264 / AAC')}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] flex items-center justify-between gap-3">
                  <span>{t('mode.rtmpTarget', 'RTMP Target:')}</span>
                  <span className="font-mono-num text-[var(--app-text-muted)] truncate max-w-[260px]">
                    {settings.rtmpServer || '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Honest Disclaimer */}
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)]">
              <Info className="w-4 h-4 text-[var(--app-accent-text)] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {t(
                  'mode.disclaimer',
                  'Catatan Transparansi: Pemilihan mode, target RTMP, dan profil encoder tersimpan secara persisten di perangkat. Telemetri perangkat keras nyata hanya dibaca saat sesi aktif berjalan.',
                )}
              </p>
            </div>
          </div>

          {/* Configured Output & Bitrate Specs (Real Settings Only) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[var(--app-surface-elevated)] border border-[var(--app-border)] flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
              <div>
                <div className="text-[11px] text-[var(--app-text-muted)]">
                  {t('mode.outputRes', 'Resolusi Output')}
                </div>
                <div className="font-bold font-mono-num text-[var(--app-text)]">
                  {settings.targetResolution} · {settings.frameRate} FPS
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--app-surface-elevated)] border border-[var(--app-border)] flex items-center gap-2.5">
              <Gauge className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
              <div>
                <div className="text-[11px] text-[var(--app-text-muted)]">
                  {t('settings.videoBitrate.title', 'Bitrate Video')}
                </div>
                <div className="font-bold font-mono-num text-[var(--app-text)]">
                  {settings.videoBitrateKbps} kbps
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--app-surface-elevated)] border border-[var(--app-border)] flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-[var(--app-text-muted)] shrink-0" />
              <div>
                <div className="text-[11px] text-[var(--app-text-muted)]">
                  {t('mode.batteryConsumption', 'Konsumsi Baterai')}
                </div>
                <div className="font-semibold text-[var(--app-text-muted)]">
                  {t('mode.batteryConsumptionVal', 'Belum tersedia')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--app-border)] flex items-center justify-end gap-3 bg-[var(--app-bg)]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-[9px] bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold transition-colors"
          >
            {t('mode.applyClose', 'Terapkan & Tutup')}
          </button>
        </div>
      </div>
    </div>
  );
};
