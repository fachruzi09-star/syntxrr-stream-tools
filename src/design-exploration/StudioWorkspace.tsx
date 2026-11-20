import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Folder,
  FolderTree,
  Grid3X3,
  Layers,
  Lock,
  Music2,
  Package,
  Play,
  Plus,
  Radio,
  Sliders,
  Sparkles,
  Unlock,
  Upload,
  Video,
} from 'lucide-react';
import {
  EXPLORATION_IMAGES,
  INITIAL_GROUPS,
  INITIAL_SUPER_GROUPS,
  MOCK_ELEMENT_CATALOG,
  MOCK_LOCAL_MEDIA,
  MOCK_MARKETPLACE_PACKS,
  MOCK_PRESETS,
} from './mockData';
import { OPTION_SYSTEMS } from './tokens';
import type { ExplorationSharedState, StudioInspectorTab } from './types';

interface StudioWorkspaceProps {
  shared: ExplorationSharedState;
}

const STUDIO_DOCK_TABS: Array<{ id: StudioInspectorTab; label: string }> = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'layers', label: 'Layers & Groups' },
  { id: 'elements', label: 'Element Library' },
  { id: 'sources', label: 'Sources' },
  { id: 'presets', label: 'Presets' },
  { id: 'media', label: 'Local Media' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'song_request', label: 'Song Request' },
];

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({ shared }) => {
  const sys = OPTION_SYSTEMS[shared.optionId];
  const p = sys.palettes[shared.theme];
  const isDPlus = shared.optionId === 'D_PLUS';
  const [showGrid, setShowGrid] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [srPrefix, setSrPrefix] = useState('!play');
  const [srAutoApprove, setSrAutoApprove] = useState(true);
  const [srMaxQueue, setSrMaxQueue] = useState(12);
  const [installedPackIds, setInstalledPackIds] = useState<string[]>(['mk_atelier']);
  const [stageImgError, setStageImgError] = useState(false);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  const selectedEl =
    shared.studioElements.find((el) => el.id === shared.selectedElementId) ||
    shared.studioElements[0];

  const isMobile = shared.isMobileViewport;
  const isThreePane = shared.optionId === 'B' && !isMobile;

  type DPlusGroupId = 'design' | 'add' | 'presets' | 'media' | 'requests';
  const activeDPlusGroup: DPlusGroupId =
    shared.studioDockTab === 'inspector' || shared.studioDockTab === 'layers'
      ? 'design'
      : shared.studioDockTab === 'elements' || shared.studioDockTab === 'sources'
      ? 'add'
      : shared.studioDockTab === 'presets' || shared.studioDockTab === 'marketplace'
      ? 'presets'
      : shared.studioDockTab === 'media' || shared.studioDockTab === 'simulator'
      ? 'media'
      : 'requests';

  const D_PLUS_GROUPS: Array<{ id: DPlusGroupId; label: string; defaultTab: StudioInspectorTab }> = [
    { id: 'design', label: 'Design', defaultTab: 'inspector' },
    { id: 'add', label: 'Add', defaultTab: 'elements' },
    { id: 'presets', label: 'Presets', defaultTab: 'presets' },
    { id: 'media', label: 'Media', defaultTab: 'media' },
    { id: 'requests', label: 'Requests', defaultTab: 'song_request' },
  ];

  const renderDockContent = (forcedTab?: StudioInspectorTab) => {
    const activeTab = forcedTab ?? shared.studioDockTab;

    if (activeTab === 'inspector') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2.5" style={{ borderBottom: `1px solid ${p.border}` }}>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: p.text }}>
                {selectedEl ? selectedEl.name : 'No Element Selected'}
              </div>
              <div className="text-[11px] truncate" style={{ color: p.textMuted }}>
                {selectedEl ? selectedEl.summary : 'Select a layer on canvas'}
              </div>
            </div>
            {selectedEl && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => shared.onToggleElementVisibility(selectedEl.id)}
                  className="p-2 transition-opacity hover:opacity-80"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${p.border}`,
                    backgroundColor: p.surfaceMuted,
                    color: p.text,
                  }}
                  title={selectedEl.visible ? 'Hide element' : 'Show element'}
                >
                  {selectedEl.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => shared.onToggleElementLock(selectedEl.id)}
                  className="p-2 transition-opacity hover:opacity-80"
                  style={{
                    borderRadius: sys.radiusControl,
                    border: `1px solid ${p.border}`,
                    backgroundColor: p.surfaceMuted,
                    color: selectedEl.locked ? p.accent : p.text,
                  }}
                  title={selectedEl.locked ? 'Unlock element' : 'Lock element'}
                >
                  {selectedEl.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {selectedEl && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { key: 'x', label: 'Pos X (%)', val: selectedEl.x, max: 90 },
                  { key: 'y', label: 'Pos Y (%)', val: selectedEl.y, max: 90 },
                  { key: 'width', label: 'Width (%)', val: selectedEl.width, max: 100 },
                  { key: 'height', label: 'Height (%)', val: selectedEl.height, max: 100 },
                ] as const).map((field) => (
                  <div
                    key={field.key}
                    className="p-2.5"
                    style={{
                      backgroundColor: p.surfaceMuted,
                      border: `1px solid ${p.border}`,
                      borderRadius: sys.radiusControl,
                    }}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span style={{ color: p.textMuted }}>{field.label}</span>
                      <span className="font-mono tabular-nums font-medium" style={{ color: p.text }}>
                        {field.val}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={field.max}
                      value={field.val}
                      disabled={selectedEl.locked}
                      onChange={(e) =>
                        shared.onUpdateElementProp(selectedEl.id, {
                          [field.key]: Number(e.target.value),
                        })
                      }
                      className="w-full accent-current cursor-pointer"
                      style={{ color: p.accent }}
                    />
                  </div>
                ))}
              </div>

              <div
                className="p-3"
                style={{
                  backgroundColor: p.surfaceMuted,
                  border: `1px solid ${p.border}`,
                  borderRadius: sys.radiusControl,
                }}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span style={{ color: p.textSecondary }}>Layer Opacity</span>
                  <span className="font-mono tabular-nums font-semibold" style={{ color: p.text }}>
                    {selectedEl.opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  value={selectedEl.opacity}
                  onChange={(e) =>
                    shared.onUpdateElementProp(selectedEl.id, { opacity: Number(e.target.value) })
                  }
                  className="w-full cursor-pointer"
                  style={{ accentColor: p.accent }}
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1" style={{ color: p.textMuted }}>
                <span>Z-Order: {selectedEl.zIndex}</span>
                <span>·</span>
                <span>Group: {selectedEl.groupId ? 'Assigned' : 'Root Canvas'}</span>
              </div>
            </>
          )}
        </div>
      );
    }

    if (activeTab === 'layers') {
      return (
        <div className="space-y-3">
          {INITIAL_SUPER_GROUPS.map((sg) => (
            <div key={sg.id} className="space-y-1.5">
              <div
                className="flex items-center justify-between px-2.5 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: p.surfaceMuted,
                  border: `1px solid ${p.border}`,
                  borderRadius: sys.radiusControl,
                  color: p.text,
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  <FolderTree className="w-3.5 h-3.5 shrink-0" style={{ color: p.accent }} />
                  <span className="truncate">{sg.name}</span>
                </span>
                <span className="text-[11px] font-normal shrink-0" style={{ color: p.textMuted }}>
                  Supergroup
                </span>
              </div>

              <div className="pl-3 space-y-1.5">
                {INITIAL_GROUPS.filter((g) => g.superGroupId === sg.id).map((grp) => (
                  <div key={grp.id} className="space-y-1">
                    <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium" style={{ color: p.textSecondary }}>
                      <span className="flex items-center gap-1.5">
                        <Folder className="w-3 h-3" style={{ color: p.textMuted }} />
                        <span>{grp.name}</span>
                      </span>
                      <span style={{ color: p.textMuted }}>Group</span>
                    </div>
                    <div className="pl-3 space-y-1">
                      {shared.studioElements
                        .filter((el) => el.groupId === grp.id)
                        .map((el) => renderLayerRow(el))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {INITIAL_GROUPS.filter((g) => !g.superGroupId).map((grp) => (
            <div key={grp.id} className="space-y-1">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium" style={{ color: p.textSecondary }}>
                <span className="flex items-center gap-1.5">
                  <Folder className="w-3 h-3" style={{ color: p.textMuted }} />
                  <span>{grp.name}</span>
                </span>
                <span style={{ color: p.textMuted }}>Group</span>
              </div>
              <div className="pl-3 space-y-1">
                {shared.studioElements
                  .filter((el) => el.groupId === grp.id)
                  .map((el) => renderLayerRow(el))}
              </div>
            </div>
          ))}

          <div className="pt-1 space-y-1">
            <div className="px-2 text-[11px] font-medium" style={{ color: p.textMuted }}>
              Base Layers
            </div>
            {shared.studioElements
              .filter((el) => !el.groupId)
              .map((el) => renderLayerRow(el))}
          </div>
        </div>
      );
    }

    if (activeTab === 'elements') {
      return (
        <div className="space-y-2">
          <div className="text-xs mb-2" style={{ color: p.textMuted }}>
            Tap any component to place it directly on the active stage.
          </div>
          {MOCK_ELEMENT_CATALOG.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-2 px-3 py-2.5"
              style={{
                backgroundColor: p.surfaceMuted,
                border: `1px solid ${p.border}`,
                borderRadius: sys.radiusControl,
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: p.text }}>
                  {item.name}
                </div>
                <div className="text-[11px] truncate" style={{ color: p.textMuted }}>
                  {item.category} · {item.spec}
                </div>
              </div>
              <button
                type="button"
                onClick={() => shared.onAddMockElement(item.name, item.category)}
                className="px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 shrink-0 transition-transform active:scale-95"
                style={{
                  backgroundColor: p.accent,
                  color: p.accentInk,
                  borderRadius: sys.radiusControl,
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'sources') {
      return (
        <div className="space-y-2">
          {shared.sources.map((src) => (
            <div
              key={src.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5"
              style={{
                backgroundColor: p.surfaceMuted,
                border: `1px solid ${p.border}`,
                borderRadius: sys.radiusControl,
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: p.text }}>
                  {src.name}
                </div>
                <div className="text-[11px] truncate" style={{ color: p.textMuted }}>
                  {src.detail} · {src.permission}
                </div>
              </div>
              <button
                type="button"
                onClick={() => shared.onToggleSourceConnected(src.id)}
                className="px-2.5 py-1.5 text-[11px] font-semibold shrink-0 whitespace-nowrap"
                style={{
                  borderRadius: sys.radiusControl,
                  backgroundColor: src.connected ? p.okSoft : p.surface,
                  color: src.connected ? p.ok : p.textSecondary,
                  border: `1px solid ${src.connected ? p.ok : p.border}`,
                }}
              >
                {src.connected ? 'Routed' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'presets') {
      return (
        <div className="space-y-2.5">
          {isDPlus && (
            <div className="flex items-center justify-between gap-2 pb-1">
              <span className="text-[11px]" style={{ color: p.textMuted }}>
                Portable JSON / ZIP bundles
              </span>
              <div className="flex items-center gap-1.5">
                {(['Export', 'Import'] as const).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => {
                      setPresetNotice(`${act} bundle dialog ready`);
                      window.setTimeout(() => setPresetNotice(null), 2200);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: p.surfaceMuted,
                      border: `1px solid ${p.border}`,
                      color: p.text,
                    }}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>
          )}
          {presetNotice && (
            <div className="text-[11px] font-medium" style={{ color: p.accentText }}>
              {presetNotice}
            </div>
          )}
          {MOCK_PRESETS.map((preset) => {
            const active = preset.id === shared.activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => shared.onSelectPreset(preset.id)}
                className="w-full text-left px-3 py-2.5 transition-colors"
                style={{
                  backgroundColor: active ? p.accentSoft : p.surfaceMuted,
                  border: `1px solid ${active ? p.accent : p.border}`,
                  borderRadius: sys.radiusControl,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate" style={{ color: p.text }}>
                    {preset.name}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: active ? p.accentText : p.textMuted }}>
                    {preset.aspect} · {preset.elementsCount} layers
                  </span>
                </div>
                <div className="text-[11px] mt-1 line-clamp-2" style={{ color: p.textMuted }}>
                  {preset.summary}
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'media') {
      return (
        <div className="space-y-2.5">
          <div
            className="p-3 text-center space-y-1"
            style={{
              border: `1px dashed ${p.borderStrong}`,
              borderRadius: sys.radiusControl,
              backgroundColor: p.surfaceMuted,
            }}
          >
            <Upload className="w-4 h-4 mx-auto" style={{ color: p.accent }} />
            <div className="text-xs font-medium" style={{ color: p.text }}>
              Import Video / Image Overlay
            </div>
            <div className="text-[11px]" style={{ color: p.textMuted }}>
              Local IndexedDB portable bundle storage
            </div>
          </div>
          {MOCK_LOCAL_MEDIA.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{
                backgroundColor: p.surfaceMuted,
                border: `1px solid ${p.border}`,
                borderRadius: sys.radiusControl,
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: p.text }}>
                  {m.name}
                </div>
                <div className="text-[11px] font-mono tabular-nums" style={{ color: p.textMuted }}>
                  {m.kind} · {m.duration} · {m.size}
                </div>
              </div>
              <button
                type="button"
                onClick={() => shared.onAddMockElement(m.name, 'media')}
                className="px-2.5 py-1 text-[11px] font-semibold shrink-0"
                style={{
                  backgroundColor: p.surface,
                  border: `1px solid ${p.border}`,
                  borderRadius: sys.radiusControl,
                  color: p.text,
                }}
              >
                Use
              </button>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'marketplace') {
      return (
        <div className="space-y-2">
          {MOCK_MARKETPLACE_PACKS.map((pack) => {
            const installed = installedPackIds.includes(pack.id);
            return (
              <div
                key={pack.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5"
                style={{
                  backgroundColor: p.surfaceMuted,
                  border: `1px solid ${p.border}`,
                  borderRadius: sys.radiusControl,
                }}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: p.text }}>
                    {pack.name}
                  </div>
                  <div className="text-[11px]" style={{ color: p.textMuted }}>
                    {pack.author} · {pack.elements} components · {pack.category}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setInstalledPackIds((prev) =>
                      prev.includes(pack.id) ? prev : [...prev, pack.id]
                    )
                  }
                  className="px-2.5 py-1.5 text-[11px] font-semibold shrink-0"
                  style={{
                    borderRadius: sys.radiusControl,
                    backgroundColor: installed ? p.okSoft : p.accent,
                    color: installed ? p.ok : p.accentInk,
                  }}
                >
                  {installed ? 'Installed' : 'Install'}
                </button>
              </div>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'simulator') {
      return (
        <div className="space-y-3">
          <div className="text-xs" style={{ color: p.textMuted }}>
            Preview live overlays on the stage without emitting public stream telemetry.
          </div>
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: 'Galaxy Gift (1,000 Coins)', key: 'nadia_k sent Galaxy ×1 (1,000)' },
              { label: 'New Viewer Follow', key: 'raka_wibowo followed your broadcast' },
              { label: 'Song Request Alert', key: '!play Midnight Velvet queued' },
              { label: 'Mode B Screensaver Cue', key: 'Intermission visual loop active' },
            ].map((sim) => (
              <button
                key={sim.label}
                type="button"
                onClick={() => shared.onTriggerSimulator(sim.key)}
                className="flex items-center justify-between px-3 py-2.5 text-xs font-medium text-left transition-colors"
                style={{
                  backgroundColor: p.surfaceMuted,
                  border: `1px solid ${p.border}`,
                  borderRadius: sys.radiusControl,
                  color: p.text,
                }}
              >
                <span>{sim.label}</span>
                <Play className="w-3.5 h-3.5 shrink-0" style={{ color: p.accent }} />
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div
          className="p-3 space-y-2.5"
          style={{
            backgroundColor: p.surfaceMuted,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusControl,
          }}
        >
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: p.textSecondary }}>Chat Command Prefix</span>
            <input
              type="text"
              value={srPrefix}
              onChange={(e) => setSrPrefix(e.target.value)}
              className="w-20 px-2 py-1 text-xs font-mono text-right"
              style={{
                backgroundColor: p.surface,
                border: `1px solid ${p.border}`,
                borderRadius: sys.radiusControl,
                color: p.text,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: p.textSecondary }}>Queue Limit</span>
            <input
              type="number"
              min={1}
              max={50}
              value={srMaxQueue}
              onChange={(e) => setSrMaxQueue(Number(e.target.value) || 1)}
              className="w-20 px-2 py-1 text-xs font-mono tabular-nums text-right"
              style={{
                backgroundColor: p.surface,
                border: `1px solid ${p.border}`,
                borderRadius: sys.radiusControl,
                color: p.text,
              }}
            />
          </div>
          <label className="flex items-center justify-between text-xs cursor-pointer pt-1">
            <span style={{ color: p.textSecondary }}>Auto-approve Gift Requests</span>
            <input
              type="checkbox"
              checked={srAutoApprove}
              onChange={(e) => setSrAutoApprove(e.target.checked)}
              style={{ accentColor: p.accent }}
            />
          </label>
        </div>
      </div>
    );
  };

  function renderLayerRow(el: (typeof shared.studioElements)[number]) {
    const selected = el.id === shared.selectedElementId;
    return (
      <div
        key={el.id}
        onClick={() => shared.onSelectElement(el.id)}
        className="flex items-center justify-between gap-2 px-2.5 py-2 cursor-pointer transition-colors"
        style={{
          backgroundColor: selected ? p.accentSoft : p.surfaceMuted,
          border: `1px solid ${selected ? p.accent : p.border}`,
          borderRadius: sys.radiusControl,
        }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: selected ? p.accent : p.textMuted }} />
          <span className="text-xs font-medium truncate" style={{ color: p.text }}>
            {el.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => shared.onToggleElementVisibility(el.id)}
            className="p-1 opacity-80 hover:opacity-100"
            style={{ color: el.visible ? p.textSecondary : p.textMuted }}
            aria-label="Toggle visibility"
          >
            {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => shared.onToggleElementLock(el.id)}
            className="p-1 opacity-80 hover:opacity-100"
            style={{ color: el.locked ? p.accent : p.textMuted }}
            aria-label="Toggle lock"
          >
            {el.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Studio Contextual Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pb-3"
        style={{ borderBottom: `1px solid ${p.border}` }}
      >
        <div className="min-w-0">
          <h2
            className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight"
            style={{ fontFamily: sys.displayFont, color: p.text }}
          >
            {isDPlus ? 'Studio Composer' : 'Studio Workspace'}
          </h2>
          <div className="text-xs mt-0.5 flex flex-wrap items-center gap-2" style={{ color: p.textMuted }}>
            <span>{MOCK_PRESETS.find((pr) => pr.id === shared.activePresetId)?.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{shared.canvasAspect}</span>
            <span aria-hidden="true">·</span>
            <span>{shared.operatingMode === 'mode_b' ? 'RTMP Program Stage' : 'Companion Overlay'}</span>
          </div>
        </div>

        {/* Canvas Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="inline-flex p-0.5"
            style={{
              backgroundColor: p.surfaceMuted,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusControl,
            }}
          >
            {(['9:16', '16:9'] as const).map((aspect) => {
              const active = shared.canvasAspect === aspect;
              return (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => shared.onChangeCanvasAspect(aspect)}
                  className="px-2.5 py-1 text-xs font-mono tabular-nums font-medium whitespace-nowrap"
                  style={{
                    borderRadius: `calc(${sys.radiusControl} - 2px)`,
                    backgroundColor: active ? p.surface : 'transparent',
                    color: active ? p.text : p.textMuted,
                    boxShadow: active ? p.shadow : 'none',
                  }}
                >
                  {aspect}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className="px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            style={{
              borderRadius: sys.radiusControl,
              backgroundColor: showGrid ? p.accentSoft : p.surface,
              border: `1px solid ${showGrid ? p.accent : p.border}`,
              color: showGrid ? p.accentText : p.textSecondary,
            }}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSafeZones((s) => !s)}
            className="px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
            style={{
              borderRadius: sys.radiusControl,
              backgroundColor: showSafeZones ? p.accentSoft : p.surface,
              border: `1px solid ${showSafeZones ? p.accent : p.border}`,
              color: showSafeZones ? p.accentText : p.textSecondary,
            }}
          >
            Safe Zone
          </button>

          <button
            type="button"
            onClick={() => shared.onTriggerSimulator('nadia_k sent Galaxy ×1 (1,000)')}
            className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            style={{
              borderRadius: sys.radiusControl,
              backgroundColor: p.surface,
              border: `1px solid ${p.borderStrong}`,
              color: p.text,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: p.accentText }} />
            <span>Simulate Event</span>
          </button>

          {shared.operatingMode === 'mode_b' && (
            <button
              type="button"
              onClick={() => shared.onTriggerSimulator('Scene applied cleanly to native RTMP pipeline')}
              className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              style={{
                borderRadius: sys.radiusControl,
                backgroundColor: p.accent,
                color: p.accentInk,
              }}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Apply Live Scene</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Grid (Option-Specific Architectural Rhythm) */}
      <div
        className={`grid gap-4 items-start ${
          isThreePane
            ? 'grid-cols-12'
            : isMobile
            ? 'grid-cols-1'
            : 'grid-cols-12'
        }`}
      >
        {/* Left Asset/Layer Rack strictly for Option B (Broadcast Elite 3-Pane Console) */}
        {isThreePane && (
          <div
            className="col-span-3 p-3.5 space-y-3"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
            }}
          >
            <div className="flex items-center justify-between pb-2" style={{ borderBottom: `1px solid ${p.border}` }}>
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: p.textSecondary }}>
                Scene & Layers
              </span>
              <span className="text-[11px] font-mono tabular-nums" style={{ color: p.textMuted }}>
                {shared.studioElements.length}
              </span>
            </div>
            <div className="max-h-[470px] overflow-y-auto pr-0.5">
              {renderDockContent('layers')}
            </div>
          </div>
        )}

        {/* Center Visual Canvas Stage (Always the Visual Centerpiece) */}
        <div
          className={
            isThreePane
              ? 'col-span-5'
              : isMobile
              ? 'col-span-1'
              : 'col-span-7'
          }
        >
          <div
            className={`${isDPlus ? 'p-4 sm:p-6' : 'p-3 sm:p-4'} flex flex-col items-center justify-center relative`}
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
              boxShadow: shared.optionId === 'C' || isDPlus ? p.shadow : 'none',
            }}
          >
            {/* Stage Inner Frame */}
            <div
              className="relative overflow-hidden select-none w-full"
              style={{
                maxWidth: shared.canvasAspect === '9:16' ? (isMobile ? '234px' : isDPlus ? '292px' : '278px') : '100%',
                aspectRatio: shared.canvasAspect === '9:16' ? '9 / 16' : '16 / 9',
                borderRadius: sys.radiusControl,
                backgroundColor: '#090B10',
                border: `1px solid ${p.borderStrong}`,
              }}
            >
              {/* Camera Source Backdrop */}
              {!stageImgError ? (
                <img
                  src={EXPLORATION_IMAGES.studioStage}
                  alt="Studio camera feed stage"
                  referrerPolicy="no-referrer"
                  onError={() => setStageImgError(true)}
                  className="absolute inset-0 w-full h-full object-cover opacity-90"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black flex items-center justify-center">
                  <Video className="w-8 h-8 text-slate-500" />
                </div>
              )}

              {/* Subtle scrim for crisp HUD & overlay legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/35 pointer-events-none" />

              {/* Alignment Grid Overlay */}
              {showGrid && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-25"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.22) 1px, transparent 1px)',
                    backgroundSize: '33.33% 33.33%',
                  }}
                />
              )}

              {/* TikTok Safe Zone Margin Frame */}
              {showSafeZones && (
                <div
                  className="absolute inset-x-3 top-6 bottom-12 pointer-events-none"
                  style={{
                    border: '1px dashed rgba(255,255,255,0.35)',
                    borderRadius: '6px',
                  }}
                />
              )}

              {/* Live Rendered Interactive Overlay Elements */}
              {shared.studioElements
                .filter((el) => el.visible && el.category !== 'camera')
                .map((el) => {
                  const isSel = el.id === shared.selectedElementId;
                  return (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => {
                        shared.onSelectElement(el.id);
                        if (shared.studioDockTab !== 'inspector' && !isThreePane) {
                          shared.onChangeStudioDockTab('inspector');
                        }
                      }}
                      className="absolute text-left transition-all cursor-pointer overflow-hidden"
                      style={{
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: `${el.width}%`,
                        height: `${el.height}%`,
                        opacity: el.opacity / 100,
                        zIndex: el.zIndex,
                        borderRadius: '8px',
                        border: isSel ? `1.5px solid ${p.accent}` : '1px solid rgba(255,255,255,0.22)',
                        backgroundColor:
                          el.category === 'alert'
                            ? 'rgba(17, 24, 39, 0.78)'
                            : el.category === 'overlay'
                            ? 'rgba(10, 12, 18, 0.62)'
                            : 'rgba(15, 20, 28, 0.72)',
                        backdropFilter: 'blur(8px)',
                        padding: '5px 8px',
                      }}
                    >
                      {el.category === 'alert' && (
                        <div className="h-full flex flex-col justify-center">
                          <div className="text-[10px] font-semibold truncate" style={{ color: '#F2C230' }}>
                            {shared.simulatedBanner ? 'LIVE SIMULATOR' : 'Alert Box Ready'}
                          </div>
                          <div className="text-[10px] text-white truncate">
                            {shared.simulatedBanner || 'nadia_k sent Galaxy ×1'}
                          </div>
                        </div>
                      )}
                      {el.category === 'overlay' && (
                        <div className="space-y-0.5 text-[9.5px] leading-tight text-slate-100">
                          <div className="truncate"><span className="font-semibold text-amber-300">arief.studio:</span> !play Midnight Velvet</div>
                          <div className="truncate"><span className="font-semibold text-sky-300">sinta_audio:</span> Suara jernih sekali</div>
                          <div className="truncate"><span className="font-semibold text-emerald-300">raka_wibowo:</span> Followed live</div>
                        </div>
                      )}
                      {el.category === 'widget' && (
                        <div className="h-full flex items-center justify-between gap-1 text-[9.5px] text-white">
                          <span className="flex items-center gap-1 truncate">
                            <Music2 className="w-3 h-3 shrink-0" style={{ color: '#F2C230' }} />
                            <span className="truncate">Midnight Velvet · Nusa Quartet</span>
                          </span>
                          <span className="font-mono text-[9px] text-slate-300 shrink-0">02:14</span>
                        </div>
                      )}
                      {(el.category === 'text' || el.category === 'media') && (
                        <div className="h-full flex items-center text-[9.5px] font-medium text-white truncate">
                          {el.name}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Option C / D+ Clean Spatial Canvas Status Strip */}
            {(shared.optionId === 'C' || isDPlus) && (
              <div
                className="mt-3.5 px-3.5 py-1.5 flex flex-wrap items-center justify-center gap-2.5 text-[11px]"
                style={{
                  backgroundColor: p.surfaceElevated,
                  border: `1px solid ${p.border}`,
                  borderRadius: sys.radiusControl,
                  color: p.textSecondary,
                }}
              >
                <span className="font-mono tabular-nums">
                  {shared.studioElements.filter((e) => e.visible).length} visible layers
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[190px]">
                  Selected: <strong style={{ color: p.text }}>{selectedEl?.name}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Contextual Inspector & Module Libraries */}
        <div
          className={
            isThreePane
              ? 'col-span-4 p-3.5 space-y-3'
              : isMobile
              ? 'col-span-1 p-3.5 space-y-3'
              : 'col-span-5 p-4 sm:p-5 space-y-3.5'
          }
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: sys.radiusPanel,
          }}
        >
          {isDPlus ? (
            /* D+: 5 Logically Grouped Studio Toolsets with Clean Secondary Sub-Selector */
            <div className="space-y-2.5 pb-2.5" style={{ borderBottom: `1px solid ${p.border}` }}>
              <div className="grid grid-cols-5 gap-1">
                {D_PLUS_GROUPS.map((grp) => {
                  const active = activeDPlusGroup === grp.id;
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => shared.onChangeStudioDockTab(grp.defaultTab)}
                      className="py-1.5 px-1 text-[11px] font-semibold text-center whitespace-nowrap transition-colors"
                      style={{
                        borderRadius: sys.radiusControl,
                        backgroundColor: active ? p.accent : p.surfaceMuted,
                        color: active ? p.accentInk : p.textSecondary,
                      }}
                    >
                      {grp.label}
                    </button>
                  );
                })}
              </div>

              {activeDPlusGroup === 'design' && (
                <div className="grid grid-cols-2 gap-1 p-0.5" style={{ backgroundColor: p.surfaceMuted, borderRadius: sys.radiusControl }}>
                  {([
                    { id: 'inspector', label: 'Layer Properties' },
                    { id: 'layers', label: 'Layers & Groups' },
                  ] as const).map((sub) => {
                    const active = shared.studioDockTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => shared.onChangeStudioDockTab(sub.id)}
                        className="py-1.5 text-[11px] font-medium"
                        style={{
                          borderRadius: `calc(${sys.radiusControl} - 2px)`,
                          backgroundColor: active ? p.surface : 'transparent',
                          color: active ? p.text : p.textMuted,
                        }}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeDPlusGroup === 'add' && (
                <div className="grid grid-cols-2 gap-1 p-0.5" style={{ backgroundColor: p.surfaceMuted, borderRadius: sys.radiusControl }}>
                  {([
                    { id: 'elements', label: 'Element Library' },
                    { id: 'sources', label: 'Hardware Sources' },
                  ] as const).map((sub) => {
                    const active = shared.studioDockTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => shared.onChangeStudioDockTab(sub.id)}
                        className="py-1.5 text-[11px] font-medium"
                        style={{
                          borderRadius: `calc(${sys.radiusControl} - 2px)`,
                          backgroundColor: active ? p.surface : 'transparent',
                          color: active ? p.text : p.textMuted,
                        }}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeDPlusGroup === 'presets' && (
                <div className="grid grid-cols-2 gap-1 p-0.5" style={{ backgroundColor: p.surfaceMuted, borderRadius: sys.radiusControl }}>
                  {([
                    { id: 'presets', label: 'Preset Library' },
                    { id: 'marketplace', label: 'Marketplace' },
                  ] as const).map((sub) => {
                    const active = shared.studioDockTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => shared.onChangeStudioDockTab(sub.id)}
                        className="py-1.5 text-[11px] font-medium"
                        style={{
                          borderRadius: `calc(${sys.radiusControl} - 2px)`,
                          backgroundColor: active ? p.surface : 'transparent',
                          color: active ? p.text : p.textMuted,
                        }}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeDPlusGroup === 'media' && (
                <div className="grid grid-cols-2 gap-1 p-0.5" style={{ backgroundColor: p.surfaceMuted, borderRadius: sys.radiusControl }}>
                  {([
                    { id: 'media', label: 'Local Media' },
                    { id: 'simulator', label: 'Event Simulator' },
                  ] as const).map((sub) => {
                    const active = shared.studioDockTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => shared.onChangeStudioDockTab(sub.id)}
                        className="py-1.5 text-[11px] font-medium"
                        style={{
                          borderRadius: `calc(${sys.radiusControl} - 2px)`,
                          backgroundColor: active ? p.surface : 'transparent',
                          color: active ? p.text : p.textMuted,
                        }}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Baseline Dock Sub-Navigation Tabs for D / A / B / C */
            <div className="flex items-center gap-1 overflow-x-auto pb-2" style={{ borderBottom: `1px solid ${p.border}` }}>
              {STUDIO_DOCK_TABS.filter((t) => !(isThreePane && t.id === 'layers')).map((tab) => {
                const active = shared.studioDockTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => shared.onChangeStudioDockTab(tab.id)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors"
                    style={{
                      borderRadius: sys.radiusControl,
                      backgroundColor: active ? p.accent : p.surfaceMuted,
                      color: active ? p.accentInk : p.textSecondary,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className={isMobile ? '' : 'max-h-[450px] overflow-y-auto pr-0.5'}>
            {renderDockContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
