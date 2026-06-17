import { HISTORY_LIMIT } from './constants';

export type HistoryStack<T> = {
  past: T[];
  future: T[];
};

export function createHistory<T>(): HistoryStack<T> {
  return { past: [], future: [] };
}

export function pushHistory<T>(history: HistoryStack<T>, snapshot: T) {
  history.past = [...history.past.slice(-(HISTORY_LIMIT - 1)), snapshot];
  history.future = [];
}

export function undoHistory<T>(history: HistoryStack<T>, current: T) {
  const previous = history.past[history.past.length - 1];
  if (!previous) {
    return null;
  }
  history.past = history.past.slice(0, -1);
  history.future = [current, ...history.future.slice(0, HISTORY_LIMIT - 1)];
  return previous;
}

export function redoHistory<T>(history: HistoryStack<T>, current: T) {
  const next = history.future[0];
  if (!next) {
    return null;
  }
  history.future = history.future.slice(1);
  history.past = [...history.past.slice(-(HISTORY_LIMIT - 1)), current];
  return next;
}

export function clearHistory<T>(history: HistoryStack<T>) {
  history.past = [];
  history.future = [];
}
