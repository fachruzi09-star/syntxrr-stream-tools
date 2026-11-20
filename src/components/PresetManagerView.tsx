import React, { useRef, useState } from 'react';
import {
  StudioPreset,
  PresetCategory,
  CanvasOrientation,
  StudioElement,
} from '../types';
import { importPresetPackageFile, exportPresetPackageFile } from '../services/presetTransfer';
import { StorageService } from '../services/storage';
import {
  Layout,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Star,
  Check,
  Smartphone,
  Monitor,
  Square,
  Layers,
  ArrowRight,
  X,
  Download,
  Upload,
} from 'lucide-react';

interface PresetManagerViewProps {
  presets: StudioPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onCreatePreset: (
    preset: Omit<StudioPreset, 'id' | 'createdAt'>
  ) => void | boolean | Promise<void | boolean>;
  onCanImportPreset?: () => Promise<boolean>;
  onDuplicatePreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, newName: string) => void;
  onToggleFavorite: (presetId: string) => void;
  onNavigateToStudio: () => void;
}

export const PresetManagerView: React.FC<PresetManagerViewProps> = ({
  presets,
  activePresetId,
  onSelectPreset,
  onCreatePreset,
  onCanImportPreset,
  onDuplicatePreset,
  onDeletePreset,
  onRenamePreset,
  onToggleFavorite,
  onNavigateToStudio,
}) => {
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const presetImportInputRef = useRef<HTMLInputElement>(null);
  const isTransferringRef = useRef(false);
  const [isTransferringPreset, setIsTransferringPreset] = useState(false);
  const [transferNotice, setTransferNotice] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [createModalError, setCreateModalError] = useState<string | null>(null);

  const [newPresetName, setNewPresetName] = useState('');
  const [newCategory, setNewCategory] = useState<PresetCategory>('hp_screen');
  const [newOrientation, setNewOrientation] = useState<CanvasOrientation>('9:16');
  const [newDescription, setNewDescription] = useState('');
  const [starterTemplate, setStarterTemplate] = useState<
    'blank' | 'gaming' | 'chatting' | 'music'
  >('gaming');

  const filteredPresets = presets.filter((p) => {
    if (activeCategory === 'favorites') return p.isFavorite;
    if (activeCategory === 'all') return true;
    return p.category === activeCategory;
  });

  const handleStartRename = (preset: StudioPreset) => {
    setEditingPresetId(preset.id);
    setEditingName(preset.name);
  };

  const handleSaveRename = (presetId: string) => {
    if (editingName.trim()) {
      onRenamePreset(presetId, editingName.trim());
    }
    setEditingPresetId(null);
  };

  const rollbackImportedMedia = async (assetIds: string[]) => {
    for (const assetId of assetIds) {
      try {
        await StorageService.deleteStudioMediaAsset(assetId);
      } catch {
        // Best-effort cleanup of orphaned media when preset creation is cancelled or fails.
      }
    }
  };

  const handleExportPreset = async (preset: StudioPreset) => {
    if (isTransferringRef.current) return;
    isTransferringRef.current = true;
    setIsTransferringPreset(true);
    setTransferNotice(null);
    try {
      await exportPresetPackageFile(preset);
      setTransferNotice({
        message: `Preset “${preset.name}” berhasil diekspor beserta media lokal yang dipakai.`,
        tone: 'success',
      });
    } catch (error) {
      setTransferNotice({
        message: error instanceof Error ? error.message : 'Preset gagal diekspor.',
        tone: 'error',
      });
    } finally {
      isTransferringRef.current = false;
      setIsTransferringPreset(false);
    }
  };

  const handleImportPresetFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isTransferringRef.current) return;
    isTransferringRef.current = true;
    setIsTransferringPreset(true);
    setTransferNotice(null);
    try {
      if (onCanImportPreset && !(await onCanImportPreset())) {
        setTransferNotice({
          message:
            'Impor preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.',
          tone: 'error',
        });
        return;
      }

      const imported = await importPresetPackageFile(file);
      const baseName = imported.preset.name.trim();
      const existingNames = new Set(presets.map((preset) => preset.name.trim().toLowerCase()));
      let name = baseName;
      if (existingNames.has(name.toLowerCase())) {
        name = `${baseName} (Impor)`;
        let copyIndex = 2;
        while (existingNames.has(name.toLowerCase())) {
          name = `${baseName} (Impor ${copyIndex})`;
          copyIndex += 1;
        }
      }

      let created: void | boolean;
      try {
        created = await onCreatePreset({ ...imported.preset, name });
      } catch (createError) {
        await rollbackImportedMedia(imported.importedAssetIds);
        throw createError;
      }
      if (created === false) {
        await rollbackImportedMedia(imported.importedAssetIds);
        setTransferNotice({
          message:
            'Impor preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.',
          tone: 'error',
        });
        return;
      }

      setTransferNotice({
        message: `Preset “${name}” berhasil diimpor${
          imported.importedMediaCount ? ` bersama ${imported.importedMediaCount} file media` : ''
        } dan langsung dipilih.`,
        tone: 'success',
      });
    } catch (error) {
      setTransferNotice({
        message: error instanceof Error ? error.message : 'File preset gagal diimpor.',
        tone: 'error',
      });
    } finally {
      isTransferringRef.current = false;
      setIsTransferringPreset(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim() || isTransferringRef.current) return;

    let elements: StudioElement[] = [];

    if (starterTemplate === 'gaming') {
      elements = [
        {
          id: `elem_screen_${Date.now()}`,
          name: 'Layar Game (Screen Capture)',
          type: 'screen_capture',
          x: 0,
          y: 20,
          width: 100,
          height: 56,
          layer: 1,
          visible: true,
          locked: true,
          opacity: 100,
          rotation: 0,
          properties: { fps: 60 },
        },
        {
          id: `elem_cam_${Date.now()}`,
          name: 'Facecam Bulat',
          type: 'camera',
          x: 6,
          y: 4,
          width: 28,
          height: 15,
          layer: 2,
          visible: true,
          locked: false,
          opacity: 100,
          rotation: 0,
          properties: { borderRadius: 16, borderColor: '#F2C230' },
        },
        {
          id: `elem_chat_${Date.now()}`,
          name: 'Live Chat Penonton',
          type: 'chat_message',
          x: 6,
          y: 78,
          width: 88,
          height: 20,
          layer: 3,
          visible: true,
          locked: false,
          opacity: 90,
          rotation: 0,
          properties: { maxMessages: 4 },
        },
      ];
    } else if (starterTemplate === 'chatting') {
      elements = [
        {
          id: `elem_cam_${Date.now()}`,
          name: 'Kamera Utama Full Frame',
          type: 'camera',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          layer: 1,
          visible: true,
          locked: true,
          opacity: 100,
          rotation: 0,
          properties: { facingMode: 'user' },
        },
        {
          id: `elem_chat_${Date.now()}`,
          name: 'Kotak Chat Kaca',
          type: 'chat_message',
          x: 6,
          y: 60,
          width: 88,
          height: 30,
          layer: 2,
          visible: true,
          locked: false,
          opacity: 85,
          rotation: 0,
          properties: { maxMessages: 6 },
        },
        {
          id: `elem_alert_${Date.now()}`,
          name: 'Alert Gift & Follow',
          type: 'event_alert',
          x: 10,
          y: 10,
          width: 80,
          height: 12,
          layer: 3,
          visible: true,
          locked: false,
          opacity: 100,
          rotation: 0,
          properties: { soundEnabled: true },
        },
      ];
    } else if (starterTemplate === 'music') {
      elements = [
        {
          id: `elem_song_${Date.now()}`,
          name: 'Now Playing Widget',
          type: 'song_request',
          x: 6,
          y: 40,
          width: 88,
          height: 16,
          layer: 2,
          visible: true,
          locked: false,
          opacity: 100,
          rotation: 0,
          properties: { showAlbumArt: true },
        },
        {
          id: `elem_chat_${Date.now()}`,
          name: 'Request Queue Chat',
          type: 'chat_message',
          x: 6,
          y: 65,
          width: 88,
          height: 25,
          layer: 3,
          visible: true,
          locked: false,
          opacity: 90,
          rotation: 0,
          properties: { maxMessages: 5 },
        },
      ];
    }

    isTransferringRef.current = true;
    setIsTransferringPreset(true);
    setCreateModalError(null);
    try {
      const created = await onCreatePreset({
        name: newPresetName.trim(),
        category: newCategory,
        canvasOrientation: newOrientation,
        elements,
        isFavorite: false,
        description: newDescription.trim() || 'Preset tata letak kustom SYNTXRR STREAM',
        thumbnailColor: '#1E232D',
      });

      if (created === false) {
        setCreateModalError(
          'Pembuatan preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.'
        );
        return;
      }

      setIsCreateModalOpen(false);
      setNewPresetName('');
      setNewDescription('');
      setCreateModalError(null);
    } catch (error) {
      setCreateModalError(
        error instanceof Error ? error.message : 'Preset gagal disimpan ke penyimpanan lokal.'
      );
    } finally {
      isTransferringRef.current = false;
      setIsTransferringPreset(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header Console */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--app-text-muted)]">
              <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)]">
                Studio Scene Presets
              </span>
              <span aria-hidden="true" className="text-[var(--app-border-strong)]">
                /
              </span>
              <span className="font-mono-num">{presets.length} Preset Tersimpan</span>
            </div>
            <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight mt-0.5">
              Manajer Preset &amp; Adegan
            </h1>
            <p className="text-xs sm:text-sm text-[var(--app-text-muted)] mt-1 max-w-2xl leading-relaxed">
              Simpan, duplikasi, ekspor JSON, dan beralih antara tata letak 9:16, 16:9, dan 1:1 tanpa menata ulang dari nol.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={presetImportInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportPresetFile}
            />
            <button
              type="button"
              disabled={isTransferringPreset}
              onClick={() => presetImportInputRef.current?.click()}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold text-xs inline-flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-[var(--app-accent-text)]" />
              <span>Impor Preset</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateModalError(null);
                setIsCreateModalOpen(true);
              }}
              className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Preset Baru</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--app-border)]">
          {(
            [
              { id: 'all', label: 'Semua Preset' },
              { id: 'hp_screen', label: 'Layar HP (9:16)' },
              { id: 'landscape', label: 'Landscape (16:9)' },
              { id: 'portrait', label: 'Portrait' },
              { id: 'favorites', label: 'Favorit' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold border transition-colors ${
                activeCategory === cat.id
                  ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                  : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {transferNotice && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed"
            style={
              transferNotice.tone === 'success'
                ? {
                    backgroundColor: 'var(--app-ok-soft)',
                    borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                    color: 'var(--app-ok)',
                  }
                : {
                    backgroundColor: 'var(--app-error-soft)',
                    borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
                    color: 'var(--app-error)',
                  }
            }
          >
            {transferNotice.message}
          </div>
        )}

        <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed">
          File JSON preset membawa seluruh elemen dan media lokal yang dirujuk. Impor membuat salinan baru tanpa menimpa preset yang ada.
        </p>
      </header>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPresets.map((preset) => {
          const isActive = preset.id === activePresetId;

          return (
            <div
              key={preset.id}
              className={`rounded-2xl border flex flex-col justify-between overflow-hidden transition-colors ${
                isActive
                  ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                  : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
              }`}
            >
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono-num font-bold bg-[var(--app-surface-muted)] text-[var(--app-accent-text)] border border-[var(--app-border)] inline-flex items-center gap-1.5">
                      {preset.canvasOrientation === '9:16' && <Smartphone className="w-3 h-3" />}
                      {preset.canvasOrientation === '16:9' && <Monitor className="w-3 h-3" />}
                      {preset.canvasOrientation === '1:1' && <Square className="w-3 h-3" />}
                      <span>{preset.canvasOrientation}</span>
                    </span>

                    {isActive && (
                      <span
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold border inline-flex items-center gap-1"
                        style={{
                          backgroundColor: 'var(--app-ok-soft)',
                          borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                          color: 'var(--app-ok)',
                        }}
                      >
                        <Check className="w-3 h-3" />
                        <span>Aktif</span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFavorite(preset.id)}
                    aria-label={preset.isFavorite ? `Hapus favorit ${preset.name}` : `Favoritkan ${preset.name}`}
                    className="min-w-[44px] min-h-[44px] -mt-1.5 -mr-1.5 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] hover:bg-[var(--app-surface-muted)] flex items-center justify-center transition-colors"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        preset.isFavorite ? 'fill-[var(--app-accent)] text-[var(--app-accent)]' : ''
                      }`}
                    />
                  </button>
                </div>

                {editingPresetId === preset.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 min-w-0 min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-accent)] rounded-xl px-3 text-xs font-bold text-[var(--app-text)] focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveRename(preset.id)}
                      className="min-h-[44px] px-3 bg-[var(--app-accent)] text-[var(--app-accent-ink)] text-xs rounded-xl hover:bg-[var(--app-accent-hover)] font-bold"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPresetId(null)}
                      className="min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs rounded-xl font-semibold"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-[var(--app-text)] tracking-tight truncate">
                      {preset.name}
                    </h2>
                    <button
                      type="button"
                      onClick={() => handleStartRename(preset)}
                      className="min-w-[44px] min-h-[44px] -mr-1.5 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] flex items-center justify-center shrink-0 transition-colors"
                      aria-label={`Ubah nama ${preset.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <p className="text-xs text-[var(--app-text-muted)] line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>

                <div className="flex items-center gap-2 text-xs text-[var(--app-text-secondary)] font-mono-num pt-1">
                  <Layers className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
                  <span>{preset.elements.length} Elemen Overlay</span>
                </div>
              </div>

              <div className="px-4 py-3 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDuplicatePreset(preset.id)}
                    className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center transition-colors"
                    aria-label={`Duplikasi ${preset.name}`}
                    title="Duplikasi Preset"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isTransferringPreset}
                    onClick={() => void handleExportPreset(preset)}
                    className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-accent-text)] flex items-center justify-center transition-colors disabled:opacity-50"
                    aria-label={`Ekspor ${preset.name}`}
                    title="Ekspor Preset beserta Media"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  {presets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeletePreset(preset.id)}
                      className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--app-surface)] hover:bg-rose-950/60 border border-[var(--app-border)] hover:border-rose-700/60 text-[var(--app-text-muted)] hover:text-rose-300 flex items-center justify-center transition-colors"
                      aria-label={`Hapus ${preset.name}`}
                      title="Hapus Preset"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isActive ? (
                  <button
                    type="button"
                    onClick={onNavigateToStudio}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Buka Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--app-surface)] hover:bg-[var(--app-accent)] border border-[var(--app-border-strong)] hover:border-[var(--app-accent)] text-[var(--app-text)] hover:text-[var(--app-accent-ink)] font-bold text-xs transition-colors"
                  >
                    Gunakan Preset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Preset Modal */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-[var(--app-shadow)] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2">
                <Layout className="w-5 h-5 text-[var(--app-accent-text)]" />
                <h3 className="font-display text-base font-bold text-[var(--app-text)]">
                  Buat Preset Studio Baru
                </h3>
              </div>
              <button
                type="button"
                disabled={isTransferringPreset}
                onClick={() => {
                  setCreateModalError(null);
                  setIsCreateModalOpen(false);
                }}
                aria-label="Tutup dialog"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {createModalError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-200 leading-relaxed"
                >
                  {createModalError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Nama Preset
                </label>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Misal: Mobile Gaming Pro, TikTok Live Malam"
                  required
                  className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Orientasi Kanvas
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: '9:16', label: '9:16 HP', icon: <Smartphone className="w-4 h-4 mx-auto mb-1" /> },
                      { id: '16:9', label: '16:9 Wide', icon: <Monitor className="w-4 h-4 mx-auto mb-1" /> },
                      { id: '1:1', label: '1:1 Square', icon: <Square className="w-4 h-4 mx-auto mb-1" /> },
                    ] as const
                  ).map((orient) => (
                    <button
                      key={orient.id}
                      type="button"
                      onClick={() => {
                        setNewOrientation(orient.id);
                        if (orient.id === '9:16') setNewCategory('hp_screen');
                        else if (orient.id === '16:9') setNewCategory('landscape');
                        else setNewCategory('portrait');
                      }}
                      className={`min-h-[60px] p-2.5 rounded-xl text-center text-xs font-bold border transition-colors ${
                        newOrientation === orient.id
                          ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                          : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                      }`}
                    >
                      {orient.icon}
                      <span>{orient.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Template Permulaan
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
                      onClick={() => setStarterTemplate(tmpl.id)}
                      className={`min-h-[58px] p-3 rounded-xl text-left border transition-colors ${
                        starterTemplate === tmpl.id
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
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Keterangan singkat tentang preset ini..."
                  rows={2}
                  className="w-full bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isTransferringPreset}
                  onClick={() => {
                    setCreateModalError(null);
                    setIsCreateModalOpen(false);
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs font-semibold disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isTransferringPreset}
                  className="min-h-[44px] px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold disabled:opacity-50"
                >
                  {isTransferringPreset ? 'Menyimpan...' : 'Simpan & Buat Preset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
