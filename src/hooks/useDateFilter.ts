import { useState } from 'react';

export type DatePreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

const SESSION_KEY = 'financeiro_dateFilter';

function pad(n: number) { return n.toString().padStart(2, '0'); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function getPresetRange(preset: DatePreset): DateRange {
  const today = new Date();
  switch (preset) {
    case 'today': {
      const t = fmt(today);
      return { start: t, end: t };
    }
    case 'last7': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: fmt(start), end: fmt(today) };
    }
    case 'thisMonth':
      return {
        start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case 'lastMonth':
      return {
        start: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        end: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    default:
      return { start: fmt(today), end: fmt(today) };
  }
}

export function useDateFilter(defaultPreset: DatePreset = 'thisMonth') {
  const [state, setState] = useState<{ preset: DatePreset; customStart: string; customEnd: string }>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.preset) return parsed;
      }
    } catch {}
    const r = getPresetRange(defaultPreset);
    return { preset: defaultPreset, customStart: r.start, customEnd: r.end };
  });

  // Range is always recomputed for built-in presets (so "Este mês" auto-updates day to day)
  const range: DateRange =
    state.preset === 'custom'
      ? { start: state.customStart, end: state.customEnd }
      : getPresetRange(state.preset);

  const setPreset = (preset: DatePreset, customStart?: string, customEnd?: string) => {
    const next = {
      preset,
      customStart: customStart ?? state.customStart,
      customEnd: customEnd ?? state.customEnd,
    };
    setState(next);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
  };

  return { preset: state.preset, range, setPreset };
}
