import React, { useState } from 'react';
import {
  Activity,
  Camera,
  Check,
  Gamepad2,
  Grid3X3,
  Home,
  Layers,
  Menu,
  Moon,
  PictureInPicture2,
  Plug,
  Radio,
  Settings,
  Sliders,
  Sun,
  Volume2,
  X,
} from 'lucide-react';
import {
  AudioModule,
  DashboardModule,
  FloatingHudModule,
  IntegrationsModule,
  LiveCenterModule,
  RemoteDeckModule,
  SettingsModule,
  SourcesModule,
} from './ModulesCore';
import { StudioWorkspace } from './StudioWorkspace';
import { MOCK_PRESETS } from './mockData';
import { OPTION_SYSTEMS } from './tokens';
import type { ExplorationModule, ExplorationSharedState } from './types';

interface ShellProps {
  shared: ExplorationSharedState;
  dashboardOverride?: React.ReactNode;
}

interface NavItemDef {
  id: ExplorationModule;
  label: string;
  shortLabel: string;
  code: string;
  group: 'Operate' | 'Produce' | 'Configure';
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', code: '01', group: 'Operate', icon: Home },
  { id: 'studio', label: 'Studio', shortLabel: 'Studio', code: '02', group: 'Produce', icon: Layers },
  { id: 'live_center', label: 'Live Center', shortLabel: 'Live', code: '03', group: 'Operate', icon: Activity },
  { id: 'sources', label: 'Sources', shortLabel: 'Sources', code: '04', group: 'Produce', icon: Camera },
  { id: 'audio', label: 'Soundboard & Audio', shortLabel: 'Audio', code: '05', group: 'Produce', icon: Volume2 },
  { id: 'hud', label: 'Floating HUD', shortLabel: 'HUD', code: '06', group: 'Produce', icon: PictureInPicture2 },
  { id: 'integrations', label: 'Integrations', shortLabel: 'Integrs', code: '07', group: 'Configure', icon: Plug },
  { id: 'remote_deck', label: 'Remote Deck', shortLabel: 'Deck', code: '08', group: 'Operate', icon: Gamepad2 },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', code: '09', group: 'Configure', icon: Settings },
];

const renderModuleView = (shared: ExplorationSharedState, dashboardOverride?: React.ReactNode) => {
  switch (shared.activeModule) {
    case 'dashboard':
      return dashboardOverride ?? <DashboardModule shared={shared} />;
    case 'studio':
      return <StudioWorkspace shared={shared} />;
    case 'live_center':
      return <LiveCenterModule shared={shared} />;
    case 'sources':
      return <SourcesModule shared={shared} />;
    case 'audio':
      return <AudioModule shared={shared} />;
    case 'hud':
      return <FloatingHudModule shared={shared} />;
    case 'integrations':
      return <IntegrationsModule shared={shared} />;
    case 'remote_deck':
      return <RemoteDeckModule shared={shared} />;
    case 'settings':
      return <SettingsModule shared={shared} />;
  }
};

/* ============================================================================
   SHARED MOBILE ALL-MODULES SHEET (Adaptive to Option Token System)
   ============================================================================ */
const MobileMoreSheet: React.FC<{
  shared: ExplorationSharedState;
  open: boolean;
  onClose: () => void;
  grouped?: boolean;
}> = ({ shared, open, onClose, grouped = false }) => {
  if (!open) return null;
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const groups: Array<'Operate' | 'Produce' | 'Configure'> = ['Operate', 'Produce', 'Configure'];

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      style={{ backgroundColor: 'rgba(6, 8, 12, 0.56)' }}
      onClick={onClose}
    >
      <div
        className="w-full p-4 space-y-4 max-h-[82%] overflow-y-auto"
        style={{
          backgroundColor: p.surface,
          borderTop: `1px solid ${p.borderStrong}`,
          borderTopLeftRadius: sys.radiusPanel,
          borderTopRightRadius: sys.radiusPanel,
          boxShadow: p.shadow,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2.5" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div>
            <div className="text-[11px] font-medium" style={{ color: p.textMuted }}>
              {sys.title} · Navigation
            </div>
            <div className="text-base font-semibold" style={{ fontFamily: sys.displayFont, color: p.text }}>
              All Production Modules
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            style={{
              borderRadius: sys.radiusControl,
              border: `1px solid ${p.border}`,
              backgroundColor: p.surfaceMuted,
              color: p.text,
            }}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {grouped ? (
          <div className="space-y-4">
            {groups.map((grp) => (
              <div key={grp} className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
                  {grp}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {NAV_ITEMS.filter((item) => item.group === grp).map((item) => {
                    const Icon = item.icon;
                    const active = shared.activeModule === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          shared.onNavigate(item.id);
                          onClose();
                        }}
                        className="min-h-[44px] px-3 py-2 text-left flex items-center gap-2.5"
                        style={{
                          borderRadius: sys.radiusControl,
                          border: `1px solid ${active ? p.accent : p.border}`,
                          backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                          color: active ? p.accentText : p.text,
                        }}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-medium truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = shared.activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    shared.onNavigate(item.id);
                    onClose();
                  }}
                  className="min-h-[44px] px-3 py-2 text-left flex items-center gap-2.5"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${active ? p.accent : p.border}`,
                    backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                    color: active ? p.accentText : p.text,
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${p.border}` }}>
          <button
            type="button"
            onClick={shared.onToggleTheme}
            className="min-h-[44px] flex-1 px-3 text-xs font-medium inline-flex items-center justify-center gap-2"
            style={{
              borderRadius: sys.radiusControl,
              border: `1px solid ${p.border}`,
              backgroundColor: p.surfaceMuted,
              color: p.text,
            }}
          >
            {shared.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>Switch to {shared.theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            type="button"
            onClick={shared.onToggleLiveActive}
            className="min-h-[44px] flex-1 px-3 text-xs font-semibold inline-flex items-center justify-center gap-2"
            style={{
              borderRadius: sys.radiusControl,
              backgroundColor: shared.isLiveActive ? p.error : p.accent,
              color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
            }}
          >
            <Radio className="w-4 h-4" />
            <span>{shared.isLiveActive ? 'End Session' : 'Go Live'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   OPTION A — QUIET LUXURY ("THE ATELIER")
   Editorial serif hierarchy, warm charcoal/alabaster tones, hairline rules
   ============================================================================ */
const QuietLuxuryShell: React.FC<ShellProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS.A;
  const p = sys.palettes[shared.theme];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentPreset = MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId) || MOCK_PRESETS[0];
  const currentNav = NAV_ITEMS.find((n) => n.id === shared.activeModule) || NAV_ITEMS[0];

  if (shared.isMobileViewport) {
    return (
      <div
        className="relative flex flex-col h-full w-full overflow-hidden"
        style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
      >
        {/* 48px Hairline Top Header */}
        <header
          className="h-12 px-4 shrink-0 flex items-center justify-between gap-2"
          style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.canvas }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
              SYNTXRR
            </span>
            <span className="text-xs" style={{ color: p.textMuted }} aria-hidden="true">/</span>
            <span className="text-xs font-medium truncate" style={{ color: p.textSecondary }}>
              {currentNav.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-2.5 py-1.5 text-[11px] font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${shared.isLiveActive ? p.ok : p.borderStrong}`,
                color: shared.isLiveActive ? p.ok : p.text,
                backgroundColor: shared.isLiveActive ? p.okSoft : 'transparent',
              }}
            >
              {shared.isLiveActive ? 'Live' : 'Standby'}
            </button>
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="w-8 h-8 inline-flex items-center justify-center"
              style={{ borderRadius: sys.radiusControl, color: p.textSecondary }}
              aria-label="Toggle theme"
            >
              {shared.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Scrollable Editorial Stage */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5">
          {renderModuleView(shared)}
        </main>

        {/* 56px Serene 4-Item Bottom Tab Bar */}
        <nav
          className="h-14 shrink-0 grid grid-cols-4 px-2"
          style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.surface }}
          aria-label="Primary Mobile Navigation"
        >
          {([
            { id: 'dashboard', label: 'Atelier', icon: Home },
            { id: 'studio', label: 'Studio', icon: Layers },
            { id: 'live_center', label: 'Live', icon: Activity },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const active = shared.activeModule === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => shared.onNavigate(tab.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
                style={{ color: active ? p.accent : p.textMuted }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px] font-medium whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
            style={{
              color:
                !['dashboard', 'studio', 'live_center'].includes(shared.activeModule)
                  ? p.accent
                  : p.textMuted,
            }}
          >
            <Menu className="w-4 h-4" />
            <span className="text-[11px] font-medium whitespace-nowrap">Index</span>
          </button>
        </nav>

        <MobileMoreSheet shared={shared} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
    >
      {/* 216px Whisper-Quiet Editorial Left Rail */}
      <aside
        className="w-[216px] shrink-0 flex flex-col justify-between py-6 px-5"
        style={{ borderRight: `1px solid ${p.border}`, backgroundColor: p.canvas }}
      >
        <div className="space-y-6">
          <div className="pb-4" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div className="text-xl font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
              SYNTXRR
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: p.textMuted }}>
              The Atelier · {shared.operatingMode === 'mode_a' ? 'Mode A' : 'Mode B'}
            </div>
          </div>

          <nav className="space-y-1" aria-label="Atelier Navigation">
            {NAV_ITEMS.map((item) => {
              const active = shared.activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => shared.onNavigate(item.id)}
                  className="w-full py-2 px-2 text-left flex items-center justify-between transition-colors"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: active ? p.surfaceElevated : 'transparent',
                    color: active ? p.text : p.textMuted,
                  }}
                >
                  <span className="text-[13px]" style={{ fontWeight: active ? 600 : 400 }}>
                    {item.label}
                  </span>
                  {active && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.accent }} />}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 space-y-2.5" style={{ borderTop: `1px solid ${p.border}` }}>
          <div className="text-[11px]" style={{ color: p.textMuted }}>
            Active Scene: <span style={{ color: p.textSecondary }}>{currentPreset.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="flex-1 py-2 px-3 text-xs font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {shared.isLiveActive ? 'End Session' : 'Go Live'}
            </button>
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="p-2"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                color: p.textSecondary,
              }}
              title="Toggle Dark / Light"
            >
              {shared.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Editorial Stage */}
      <main className="flex-1 overflow-y-auto px-8 py-7">
        <div className="max-w-5xl mx-auto">{renderModuleView(shared)}</div>
      </main>
    </div>
  );
};

/* ============================================================================
   OPTION B — BROADCAST ELITE ("MASTER CONTROL")
   Top Master Tally bus, recessed rack channel sidebar, tabular telemetry
   ============================================================================ */
const BroadcastEliteShell: React.FC<ShellProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS.B;
  const p = sys.palettes[shared.theme];
  const [rackSheetOpen, setRackSheetOpen] = useState(false);
  const currentPreset = MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId) || MOCK_PRESETS[0];

  if (shared.isMobileViewport) {
    return (
      <div
        className="relative flex flex-col h-full w-full overflow-hidden"
        style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
      >
        {/* 44px Tally Strip */}
        <header
          className="h-11 px-3 shrink-0 flex items-center justify-between gap-2"
          style={{ backgroundColor: p.surface, borderBottom: `1px solid ${p.borderStrong}` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0"
              style={{
                fontFamily: sys.monoFont,
                backgroundColor: shared.isLiveActive ? p.error : p.surfaceElevated,
                color: shared.isLiveActive ? '#FFFFFF' : p.textSecondary,
                borderRadius: sys.radiusControl,
              }}
            >
              {shared.isLiveActive ? 'ON AIR' : 'STBY'}
            </span>
            <span
              className="text-sm font-bold tracking-wide uppercase truncate"
              style={{ fontFamily: sys.displayFont, color: p.text }}
            >
              SYNTXRR BUS
            </span>
            <span className="text-[11px] shrink-0" style={{ fontFamily: sys.monoFont, color: p.textMuted }}>
              {shared.operatingMode === 'mode_a' ? 'M-A' : 'M-B'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="w-8 h-8 inline-flex items-center justify-center"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                backgroundColor: p.surfaceElevated,
                color: p.text,
              }}
              aria-label="Toggle theme"
            >
              {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {shared.isLiveActive ? 'Cut' : 'Take'}
            </button>
          </div>
        </header>

        {/* Main Console Surface */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3.5">
          {renderModuleView(shared)}
        </main>

        {/* Compact 52px Docked Switcher Bar */}
        <nav
          className="h-[52px] shrink-0 grid grid-cols-5 px-1"
          style={{ backgroundColor: p.surface, borderTop: `1px solid ${p.borderStrong}` }}
          aria-label="Broadcast Mobile Switcher"
        >
          {([
            { id: 'dashboard', label: 'Tally', icon: Radio },
            { id: 'studio', label: 'Stage', icon: Layers },
            { id: 'live_center', label: 'Feed', icon: Activity },
            { id: 'audio', label: 'Mixer', icon: Sliders },
          ] as const).map((item) => {
            const Icon = item.icon;
            const active = shared.activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => shared.onNavigate(item.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
                style={{
                  color: active ? p.accent : p.textMuted,
                  borderTop: active ? `2px solid ${p.accent}` : '2px solid transparent',
                }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setRackSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
            style={{
              color:
                !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                  ? p.accent
                  : p.textMuted,
              borderTop: !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                ? `2px solid ${p.accent}`
                : '2px solid transparent',
            }}
          >
            <Grid3X3 className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Rack</span>
          </button>
        </nav>

        <MobileMoreSheet shared={shared} open={rackSheetOpen} onClose={() => setRackSheetOpen(false)} />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
    >
      {/* 44px Master Bus Tally Bar */}
      <header
        className="h-11 px-4 shrink-0 flex items-center justify-between gap-4"
        style={{ backgroundColor: p.surface, borderBottom: `1px solid ${p.borderStrong}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
            style={{
              fontFamily: sys.monoFont,
              borderRadius: sys.radiusControl,
              backgroundColor: shared.isLiveActive ? p.error : p.surfaceElevated,
              color: shared.isLiveActive ? '#FFFFFF' : p.textSecondary,
              border: `1px solid ${shared.isLiveActive ? p.error : p.borderStrong}`,
            }}
          >
            {shared.isLiveActive ? 'PGM ON AIR' : 'PGM STANDBY'}
          </span>
          <span
            className="text-base font-bold uppercase tracking-wider"
            style={{ fontFamily: sys.displayFont, color: p.text }}
          >
            SYNTXRR MASTER CONTROL
          </span>
          <span className="text-xs" style={{ fontFamily: sys.monoFont, color: p.textMuted }}>
            {currentPreset.name} · {shared.canvasAspect}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className="inline-flex p-0.5"
            style={{ backgroundColor: p.surfaceMuted, border: `1px solid ${p.border}`, borderRadius: sys.radiusControl }}
          >
            {(['mode_a', 'mode_b'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => shared.onChangeOperatingMode(m)}
                className="px-2.5 py-1 text-[11px] font-semibold uppercase"
                style={{
                  borderRadius: '3px',
                  backgroundColor: shared.operatingMode === m ? p.surfaceElevated : 'transparent',
                  color: shared.operatingMode === m ? p.accent : p.textMuted,
                  fontFamily: sys.monoFont,
                }}
              >
                {m === 'mode_a' ? 'Mode A' : 'Mode B'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={shared.onToggleTheme}
            className="px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
            style={{
              borderRadius: sys.radiusControl,
              border: `1px solid ${p.border}`,
              backgroundColor: p.surfaceElevated,
              color: p.textSecondary,
            }}
          >
            {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="capitalize">{shared.theme}</span>
          </button>

          <button
            type="button"
            onClick={shared.onToggleLiveActive}
            className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider"
            style={{
              borderRadius: sys.radiusControl,
              backgroundColor: shared.isLiveActive ? p.error : p.accent,
              color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
            }}
          >
            {shared.isLiveActive ? 'Cut Output' : 'Take Live'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 224px Channel Rack Sidebar */}
        <aside
          className="w-[224px] shrink-0 p-3 flex flex-col justify-between overflow-y-auto"
          style={{ backgroundColor: p.surfaceMuted, borderRight: `1px solid ${p.border}` }}
        >
          <div className="space-y-1">
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: p.textMuted }}>
              Channel Rack
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = shared.activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => shared.onNavigate(item.id)}
                  className="w-full px-2.5 py-2 text-left flex items-center justify-between gap-2"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: active ? p.surfaceElevated : 'transparent',
                    border: `1px solid ${active ? p.borderStrong : 'transparent'}`,
                    color: active ? p.accent : p.textSecondary,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-semibold truncate">{item.label}</span>
                  </div>
                  <span className="text-[10px]" style={{ fontFamily: sys.monoFont, color: p.textMuted }}>
                    {item.code}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="p-2.5 space-y-1 text-[11px]"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusControl,
              fontFamily: sys.monoFont,
            }}
          >
            <div className="flex justify-between">
              <span style={{ color: p.textMuted }}>ENC</span>
              <span style={{ color: p.ok }}>H.264 HW</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: p.textMuted }}>AUDIO</span>
              <span style={{ color: p.text }}>48 kHz</span>
            </div>
          </div>
        </aside>

        {/* Main Console Surface */}
        <main className="flex-1 overflow-y-auto p-5">{renderModuleView(shared)}</main>
      </div>
    </div>
  );
};

/* ============================================================================
   OPTION C — FUTURE LUXE ("SPATIAL ATELIER")
   Sculptural titanium depth, slim vertical icon dock, floating mobile capsule
   ============================================================================ */
const FutureLuxeShell: React.FC<ShellProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS.C;
  const p = sys.palettes[shared.theme];
  const [dockSheetOpen, setDockSheetOpen] = useState(false);
  const currentPreset = MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId) || MOCK_PRESETS[0];
  const currentNav = NAV_ITEMS.find((n) => n.id === shared.activeModule) || NAV_ITEMS[0];

  if (shared.isMobileViewport) {
    return (
      <div
        className="relative flex flex-col h-full w-full overflow-hidden"
        style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
      >
        {/* Minimal Spatial Top Header */}
        <header className="h-12 px-4 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: shared.isLiveActive ? p.ok : p.accent }}
            />
            <span className="text-sm font-semibold tracking-tight truncate" style={{ fontFamily: sys.displayFont, color: p.text }}>
              {currentNav.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="w-8 h-8 inline-flex items-center justify-center"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: p.surface,
                border: `1px solid ${p.border}`,
                color: p.textSecondary,
              }}
              aria-label="Toggle theme"
            >
              {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-3 py-1.5 text-[11px] font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {shared.isLiveActive ? 'End Live' : 'Go Live'}
            </button>
          </div>
        </header>

        {/* Scrollable Spatial Content with clearance for floating capsule */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 pt-1 pb-24">
          {renderModuleView(shared)}
        </main>

        {/* Floating Detached Capsule Dock */}
        <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-none flex justify-center">
          <nav
            className="pointer-events-auto w-full h-[54px] grid grid-cols-5 px-1.5 items-center"
            style={{
              backgroundColor: p.surfaceElevated,
              border: `1px solid ${p.borderStrong}`,
              borderRadius: '18px',
              boxShadow: p.shadow,
            }}
            aria-label="Spatial Floating Dock"
          >
            {([
              { id: 'dashboard', label: 'Home', icon: Home },
              { id: 'studio', label: 'Studio', icon: Layers },
              { id: 'live_center', label: 'Live', icon: Activity },
              { id: 'audio', label: 'Audio', icon: Volume2 },
            ] as const).map((item) => {
              const Icon = item.icon;
              const active = shared.activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => shared.onNavigate(item.id)}
                  className="h-11 flex flex-col items-center justify-center gap-0.5"
                  style={{
                    borderRadius: '12px',
                    backgroundColor: active ? p.accentSoft : 'transparent',
                    color: active ? p.accent : p.textMuted,
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] font-semibold whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setDockSheetOpen(true)}
              className="h-11 flex flex-col items-center justify-center gap-0.5"
              style={{
                borderRadius: '12px',
                backgroundColor:
                  !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                    ? p.accentSoft
                    : 'transparent',
                color:
                  !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                    ? p.accent
                    : p.textMuted,
              }}
            >
              <Grid3X3 className="w-4 h-4" />
              <span className="text-[10px] font-semibold whitespace-nowrap">Modules</span>
            </button>
          </nav>
        </div>

        <MobileMoreSheet shared={shared} open={dockSheetOpen} onClose={() => setDockSheetOpen(false)} />
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden p-3 gap-3"
      style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
    >
      {/* 80px Sculptural Vertical Rail */}
      <aside
        className="w-[80px] shrink-0 py-3 px-1.5 flex flex-col items-center justify-between overflow-y-auto"
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
          boxShadow: p.shadow,
        }}
      >
        <div
          className="w-10 h-10 flex items-center justify-center text-sm font-bold tracking-tight shrink-0"
          style={{
            fontFamily: sys.displayFont,
            borderRadius: sys.radiusControl,
            backgroundColor: p.accent,
            color: p.accentInk,
          }}
        >
          SX
        </div>

        <nav className="w-full space-y-1 my-2" aria-label="Spatial Rail">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = shared.activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => shared.onNavigate(item.id)}
                className="w-full py-2 px-1 flex flex-col items-center justify-center gap-1 transition-colors"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: active ? p.accentSoft : 'transparent',
                  border: `1px solid ${active ? p.accent : 'transparent'}`,
                  color: active ? p.accent : p.textMuted,
                }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium leading-none truncate max-w-full">{item.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={shared.onToggleTheme}
          className="w-10 h-10 inline-flex items-center justify-center shrink-0"
          style={{
            borderRadius: sys.radiusControl,
            border: `1px solid ${p.border}`,
            backgroundColor: p.surfaceElevated,
            color: p.textSecondary,
          }}
          title="Toggle Dark / Light"
        >
          {shared.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </aside>

      {/* Spatial Canvas Column */}
      <div className="flex-1 flex flex-col min-w-0 gap-3 overflow-hidden">
        {/* Floating Contextual Header Capsule */}
        <header
          className="h-14 px-5 shrink-0 flex items-center justify-between gap-4"
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
            boxShadow: p.shadow,
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
              {currentNav.label}
            </span>
            <span className="text-xs" style={{ color: p.textMuted }}>
              {shared.operatingMode === 'mode_a' ? 'TikTok Companion' : 'RTMP Encoder'} · {currentPreset.name}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => shared.onChangeOperatingMode(shared.operatingMode === 'mode_a' ? 'mode_b' : 'mode_a')}
              className="px-3 py-1.5 text-xs font-medium"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                backgroundColor: p.surfaceElevated,
                color: p.textSecondary,
              }}
            >
              Switch to {shared.operatingMode === 'mode_a' ? 'Mode B' : 'Mode A'}
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-4 py-1.5 text-xs font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {shared.isLiveActive ? 'End Live Broadcast' : 'Launch Live Session'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pr-1">{renderModuleView(shared)}</main>
      </div>
    </div>
  );
};

/* ============================================================================
   OPTION D — SIGNATURE HYBRID ("FLAGSHIP HYBRID")
   Workflow-grouped sidebar (Operate / Produce / Configure) + calm top bar
   ============================================================================ */
const SignatureHybridShell: React.FC<ShellProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS.D;
  const p = sys.palettes[shared.theme];
  const [moreOpen, setMoreOpen] = useState(false);
  const currentPreset = MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId) || MOCK_PRESETS[0];
  const currentNav = NAV_ITEMS.find((n) => n.id === shared.activeModule) || NAV_ITEMS[0];
  const groups: Array<'Operate' | 'Produce' | 'Configure'> = ['Operate', 'Produce', 'Configure'];

  if (shared.isMobileViewport) {
    return (
      <div
        className="relative flex flex-col h-full w-full overflow-hidden"
        style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
      >
        {/* 48px Executive Mobile Header */}
        <header
          className="h-12 px-3.5 shrink-0 flex items-center justify-between gap-2"
          style={{ backgroundColor: p.surface, borderBottom: `1px solid ${p.border}` }}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate" style={{ fontFamily: sys.displayFont, color: p.text }}>
              SYNTXRR · {currentNav.shortLabel}
            </div>
            <div className="text-[10px] truncate" style={{ color: p.textMuted }}>
              {shared.operatingMode === 'mode_a' ? 'Mode A Companion' : 'Mode B RTMP'} · {currentPreset.name}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="w-8 h-8 inline-flex items-center justify-center"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                backgroundColor: p.surfaceMuted,
                color: p.textSecondary,
              }}
              aria-label="Toggle theme"
            >
              {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-2.5 py-1.5 text-[11px] font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {shared.isLiveActive ? 'End' : 'Go Live'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-4">
          {renderModuleView(shared)}
        </main>

        {/* Native Android 5-Tab Ergonomic Thumb Bar */}
        <nav
          className="h-14 shrink-0 grid grid-cols-5 px-1"
          style={{ backgroundColor: p.surface, borderTop: `1px solid ${p.border}` }}
          aria-label="Hybrid Mobile Navigation"
        >
          {([
            { id: 'dashboard', label: 'Dash', icon: Home },
            { id: 'studio', label: 'Studio', icon: Layers },
            { id: 'live_center', label: 'Live', icon: Activity },
            { id: 'audio', label: 'Audio', icon: Volume2 },
          ] as const).map((item) => {
            const Icon = item.icon;
            const active = shared.activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => shared.onNavigate(item.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
                style={{ color: active ? p.accent : p.textMuted }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px] font-medium whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
            style={{
              color:
                !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                  ? p.accent
                  : p.textMuted,
            }}
          >
            <Menu className="w-4 h-4" />
            <span className="text-[11px] font-medium whitespace-nowrap">All</span>
          </button>
        </nav>

        <MobileMoreSheet shared={shared} open={moreOpen} onClose={() => setMoreOpen(false)} grouped />
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
    >
      {/* 232px Workflow-Grouped Sidebar */}
      <aside
        className="w-[232px] shrink-0 p-4 flex flex-col justify-between overflow-y-auto"
        style={{ backgroundColor: p.surface, borderRight: `1px solid ${p.border}` }}
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between pb-3" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div>
              <div className="text-base font-bold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
                SYNTXRR STREAM
              </div>
              <div className="text-[11px]" style={{ color: p.textMuted }}>
                Flagship Hybrid
              </div>
            </div>
            <Check className="w-4 h-4" style={{ color: p.ok }} />
          </div>

          {groups.map((grp) => (
            <div key={grp} className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
                {grp}
              </div>
              {NAV_ITEMS.filter((item) => item.group === grp).map((item) => {
                const Icon = item.icon;
                const active = shared.activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => shared.onNavigate(item.id)}
                    className="w-full px-2.5 py-2 text-left flex items-center gap-2.5 transition-colors"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: active ? p.surfaceElevated : 'transparent',
                      border: `1px solid ${active ? p.borderStrong : 'transparent'}`,
                      color: active ? p.text : p.textSecondary,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <Icon className="w-4 h-4 shrink-0" style={{ color: active ? p.accent : p.textMuted }} />
                    <span className="text-xs truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          className="p-3 space-y-2 text-xs"
          style={{
            backgroundColor: p.surfaceMuted,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: p.textMuted }}>Scene</span>
            <span className="font-medium truncate max-w-[120px]" style={{ color: p.text }}>
              {currentPreset.name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: p.textMuted }}>Mode</span>
            <span className="font-medium" style={{ color: p.textSecondary }}>
              {shared.operatingMode === 'mode_a' ? 'Mode A' : 'Mode B'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 52px Executive Top Bar */}
        <header
          className="h-[52px] px-6 shrink-0 flex items-center justify-between gap-4"
          style={{ backgroundColor: p.surface, borderBottom: `1px solid ${p.border}` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-semibold" style={{ color: p.text }}>
              {currentNav.label}
            </span>
            <span className="text-xs" style={{ color: p.textMuted }}>
              {currentNav.group} · {shared.operatingMode === 'mode_a' ? 'TikTok LIVE Companion' : 'RTMP Encoder'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                backgroundColor: p.surfaceMuted,
                color: p.textSecondary,
              }}
            >
              {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="capitalize">{shared.theme}</span>
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-4 py-1.5 text-xs font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {shared.isLiveActive ? 'End Live Broadcast' : 'Go Live'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{renderModuleView(shared)}</main>
      </div>
    </div>
  );
};

/* ============================================================================
   OPTION D+ — SIGNATURE HYBRID FLAGSHIP LUXURY EDITION
   Option D foundation + Option A restraint + Option B precision + Option C depth
   ============================================================================ */
const SignatureHybridPlusShell: React.FC<ShellProps> = ({ shared, dashboardOverride }) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[shared.theme];
  const [moreOpen, setMoreOpen] = useState(false);
  const currentPreset = MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId) || MOCK_PRESETS[0];
  const currentNav = NAV_ITEMS.find((n) => n.id === shared.activeModule) || NAV_ITEMS[0];
  const groups: Array<'Operate' | 'Produce' | 'Configure'> = ['Operate', 'Produce', 'Configure'];
  const mobileCtaLabel = shared.isLiveActive
    ? 'Stop'
    : shared.operatingMode === 'mode_a'
    ? 'Start'
    : 'Stream';
  const desktopCtaLabel = shared.isLiveActive
    ? shared.operatingMode === 'mode_a'
      ? 'Stop Companion'
      : 'Stop RTMP'
    : shared.operatingMode === 'mode_a'
    ? 'Start Companion'
    : 'Start RTMP';

  if (shared.isMobileViewport) {
    return (
      <div
        className="relative flex flex-col h-full w-full overflow-hidden"
        style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
      >
        {/* 48px Android Flagship Top Bar */}
        <header
          className="h-12 px-3.5 shrink-0 flex items-center justify-between gap-2"
          style={{ backgroundColor: p.surface, borderBottom: `1px solid ${p.border}` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-6 h-6 shrink-0 inline-flex items-center justify-center text-[11px] font-bold tracking-tight"
              style={{
                borderRadius: '6px',
                backgroundColor: p.accent,
                color: p.accentInk,
                fontFamily: sys.displayFont,
              }}
            >
              SX
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold tracking-tight truncate" style={{ fontFamily: sys.displayFont, color: p.text }}>
                {currentNav.label}
              </div>
              <div className="text-[10px] truncate" style={{ color: p.textMuted }}>
                {shared.operatingMode === 'mode_a' ? 'Mode A Companion' : 'Mode B RTMP'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="w-8 h-8 inline-flex items-center justify-center"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                backgroundColor: p.surfaceMuted,
                color: p.textSecondary,
              }}
              aria-label="Toggle theme"
            >
              {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {mobileCtaLabel}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-4">
          {renderModuleView(shared, dashboardOverride)}
        </main>

        {/* Native Android 56px Thumb Bar with Crisp #F2C230 Active Top Indicator */}
        <nav
          className="h-14 shrink-0 grid grid-cols-5 px-1"
          style={{ backgroundColor: p.surface, borderTop: `1px solid ${p.border}` }}
          aria-label="D+ Mobile Navigation"
        >
          {([
            { id: 'dashboard', label: 'Home', icon: Home },
            { id: 'studio', label: 'Studio', icon: Layers },
            { id: 'live_center', label: 'Live', icon: Activity },
            { id: 'audio', label: 'Audio', icon: Volume2 },
          ] as const).map((item) => {
            const Icon = item.icon;
            const active = shared.activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => shared.onNavigate(item.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors"
                style={{
                  color: active ? p.accentText : p.textMuted,
                  borderTop: active ? `2px solid ${p.accent}` : '2px solid transparent',
                }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px] font-medium whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors"
            style={{
              color:
                !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                  ? p.accentText
                  : p.textMuted,
              borderTop: !['dashboard', 'studio', 'live_center', 'audio'].includes(shared.activeModule)
                ? `2px solid ${p.accent}`
                : '2px solid transparent',
            }}
          >
            <Menu className="w-4 h-4" />
            <span className="text-[11px] font-medium whitespace-nowrap">All</span>
          </button>
        </nav>

        <MobileMoreSheet shared={shared} open={moreOpen} onClose={() => setMoreOpen(false)} grouped />
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ backgroundColor: p.canvas, color: p.text, fontFamily: sys.bodyFont }}
    >
      {/* 228px Flagship Grouped Sidebar */}
      <aside
        className="w-[228px] shrink-0 p-4 flex flex-col justify-between overflow-y-auto"
        style={{ backgroundColor: p.surface, borderRight: `1px solid ${p.border}` }}
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between pb-3.5" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 flex items-center justify-center text-xs font-bold tracking-tight shrink-0"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: p.accent,
                  color: p.accentInk,
                  fontFamily: sys.displayFont,
                }}
              >
                SX
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight" style={{ fontFamily: sys.displayFont, color: p.text }}>
                  SYNTXRR
                </div>
                <div className="text-[10.5px]" style={{ color: p.textMuted }}>
                  Flagship Luxury
                </div>
              </div>
            </div>
          </div>

          {groups.map((grp) => (
            <div key={grp} className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
                {grp}
              </div>
              {NAV_ITEMS.filter((item) => item.group === grp).map((item) => {
                const Icon = item.icon;
                const active = shared.activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => shared.onNavigate(item.id)}
                    className="w-full px-2.5 py-2 text-left flex items-center justify-between gap-2 transition-colors"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: active ? p.surfaceElevated : 'transparent',
                      border: `1px solid ${active ? p.borderStrong : 'transparent'}`,
                      color: active ? p.text : p.textSecondary,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" style={{ color: active ? p.accentText : p.textMuted }} />
                      <span className="text-xs truncate">{item.label}</span>
                    </div>
                    {active && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          className="p-3 space-y-2 text-[11px]"
          style={{
            backgroundColor: p.surfaceMuted,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: p.textMuted }}>Scene</span>
            <span className="font-medium truncate" style={{ color: p.text }}>
              {currentPreset.name}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: p.textMuted }}>Pipeline</span>
            <span className="font-mono tabular-nums font-medium" style={{ color: shared.isLiveActive ? p.ok : p.textSecondary }}>
              {shared.operatingMode === 'mode_a' ? 'Mode A' : 'Mode B'} · {shared.isLiveActive ? 'Active' : 'Standby'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 52px Restrained Executive Header */}
        <header
          className="h-[52px] px-6 shrink-0 flex items-center justify-between gap-4"
          style={{ backgroundColor: p.surface, borderBottom: `1px solid ${p.border}` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-semibold" style={{ fontFamily: sys.displayFont, color: p.text }}>
              {currentNav.label}
            </span>
            <span className="text-xs" style={{ color: p.textMuted }}>
              {currentNav.group} · {shared.operatingMode === 'mode_a' ? 'TikTok LIVE Companion' : 'Native RTMP Encoder'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={shared.onToggleTheme}
              className="px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
              style={{
                borderRadius: sys.radiusControl,
                border: `1px solid ${p.border}`,
                backgroundColor: p.surfaceMuted,
                color: p.textSecondary,
              }}
            >
              {shared.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="capitalize">{shared.theme}</span>
            </button>
            <button
              type="button"
              onClick={shared.onToggleLiveActive}
              className="px-4 py-1.5 text-xs font-semibold"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: shared.isLiveActive ? p.error : p.accent,
                color: shared.isLiveActive ? '#FFFFFF' : p.accentInk,
              }}
            >
              {desktopCtaLabel}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-7 py-6">
          <div className="max-w-5xl mx-auto">{renderModuleView(shared, dashboardOverride)}</div>
        </main>
      </div>
    </div>
  );
};

export const OptionShellRenderer: React.FC<ShellProps> = ({ shared, dashboardOverride }) => {
  switch (shared.optionId) {
    case 'D_PLUS':
      return <SignatureHybridPlusShell shared={shared} dashboardOverride={dashboardOverride} />;
    case 'D':
      return <SignatureHybridShell shared={shared} />;
    case 'A':
      return <QuietLuxuryShell shared={shared} />;
    case 'B':
      return <BroadcastEliteShell shared={shared} />;
    case 'C':
      return <FutureLuxeShell shared={shared} />;
  }
};
