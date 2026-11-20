import React from 'react';
import { StudioView } from './StudioView';
import type { StudioPanelId } from './studio/StudioPanelNav';

type StudioViewProps = React.ComponentProps<typeof StudioView>;

/**
 * The Presets navigation route now renders the same Studio workspace with the
 * shared preset library opened. There is no second preset editor: the route
 * reuses StudioView's canvas, active preset and Mode B locks, so switching
 * between Studio and Presets cannot reset canvas state or drop media.
 */
export const PresetManagerView: React.FC<
  StudioViewProps & { initialSidePanel?: StudioPanelId }
> = ({ initialSidePanel = 'presets', ...studioProps }) => (
  <StudioView {...studioProps} initialSidePanel={initialSidePanel} />
);
