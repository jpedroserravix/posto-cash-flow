import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Opens a URL in a new tab using <a>.click() instead of window.open().
 * window.open() is blocked as a popup by Safari when called from async
 * functions or Promise callbacks. <a>.click() within the same synchronous
 * user-gesture call stack is always allowed.
 */
/**
 * Formats an ISO datetime string literally, without timezone conversion.
 * Timestamps from pix_transacoes/pix_repasses are stored as Brasília local time
 * with a +00:00 suffix — reading them with new Date() shifts them 3h back.
 * This helper slices the string directly: "2026-07-10T06:53:12..." → "10/07/2026, 06:53".
 */
export function formatarDataHoraLiteral(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = iso.replace(' ', 'T');
  const datePart = s.slice(0, 10);
  const timePart = s.slice(11, 16);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}, ${timePart}`;
}

export function openInNewTab(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
