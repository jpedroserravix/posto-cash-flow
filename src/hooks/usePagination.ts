import { useState, useMemo, useCallback, useEffect } from 'react';

const DEFAULT_SESSION_KEY = 'pagination_pageSize';

export function usePagination<T>(
  data: T[],
  deps: any[] = [],
  options?: { defaultPageSize?: number; sessionKey?: string }
) {
  const sessionKey = options?.sessionKey ?? DEFAULT_SESSION_KEY;
  const defaultPageSize = options?.defaultPageSize ?? 25;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const stored = sessionStorage.getItem(sessionKey);
    const parsed = stored ? parseInt(stored) : NaN;
    return isNaN(parsed) ? defaultPageSize : parsed;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, deps);

  // Reset to page 1 if current page is out of bounds
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  const handlePageSizeChange = useCallback((size: string) => {
    const n = parseInt(size);
    setPageSize(n);
    sessionStorage.setItem(sessionKey, String(n));
    setPage(1);
  }, [sessionKey]);

  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, data.length);

  return {
    page,
    setPage,
    pageSize,
    handlePageSizeChange,
    paginatedData,
    totalPages,
    totalItems: data.length,
    startIndex,
    endIndex,
  };
}
