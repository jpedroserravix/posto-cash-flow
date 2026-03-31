import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface HorizontalScrollSyncProps {
  children: ReactNode;
  className?: string;
}

export function HorizontalScrollSync({ children, className }: HorizontalScrollSyncProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topScrollWidthRef = useRef<HTMLDivElement>(null);
  const targetScrollRef = useRef<HTMLElement | null>(null);
  const syncingRef = useRef(false);
  const [showScrollbar, setShowScrollbar] = useState(false);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const target = wrapper.querySelector<HTMLElement>('[data-table-scroll-viewport]');
    targetScrollRef.current = target;

    if (!target) {
      setShowScrollbar(false);
      return;
    }

    const syncWidths = () => {
      const scrollWidth = target.scrollWidth;
      const clientWidth = target.clientWidth;

      setShowScrollbar(scrollWidth > clientWidth + 1);

      if (topScrollWidthRef.current) {
        topScrollWidthRef.current.style.width = `${scrollWidth}px`;
      }

      if (topScrollRef.current) {
        topScrollRef.current.scrollLeft = target.scrollLeft;
      }
    };

    syncWidths();

    const resizeObserver = new ResizeObserver(syncWidths);
    resizeObserver.observe(target);

    const table = target.querySelector('table');
    if (table) {
      resizeObserver.observe(table);
    }

    window.addEventListener('resize', syncWidths);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncWidths);
    };
  }, [children]);

  useEffect(() => {
    const topScroll = topScrollRef.current;
    const target = targetScrollRef.current;

    if (!topScroll || !target || !showScrollbar) return;

    const syncScroll = (source: HTMLElement, destination: HTMLElement) => {
      if (syncingRef.current) return;

      syncingRef.current = true;
      destination.scrollLeft = source.scrollLeft;

      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    };

    const handleTopScroll = () => syncScroll(topScroll, target);
    const handleTargetScroll = () => syncScroll(target, topScroll);

    topScroll.addEventListener('scroll', handleTopScroll, { passive: true });
    target.addEventListener('scroll', handleTargetScroll, { passive: true });

    return () => {
      topScroll.removeEventListener('scroll', handleTopScroll);
      target.removeEventListener('scroll', handleTargetScroll);
    };
  }, [showScrollbar]);

  return (
    <div ref={wrapperRef} className={cn('space-y-2', className)}>
      {showScrollbar && (
        <div className="sticky top-0 z-10 rounded-md border border-border bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div
            ref={topScrollRef}
            className="h-4 overflow-x-auto overflow-y-hidden"
            aria-label="Rolagem horizontal da tabela"
          >
            <div ref={topScrollWidthRef} className="h-px" />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
