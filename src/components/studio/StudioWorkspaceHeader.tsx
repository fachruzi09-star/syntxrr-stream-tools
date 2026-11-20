import React from 'react';
import {
  Tv,
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  Lock,
  Smartphone,
  Monitor,
  Square,
} from 'lucide-react';
import type { CanvasOrientation } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';
import { cn } from '../ui/cn';

export interface StudioWorkspaceHeaderProps {
  presetName?: string | null;
  elementCount: number;
  orientation: CanvasOrientation;
  onChangeOrientation: (orientation: CanvasOrientation) => void;
  /** True while Mode B holds the structural mutation lock. */
  locked?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveAsPreset: () => void;
  onOpenPresetLibrary: () => void;
}

const ORIENTATIONS: {
  id: CanvasOrientation;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  shortKey: string;
}[] = [
  { id: '9:16', icon: Smartphone, labelKey: 'studio.shell.portrait', shortKey: '9:16' },
  { id: '16:9', icon: Monitor, labelKey: 'studio.shell.landscape', shortKey: '16:9' },
  { id: '1:1', icon: Square, labelKey: 'studio.shell.square', shortKey: '1:1' },
];

/**
 * Compact Studio workspace header.
 *
 * Presentation only: every action is delegated to the existing StudioView
 * handlers so undo/redo history, save-as-preset and the Mode B mutation lock
 * keep a single source of truth.
 */
export const StudioWorkspaceHeader: React.FC<StudioWorkspaceHeaderProps> = ({
  presetName,
  elementCount,
  orientation,
  onChangeOrientation,
  locked = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveAsPreset,
  onOpenPresetLibrary,
}) => {
  const { t } = useTranslation();

  return (
    <header className="rounded-2xl border border-sx-border bg-sx-surface px-3 py-2.5 shadow-sm sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* Identity + active preset */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sx-accent/25 bg-sx-accent/12 text-sx-accent">
            <Tv className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sx-text-muted">
              {t('studio.shell.eyebrow', 'SYNTXRR STUDIO')}
            </p>
            <h1 className="truncate text-[15px] font-semibold leading-tight text-sx-text">
              {t('studio.shell.title', 'Studio Produksi')}
            </h1>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-sx-text-secondary">
              <span className="shrink-0 text-sx-text-muted">
                {t('studio.shell.activePreset', 'Preset aktif')}
              </span>
              <span className="truncate font-medium text-sx-text">
                {presetName || t('studio.shell.noPreset', 'Belum ada preset')}
              </span>
              <span className="shrink-0 text-sx-text-muted">·</span>
              <span className="shrink-0 tabular-nums text-sx-text-muted">
                {elementCount} {t('studio.shell.elementsUnit', 'elemen')}
              </span>
            </div>
          </div>
        </div>

        {/* Orientation */}
        <div
          className="flex items-center gap-1 rounded-xl border border-sx-border bg-sx-surface-2 p-1"
          role="group"
          aria-label={t('studio.shell.orientation', 'Orientasi kanvas')}
        >
          {ORIENTATIONS.map(({ id, icon: OrientationIcon, labelKey, shortKey }) => {
            const isActive = orientation === id;
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                aria-pressed={isActive}
                aria-label={t(labelKey, shortKey)}
                title={t(labelKey, shortKey)}
                onClick={() => onChangeOrientation(id)}
                data-testid={`studio-orientation-${id}`}
                className={cn(
                  'flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  isActive
                    ? 'bg-sx-accent/15 text-sx-accent ring-1 ring-inset ring-sx-accent/40'
                    : 'text-sx-text-secondary hover:bg-sx-surface-3 hover:text-sx-text',
                )}
              >
                <OrientationIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">{shortKey}</span>
              </button>
            );
          })}
        </div>

        {/* History + actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('studio.shell.undo', 'Urungkan')}
            title={t('studio.shell.undo', 'Urungkan')}
            data-testid="studio-undo"
            className="grid h-9 w-9 place-items-center rounded-lg border border-sx-border bg-sx-surface-2 text-sx-text-secondary transition-colors hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={t('studio.shell.redo', 'Ulangi')}
            title={t('studio.shell.redo', 'Ulangi')}
            data-testid="studio-redo"
            className="grid h-9 w-9 place-items-center rounded-lg border border-sx-border bg-sx-surface-2 text-sx-text-secondary transition-colors hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenPresetLibrary}
            data-testid="studio-open-library"
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sx-border bg-sx-surface-2 px-2.5 text-[11px] font-semibold text-sx-text-secondary transition-colors hover:bg-sx-surface-3 hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span>{t('studio.shell.library', 'Library Preset')}</span>
          </button>
          <button
            type="button"
            onClick={onSaveAsPreset}
            disabled={locked}
            data-testid="studio-save-preset"
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-sx-accent px-3 text-[11px] font-bold text-[#171B22] shadow-sm transition-colors hover:bg-sx-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sx-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5 shrink-0" />
            <span>{t('studio.shell.savePreset', 'Simpan Preset')}</span>
          </button>
        </div>
      </div>

      {/* Honest context strip: never claims a save that did not happen. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-sx-border pt-2 text-[10.5px] text-sx-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sx-accent" aria-hidden="true" />
          {t('studio.shell.syncHint', 'Perubahan kanvas diteruskan ke aplikasi')}
        </span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">
          {t('studio.shell.canvasHint', 'Kanvas diskalakan mengikuti ruang yang tersedia')}
        </span>
        {locked && (
          <span className="flex items-center gap-1.5 font-semibold text-[#F2C230]">
            <Lock className="h-3 w-3" />
            {t('studio.shell.locked', 'Struktur dikunci Mode B')}
          </span>
        )}
      </div>
    </header>
  );
};
