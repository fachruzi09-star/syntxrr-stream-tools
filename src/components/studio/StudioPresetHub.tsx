import React, { useMemo, useState } from 'react';
import {
  CanvasOrientation,
  PresetCategory,
  StudioPreset,
} from '../../types';
import { StudioPresetMiniPreview } from './StudioPresetMiniPreview';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  Download,
  Edit2,
  FolderOpen,
  Layout,
  Lock,
  Monitor,
  MoreVertical,
  Play,
  Plus,
  Search,
  Smartphone,
  Square,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

export interface StudioPresetHubProps {
  presets: StudioPreset[];
  activePresetId?: string;
  activePreset: StudioPreset | null;
  canvasOrientation: CanvasOrientation;
  hasResumeSession: boolean;
  isModeBMutationLocked: boolean;
  isModeBLive: boolean;
  selectorFilterCategory: PresetCategory;
  onChangeFilterCategory: (category: PresetCategory) => void;
  selectorActionError: string | null;
  onDismissActionError: () => void;
  transferNotice: { tone: 'ok' | 'error'; text: string } | null;
  onDismissTransferNotice: () => void;
  isTransferringPreset: boolean;
  isCreatingBlankCanvas: boolean;
  editingPresetIdInSelector: string | null;
  editingNameInSelector: string;
  onStartRenamePreset: (preset: StudioPreset) => void;
  onChangeEditingName: (value: string) => void;
  onSaveRenamePreset: (presetId: string) => void;
  onCancelRenamePreset: () => void;
  onSelectPreset: (presetId: string) => void;
  onResumeCanvas: () => void;
  onCreateBlankCanvas: () => Promise<void>;
  onOpenCreateModal: () => void;
  onToggleFavoritePreset?: (presetId: string) => void;
  onDuplicatePreset?: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onExportPreset: (preset: StudioPreset) => Promise<void>;
  onTriggerImportPreset: () => void;
  // Create Preset Modal State & Handlers
  createModalOpen: boolean;
  onCloseCreateModal: () => void;
  presetNameInput: string;
  onChangePresetNameInput: (value: string) => void;
  presetOrientationInput: CanvasOrientation;
  onChangePresetOrientationInput: (
    orientation: CanvasOrientation,
    category: PresetCategory,
  ) => void;
  presetTemplateInput: 'blank' | 'gaming' | 'chatting' | 'music';
  onChangePresetTemplateInput: (
    template: 'blank' | 'gaming' | 'chatting' | 'music',
  ) => void;
  presetDescriptionInput: string;
  onChangePresetDescriptionInput: (value: string) => void;
  isCreatingPreset: boolean;
  createError: string | null;
  onSubmitCreatePreset: (e: React.FormEvent) => Promise<void>;
}

const CATEGORY_OPTIONS: ReadonlyArray<{ id: PresetCategory; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'hp_screen', label: '9:16 HP' },
  { id: 'landscape', label: '16:9 PC' },
  { id: 'portrait', label: '1:1' },
  { id: 'favorites', label: 'Favorit' },
];

export const StudioPresetHub: React.FC<StudioPresetHubProps> = ({
  presets,
  activePresetId,
  activePreset,
  canvasOrientation,
  hasResumeSession,
  isModeBMutationLocked,
  isModeBLive,
  selectorFilterCategory,
  onChangeFilterCategory,
  selectorActionError,
  onDismissActionError,
  transferNotice,
  onDismissTransferNotice,
  isTransferringPreset,
  isCreatingBlankCanvas,
  editingPresetIdInSelector,
  editingNameInSelector,
  onStartRenamePreset,
  onChangeEditingName,
  onSaveRenamePreset,
  onCancelRenamePreset,
  onSelectPreset,
  onResumeCanvas,
  onCreateBlankCanvas,
  onOpenCreateModal,
  onToggleFavoritePreset,
  onDuplicatePreset,
  onDeletePreset,
  onExportPreset,
  onTriggerImportPreset,
  createModalOpen,
  onCloseCreateModal,
  presetNameInput,
  onChangePresetNameInput,
  presetOrientationInput,
  onChangePresetOrientationInput,
  presetTemplateInput,
  onChangePresetTemplateInput,
  presetDescriptionInput,
  onChangePresetDescriptionInput,
  isCreatingPreset,
  createError,
  onSubmitCreatePreset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSheetPresetId, setActionSheetPresetId] = useState<string | null>(null);

  const filteredPresets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return presets.filter((preset) => {
      if (selectorFilterCategory === 'favorites' && !preset.isFavorite) {
        return false;
      }
      if (
        selectorFilterCategory !== 'all' &&
        selectorFilterCategory !== 'favorites' &&
        preset.category !== selectorFilterCategory
      ) {
        return false;
      }
      if (!query) return true;
      return (
        preset.name.toLowerCase().includes(query) ||
        (preset.description || '').toLowerCase().includes(query) ||
        preset.canvasOrientation.toLowerCase().includes(query)
      );
    });
  }, [presets, selectorFilterCategory, searchQuery]);

  const actionSheetPreset = useMemo(
    () => (actionSheetPresetId ? presets.find((p) => p.id === actionSheetPresetId) || null : null),
    [actionSheetPresetId, presets],
  );

  const renamingPreset = useMemo(
    () => (editingPresetIdInSelector ? presets.find((p) => p.id === editingPresetIdInSelector) || null : null),
    [editingPresetIdInSelector, presets],
  );

  const renderOrientationIcon = (orientation: CanvasOrientation) => {
    if (orientation === '9:16') return <Smartphone className="w-3 h-3 shrink-0" />;
    if (orientation === '16:9') return <Monitor className="w-3 h-3 shrink-0" />;
    return <Square className="w-3 h-3 shrink-0" />;
  };

  return (
    <div className="space-y-3 pb-20 xl:pb-6 overflow-x-hidden max-w-full">
      {/* Compact Studio Preset Hub Header */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3 sm:p-4 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h1 className="font-display text-base sm:text-xl font-bold text-[var(--app-text)] tracking-tight">
                Preset Studio
              </h1>
              <span className="text-[11px] text-[var(--app-text-muted)] tabular-metrics">
                {presets.length} preset · {canvasOrientation}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--app-text-secondary)] mt-0.5 line-clamp-1">
              Pilih preset untuk masuk kanvas atau buat tata letak baru.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            {hasResumeSession && (
              <button
                type="button"
                onClick={onResumeCanvas}
                className="btn-press min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] font-bold text-[11px] sm:text-xs inline-flex items-center gap-1 whitespace-nowrap"
              >
                <ArrowRight className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
                <span>Ke Kanvas</span>
              </button>
            )}
            <button
              type="button"
              disabled={isModeBMutationLocked || isTransferringPreset}
              onClick={onTriggerImportPreset}
              className="btn-press min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold text-[11px] sm:text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title="Impor paket preset JSON beserta aset lokal"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
              <span>{isTransferringPreset ? 'Memproses...' : 'Impor'}</span>
            </button>
            <button
              type="button"
              onClick={() => void onCreateBlankCanvas()}
              disabled={isModeBMutationLocked || isCreatingBlankCanvas}
              className="btn-press min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold text-[11px] sm:text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Layout className="w-3.5 h-3.5 text-[var(--app-text-secondary)]" />
              <span>{isCreatingBlankCanvas ? 'Membuat...' : 'Kosong'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenCreateModal}
              disabled={isModeBMutationLocked}
              className="btn-press min-h-[40px] sm:min-h-[44px] px-3 sm:px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-[11px] sm:text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Preset Baru</span>
            </button>
          </div>
        </div>

        {/* Notices / Validation Feedback */}
        {selectorActionError && (
          <div
            role="alert"
            className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs text-rose-200 flex items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{selectorActionError}</span>
            </span>
            <button
              type="button"
              onClick={onDismissActionError}
              className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-semibold text-rose-300 hover:text-white shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {transferNotice && (
          <div
            role={transferNotice.tone === 'error' ? 'alert' : 'status'}
            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              transferNotice.tone === 'error'
                ? 'border-rose-500/40 bg-rose-950/40 text-rose-200'
                : 'border-emerald-500/35 bg-[var(--app-ok-soft)] text-[var(--app-text)]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {transferNotice.tone === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <Check className="w-4 h-4 text-[var(--app-ok)] shrink-0" />
              )}
              <span>{transferNotice.text}</span>
            </span>
            <button
              type="button"
              onClick={onDismissTransferNotice}
              className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-semibold opacity-80 hover:opacity-100 shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {isModeBMutationLocked && (
          <div className="p-2.5 rounded-xl border border-amber-500/35 bg-[var(--app-warn-soft)] text-[11px] text-[var(--app-text)] flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-[var(--app-warn)] shrink-0" />
            <span>
              {isModeBLive
                ? 'Mode B sedang LIVE — pilih preset atau buka Studio tanpa mengganggu orientasi siaran aktif.'
                : 'Mode B sedang sibuk — pembuatan, penghapusan, dan impor preset dikunci sementara.'}
            </span>
          </div>
        )}

        {/* Filter Bar + Search */}
        <div className="pt-2.5 border-t border-[var(--app-border)] flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] overflow-x-auto no-scrollbar flex-1 min-w-0">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onChangeFilterCategory(cat.id)}
                className={`btn-press min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                  selectorFilterCategory === cat.id
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative md:w-60 shrink-0">
            <Search className="w-3.5 h-3.5 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama preset..."
              className="w-full min-h-[40px] sm:min-h-[44px] pl-8 pr-8 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian preset"
                className="min-h-[36px] min-w-[36px] absolute right-0.5 top-1/2 -translate-y-1/2 rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Compact Returning User Active Spotlight */}
      {activePreset && (
        <section
          aria-label="Preset aktif terakhir"
          className="rounded-2xl bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] p-3 sm:p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <StudioPresetMiniPreview
              elements={activePreset.elements}
              orientation={activePreset.canvasOrientation}
              isActive
              hasBackground={Boolean(activePreset.backgroundUri)}
              size="xs"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="text-[10px] font-bold text-[var(--app-ok)] uppercase tracking-wider">
                Preset Terakhir
              </div>
              <h2 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)] tracking-tight truncate">
                {activePreset.name}
              </h2>
              <div className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics flex items-center gap-1.5 flex-wrap">
                <span>
                  {activePreset.canvasOrientation === '9:16'
                    ? 'Mode A · 9:16'
                    : `Mode B · ${activePreset.canvasOrientation}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activePreset.elements.length} elemen</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectPreset(activePreset.id)}
            className="btn-press min-h-[44px] px-3.5 sm:px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Lanjutkan</span>
          </button>
        </section>
      )}

      {/* Active Inline Rename Strip (accessible at 360px+ without getting clipped inside narrow 3-up cards) */}
      {renamingPreset && (
        <div
          role="region"
          aria-label={`Ubah nama ${renamingPreset.name}`}
          className="rounded-2xl bg-[var(--app-surface-elevated)] border border-[var(--app-accent)] p-3 space-y-2 anim-pop-in"
        >
          <div className="text-[11px] font-bold text-[var(--app-accent-text)]">
            Ubah Nama Preset
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={editingNameInSelector}
              onChange={(e) => onChangeEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveRenamePreset(renamingPreset.id);
                if (e.key === 'Escape') onCancelRenamePreset();
              }}
              placeholder="Nama preset..."
              className="flex-1 min-w-[160px] min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-accent)] rounded-xl px-3 text-xs text-[var(--app-text)] focus:outline-none font-bold"
              autoFocus
            />
            <button
              type="button"
              onClick={() => onSaveRenamePreset(renamingPreset.id)}
              className="btn-press min-h-[44px] px-4 bg-[var(--app-accent)] text-[var(--app-accent-ink)] text-xs rounded-xl font-bold shrink-0"
            >
              Simpan
            </button>
            <button
              type="button"
              onClick={onCancelRenamePreset}
              className="btn-press min-h-[44px] px-3.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs rounded-xl shrink-0"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* New-User Empty State / Filtered Empty State / 3-Up Horizontal Preset Cards */}
      {presets.length === 0 ? (
        <section className="rounded-2xl bg-[var(--app-surface)] border border-dashed border-[var(--app-border-strong)] p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] text-[var(--app-accent-text)] flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="font-display text-base font-bold text-[var(--app-text)]">
              Mulai Desain Layar Streaming Pertama Anda
            </h2>
            <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
              Pilih template siap pakai seperti Mobile Gaming atau Just Chatting, mulai dari kanvas kosong, atau impor file preset JSON.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenCreateModal}
              disabled={isModeBMutationLocked}
              className="btn-press min-h-[44px] px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-2 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              <span>Buat dari Template Starter</span>
            </button>
            <button
              type="button"
              onClick={() => void onCreateBlankCanvas()}
              disabled={isModeBMutationLocked || isCreatingBlankCanvas}
              className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-40"
            >
              <Layout className="w-4 h-4" />
              <span>Mulai Kanvas Kosong</span>
            </button>
          </div>
        </section>
      ) : filteredPresets.length === 0 ? (
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-6 text-center space-y-2">
          <p className="text-sm font-bold text-[var(--app-text)]">
            Tidak ada preset yang cocok dengan filter saat ini
          </p>
          <p className="text-xs text-[var(--app-text-secondary)]">
            Coba ubah kategori atau kata kunci pencarian untuk melihat preset yang tersimpan.
          </p>
          <button
            type="button"
            onClick={() => {
              onChangeFilterCategory('all');
              setSearchQuery('');
            }}
            className="btn-press mt-2 min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)]"
          >
            Tampilkan Semua Preset
          </button>
        </section>
      ) : (
        <section aria-label="Daftar preset Studio" className="space-y-2 max-w-full">
          <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-[var(--app-text-secondary)]">
            <span className="font-semibold">
              Daftar Preset ({filteredPresets.length})
            </span>
            {filteredPresets.length > 3 && (
              <span className="md:hidden text-[10px] text-[var(--app-accent-text)] font-semibold">
                Geser horizontal →
              </span>
            )}
          </div>

          {/* 3 Preset Cards Side-by-Side on Portrait Phones (360-412px), smooth horizontal scroll for 4+ */}
          <div className="flex flex-nowrap gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1.5 no-scrollbar md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:overflow-visible md:pb-0">
            {filteredPresets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <article
                  key={preset.id}
                  className={`w-[calc((100%-16px)/3)] shrink-0 snap-start sm:w-[calc((100%-24px)/3)] md:w-auto rounded-2xl border flex flex-col justify-between overflow-hidden transition-colors ${
                    isActive
                      ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                      : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  {/* Top Bar: Orientation + Favorite */}
                  <div className="px-1.5 pt-1 flex items-center justify-between gap-0.5 bg-[var(--app-bg)]">
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--app-text-secondary)] tabular-metrics truncate">
                      {renderOrientationIcon(preset.canvasOrientation)}
                      <span>{preset.canvasOrientation}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleFavoritePreset?.(preset.id)}
                      aria-label={
                        preset.isFavorite
                          ? `Hapus ${preset.name} dari favorit`
                          : `Tandai ${preset.name} sebagai favorit`
                      }
                      className="btn-press min-h-[34px] min-w-[34px] sm:min-h-[38px] sm:min-w-[38px] -my-0.5 -mr-0.5 rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] flex items-center justify-center shrink-0"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          preset.isFavorite ? 'fill-[var(--app-accent)] text-[var(--app-accent)]' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Proportional Mini Preview Stage */}
                  <button
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    aria-label={`Buka preset ${preset.name} di Studio`}
                    className="w-full px-1.5 py-2 bg-[var(--app-bg)] border-b border-[var(--app-border)] flex items-center justify-center min-h-[78px] sm:min-h-[96px] focus:outline-none hover:bg-[var(--app-surface-muted)]/60 transition-colors"
                  >
                    <StudioPresetMiniPreview
                      elements={preset.elements}
                      orientation={preset.canvasOrientation}
                      isActive={isActive}
                      hasBackground={Boolean(preset.backgroundUri)}
                      size="xs"
                    />
                  </button>

                  {/* Compact Preset Info */}
                  <button
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    className="p-2 text-left space-y-0.5 flex-1 flex flex-col justify-between min-w-0 hover:bg-[var(--app-surface-hover)]/40 transition-colors"
                  >
                    <h3 className="text-[11px] sm:text-xs font-display font-bold text-[var(--app-text)] tracking-tight truncate w-full">
                      {preset.name}
                    </h3>
                    <div className="text-[9px] sm:text-[10px] text-[var(--app-text-muted)] tabular-metrics truncate w-full">
                      {preset.elements.length} elm · {preset.canvasOrientation === '9:16' ? 'Mode A' : 'Mode B'}
                      {isActive && <span className="text-[var(--app-ok)] font-bold"> · Aktif</span>}
                    </div>
                  </button>

                  {/* Compact Card Action Row (Open + Actions Menu preserving Rename/Duplicate/Export/Delete) */}
                  <div className="px-1.5 py-1.5 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)] flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectPreset(preset.id)}
                      className={`btn-press flex-1 min-w-0 min-h-[36px] sm:min-h-[40px] px-1.5 rounded-lg font-bold text-[10px] sm:text-[11px] truncate ${
                        isActive
                          ? 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
                          : 'bg-[var(--app-surface)] hover:bg-[var(--app-accent)] hover:text-[var(--app-accent-ink)] border border-[var(--app-border-strong)] text-[var(--app-text)]'
                      }`}
                    >
                      {isActive ? 'Edit' : 'Pakai'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActionSheetPresetId(preset.id)}
                      aria-label={`Kelola aksi untuk ${preset.name}`}
                      aria-haspopup="dialog"
                      className="btn-press min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center shrink-0"
                      title="Opsi preset (Rename, Duplikat, Ekspor, Hapus)"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Preset Options Action Sheet (avoids clipping inside horizontal scroller & guarantees 44px+ touch targets) */}
      {actionSheetPreset && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Opsi preset ${actionSheetPreset.name}`}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4"
          onClick={() => setActionSheetPresetId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[var(--app-surface-elevated)] border border-[var(--app-border-strong)] p-4 space-y-3 shadow-2xl anim-sheet-up"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <StudioPresetMiniPreview
                  elements={actionSheetPreset.elements}
                  orientation={actionSheetPreset.canvasOrientation}
                  isActive={actionSheetPreset.id === activePresetId}
                  hasBackground={Boolean(actionSheetPreset.backgroundUri)}
                  size="xs"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-display font-bold text-[var(--app-text)] truncate">
                    {actionSheetPreset.name}
                  </h3>
                  <div className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics">
                    {actionSheetPreset.canvasOrientation} · {actionSheetPreset.elements.length} elemen
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActionSheetPresetId(null)}
                aria-label="Tutup opsi preset"
                className="btn-press min-h-[44px] min-w-[44px] -mr-1 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  const id = actionSheetPreset.id;
                  setActionSheetPresetId(null);
                  onSelectPreset(id);
                }}
                className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" />
                  <span>Buka di Studio</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = actionSheetPreset;
                  setActionSheetPresetId(null);
                  onStartRenamePreset(target);
                }}
                className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2.5"
              >
                <Edit2 className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span>Ganti Nama Preset</span>
              </button>

              {onToggleFavoritePreset && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleFavoritePreset(actionSheetPreset.id);
                    setActionSheetPresetId(null);
                  }}
                  className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2.5"
                >
                  <Star
                    className={`w-4 h-4 ${
                      actionSheetPreset.isFavorite
                        ? 'fill-[var(--app-accent)] text-[var(--app-accent)]'
                        : 'text-[var(--app-text-secondary)]'
                    }`}
                  />
                  <span>{actionSheetPreset.isFavorite ? 'Hapus dari Favorit' : 'Tandai sebagai Favorit'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={isModeBMutationLocked}
                onClick={() => {
                  const id = actionSheetPreset.id;
                  setActionSheetPresetId(null);
                  onDuplicatePreset?.(id);
                }}
                className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Copy className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span>Duplikasi Preset</span>
              </button>

              <button
                type="button"
                disabled={isTransferringPreset}
                onClick={() => {
                  const target = actionSheetPreset;
                  setActionSheetPresetId(null);
                  void onExportPreset(target);
                }}
                className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2.5 disabled:opacity-40"
              >
                <Download className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span>Ekspor Preset (.json)</span>
              </button>

              {presets.length > 1 && (
                <button
                  type="button"
                  disabled={isModeBMutationLocked}
                  onClick={() => {
                    const id = actionSheetPreset.id;
                    setActionSheetPresetId(null);
                    onDeletePreset?.(id);
                  }}
                  className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-[var(--app-error)] text-xs font-semibold flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Preset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Preset Modal */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overscroll-contain"
          onClick={() => {
            if (!isCreatingPreset) onCloseCreateModal();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-[var(--app-shadow)] space-y-4 anim-pop-in max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2">
                <Layout className="w-5 h-5 text-[var(--app-accent-text)]" />
                <h3 className="text-base font-display font-bold text-[var(--app-text)]">
                  Buat Preset Studio Baru
                </h3>
              </div>
              <button
                type="button"
                disabled={isCreatingPreset}
                onClick={onCloseCreateModal}
                aria-label="Tutup modal preset"
                className="btn-press min-h-[44px] min-w-[44px] -mr-2 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] flex items-center justify-center disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void onSubmitCreatePreset(e)} className="space-y-4">
              {createError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs text-rose-200 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Nama Preset
                </label>
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={(e) => onChangePresetNameInput(e.target.value)}
                  placeholder="Misal: Mobile Gaming Pro, TikTok Live Malam"
                  required
                  className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Orientasi &amp; Mode Siaran
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: '9:16',
                        category: 'hp_screen',
                        label: '9:16 HP',
                        hint: 'Mode A · 1080×1920',
                        icon: <Smartphone className="w-4 h-4 mx-auto mb-1" />,
                      },
                      {
                        id: '16:9',
                        category: 'landscape',
                        label: '16:9 Wide',
                        hint: 'Mode B · 1920×1080',
                        icon: <Monitor className="w-4 h-4 mx-auto mb-1" />,
                      },
                      {
                        id: '1:1',
                        category: 'portrait',
                        label: '1:1 Square',
                        hint: 'Mode B · 1080×1080',
                        icon: <Square className="w-4 h-4 mx-auto mb-1" />,
                      },
                    ] as const
                  ).map((orient) => (
                    <button
                      key={orient.id}
                      type="button"
                      onClick={() => onChangePresetOrientationInput(orient.id, orient.category)}
                      className={`btn-press min-h-[68px] p-2 rounded-xl text-center border transition-colors flex flex-col items-center justify-center ${
                        presetOrientationInput === orient.id
                          ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                          : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                      }`}
                    >
                      {orient.icon}
                      <span className="text-xs font-bold leading-tight">{orient.label}</span>
                      <span className="text-[9px] opacity-80 tabular-metrics mt-0.5">{orient.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Template Awal
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'gaming', label: 'Mobile Gaming', desc: 'Screen + Facecam + Chat' },
                      { id: 'chatting', label: 'Just Chatting', desc: 'Kamera + Alert + Chat' },
                      { id: 'music', label: 'Music Stream', desc: 'Now Playing + Chat' },
                      { id: 'blank', label: 'Kanvas Kosong', desc: 'Mulai dari nol' },
                    ] as const
                  ).map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => onChangePresetTemplateInput(tmpl.id)}
                      className={`btn-press min-h-[56px] p-2.5 rounded-xl text-left border transition-colors ${
                        presetTemplateInput === tmpl.id
                          ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)] text-[var(--app-text)]'
                          : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                      }`}
                    >
                      <div className="text-xs font-bold text-[var(--app-text)]">{tmpl.label}</div>
                      <div className="text-[10px] text-[var(--app-text-muted)] mt-0.5">{tmpl.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Deskripsi (Opsional)
                </label>
                <textarea
                  value={presetDescriptionInput}
                  onChange={(e) => onChangePresetDescriptionInput(e.target.value)}
                  placeholder="Keterangan singkat tentang preset ini..."
                  rows={2}
                  className="w-full bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl px-3.5 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isCreatingPreset}
                  onClick={onCloseCreateModal}
                  className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs font-semibold hover:text-[var(--app-text)] disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreatingPreset}
                  className="btn-press min-h-[44px] px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold disabled:opacity-50"
                >
                  {isCreatingPreset ? 'Menyimpan...' : 'Buat & Buka Studio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
