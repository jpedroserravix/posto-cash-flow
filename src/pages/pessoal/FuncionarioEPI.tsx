import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { openInNewTab } from '@/lib/utils';

// ─── types ──────────────────────────────────────────────────────────────────

interface Props {
  funcionarioId: string;
  postoId: string;
}

interface EPIItem {
  tipo_item: string;
  quantidade: number;
}

interface EntregaEPI {
  id: string;
  data_entrega: string;
  comprovante_path: string | null;
  comprovante_type: string | null;
  observacoes: string | null;
  created_at: string;
  pessoal_entregas_epi_itens: EPIItem[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(str: string) {
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function FuncionarioEPI({ funcionarioId }: Props) {
  const [entregas, setEntregas] = useState<EntregaEPI[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('pessoal_entregas_epi')
      .select('*, pessoal_entregas_epi_itens(tipo_item, quantidade)')
      .eq('funcionario_id', funcionarioId)
      .order('data_entrega', { ascending: false });
    if (error) { toast.error('Erro ao carregar entregas de EPI'); }
    else { setEntregas(data ?? []); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [funcionarioId]);

  // Summary: total of each item type across all deliveries
  const summary = entregas.reduce((acc, e) => {
    (e.pessoal_entregas_epi_itens ?? []).forEach((item) => {
      acc[item.tipo_item] = (acc[item.tipo_item] ?? 0) + item.quantidade;
    });
    return acc;
  }, {} as Record<string, number>);

  const summaryEntries = Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0]));

  function getFileUrl(path: string) {
    const { data } = supabase.storage.from('pessoal-documentos').getPublicUrl(path);
    openInNewTab(data.publicUrl);
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-4 text-center">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      {summaryEntries.length > 0 && (
        <div className="bg-muted/40 rounded-lg p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Total recebido</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {summaryEntries.map(([tipo, total]) => (
              <div key={tipo} className="text-xs">
                <span className="font-medium">{tipo}:</span>{' '}
                <span className="text-muted-foreground">{total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery list */}
      {entregas.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Nenhuma entrega registrada.</div>
      ) : (
        <div className="space-y-2">
          {entregas.map((e) => (
            <div key={e.id} className="border rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{formatDate(e.data_entrega)}</span>
                {e.comprovante_path && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => getFileUrl(e.comprovante_path!)}
                    title="Ver comprovante"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {(e.pessoal_entregas_epi_itens ?? []).map((item, idx) => (
                  <span key={idx} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{item.quantidade}×</span> {item.tipo_item}
                  </span>
                ))}
              </div>
              {e.observacoes && (
                <div className="text-muted-foreground italic">{e.observacoes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
