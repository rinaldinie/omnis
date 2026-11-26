import { useEffect, useState, useMemo } from "react";

export interface VirtualWindowOptions {
  itemCount: number;
  rowHeight: number;
  columns?: number;
  overscanRows?: number;
  threshold?: number;
  enabled?: boolean;
  getScrollElement: () => HTMLElement | null;
}

export interface VirtualWindowResult {
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  isVirtualized: boolean;
}

/**
 * Lightweight scroll windowing hook for large lists and grids.
 * Falls back to rendering the full slice when below `threshold`, disabled,
 * or when the scroll viewport has zero height (e.g. headless DOM tests).
 */
export function useVirtualWindow({
  itemCount,
  rowHeight,
  columns = 1,
  overscanRows = 6,
  threshold = 80,
  enabled = true,
  getScrollElement,
}: VirtualWindowOptions): VirtualWindowResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const shouldObserve = enabled && itemCount > threshold && rowHeight > 0 && columns > 0;

  useEffect(() => {
    if (!shouldObserve) {
      setViewportHeight(0);
      return;
    }

    const el = getScrollElement();
    if (!el) return;

    const updateMetrics = () => {
      setViewportHeight(el.clientHeight);
      setScrollTop(el.scrollTop);
    };

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        setScrollTop(el.scrollTop);
      });
    };

    updateMetrics();
    el.addEventListener("scroll", onScroll, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateMetrics);
      observer.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [shouldObserve, getScrollElement]);

  return useMemo(() => {
    if (!shouldObserve || viewportHeight <= 0 || itemCount === 0) {
      return {
        startIndex: 0,
        endIndex: itemCount,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
        isVirtualized: false,
      };
    }

    const safeCols = Math.max(1, columns);
    const totalRows = Math.ceil(itemCount / safeCols);
    const firstVisibleRow = Math.floor(scrollTop / rowHeight);
    const visibleRowCount = Math.ceil(viewportHeight / rowHeight);

    const startRow = Math.max(0, firstVisibleRow - overscanRows);
    const endRow = Math.min(totalRows, firstVisibleRow + visibleRowCount + overscanRows);

    const startIndex = startRow * safeCols;
    const endIndex = Math.min(itemCount, endRow * safeCols);
    const topSpacerPx = startRow * rowHeight;
    const bottomSpacerPx = Math.max(0, (totalRows - endRow) * rowHeight);

    return {
      startIndex,
      endIndex,
      topSpacerPx,
      bottomSpacerPx,
      isVirtualized: true,
    };
  }, [shouldObserve, viewportHeight, scrollTop, itemCount, rowHeight, columns, overscanRows]);
}
