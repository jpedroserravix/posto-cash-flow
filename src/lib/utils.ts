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
export function openInNewTab(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
