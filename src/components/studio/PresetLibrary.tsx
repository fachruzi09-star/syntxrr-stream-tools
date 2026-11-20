import React, { useMemo, useRef, useState } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Edit2,
  Star,
  Check,
  Smartphone,
  Monitor,
  Square,
  Search,
  Download,
  Upload,
  ArrowRight,
  X,
  Layout,
} from 'lucide-react';
import type {
  CanvasOrientation,
  PresetCategory,
  StudioElement,
  StudioPreset,
} from '../../types';
import { exportPresetPackageFile, importPresetPackageFile } from '../../services/presetTransfer';
import { StorageService } from '../../services/storage';
import { useTranslation } from '../../i18n/I18nContext';
import { cn } from '../ui/cn';

type StarterTemplate = 'blank' | 'gaming' | 'chatting' | 'music';

export interface PresetLibraryProps {
  presets: StudioPreset[];
  activePresetId?: string;
  /** `panel` renders inside the Studio tool column, `page` as the Presets route. */
  variant?: 'panel' | 'page';
  onSelectPreset?: (presetId: string) => void;
  onCreatePreset?: (
    preset: Omit<StudioPreset, 'id' | 'createdAt'>,
  ) => void | boolean | Promise<void | boolean>;
  onDuplicatePreset?: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onRenamePreset?: (presetId: string, newName: string) => void;
  onToggleFavorite?: (presetId: string) => void;
  /** Existing App-level guard: resolves false when a Mode B session blocks preset mutation. */
  onCanImportPreset?: () => Promise<boolean>;
  onOpenStudio?: () => void;
}

/**
 * The single preset library used by both the Studio tool column and the
 * Presets navigation route. Import/export, templates and duplicate-name
 * handling keep the existing `syntxrr-preset` schema-2 transfer contract.
 */
export const PresetLibrary: React.FC<PresetLibraryProps> = ({
  presets,
  activePresetId,
  variant = 'panel',
  onSelectPreset,
  onCreatePreset,
  onDuplicatePreset,
  onDeletePreset,
  onRenamePreset,
  onToggleFavorite,
  onCanImportPreset,
  onOpenStudio,
}) => {
  const { t } = useTranslation();
  const isPage = variant === 'page';

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('all');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<PresetCategory>('hp_screen');
  const [newOrientation, setNewOrientation] = useState<CanvasOrientation>('9:16');
  const [starterTemplate, setStarterTemplate] = useState<StarterTemplate>('gaming');

  const busyRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const categories: { id: PresetCategory; labelKey: string; fallback: string }[] = [
    { id: 'all', labelKey: 'studio.library.catAll', fallback: 'Semua' },
    { id: 'favorites', labelKey: 'studio.library.catFavorites', fallback: 'Favorit' },
    { id: 'hp_screen', labelKey: 'studio.library.catHp', fallback: '9:16 HP' },
    { id: 'landscape', labelKey: 'studio.library.catLandscape', fallback: '16:9' },
    { id: 'portrait', labelKey: 'studio.library.catPortrait', fallback: 'Portrait' },
  ];

  const templates: { id: StarterTemplate; labelKey: string; fallback: string; descKey: string; descFallback: string }[] = [
    { id: 'blank', labelKey: 'studio.library.tplBlank', fallback: 'Kanvas Kosong', descKey: 'studio.library.tplBlankDesc', descFallback: 'Mulai dari nol' },
    { id: 'gaming', labelKey: 'studio.library.tplGaming', fallback: 'Gaming', descKey: 'studio.library.tplGamingDesc', descFallback: 'Screen capture + facecam + chat' },
    { id: 'chatting', labelKey: 'studio.library.tplChatting', fallback: 'Chatting', descKey: 'studio.library.tplChattingDesc', descFallback: 'Kamera penuh + chat + alert' },
    { id: 'music', labelKey: 'studio.library.tplMusic', fallback: 'Musik', descKey: 'studio.library.tplMusicDesc', descFallback: 'Now playing + antrean request' },
  ];

  const filteredPresets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return presets.filter((preset) => {
      if (activeCategory === 'favorites' && !preset.isFavorite) return false;
      if (
        activeCategory !== 'all' &&
        activeCategory !== 'favorites' &&
        preset.category !== activeCategory
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        preset.name.toLowerCase().includes(needle) ||
        (preset.description || '').toLowerCase().includes(needle)
      );
    });
  }, [presets, activeCategory, query]);

  const buildTemplateElements = (template: StarterTemplate): StudioElement[] => {
    const stamp = Date.now();
    if (template === 'gaming') {
      return [
        {
          id: `elem_screen_${stamp}`,
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
          id: `elem_cam_${stamp}`,
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
          properties: { borderRadius: 16, borderColor: '#2563EB' },
        },
        {
          id: `elem_chat_${stamp}`,
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
    }
    if (template === 'chatting') {
      return [
        {
          id: `elem_cam_${stamp}`,
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
          id: `elem_chat_${stamp}`,
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
          id: `elem_alert_${stamp}`,
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
    }
    if (template === 'music') {
      return [
        {
          id: `elem_song_${stamp}`,
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
          id: `elem_chat_${stamp}`,
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
    return [];
  };

  const rollbackImportedMedia = async (assetIds: string[]) => {
    for (const assetId of assetIds) {
      try {
        await StorageService.deleteStudioMediaAsset(assetId);
      } catch {
        // Best-effort cleanup of orphaned media when preset creation fails.
      }
    }
  };

  const handleExport = async (preset: StudioPreset) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setNotice(null);
    try {
      await exportPresetPackageFile(preset);
      setNotice({
        message: t('studio.library.exportOk', 'Preset “{name}” berhasil diekspor beserta media lokalnya.').replace(
          '{name}',
          preset.name,
        ),
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : t('studio.library.exportFail', 'Preset gagal diekspor.'),
        tone: 'error',
      });
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setNotice(null);
    try {
      if (onCanImportPreset && !(await onCanImportPreset())) {
        setNotice({
          message: t(
            'studio.library.importBlocked',
            'Impor preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.',
          ),
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
        created = await onCreatePreset?.({ ...imported.preset, name });
      } catch (createError) {
        await rollbackImportedMedia(imported.importedAssetIds);
        throw createError;
      }
      if (created === false) {
        await rollbackImportedMedia(imported.importedAssetIds);
        setNotice({
          message: t(
            'studio.library.importBlocked',
            'Impor preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.',
          ),
          tone: 'error',
        });
        return;
      }

      setNotice({
        message: imported.importedMediaCount
          ? t('studio.library.importOkMedia', 'Preset “{name}” berhasil diimpor bersama {count} file media dan langsung dipilih.')
              .replace('{name}', name)
              .replace('{count}', String(imported.importedMediaCount))
          : t('studio.library.importOk', 'Preset “{name}” berhasil diimpor dan langsung dipilih.').replace(
              '{name}',
              name,
            ),
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : t('studio.library.importFail', 'File preset gagal diimpor.'),
        tone: 'error',
      });
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setCreateError(null);
    try {
      const created = await onCreatePreset?.({
        name: newName.trim(),
        category: newCategory,
        canvasOrientation: newOrientation,
        elements: buildTemplateElements(starterTemplate),
        isFavorite: false,
        description:
          newDescription.trim() || 'Preset tata letak kustom SYNTXRR STREAM',
        thumbnailColor: '#1e3a8a',
      });

      if (created === false) {
        setCreateError(
          t(
            'studio.library.createBlocked',
            'Pembuatan preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.',
          ),
        );
        return;
      }

      setIsCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setStarterTemplate('gaming');
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : t('studio.library.createFail', 'Preset gagal disimpan ke penyimpanan lokal.'),
      );
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const saveRename = (presetId: string) => {
    const next = editingName.trim();
    if (next) onRenamePreset?.(presetId, next);
    setEditingPresetId(null);
  };

  const orientationIcon = (orientation: CanvasOrientation) => {
    if (orientation === '16:9') return Monitor;
    if (orientation === '1:1') return Square;
    return Smartphone;
  };

  return (
    <div className={cn('flex flex-col gap-3', isPage && 'gap-5')}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            className={cn(
              'flex items-center gap-2 font-semibold text-sx-text',
              isPage ? 'text-lg' : 'text-xs',
            )}
          >
            <Layout className={cn('shrink-0 text-sx-accent', isPage ? 'h-5 w-5' : 'h-4 w-4')} />
            {t('studio.library.title', 'Pustaka Preset')}
            <span className="rounded-full border border-sx-border bg-sx-surface-2 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sx-text-muted">
              {presets.length}
            </span>
          </h2>
          <p className={cn('text-sx-text-secondary', isPage ? 'mt-1 text-sm' : 'mt-0.5 text-[10px]')}>
            {t(
              'studio.library.subtitle',
              'Satu pustaka untuk memilih, membuat, dan memindahkan preset beserta media lokalnya.',
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
            data-testid="preset-import-input"
          />
          <button
            type="button"
            disabled={isBusy}
            onClick={() => importInputRef.current?.click()}
            data-testid="preset-import"
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sx-border bg-sx-surface-2 px-2.5 text-[11px] font-semibold text-sx-text-secondary transition-colors hover:bg-sx-surface-3 hover:text-sx-text disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{t('studio.library.import', 'Impor')}</span>
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            data-testid="preset-create"
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-sx-accent px-2.5 text-[11px] font-bold text-[#171B22] transition-colors hover:bg-sx-accent-hover disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('studio.library.new', 'Baru')}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed',
            notice.tone === 'success'
              ? 'border-sx-success/30 bg-sx-success/10 text-sx-success'
              : 'border-sx-danger/30 bg-sx-danger/10 text-sx-danger',
          )}
        >
          {notice.message}
        </div>
      )}

      {/* Search */}
      <label className="flex items-center gap-2 rounded-lg border border-sx-input-border bg-sx-input-bg px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-sx-text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('studio.library.search', 'Cari preset…')}
          data-testid="preset-search"
          className="min-h-[36px] w-full bg-transparent text-xs text-sx-text placeholder:text-sx-text-muted focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('studio.library.clearSearch', 'Hapus pencarian')}
            className="text-sx-text-muted hover:text-sx-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/* Category chips */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveCategory(cat.id)}
              data-testid={`preset-cat-${cat.id}`}
              className={cn(
                'min-h-[32px] shrink-0 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60',
                isActive
                  ? 'bg-sx-accent/15 text-sx-accent ring-1 ring-inset ring-sx-accent/40'
                  : 'border border-sx-border bg-sx-surface-2 text-sx-text-secondary hover:text-sx-text',
              )}
            >
              {t(cat.labelKey, cat.fallback)}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filteredPresets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sx-border bg-sx-surface-2 px-3 py-6 text-center">
          <p className="text-xs font-semibold text-sx-text">
            {t('studio.library.empty', 'Tidak ada preset yang cocok')}
          </p>
          <p className="mt-1 text-[11px] text-sx-text-secondary">
            {t('studio.library.emptyHint', 'Ubah filter atau buat preset baru dari template.')}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            isPage
              ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
              : 'flex flex-col gap-2',
          )}
        >
          {filteredPresets.map((preset) => {
            const isActive = preset.id === activePresetId;
            const OrientationIcon = orientationIcon(preset.canvasOrientation);
            return (
              <article
                key={preset.id}
                data-testid={`preset-card-${preset.id}`}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border bg-sx-surface-2 transition-colors',
                  isPage ? 'p-3.5' : 'p-2.5',
                  isActive
                    ? 'border-sx-accent/45 ring-1 ring-inset ring-sx-accent/25'
                    : 'border-sx-border hover:border-sx-border-strong',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {editingPresetId === preset.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveRename(preset.id);
                            if (event.key === 'Escape') setEditingPresetId(null);
                          }}
                          className="min-h-[30px] w-full rounded-md border border-sx-input-border bg-sx-input-bg px-2 text-xs text-sx-text focus:outline-none focus:ring-2 focus:ring-sx-accent/50"
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(preset.id)}
                          aria-label={t('studio.library.saveName', 'Simpan nama')}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sx-accent/15 text-sx-accent"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3
                        className={cn(
                          'truncate font-semibold text-sx-text',
                          isPage ? 'text-sm' : 'text-[12px]',
                        )}
                      >
                        {preset.name}
                      </h3>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-sx-text-muted">
                      <span className="flex items-center gap-1 rounded border border-sx-border bg-sx-surface px-1.5 py-0.5 font-mono">
                        <OrientationIcon className="h-3 w-3" />
                        {preset.canvasOrientation}
                      </span>
                      <span className="truncate capitalize">{preset.category.replace('_', ' ')}</span>
                      <span className="shrink-0 tabular-nums">
                        {preset.elements.length} {t('studio.shell.elementsUnit', 'elemen')}
                      </span>
                    </div>
                    {isPage && preset.description && (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-sx-text-secondary">
                        {preset.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFavorite?.(preset.id)}
                    aria-pressed={Boolean(preset.isFavorite)}
                    aria-label={t('studio.library.favorite', 'Favorit')}
                    title={t('studio.library.favorite', 'Favorit')}
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors',
                      preset.isFavorite
                        ? 'border-sx-accent/40 bg-sx-accent/12 text-sx-accent'
                        : 'border-sx-border bg-sx-surface text-sx-text-muted hover:text-sx-text',
                    )}
                  >
                    <Star className={cn('h-3.5 w-3.5', preset.isFavorite && 'fill-current')} />
                  </button>
                </div>

                {isActive && (
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sx-accent/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sx-accent">
                    <Check className="h-3 w-3" />
                    {t('studio.library.active', 'Aktif')}
                  </span>
                )}

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    disabled={isActive || isBusy}
                    onClick={() => onSelectPreset?.(preset.id)}
                    data-testid={`preset-activate-${preset.id}`}
                    className={cn(
                      'flex min-h-[30px] items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60',
                      isActive
                        ? 'bg-sx-surface-3 text-sx-text-muted'
                        : 'bg-sx-accent text-[#171B22] hover:bg-sx-accent-hover',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <ArrowRight className="h-3 w-3" />
                    {isActive
                      ? t('studio.library.inUse', 'Dipakai')
                      : t('studio.library.activate', 'Terapkan')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPresetId(preset.id);
                      setEditingName(preset.name);
                    }}
                    aria-label={t('studio.library.rename', 'Ganti nama')}
                    title={t('studio.library.rename', 'Ganti nama')}
                    className="grid h-7 w-7 place-items-center rounded-md border border-sx-border bg-sx-surface text-sx-text-secondary hover:text-sx-text"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicatePreset?.(preset.id)}
                    aria-label={t('studio.library.duplicate', 'Duplikat')}
                    title={t('studio.library.duplicate', 'Duplikat')}
                    className="grid h-7 w-7 place-items-center rounded-md border border-sx-border bg-sx-surface text-sx-text-secondary hover:text-sx-text"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleExport(preset)}
                    aria-label={t('studio.library.export', 'Ekspor')}
                    title={t('studio.library.export', 'Ekspor')}
                    className="grid h-7 w-7 place-items-center rounded-md border border-sx-border bg-sx-surface text-sx-text-secondary hover:text-sx-text disabled:opacity-45"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  {deleteConfirmId === preset.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onDeletePreset?.(preset.id);
                          setDeleteConfirmId(null);
                        }}
                        data-testid={`preset-delete-confirm-${preset.id}`}
                        className="min-h-[30px] rounded-md bg-sx-danger px-2 text-[11px] font-bold text-white"
                      >
                        {t('studio.library.deleteConfirm', 'Hapus')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="min-h-[30px] rounded-md border border-sx-border bg-sx-surface px-2 text-[11px] font-semibold text-sx-text-secondary"
                      >
                        {t('common.cancel', 'Batal')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(preset.id)}
                      aria-label={t('studio.library.delete', 'Hapus')}
                      title={t('studio.library.delete', 'Hapus')}
                      className="grid h-7 w-7 place-items-center rounded-md border border-sx-border bg-sx-surface text-sx-text-muted hover:border-sx-danger/40 hover:text-sx-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isPage && onOpenStudio && (
        <button
          type="button"
          onClick={onOpenStudio}
          className="flex min-h-[40px] w-fit items-center gap-2 rounded-lg border border-sx-border bg-sx-surface-2 px-3 text-xs font-semibold text-sx-text-secondary transition-colors hover:text-sx-text"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          {t('studio.library.openStudio', 'Buka kanvas Studio')}
        </button>
      )}

      {/* Create modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('studio.library.createTitle', 'Buat preset baru')}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-sx-border bg-sx-surface p-4 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-sx-text">
                {t('studio.library.createTitle', 'Buat preset baru')}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label={t('common.close', 'Tutup')}
                className="grid h-8 w-8 place-items-center rounded-lg border border-sx-border text-sx-text-secondary hover:text-sx-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sx-text-secondary">
                  {t('studio.library.name', 'Nama preset')}
                </label>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  data-testid="preset-name-input"
                  className="min-h-[38px] w-full rounded-lg border border-sx-input-border bg-sx-input-bg px-2.5 text-xs text-sx-text focus:outline-none focus:ring-2 focus:ring-sx-accent/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-sx-text-secondary">
                  {t('studio.library.description', 'Deskripsi')}
                </label>
                <input
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  className="min-h-[38px] w-full rounded-lg border border-sx-input-border bg-sx-input-bg px-2.5 text-xs text-sx-text focus:outline-none focus:ring-2 focus:ring-sx-accent/50"
                />
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-semibold text-sx-text-secondary">
                  {t('studio.library.template', 'Template awal')}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      aria-pressed={starterTemplate === template.id}
                      onClick={() => setStarterTemplate(template.id)}
                      data-testid={`preset-template-${template.id}`}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-left transition-colors',
                        starterTemplate === template.id
                          ? 'border-sx-accent/45 bg-sx-accent/12'
                          : 'border-sx-border bg-sx-surface-2 hover:border-sx-border-strong',
                      )}
                    >
                      <span className="block text-[11px] font-semibold text-sx-text">
                        {t(template.labelKey, template.fallback)}
                      </span>
                      <span className="block text-[10px] leading-tight text-sx-text-muted">
                        {t(template.descKey, template.descFallback)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-sx-text-secondary">
                    {t('studio.library.orientation', 'Orientasi')}
                  </label>
                  <select
                    value={newOrientation}
                    onChange={(event) => setNewOrientation(event.target.value as CanvasOrientation)}
                    className="min-h-[38px] w-full rounded-lg border border-sx-input-border bg-sx-input-bg px-2 text-xs text-sx-text focus:outline-none focus:ring-2 focus:ring-sx-accent/50"
                  >
                    <option value="9:16">9:16</option>
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-sx-text-secondary">
                    {t('studio.library.category', 'Kategori')}
                  </label>
                  <select
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value as PresetCategory)}
                    className="min-h-[38px] w-full rounded-lg border border-sx-input-border bg-sx-input-bg px-2 text-xs text-sx-text focus:outline-none focus:ring-2 focus:ring-sx-accent/50"
                  >
                    <option value="hp_screen">HP Screen</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
              </div>

              {createError && (
                <p role="alert" className="rounded-lg border border-sx-danger/30 bg-sx-danger/10 px-2.5 py-2 text-[11px] text-sx-danger">
                  {createError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="min-h-[38px] rounded-lg border border-sx-border bg-sx-surface-2 px-3 text-xs font-semibold text-sx-text-secondary hover:text-sx-text"
                >
                  {t('common.cancel', 'Batal')}
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  data-testid="preset-create-submit"
                  className="min-h-[38px] rounded-lg bg-sx-accent px-3 text-xs font-bold text-[#171B22] hover:bg-sx-accent-hover disabled:opacity-45"
                >
                  {t('studio.library.create', 'Buat preset')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
