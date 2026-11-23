export const STUDIO_TAP_MOVE_THRESHOLD_PX = 8;

export type CanvasElementGestureKind = 'pending_tap' | 'dragging' | 'resizing' | 'cancelled_locked_move';

export interface PendingCanvasElementGesture {
  kind: CanvasElementGestureKind;
  elementId: string;
  pointerId: number;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  canDrag: boolean;
  resizeHandle: string | null;
}

export function computePointerMoveDistance(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): number {
  if (
    !Number.isFinite(startX) ||
    !Number.isFinite(startY) ||
    !Number.isFinite(currentX) ||
    !Number.isFinite(currentY)
  ) {
    return 0;
  }
  return Math.hypot(currentX - startX, currentY - startY);
}

export function hasExceededTapThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  thresholdPx: number = STUDIO_TAP_MOVE_THRESHOLD_PX,
): boolean {
  return computePointerMoveDistance(startX, startY, currentX, currentY) > thresholdPx + 1e-6;
}

const INTERACTIVE_CHILD_TAGS = new Set([
  'button',
  'input',
  'select',
  'textarea',
  'a',
  'option',
  'label',
]);

interface TraversableDomNode {
  tagName?: unknown;
  isContentEditable?: unknown;
  parentElement?: TraversableDomNode | null;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
}

export function isInteractiveCanvasChildTarget(target: unknown, container: unknown): boolean {
  let cursor = target as TraversableDomNode | null | undefined;
  let hops = 0;
  while (cursor && cursor !== container && hops < 32) {
    hops += 1;
    const tag = typeof cursor.tagName === 'string' ? cursor.tagName.toLowerCase() : '';
    if (tag && INTERACTIVE_CHILD_TAGS.has(tag)) {
      return true;
    }
    if (cursor.isContentEditable === true) {
      return true;
    }
    const role = typeof cursor.getAttribute === 'function' ? cursor.getAttribute('role') : null;
    if (role && role.toLowerCase() === 'button') {
      return true;
    }
    if (
      (typeof cursor.hasAttribute === 'function' && cursor.hasAttribute('data-interactive-control')) ||
      (typeof cursor.getAttribute === 'function' && cursor.getAttribute('data-interactive-control') === 'true')
    ) {
      return true;
    }
    cursor = cursor.parentElement;
  }
  return false;
}

export function classifyCanvasElementPointerMove(params: {
  gesture: PendingCanvasElementGesture;
  clientX: number;
  clientY: number;
  thresholdPx?: number;
}): {
  outcome: 'ignore' | 'still_pending' | 'confirm_drag' | 'move_drag' | 'move_resize';
  shouldClosePropertiesInspector: boolean;
} {
  const { gesture, clientX, clientY, thresholdPx = STUDIO_TAP_MOVE_THRESHOLD_PX } = params;

  if (gesture.kind === 'resizing') {
    return { outcome: 'move_resize', shouldClosePropertiesInspector: false };
  }
  if (gesture.kind === 'dragging') {
    return { outcome: 'move_drag', shouldClosePropertiesInspector: false };
  }
  if (gesture.kind === 'cancelled_locked_move') {
    return { outcome: 'ignore', shouldClosePropertiesInspector: false };
  }

  if (!hasExceededTapThreshold(gesture.startX, gesture.startY, clientX, clientY, thresholdPx)) {
    return { outcome: 'still_pending', shouldClosePropertiesInspector: false };
  }

  if (!gesture.canDrag) {
    return { outcome: 'ignore', shouldClosePropertiesInspector: false };
  }

  return { outcome: 'confirm_drag', shouldClosePropertiesInspector: true };
}

export function resolveCanvasElementPointerUp(params: {
  gesture: PendingCanvasElementGesture;
  clientX: number;
  clientY: number;
  thresholdPx?: number;
}): {
  outcome: 'open_inspector' | 'commit_drag_or_resize' | 'noop';
  targetElementId: string | null;
} {
  const { gesture, clientX, clientY, thresholdPx = STUDIO_TAP_MOVE_THRESHOLD_PX } = params;

  if (gesture.kind === 'dragging' || gesture.kind === 'resizing') {
    return { outcome: 'commit_drag_or_resize', targetElementId: gesture.elementId };
  }

  if (gesture.kind === 'cancelled_locked_move') {
    return { outcome: 'noop', targetElementId: null };
  }

  if (!hasExceededTapThreshold(gesture.startX, gesture.startY, clientX, clientY, thresholdPx)) {
    return { outcome: 'open_inspector', targetElementId: gesture.elementId };
  }

  return { outcome: 'noop', targetElementId: null };
}

export function isStudioElementReadOnly(params: {
  elementLocked?: boolean;
  isElementGroupLocked?: boolean;
  isStrictModeBLocked?: boolean;
}): boolean {
  return Boolean(params.isStrictModeBLocked || params.isElementGroupLocked || params.elementLocked);
}

export function canMutateStudioElementField(params: {
  elementLocked?: boolean;
  isElementGroupLocked?: boolean;
  isStrictModeBLocked?: boolean;
  field: string;
}): boolean {
  if (params.isStrictModeBLocked || params.isElementGroupLocked) {
    return false;
  }
  if (params.field === 'locked') {
    return true;
  }
  return !params.elementLocked;
}

export function shouldClosePropertiesOnCanvasBackgroundClick(params: {
  isCanvasLivePreview: boolean;
  isMobilePanelOpen: boolean;
  activeSidePanel: string;
}): boolean {
  return Boolean(
    !params.isCanvasLivePreview &&
      params.isMobilePanelOpen &&
      params.activeSidePanel === 'properties',
  );
}
