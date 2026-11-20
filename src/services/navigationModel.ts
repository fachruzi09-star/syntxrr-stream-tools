import type {
  LegacyCompatibilitySubview,
  LegacyNavigationRoute,
  NavigationRequest,
  NavigationTab,
} from '../types';

export const PRIMARY_NAVIGATION_TABS: readonly NavigationTab[] = [
  'dashboard',
  'studio',
  'live_center',
  'remote_deck',
  'integrations',
  'settings',
] as const;

export const LEGACY_NAVIGATION_ROUTES: readonly LegacyNavigationRoute[] = [
  'sources',
  'presets',
  'scenes',
  'marketplace',
  'music',
  'overlay',
  'alerts',
] as const;

export interface ResolvedNavigationTarget {
  primaryTab: NavigationTab;
  legacySubview: LegacyCompatibilitySubview | null;
  normalizedFromLegacy: boolean;
}

const LEGACY_ROUTE_MAP: Record<
  LegacyNavigationRoute,
  { primaryTab: NavigationTab; legacySubview: LegacyCompatibilitySubview | null }
> = {
  sources: { primaryTab: 'studio', legacySubview: 'sources' },
  presets: { primaryTab: 'studio', legacySubview: 'presets' },
  scenes: { primaryTab: 'studio', legacySubview: 'presets' },
  marketplace: { primaryTab: 'studio', legacySubview: 'marketplace' },
  music: { primaryTab: 'live_center', legacySubview: 'music' },
  overlay: { primaryTab: 'studio', legacySubview: null },
  alerts: { primaryTab: 'live_center', legacySubview: null },
};

export function isPrimaryNavigationTab(value: unknown): value is NavigationTab {
  return (
    typeof value === 'string' &&
    (PRIMARY_NAVIGATION_TABS as readonly string[]).includes(value)
  );
}

export function isLegacyNavigationRoute(value: unknown): value is LegacyNavigationRoute {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(LEGACY_ROUTE_MAP, value)
  );
}

/**
 * Normalizes any primary or legacy navigation request into one of the six
 * primary menus, clearing legacy subviews whenever navigating directly to a
 * primary route or unknown fallback.
 */
export function resolveNavigationTarget(
  route: NavigationRequest | string | undefined | null,
): ResolvedNavigationTarget {
  if (isPrimaryNavigationTab(route)) {
    return {
      primaryTab: route,
      legacySubview: null,
      normalizedFromLegacy: false,
    };
  }

  if (isLegacyNavigationRoute(route)) {
    const mapped = LEGACY_ROUTE_MAP[route];
    return {
      primaryTab: mapped.primaryTab,
      legacySubview: mapped.legacySubview,
      normalizedFromLegacy: true,
    };
  }

  return {
    primaryTab: 'dashboard',
    legacySubview: null,
    normalizedFromLegacy: false,
  };
}

export type BackNavigationStep =
  | { action: 'clear_legacy_subview'; nextNav: NavigationTab; nextLegacySubview: null }
  | { action: 'navigate_dashboard'; nextNav: 'dashboard'; nextLegacySubview: null }
  | { action: 'exit_app' };

/**
 * Resolves Android hardware back behavior after modals/alerts are handled:
 * 1. If inside a legacy compatibility subview, return to its owner primary menu.
 * 2. If on any primary menu other than dashboard, return to dashboard.
 * 3. If already on dashboard, exit the application.
 */
export function resolveBackNavigationStep(state: {
  activeNav: NavigationTab;
  legacySubview: LegacyCompatibilitySubview | null;
}): BackNavigationStep {
  if (state.legacySubview !== null) {
    return {
      action: 'clear_legacy_subview',
      nextNav: state.activeNav,
      nextLegacySubview: null,
    };
  }

  if (state.activeNav !== 'dashboard') {
    return {
      action: 'navigate_dashboard',
      nextNav: 'dashboard',
      nextLegacySubview: null,
    };
  }

  return { action: 'exit_app' };
}
