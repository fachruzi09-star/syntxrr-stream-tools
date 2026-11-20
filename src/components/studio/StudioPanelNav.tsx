import React from 'react';
import {
  Sliders,
  Plus,
  Box,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Zap,
  ShoppingBag,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { cn } from '../ui/cn';

export type StudioPanelId =
  | 'properties'
  | 'elements'
  | 'sources'
  | 'presets'
  | 'media'
  | 'layers'
  | 'simulator'
  | 'marketplace';

interface PanelDescriptor {
  id: StudioPanelId;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  fallback: string;
  accent?: boolean;
}

const PANELS: PanelDescriptor[] = [
  { id: 'properties', icon: Sliders, labelKey: 'studio.panel.properties', fallback: 'Properti' },
  { id: 'elements', icon: Plus, labelKey: 'studio.panel.elements', fallback: 'Elemen' },
  { id: 'sources', icon: Box, labelKey: 'studio.panel.sources', fallback: 'Sumber' },
  { id: 'presets', icon: FolderOpen, labelKey: 'studio.panel.presets', fallback: 'Preset' },
  { id: 'media', icon: ImageIcon, labelKey: 'studio.panel.media', fallback: 'Media' },
  { id: 'layers', icon: Layers, labelKey: 'studio.panel.layers', fallback: 'Lapisan' },
  { id: 'simulator', icon: Zap, labelKey: 'studio.panel.simulator', fallback: 'Uji Live', accent: true },
  { id: 'marketplace', icon: ShoppingBag, labelKey: 'studio.panel.marketplace', fallback: 'Marketplace' },
];

export interface StudioPanelNavProps {
  active: StudioPanelId;
  onChange: (panel: StudioPanelId) => void;
}

/**
 * Premium panel rail for the Studio tool column.
 *
 * Keeps all eight existing panels reachable — nothing is removed, only the
 * presentation changes — and stays horizontally scrollable on narrow phones.
 */
export const StudioPanelNav: React.FC<StudioPanelNavProps> = ({ active, onChange }) => {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t('studio.panel.aria', 'Panel alat Studio')}
      data-testid="studio-panel-nav"
      className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-sx-border bg-sx-surface-2 p-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {PANELS.map(({ id, icon: PanelIcon, labelKey, fallback, accent }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`studio-panel-${id}`}
            onClick={() => onChange(id)}
            className={cn(
              'flex min-h-[38px] shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent/60',
              isActive
                ? 'bg-sx-accent/15 text-sx-accent ring-1 ring-inset ring-sx-accent/40'
                : 'text-sx-text-secondary hover:bg-sx-surface-3 hover:text-sx-text',
            )}
          >
            <PanelIcon
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                !isActive && accent ? 'text-sx-accent/80' : undefined,
              )}
            />
            <span>{t(labelKey, fallback)}</span>
          </button>
        );
      })}
    </div>
  );
};
