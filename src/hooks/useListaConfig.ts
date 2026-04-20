import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Simple in-memory cache (module-level) so the same list isn't re-fetched
// every time a component mounts within the same session.
const cache: Record<string, { items: string[]; loadedAt: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Invalidate cache for a specific lista (call after saving in Configuracoes). */
export function invalidateListaConfig(lista: string) {
  delete cache[lista];
}

/**
 * Returns the items for a configurable list.
 * Falls back to `fallback` if the DB table is empty or errors.
 */
export function useListaConfig(lista: string, fallback: string[]): string[] {
  const [items, setItems] = useState<string[]>(() => {
    const cached = cache[lista];
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) return cached.items;
    return fallback;
  });

  useEffect(() => {
    let active = true;
    const cached = cache[lista];
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
      setItems(cached.items);
      return;
    }

    (supabase as any)
      .from('listas_configuracoes')
      .select('valor')
      .eq('lista', lista)
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .then(({ data, error }: any) => {
        if (!active) return;
        if (error || !data || data.length === 0) return; // keep fallback
        const vals = data.map((r: any) => r.valor as string);
        cache[lista] = { items: vals, loadedAt: Date.now() };
        setItems(vals);
      });

    return () => { active = false; };
  }, [lista]);

  return items;
}
