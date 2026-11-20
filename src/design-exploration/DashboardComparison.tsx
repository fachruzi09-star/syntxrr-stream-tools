import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { DASHBOARD_ALTERNATIVES, type DashboardAlternativeId } from './dashboardTypes';
import { OPTION_SYSTEMS } from './tokens';
import type { ThemeMode, ViewportPreset } from './types';

interface DashboardComparisonProps {
  theme: ThemeMode;
  onInspectAlternative: (id: DashboardAlternativeId, viewport?: ViewportPreset, theme?: ThemeMode) => void;
}

export const DashboardComparisonView: React.FC<DashboardComparisonProps> = ({
  theme,
  onInspectAlternative,
}) => {
  const sys = OPTION_SYSTEMS.D_PLUS;
  const p = sys.palettes[theme];

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <section
        className="p-6 space-y-2"
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
          boxShadow: p.shadow,
        }}
      >
        <div className="text-xs font-medium" style={{ color: p.accentText }}>
          D+ Signature Hybrid Flagship Luxury · Dashboard Design Exploration
        </div>
        <h1
          className="text-2xl sm:text-3xl font-semibold tracking-tight"
          style={{ fontFamily: sys.displayFont, color: p.text }}
        >
          Four Dashboard Layout Alternatives — Neutral Comparison
        </h1>
        <p className="text-xs sm:text-sm max-w-3xl leading-relaxed" style={{ color: p.textSecondary }}>
          All four options share the exact D+ visual identity (#F2C230 SYNTXRR yellow, Adaptive Dark/Light obsidian & porcelain surfaces, Bricolage Grotesque + Plus Jakarta Sans + JetBrains Mono, zero-pill restraint) and honor real Mode A / Mode B product mechanics with zero fabricated hardware telemetry.
        </p>
      </section>

      {/* Neutral Side-by-Side Comparison Matrix */}
      <section
        className="overflow-hidden"
        style={{
          backgroundColor: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: sys.radiusPanel,
        }}
      >
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${p.border}` }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: sys.displayFont, color: p.text }}>
            Architectural Matrix (A / B / C / D)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr style={{ backgroundColor: p.surfaceMuted, borderBottom: `1px solid ${p.border}` }}>
                <th className="py-3 px-4 font-semibold" style={{ color: p.textMuted }}>
                  Dimension
                </th>
                {DASHBOARD_ALTERNATIVES.map((alt) => (
                  <th key={alt.id} className="py-3 px-4 font-semibold" style={{ color: p.text }}>
                    {alt.id} · {alt.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: p.border }}>
              {[
                { label: 'Information Density', getValue: (a: (typeof DASHBOARD_ALTERNATIVES)[0]) => a.density },
                { label: 'Hierarchy Thesis', getValue: (a: (typeof DASHBOARD_ALTERNATIVES)[0]) => a.hierarchyThesis },
                { label: 'Desktop (1280×800)', getValue: (a: (typeof DASHBOARD_ALTERNATIVES)[0]) => a.desktopLayout },
                { label: 'Android (360×800)', getValue: (a: (typeof DASHBOARD_ALTERNATIVES)[0]) => a.mobileStrategy },
                { label: 'Warning / Recovery', getValue: (a: (typeof DASHBOARD_ALTERNATIVES)[0]) => a.recoveryPlacement },
              ].map((row) => (
                <tr key={row.label} style={{ borderColor: p.border }}>
                  <td className="py-3 px-4 font-medium align-top whitespace-nowrap" style={{ color: p.textMuted }}>
                    {row.label}
                  </td>
                  {DASHBOARD_ALTERNATIVES.map((alt) => (
                    <td key={alt.id} className="py-3 px-4 align-top leading-relaxed" style={{ color: p.textSecondary }}>
                      {row.getValue(alt)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Four Detailed Neutral Trade-Off Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DASHBOARD_ALTERNATIVES.map((alt) => (
          <article
            key={alt.id}
            className="p-5 sm:p-6 flex flex-col justify-between gap-5"
            style={{
              backgroundColor: p.surface,
              border: `1px solid ${p.border}`,
              borderRadius: sys.radiusPanel,
              boxShadow: p.shadow,
            }}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase" style={{ color: p.accentText }}>
                    {alt.code} · {alt.density}
                  </div>
                  <h3 className="text-lg font-semibold mt-0.5" style={{ fontFamily: sys.displayFont, color: p.text }}>
                    {alt.name}
                  </h3>
                  <div className="text-xs" style={{ color: p.textMuted }}>
                    {alt.subtitle}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="font-semibold" style={{ color: p.ok }}>
                    Strengths
                  </div>
                  <ul className="space-y-1.5 leading-relaxed" style={{ color: p.textSecondary }}>
                    {alt.strengths.map((st) => (
                      <li key={st}>· {st}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold" style={{ color: p.warn }}>
                    Trade-offs
                  </div>
                  <ul className="space-y-1.5 leading-relaxed" style={{ color: p.textSecondary }}>
                    {alt.tradeoffs.map((tr) => (
                      <li key={tr}>· {tr}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${p.border}` }}>
              <button
                type="button"
                onClick={() => onInspectAlternative(alt.id, '1280x800')}
                className="px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ borderRadius: sys.radiusControl, backgroundColor: p.accent, color: p.accentInk }}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Inspect {alt.id} · Desktop 1280</span>
              </button>
              <button
                type="button"
                onClick={() => onInspectAlternative(alt.id, '360x800')}
                className="px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                style={{
                  borderRadius: sys.radiusControl,
                  border: `1px solid ${p.borderStrong}`,
                  backgroundColor: p.surfaceMuted,
                  color: p.text,
                }}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android 360×800</span>
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
