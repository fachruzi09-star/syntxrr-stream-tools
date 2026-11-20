export type InAppNoticeTone = 'info' | 'success' | 'warn' | 'error';

export interface InAppNotice {
  id: string;
  tone: InAppNoticeTone;
  title?: string;
  message: string;
  durationMs: number;
}

export interface ShowInAppNoticeInput {
  tone?: InAppNoticeTone;
  title?: string;
  message: string;
  durationMs?: number;
}

type NoticeListener = (notices: InAppNotice[]) => void;

const MAX_ACTIVE_NOTICES = 3;
let activeNotices: InAppNotice[] = [];
const listeners = new Set<NoticeListener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emitNotices(): void {
  const snapshot = [...activeNotices];
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
}

export function dismissInAppNotice(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const next = activeNotices.filter((item) => item.id !== id);
  if (next.length !== activeNotices.length) {
    activeNotices = next;
    emitNotices();
  }
}

export function showInAppNotice(input: ShowInAppNoticeInput): string {
  const message = String(input.message || '').trim();
  if (!message) return '';

  const tone: InAppNoticeTone = input.tone ?? 'info';
  const durationMs =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(1500, Math.min(12000, Math.round(input.durationMs)))
      : 4200;

  const id = `notice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const notice: InAppNotice = {
    id,
    tone,
    title: input.title?.trim() || undefined,
    message,
    durationMs,
  };

  activeNotices = [notice, ...activeNotices].slice(0, MAX_ACTIVE_NOTICES);
  emitNotices();

  if (typeof setTimeout === 'function') {
    const timer = setTimeout(() => {
      dismissInAppNotice(id);
    }, durationMs);
    timers.set(id, timer);
  }

  return id;
}

export function subscribeInAppNotices(listener: NoticeListener): () => void {
  listeners.add(listener);
  listener([...activeNotices]);
  return () => {
    listeners.delete(listener);
  };
}

export function __clearAllInAppNoticesForTests(): void {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  activeNotices = [];
  emitNotices();
}
