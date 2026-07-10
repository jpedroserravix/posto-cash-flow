import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { QrCode, Upload } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface PixVenda {
  transacao_id: string;
  data_hora: string;
  valor_bruto: number;
  tarifa: number;
  tarifa_esperada: number;
  nome_pagador: string;
  nome_funcionario: string;
  pdv: string;
}

interface PixRepasse {
  data_hora: string;
  valor: number;
  dia_referencia: string;
}

interface PixConfig {
  tarifa_percentual: number;
  tarifa_minima: number;
}

interface ParseResult {
  vendas: PixVenda[];
  repasses: PixRepasse[];
  error?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function excelDateToISO(val: unknown): string | null {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const Y = val.getFullYear();
    const M = String(val.getMonth() + 1).padStart(2, '0');
    const D = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D}T${h}:${m}:${s}`;
  }
  if (typeof val === 'string' && val.trim()) {
    return val.trim().replace(' ', 'T');
  }
  return null;
}

// Returns YYYY-MM-DD of the day before the given ISO datetime string.
function previousDay(isoDatetime: string): string {
  const [y, m, d] = isoDatetime.split('T')[0].split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function calcTarifaEsperada(valorBruto: number, cfg: PixConfig): number {
  return Math.max(cfg.tarifa_minima, valorBruto * cfg.tarifa_percentual / 100);
}

// ─── parser ──────────────────────────────────────────────────────────────────

function parsePixXLSX(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });

  if (jsonData.length < 2) {
    return { vendas: [], repasses: [], error: 'Planilha vazia ou sem dados.' };
  }

  const rawHeaders = (jsonData[0] as unknown[]).map(
    (h) => (h != null ? String(h) : '').trim().toUpperCase(),
  );

  const idx = (pred: (h: string) => boolean) => rawHeaders.findIndex(pred);

  const descIdx  = idx((h) => h.includes('DESCRI'));
  const dtIdx    = idx((h) => h.includes('DATA') && (h.includes('HORA') || h.includes('REGISTRO')));
  const valorIdx = idx((h) => h === 'VALOR');
  const txIdx    = idx((h) => h.includes('TRANSA'));
  const pagIdx   = idx((h) => h.includes('PAGADOR'));
  const funcIdx  = idx((h) => h.includes('FUNCION'));
  const pdvIdx   = idx((h) => h === 'PDV');

  if (descIdx === -1 || dtIdx === -1 || valorIdx === -1 || txIdx === -1) {
    return {
      vendas: [],
      repasses: [],
      error: 'Colunas não encontradas. O arquivo deve conter: Descrição, Data/Hora do Registro, Valor e Transação.',
    };
  }

  const tarifaMap = new Map<string, number>(); // transacao_id → valor absoluto da tarifa
  const vendaRows: Omit<PixVenda, 'tarifa_esperada'>[] = [];
  const repasses: PixRepasse[] = [];

  for (const row of jsonData.slice(1)) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const cols = row as unknown[];

    const desc = (cols[descIdx] != null ? String(cols[descIdx]) : '').trim().toUpperCase();
    const rawValor = cols[valorIdx];
    const valor = typeof rawValor === 'number'
      ? rawValor
      : parseFloat((rawValor != null ? String(rawValor) : '').replace(',', '.')) || 0;
    const transacaoId = (cols[txIdx] != null ? String(cols[txIdx]) : '').trim();
    const dataHora = excelDateToISO(cols[dtIdx]);

    if (!dataHora) continue;

    if (desc === 'CREDITO DE PAGAMENTO VIA PIX') {
      if (!transacaoId) continue;
      vendaRows.push({
        transacao_id:     transacaoId,
        data_hora:        dataHora,
        valor_bruto:      valor,
        tarifa:           0,
        nome_pagador:     pagIdx  >= 0 && cols[pagIdx]  != null ? String(cols[pagIdx]).trim()  : '',
        nome_funcionario: funcIdx >= 0 && cols[funcIdx] != null ? String(cols[funcIdx]).trim() : '',
        pdv:              pdvIdx  >= 0 && cols[pdvIdx]  != null ? String(cols[pdvIdx]).trim()  : '',
      });
    } else if (desc === 'DEBITO DE TARIFA PIX') {
      if (transacaoId) tarifaMap.set(transacaoId, Math.abs(valor));
    } else if (desc === 'PIX ENVIADO') {
      repasses.push({
        data_hora:      dataHora,
        valor:          Math.abs(valor),
        dia_referencia: previousDay(dataHora),
      });
    }
  }

  const vendas: PixVenda[] = vendaRows.map((v) => ({
    ...v,
    tarifa:          tarifaMap.get(v.transacao_id) ?? 0,
    tarifa_esperada: 0,
  }));

  return { vendas, repasses };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ConciliacaoPix() {
  const { selectedPostoId, nome } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  if (!selectedPostoId) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Selecione um posto para continuar.
      </p>
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    doImport(file);
  }

  async function doImport(file: File) {
    setImporting(true);
    try {
      // 1. Parse XLSX
      const buffer = await file.arrayBuffer();
      const { vendas, repasses, error: parseError } = parsePixXLSX(buffer);

      if (parseError) { toast.error(parseError); return; }
      if (vendas.length === 0 && repasses.length === 0) {
        toast.error('Nenhuma transação reconhecida no arquivo.');
        return;
      }

      // 2. Load pix_config (fallback to defaults if posto não tem configuração)
      const { data: cfgRaw } = await (supabase as any)
        .from('pix_config')
        .select('tarifa_percentual, tarifa_minima')
        .eq('posto_id', selectedPostoId)
        .maybeSingle();
      const cfg: PixConfig = {
        tarifa_percentual: cfgRaw?.tarifa_percentual ?? 0.2,
        tarifa_minima:     cfgRaw?.tarifa_minima     ?? 0.15,
      };

      // 3. Compute tarifa_esperada
      const vendasFinal = vendas.map((v) => ({
        ...v,
        tarifa_esperada: calcTarifaEsperada(v.valor_bruto, cfg),
      }));

      // 4. Upload arquivo para o Storage
      const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath  = `${selectedPostoId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('pix-extratos')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) throw new Error('Erro ao enviar arquivo: ' + uploadError.message);

      // 5. Inserir pix_importacoes e obter ID
      const allDates = [
        ...vendasFinal.map((v) => v.data_hora.split('T')[0]),
        ...repasses.map((r) => r.data_hora.split('T')[0]),
      ].sort();
      const { data: importRow, error: importError } = await (supabase as any)
        .from('pix_importacoes')
        .insert({
          posto_id:         selectedPostoId,
          file_path:        filePath,
          file_name:        file.name,
          periodo_inicio:   allDates[0],
          periodo_fim:      allDates[allDates.length - 1],
          total_transacoes: vendasFinal.length,
          criado_por_nome:  nome ?? null,
        })
        .select('id')
        .single();
      if (importError) throw new Error('Erro ao registrar importação: ' + importError.message);
      const importacaoId: string = importRow.id;

      // 6. Contar transações já existentes (para o toast)
      const allTxIds = vendasFinal.map((v) => v.transacao_id);
      let existingCount = 0;
      if (allTxIds.length > 0) {
        const { data: existing } = await (supabase as any)
          .from('pix_transacoes')
          .select('transacao_id')
          .in('transacao_id', allTxIds);
        existingCount = (existing || []).length;
      }

      // 7. Upsert pix_transacoes (ignoreDuplicates mantém o importacao_id original)
      if (vendasFinal.length > 0) {
        const { error: txError } = await (supabase as any)
          .from('pix_transacoes')
          .upsert(
            vendasFinal.map((v) => ({
              posto_id:         selectedPostoId,
              importacao_id:    importacaoId,
              transacao_id:     v.transacao_id,
              data_hora:        v.data_hora,
              valor_bruto:      v.valor_bruto,
              tarifa:           v.tarifa,
              tarifa_esperada:  v.tarifa_esperada,
              nome_pagador:     v.nome_pagador,
              nome_funcionario: v.nome_funcionario,
              pdv:              v.pdv,
            })),
            { onConflict: 'transacao_id', ignoreDuplicates: true },
          );
        if (txError) throw new Error('Erro ao salvar transações: ' + txError.message);
      }

      // 8. Contar repasses já existentes (para o toast)
      let existingRepassesCount = 0;
      if (repasses.length > 0) {
        const { data: existingRep } = await (supabase as any)
          .from('pix_repasses')
          .select('data_hora')
          .eq('posto_id', selectedPostoId)
          .in('data_hora', repasses.map((r) => r.data_hora));
        existingRepassesCount = (existingRep || []).length;
      }

      // 9. Upsert pix_repasses
      if (repasses.length > 0) {
        const { error: repError } = await (supabase as any)
          .from('pix_repasses')
          .upsert(
            repasses.map((r) => ({
              posto_id:       selectedPostoId,
              data_hora:      r.data_hora,
              valor:          r.valor,
              dia_referencia: r.dia_referencia,
              valor_esperado: 0,
              status:         'pendente',
            })),
            { onConflict: 'posto_id,data_hora', ignoreDuplicates: true },
          );
        if (repError) throw new Error('Erro ao salvar repasses: ' + repError.message);
      }

      // 10. Toast resultado
      const novas       = vendasFinal.length - existingCount;
      const jaExistiam  = existingCount;
      const novosRep    = repasses.length - existingRepassesCount;

      toast.success(
        `${novas} transaç${novas === 1 ? 'ão nova' : 'ões novas'}` +
        (jaExistiam > 0 ? `, ${jaExistiam} já existiam` : '') +
        `, ${novosRep} repasse${novosRep === 1 ? '' : 's'}`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado na importação');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Conciliação Pix</h1>
        </div>
        <Button
          className="gap-2 text-xs"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          {importing ? 'Importando...' : 'Importar Extrato'}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
