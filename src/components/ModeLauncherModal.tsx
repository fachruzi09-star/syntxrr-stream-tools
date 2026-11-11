import { OperatingMode, AppSettings } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import {
  X,
  Layers,
  Radio,
  Check,
  Video,
  Mic,
  Monitor,
  Flame,
  Battery,
  Cpu,
  Info,
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-launcher-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 id="mode-launcher-title" className="text-base font-bold text-white flex items-center gap-2">
              {t('mode.title', 'Arsitektur Jalur Operasi (Mode A vs Mode B)')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('mode.subtitle', 'Pilih dan uji dua jalur rendering terpisah: Floating HUD atau Direct RTMP Compositor')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={t('action.close', 'Tutup dialog')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Mode Selector Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode A */}
            <div
              onClick={() => onSelectMode('MODE_A_OVERLAY')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                currentMode === 'MODE_A_OVERLAY' || currentMode === 'MODE_A_TIKTOK_COMPANION'
                  ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50 ring-1 ring-blue-500'
                  : 'bg-[#131f36] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                {(currentMode === 'MODE_A_OVERLAY' || currentMode === 'MODE_A_TIKTOK_COMPANION') && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-800">
                    <Check className="w-3 h-3" /> {t('mode.activeBadge', 'Mode Aktif')}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mt-3">
                {t('mode.modeA.name', 'Mode A: TikTok LIVE Companion')}
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {t('mode.modeA.desc', 'Aplikasi TikTok resmi menyiarkan kamera Anda. SYNTXRR STREAM melayang di atasnya sebagai Floating HUD untuk memantau interaksi, audio, dan chat.')}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span>{t('mode.ramLoad', 'Beban RAM')}</span>
                  <span className="font-mono text-emerald-400 font-semibold">{t('mode.modeA.ramVal', '~45 MB (Rendah)')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('mode.batteryImpact', 'Dampak Baterai')}</span>
                  <span className="font-mono text-emerald-400 font-semibold">{t('mode.modeA.batteryVal', 'Minimal (<1.8%/jam)')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('mode.renderPipeline', 'Jalur Rendering')}</span>
                  <span className="text-slate-300">{t('mode.modeA.pipelineVal', 'Android Window Service')}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_A_OVERLAY');
                }}
                className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  currentMode === 'MODE_A_OVERLAY' || currentMode === 'MODE_A_TIKTOK_COMPANION'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {currentMode === 'MODE_A_OVERLAY' || currentMode === 'MODE_A_TIKTOK_COMPANION'
                  ? t('mode.modeA.selected', 'Mode A Terpilih')
                  : t('mode.modeA.select', 'Pilih Mode A')}
              </button>
            </div>

            {/* Mode B */}
            <div
              onClick={() => onSelectMode('MODE_B_ENCODER')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                currentMode === 'MODE_B_ENCODER' || currentMode === 'MODE_B_STREAMING_ENCODER'
                  ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50 ring-1 ring-blue-500'
                  : 'bg-[#131f36] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <Radio className="w-5 h-5" />
                </div>
                {(currentMode === 'MODE_B_ENCODER' || currentMode === 'MODE_B_STREAMING_ENCODER') && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded-full border border-sky-800">
                    <Check className="w-3 h-3" /> {t('mode.activeBadge', 'Mode Aktif')}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mt-3">
                {t('mode.modeB.name', 'Mode B: Standalone RTMP Encoder')}
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {t('mode.modeB.desc', 'SYNTXRR STREAM menyiarkan langsung audio/video ke server RTMP pilihan Anda (YouTube, Twitch, Kick) dengan kontrol encoder penuh.')}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span>{t('mode.ramLoad', 'Beban RAM')}</span>
                  <span className="font-mono text-amber-400 font-semibold">{t('mode.modeB.ramVal', '~135 MB (Seimbang)')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('mode.encoderProfile', 'Profil Encoder')}</span>
                  <span className="font-mono text-sky-400 font-semibold">{settings.targetResolution} @ {settings.frameRate} FPS</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('mode.broadcastProtocol', 'Protokol Siaran')}</span>
                  <span className="text-slate-300">{t('mode.modeB.protocolVal', 'RTMP / RTMPS Langsung')}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_B_ENCODER');
                }}
                className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  currentMode === 'MODE_B_ENCODER' || currentMode === 'MODE_B_STREAMING_ENCODER'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {currentMode === 'MODE_B_ENCODER' || currentMode === 'MODE_B_STREAMING_ENCODER'
                  ? t('mode.modeB.selected', 'Mode B Terpilih')
                  : t('mode.modeB.select', 'Pilih Mode B')}
              </button>
            </div>
          </div>

          {/* Runtime Mode Preview Simulation Box */}
          <div className="bg-[#080c16] rounded-xl border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-blue-400" />
                {currentMode === 'MODE_A_OVERLAY' || currentMode === 'MODE_A_TIKTOK_COMPANION'
                  ? t('mode.previewA', 'Pratinjau Mode A: Floating Overlay HUD')
                  : t('mode.previewB', 'Pratinjau Mode B: Compositor Pipeline RTMP 1080p')}
              </span>
              <span className="text-[10px] font-bold text-sky-400 bg-sky-950/80 border border-sky-800 px-2 py-0.5 rounded">
                {t('mode.simBadge', 'SIMULATION & FOUNDATION')}
              </span>
            </div>

            {currentMode === 'MODE_A_OVERLAY' || currentMode === 'MODE_A_TIKTOK_COMPANION' ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#0e1626] border border-blue-900/40 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                    <span>{t('mode.permStatus', 'Status Izin Android SYSTEM_ALERT_WINDOW')}</span>
                    <span className="text-emerald-400 font-bold">{t('mode.permSimulated', 'Tersimulasi Aktif')}</span>
                  </div>
                  <p className="leading-relaxed">
                    {t('mode.previewADesc', 'Saat dijalankan di perangkat Android dengan service latar depan, SYNTXRR memunculkan jendela floating pill yang tetap melayang di atas game (MLBB, PUBG, Free Fire) atau aplikasi TikTok LIVE.')}
                  </p>
                  {/* Floating Pill Mockup */}
                  <div className="my-2 p-2.5 rounded-lg bg-blue-950/90 border border-blue-500/80 flex items-center justify-between max-w-sm mx-auto shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                      <span className="text-xs font-bold text-white">{t('mode.floatingHudTitle', 'SYNTXRR FLOATING HUD')}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono">
                      {t('mode.floatingHudQueue', 'Queue: 3 · TTS: Aktif')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-[#0e1626] border border-slate-800">
                    <Video className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <div className="font-semibold text-white">{t('mode.videoSource', 'Video Source')}</div>
                    <div className="text-[10px] text-slate-400">{t('mode.videoSourceSub', 'Camera / Screen')}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0e1626] border border-slate-800">
                    <Mic className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <div className="font-semibold text-white">{t('mode.audioSource', 'Audio Source')}</div>
                    <div className="text-[10px] text-slate-400">{t('mode.audioSourceSub', 'Mic + Internal')}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0e1626] border border-slate-800">
                    <Cpu className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                    <div className="font-semibold text-white">{t('mode.muxer', 'Hardware Muxer')}</div>
                    <div className="text-[10px] text-slate-400">{t('mode.muxerSub', 'H.264 / AAC')}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#0e1626] border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span>{t('mode.rtmpTarget', 'RTMP Target:')}</span>
                  <span className="font-mono text-slate-400 truncate max-w-[240px]">
                    {settings.rtmpServer}
                  </span>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-950/30 border border-blue-900/50 text-xs text-blue-300/90">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {t('mode.disclaimer', 'Prinsip Keterbukaan: Koneksi server broadcast aktual berstatus belum tersambung (NOT_CONNECTED). Pengaturan, simulasi render, dan parameter tersimpan persisten secara lokal di IndexedDB HP.')}
              </p>
            </div>
          </div>

          {/* Device Profile Specs */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#131f36] border border-slate-800 flex items-center gap-2.5">
              <Battery className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">{t('mode.batteryConsumption', 'Konsumsi Baterai')}</div>
                <div className="font-bold text-white">{t('mode.batteryConsumptionVal', '~4.2%/jam Target')}</div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#131f36] border border-slate-800 flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">{t('mode.deviceTemp', 'Suhu Perangkat')}</div>
                <div className="font-bold text-white">{t('mode.deviceTempVal', '<38°C Seimbang')}</div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#131f36] border border-slate-800 flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">{t('mode.outputRes', 'Resolusi Output')}</div>
                <div className="font-bold text-white">{settings.targetResolution}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-[#080c16]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            {t('mode.applyClose', 'Terapkan & Tutup')}
          </button>
        </div>
      </div>
    </div>
  );
};
