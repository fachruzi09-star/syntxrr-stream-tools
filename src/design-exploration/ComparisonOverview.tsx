import React from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, Layers, Monitor, Smartphone } from 'lucide-react';
import { OPTION_SYSTEMS } from './tokens';
import type { ExplorationModule, OptionId, ThemeMode, ViewportPreset } from './types';

interface ComparisonOverviewProps {
  theme: ThemeMode;
  onSelectOption: (option: OptionId, viewport?: ViewportPreset, module?: ExplorationModule, theme?: ThemeMode) => void;
}

const REFERENCE_OPTIONS: OptionId[] = ['A', 'B', 'C'];

const BEFORE_AFTER_ROWS: Array<{
  area: string;
  beforeD: string;
  afterDPlus: string;
  dnaSource: string;
  jumpModule: ExplorationModule;
}> = [
  {
    area: 'Brand Identity & Adaptive Contrast',
    beforeD: 'Used #F5C518 in dark mode and #B48200 in light mode; muted DM Sans body typography.',
    afterDPlus:
      'Enforces true SYNTXRR #F2C230 brand yellow across dark & light CTAs/meters, paired with WCAG AA #8A6700 text ink on light surfaces and Plus Jakarta Sans + Bricolage Grotesque.',
    dnaSource: 'SYNTXRR Identity + Option A',
    jumpModule: 'dashboard',
  },
  {
    area: 'Dashboard & Operational Calm',
    beforeD: 'Compact header spacing with heavy amber-tinted alert box at the bottom of the screen.',
    afterDPlus:
      'Expanded vertical rhythm and breathing room, clean hairline KPI cells, subtle C-inspired surface elevation, and a restrained advisory bar that stays quiet during live operation.',
    dnaSource: 'Option A + Option D',
    jumpModule: 'dashboard',
  },
  {
    area: 'Studio Workspace & Tool Grouping',
    beforeD: '9 flat horizontally scrolling inspector tabs that felt crowded on 360px Android screens.',
    afterDPlus:
      'Reorganized into 5 clean toolsets (Design, Add, Presets, Media, Requests) with contextual sub-switches, portable JSON/ZIP bundle hooks, and a spacious centered canvas stage.',
    dnaSource: 'Option B + Option C',
    jumpModule: 'studio',
  },
  {
    area: 'Audio Mixer & Song Requests',
    beforeD: 'Plain range inputs and read-only status badges in the Song Request queue.',
    afterDPlus:
      'Calibrated -24 / -12 / -6 / 0 dB scale ticks on Master, SFX & Mic sliders plus 1-tap Approve actions for pending viewer song requests.',
    dnaSource: 'Option B + Option D',
    jumpModule: 'audio',
  },
  {
    area: 'Android 360×800 / 390×844 / 412×915 Ergonomics',
    beforeD: 'Text-only mobile header and standard active tab tint without a top indicator rule.',
    afterDPlus:
      'Compact SX brand emblem header, single-line view context, crisp #F2C230 active top bar indicator on the 56px thumb dock, and zero horizontal scrolling in Studio toolsets.',
    dnaSource: 'Option C + Option D',
    jumpModule: 'hud',
  },
];

export const DvsDPlusComparison: React.FC<ComparisonOverviewProps> = ({ theme, onSelectOption }) => {
  const isDark = theme === 'dark';
  const sysD = OPTION_SYSTEMS.D;
  const sysPlus = OPTION_SYSTEMS.D_PLUS;
  const palD = sysD.palettes[theme];
  const palPlus = sysPlus.palettes[theme];

  return (
    <div className="space-y-7 py-4" style={{ color: palPlus.text }}>
      {/* Executive Selection Header */}
      <section
        className="p-6 sm:p-8"
        style={{
          backgroundColor: palPlus.surface,
          border: `1px solid ${palPlus.border}`,
          borderRadius: sysPlus.radiusPanel,
          boxShadow: palPlus.shadow,
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: palPlus.accentText }}>
              <CheckCircle2 className="w-4 h-4" />
              <span>OFFICIALLY SELECTED DIRECTION · REFINEMENT REVIEW</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ fontFamily: sysPlus.displayFont }}>
              Option D (Before) → D+ Signature Hybrid Flagship Luxury (After)
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed" style={{ color: palPlus.textSecondary }}>
              D+ refines the owner-selected Option D workflow foundation using Option A negative space,
              Option B precision studio controls, Option C tonal depth, and the true SYNTXRR #F2C230 palette across Dark &amp; Light themes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onSelectOption('D')}
              className="px-4 py-2.5 text-xs font-semibold"
              style={{
                borderRadius: sysPlus.radiusControl,
                backgroundColor: palPlus.surfaceMuted,
                border: `1px solid ${palPlus.borderStrong}`,
                color: palPlus.text,
              }}
            >
              Inspect Baseline D
            </button>
            <button
              type="button"
              onClick={() => onSelectOption('D_PLUS')}
              className="px-4 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5"
              style={{
                borderRadius: sysPlus.radiusControl,
                backgroundColor: palPlus.accent,
                color: palPlus.accentInk,
              }}
            >
              <span>Inspect Refined D+</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Side-by-Side Swatch & DNA Cards (D vs D+) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {([
          { label: 'Before · Selected Baseline', sys: sysD, pal: palD, opt: 'D' as const },
          { label: 'After · Flagship Luxury Refinement', sys: sysPlus, pal: palPlus, opt: 'D_PLUS' as const },
        ]).map((item) => (
          <div
            key={item.opt}
            className="p-5 sm:p-6 space-y-4"
            style={{
              backgroundColor: item.pal.surface,
              border: `1px solid ${item.opt === 'D_PLUS' ? item.pal.accent : item.pal.border}`,
              borderRadius: item.sys.radiusPanel,
              boxShadow: item.opt === 'D_PLUS' ? item.pal.shadow : 'none',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: item.opt === 'D_PLUS' ? item.pal.accentText : item.pal.textMuted }}>
                  {item.label}
                </div>
                <h2 className="text-xl font-semibold mt-0.5" style={{ fontFamily: item.sys.displayFont, color: item.pal.text }}>
                  {item.sys.title}
                </h2>
                <div className="text-xs mt-0.5" style={{ color: item.pal.textMuted }}>
                  {item.sys.displayFont.split(',')[0].replace(/'/g, '')} + {item.sys.bodyFont.split(',')[0].replace(/'/g, '')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectOption(item.opt)}
                className="px-3 py-1.5 text-xs font-semibold shrink-0"
                style={{
                  borderRadius: item.sys.radiusControl,
                  backgroundColor: item.opt === 'D_PLUS' ? item.pal.accent : item.pal.surfaceMuted,
                  color: item.opt === 'D_PLUS' ? item.pal.accentInk : item.pal.text,
                  border: `1px solid ${item.opt === 'D_PLUS' ? 'transparent' : item.pal.border}`,
                }}
              >
                Open {item.opt === 'D_PLUS' ? 'D+' : 'D'}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {[item.pal.canvas, item.pal.surface, item.pal.surfaceElevated, item.pal.accent, item.pal.ok, item.pal.error].map((hex, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span
                    className="w-7 h-7"
                    style={{
                      backgroundColor: hex,
                      border: `1px solid ${item.pal.borderStrong}`,
                      borderRadius: '6px',
                    }}
                  />
                  <span className="text-[9.5px] font-mono" style={{ color: item.pal.textMuted }}>
                    {hex}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-xs leading-relaxed pt-2" style={{ borderTop: `1px solid ${item.pal.border}`, color: item.pal.textSecondary }}>
              {item.sys.studioParadigm}
            </div>
          </div>
        ))}
      </section>

      {/* Screen-by-Screen Before vs After Matrix */}
      <section
        className="overflow-x-auto"
        style={{
          backgroundColor: palPlus.surface,
          border: `1px solid ${palPlus.border}`,
          borderRadius: sysPlus.radiusPanel,
        }}
      >
        <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[740px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${palPlus.border}`, backgroundColor: isDark ? '#151923' : '#EEF1F6' }}>
              <th className="p-4 font-semibold w-[22%]" style={{ color: palPlus.text }}>Refinement Area</th>
              <th className="p-4 font-semibold w-[30%]" style={{ color: palPlus.textMuted }}>Option D (Before)</th>
              <th className="p-4 font-semibold w-[34%]" style={{ color: palPlus.accentText }}>Option D+ (After Refinement)</th>
              <th className="p-4 font-semibold w-[14%]" style={{ color: palPlus.textMuted }}>Verify</th>
            </tr>
          </thead>
          <tbody>
            {BEFORE_AFTER_ROWS.map((row) => (
              <tr key={row.area} style={{ borderBottom: `1px solid ${palPlus.border}` }}>
                <td className="p-4 align-top">
                  <div className="font-semibold" style={{ color: palPlus.text }}>{row.area}</div>
                  <div className="text-[11px] mt-1" style={{ color: palPlus.textMuted }}>{row.dnaSource}</div>
                </td>
                <td className="p-4 align-top leading-relaxed" style={{ color: palPlus.textMuted }}>
                  {row.beforeD}
                </td>
                <td className="p-4 align-top leading-relaxed" style={{ color: palPlus.textSecondary }}>
                  {row.afterDPlus}
                </td>
                <td className="p-4 align-top">
                  <button
                    type="button"
                    onClick={() => onSelectOption('D_PLUS', undefined, row.jumpModule)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    style={{
                      borderRadius: sysPlus.radiusControl,
                      backgroundColor: palPlus.surfaceMuted,
                      border: `1px solid ${palPlus.border}`,
                      color: palPlus.text,
                    }}
                  >
                    <span>View</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export const ComparisonOverview: React.FC<ComparisonOverviewProps> = ({ theme, onSelectOption }) => {
  const isDark = theme === 'dark';
  const pageBg = isDark ? '#090B10' : '#F4F6FA';
  const cardBg = isDark ? '#11151E' : '#FFFFFF';
  const mutedBg = isDark ? '#161B26' : '#ECEFF5';
  const border = isDark ? '#232B3B' : '#D9E0EC';
  const text = isDark ? '#F3F6FB' : '#0F172A';
  const textSec = isDark ? '#C7D0E0' : '#334155';
  const textMuted = isDark ? '#8994AA' : '#64748B';
  const accentText = isDark ? '#F2C230' : '#8A6700';

  const dPlus = OPTION_SYSTEMS.D_PLUS;

  return (
    <div className="space-y-8 py-4" style={{ color: text }}>
      {/* Selected D+ Flagship Spotlight Banner */}
      <section
        className="p-6 sm:p-8"
        style={{
          backgroundColor: cardBg,
          border: `1.5px solid #F2C230`,
          borderRadius: '14px',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: accentText }}>
              <CheckCircle2 className="w-4 h-4" />
              <span>OFFICIALLY SELECTED DIRECTION · D+ SIGNATURE HYBRID FLAGSHIP LUXURY EDITION</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight" style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>
              Selected Foundation Refined, Reference Alternatives Preserved
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: textSec }}>
              Option D has been officially selected and elevated into <strong>D+ Signature Hybrid Flagship Luxury Edition</strong> using
              SYNTXRR Brand Yellow (<code>#F2C230</code>) alongside refined traits from A, B, and C. Options A, B, C, and baseline D remain
              fully interactive below as reference benchmarks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onSelectOption('D_PLUS', '1280x800', 'dashboard')}
              className="px-4 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5"
              style={{ borderRadius: '9px', backgroundColor: '#F2C230', color: '#111318' }}
            >
              <span>Open D+ Flagship</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSelectOption('D_PLUS', '360x800', 'studio')}
              className="px-3.5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5"
              style={{ borderRadius: '9px', backgroundColor: mutedBg, border: `1px solid ${border}`, color: text }}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>D+ 360px Studio</span>
            </button>
          </div>
        </div>
      </section>

      {/* Reference Comparison Grid (D+ Selected + A/B/C References) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[dPlus.id, ...REFERENCE_OPTIONS].map((id) => {
          const sys = OPTION_SYSTEMS[id];
          const isSelected = id === 'D_PLUS';

          return (
            <article
              key={id}
              className="p-5 sm:p-6 flex flex-col justify-between gap-5"
              style={{
                backgroundColor: cardBg,
                border: `1px solid ${isSelected ? '#F2C230' : border}`,
                borderRadius: '14px',
              }}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold" style={{ color: isSelected ? accentText : textMuted }}>
                      {isSelected ? 'SELECTED · REFINED FLAGSHIP' : `REFERENCE · ${sys.codeName.toUpperCase()}`}
                    </div>
                    <h2
                      className="text-2xl font-semibold tracking-tight mt-0.5"
                      style={{ fontFamily: sys.displayFont, color: text }}
                    >
                      {sys.title}
                    </h2>
                    <div className="text-xs mt-1" style={{ color: textMuted }}>
                      {sys.subtitle}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectOption(id)}
                    className="px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-opacity hover:opacity-90"
                    style={{
                      borderRadius: '8px',
                      backgroundColor: sys.palettes[theme].accent,
                      color: sys.palettes[theme].accentInk,
                    }}
                  >
                    <span>Explore {id === 'D_PLUS' ? 'D+' : id}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: textSec, fontFamily: sys.bodyFont }}>
                  {sys.tagline}
                </p>

                {/* Dual Dark + Light Live Mini Specimens */}
                <div className="grid grid-cols-2 gap-3">
                  {(['dark', 'light'] as const).map((mode) => {
                    const pal = sys.palettes[mode];
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onSelectOption(id, undefined, undefined, mode)}
                        className="p-3 text-left transition-transform hover:-translate-y-0.5"
                        style={{
                          backgroundColor: pal.canvas,
                          border: `1px solid ${pal.border}`,
                          borderRadius: sys.radiusPanel,
                        }}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-2" style={{ color: pal.textMuted }}>
                          <span className="uppercase font-semibold">{mode}</span>
                          <span style={{ color: pal.accentText }}>Preview</span>
                        </div>
                        <div
                          className="p-2.5 space-y-2"
                          style={{
                            backgroundColor: pal.surface,
                            border: `1px solid ${pal.border}`,
                            borderRadius: sys.radiusControl,
                          }}
                        >
                          <div className="text-sm font-semibold truncate" style={{ fontFamily: sys.displayFont, color: pal.text }}>
                            SYNTXRR Live
                          </div>
                          <div className="flex items-center gap-1.5">
                            {[pal.canvas, pal.surfaceElevated, pal.accent, pal.ok, pal.error].map((hex, i) => (
                              <span
                                key={i}
                                className="w-4 h-4 shrink-0"
                                style={{
                                  backgroundColor: hex,
                                  border: `1px solid ${pal.borderStrong}`,
                                  borderRadius: '4px',
                                }}
                                title={hex}
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div
                  className="p-3.5 space-y-2 text-xs"
                  style={{
                    backgroundColor: mutedBg,
                    border: `1px solid ${border}`,
                    borderRadius: '10px',
                  }}
                >
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <span style={{ color: textMuted }}>Typography</span>
                    <span className="font-medium truncate" style={{ color: text }}>
                      {sys.displayFont.split(',')[0].replace(/'/g, '')} + {sys.bodyFont.split(',')[0].replace(/'/g, '')}
                    </span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <span style={{ color: textMuted }}>Desktop Nav</span>
                    <span style={{ color: textSec }}>{sys.navModelDesktop}</span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <span style={{ color: textMuted }}>Android Nav</span>
                    <span style={{ color: textSec }}>{sys.navModelMobile}</span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <span style={{ color: textMuted }}>Studio Model</span>
                    <span style={{ color: textSec }}>{sys.studioParadigm}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${border}` }}>
                <button
                  type="button"
                  onClick={() => onSelectOption(id, '1280x800', 'studio')}
                  className="px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center gap-1.5"
                  style={{ borderRadius: '7px', border: `1px solid ${border}`, color: textSec, backgroundColor: pageBg }}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Studio Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectOption(id, '360x800', 'dashboard')}
                  className="px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center gap-1.5"
                  style={{ borderRadius: '7px', border: `1px solid ${border}`, color: textSec, backgroundColor: pageBg }}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>360px Android</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectOption(id, '1280x800', 'hud')}
                  className="px-2.5 py-1.5 text-[11px] font-medium inline-flex items-center gap-1.5"
                  style={{ borderRadius: '7px', border: `1px solid ${border}`, color: textSec, backgroundColor: pageBg }}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Floating HUD</span>
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
};
