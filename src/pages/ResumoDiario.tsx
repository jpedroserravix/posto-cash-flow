import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Save, Upload, ChevronDown } from 'lucide-react';
import { parseQualityPDF, type QualityData } from '@/lib/qualityParser';

const CONFERIDO_OPTIONS = ['OK', 'PENDENTE', 'DIVERGÊNCIA'];

interface TurnoRow {
  turno: string;
  cofreBrinks: number;
  manual: number;
  total: number;
}

interface GroupData {
  data: string;
  centroCusto: string;
  turnos: TurnoRow[];
  totalBrinks: number;
  totalManual: number;
  totalGeral: number;
  conferido: string;
  observacao: string;
  resumoId?: string;
  quality?: QualityData;
}

export default function ResumoDiario() {
  const { selectedPostoId } = useAuth();
  const [groups, setGroups] = useState<GroupData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedPostoId) loadResumo();
  }, [selectedPostoId]);

  const loadResumo = async () => {
    if (!selectedPostoId) return;

    const [{ data: brinks }, { data: manuais }, { data: conferencias }, { data: qualityData }] = await Promise.all([
      supabase
        .from('depositos_brinks')
        .select('data_caixa, turno, valor, centro_custo')
        .eq('posto_id', selectedPostoId)
        .not('data_caixa', 'is', null)
        .not('turno', 'is', null),
      supabase
        .from('depositos_manuais')
        .select('data, turno, valor_lancado, centro_custo')
        .eq('posto_id', selectedPostoId),
      supabase
        .from('resumo_conferencia')
        .select('*')
        .eq('posto_id', selectedPostoId),
      supabase
        .from('relatorio_quality')
        .select('*')
        .eq('posto_id', selectedPostoId),
    ]);

    const turnoMap = new Map<string, { brinks: number; manual: number }>();

    brinks?.forEach((b) => {
      if (!b.data_caixa || !b.turno || !b.centro_custo) return;
      const cc = b.centro_custo || 'SEM CENTRO';
      const key = `${b.data_caixa}|${cc}|${b.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.brinks += b.valor;
      turnoMap.set(key, existing);
    });

    manuais?.forEach((m) => {
      if (!m.centro_custo) return;
      const key = `${m.data}|${m.centro_custo}|${m.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.manual += m.valor_lancado;
      turnoMap.set(key, existing);
    });

    const groupMap = new Map<string, TurnoRow[]>();
    turnoMap.forEach((val, key) => {
      const [data, cc, turno] = key.split('|');
      const groupKey = `${data}|${cc}`;
      const arr = groupMap.get(groupKey) || [];
      arr.push({ turno, cofreBrinks: val.brinks, manual: val.manual, total: val.brinks + val.manual });
      groupMap.set(groupKey, arr);
    });

    const confMap = new Map<string, { conferido: string; observacao: string; id: string }>();
    conferencias?.forEach((c) => {
      const cc = c.centro_custo || 'SEM CENTRO';
      const key = `${c.data}|${cc}`;
      const existing = confMap.get(key);
      if (!existing || c.turno === null) {
        confMap.set(key, { conferido: c.conferido, observacao: c.observacao || '', id: c.id });
      }
    });

    const qualityMap = new Map<string, QualityData>();
    qualityData?.forEach((q: any) => {
      qualityMap.set(q.data_caixa, {
        data_caixa: q.data_caixa,
        total_dinheiro_apurado: q.total_dinheiro_apurado,
        total_cartao: q.total_cartao,
        total_pix: q.total_pix,
        total_vendas: q.total_vendas,
        total_despesas: q.total_despesas,
        diferenca_caixa: q.diferenca_caixa,
        raw_text: q.raw_text || '',
      });
    });

    const result: GroupData[] = Array.from(groupMap.entries())
      .map(([key, turnos]) => {
        const [data, centroCusto] = key.split('|');
        const sorted = turnos.sort((a, b) => a.turno.localeCompare(b.turno));
        const totalBrinks = sorted.reduce((sum, t) => sum + t.cofreBrinks, 0);
        const totalManual = sorted.reduce((sum, t) => sum + t.manual, 0);
        const conf = confMap.get(key);

        return {
          data,
          centroCusto,
          turnos: sorted,
          totalBrinks,
          totalManual,
          totalGeral: totalBrinks + totalManual,
          conferido: conf?.conferido || 'PENDENTE',
          observacao: conf?.observacao || '',
          resumoId: conf?.id,
          quality: qualityMap.get(data),
        };
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.centroCusto.localeCompare(b.centroCusto));

    setGroups(result);
  };

  const handleSaveGroup = async (group: GroupData) => {
    if (!selectedPostoId) return;

    const payload = {
      posto_id: selectedPostoId,
      data: group.data,
      turno: null as string | null,
      centro_custo: group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto,
      conferido: group.conferido,
      observacao: group.observacao || null,
    };

    if (group.resumoId) {
      const { error } = await supabase
        .from('resumo_conferencia')
        .update({ turno: null as string | null, centro_custo: payload.centro_custo, conferido: payload.conferido, observacao: payload.observacao })
        .eq('id', group.resumoId);
      if (error) { toast.error('Erro: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('resumo_conferencia').insert(payload);
      if (error) { toast.error('Erro: ' + error.message); return; }
    }

    toast.success('Salvo');
    loadResumo();
  };

  const handleImportQuality = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPostoId) return;

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str);
        fullText += strings.join(' ') + '\n';
      }

      const parsed = parseQualityPDF(fullText);

      if (!parsed.data_caixa) {
        toast.error('Não foi possível extrair a data do PDF. Verifique o formato.');
        return;
      }

      const { error } = await supabase
        .from('relatorio_quality')
        .upsert({
          posto_id: selectedPostoId,
          data_caixa: parsed.data_caixa,
          total_dinheiro_apurado: parsed.total_dinheiro_apurado,
          total_cartao: parsed.total_cartao,
          total_pix: parsed.total_pix,
          total_vendas: parsed.total_vendas,
          total_despesas: parsed.total_despesas,
          diferenca_caixa: parsed.diferenca_caixa,
          raw_text: parsed.raw_text,
        }, { onConflict: 'posto_id,data_caixa' });

      if (error) {
        toast.error('Erro ao salvar: ' + error.message);
        return;
      }

      toast.success(`Relatório Quality importado para ${new Date(parsed.data_caixa + 'T00:00:00').toLocaleDateString('pt-BR')}`);
      loadResumo();
    } catch (err: any) {
      toast.error('Erro ao processar PDF: ' + (err.message || err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateGroup = (index: number, field: 'conferido' | 'observacao', value: string) => {
    setGroups((prev) => prev.map((group, i) => (i === index ? { ...group, [field]: value } : group)));
  };

  const formatCurrency = (value: number | null | undefined) =>
    (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const borderColor = (status: string) => {
    if (status === 'OK') return 'border-l-4 border-l-success';
    if (status === 'DIVERGÊNCIA') return 'border-l-4 border-l-destructive';
    return 'border-l-4 border-l-warning';
  };

  if (!selectedPostoId) {
    return <p className="py-8 text-center text-muted-foreground">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Resumo Diário</h1>
        <div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleImportQuality} />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Importar Quality
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">
              Nenhum dado para exibir. Importe depósitos Brinks ou cadastre depósitos manuais.
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group, i) => (
          <Card key={`${group.data}-${group.centroCusto}`} className={borderColor(group.conferido)}>
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR')} — {group.centroCusto}
                </CardTitle>
                <span className="text-lg font-bold">{formatCurrency(group.totalGeral)}</span>
              </div>
            </CardHeader>

            <CardContent className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Turno</TableHead>
                    <TableHead className="text-right text-xs">Cofre Brinks</TableHead>
                    <TableHead className="text-right text-xs">Manual</TableHead>
                    <TableHead className="text-right text-xs">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.turnos.map((turno) => (
                    <TableRow key={turno.turno}>
                      <TableCell className="py-1 text-xs">{turno.turno}</TableCell>
                      <TableCell className="py-1 text-right text-xs">{formatCurrency(turno.cofreBrinks)}</TableCell>
                      <TableCell className="py-1 text-right text-xs">{formatCurrency(turno.manual)}</TableCell>
                      <TableCell className="py-1 text-right text-xs font-medium">{formatCurrency(turno.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="py-1 text-xs font-bold">Soma</TableCell>
                    <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalBrinks)}</TableCell>
                    <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalManual)}</TableCell>
                    <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalGeral)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Quality comparison panel */}
              {group.quality ? (
                <QualityPanel quality={group.quality} totalSistema={group.totalGeral} />
              ) : (
                <div className="mt-2">
                  <Badge variant="secondary" className="text-xs opacity-60">Sem relatório Quality</Badge>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
              <Select value={group.conferido} onValueChange={(value) => updateGroup(i, 'conferido', value)}>
                <SelectTrigger
                  className={`h-8 w-36 text-xs ${
                    group.conferido === 'OK'
                      ? 'border-success text-success'
                      : group.conferido === 'DIVERGÊNCIA'
                        ? 'border-destructive text-destructive'
                        : 'border-warning text-warning'
                  }`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFERIDO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                className="h-8 min-w-[120px] flex-1 text-xs"
                value={group.observacao}
                onChange={(e) => updateGroup(i, 'observacao', e.target.value)}
                placeholder="Observação"
              />

              <Button size="sm" variant="ghost" onClick={() => handleSaveGroup(group)}>
                <Save className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}

function QualityPanel({ quality, totalSistema }: { quality: QualityData; totalSistema: number }) {
  const deltaDinheiro = totalSistema - (quality.total_dinheiro_apurado ?? 0);
  const deltaIsZero = Math.abs(deltaDinheiro) < 0.01;

  const formatCurrency = (value: number | null | undefined) =>
    (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
          <span>Conferência Quality</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Campo</TableHead>
              <TableHead className="text-right text-xs">Brinks+Manual</TableHead>
              <TableHead className="text-right text-xs">Quality</TableHead>
              <TableHead className="text-right text-xs">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="py-1 text-xs font-medium">Dinheiro</TableCell>
              <TableCell className="py-1 text-right text-xs">{formatCurrency(totalSistema)}</TableCell>
              <TableCell className="py-1 text-right text-xs">{formatCurrency(quality.total_dinheiro_apurado)}</TableCell>
              <TableCell className={`py-1 text-right text-xs font-bold ${deltaIsZero ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(deltaDinheiro)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-1 text-xs">Cartão/POS</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
              <TableCell className="py-1 text-right text-xs">{formatCurrency(quality.total_cartao)}</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-1 text-xs">PIX</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
              <TableCell className="py-1 text-right text-xs">{formatCurrency(quality.total_pix)}</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-1 text-xs">Despesas</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
              <TableCell className="py-1 text-right text-xs">{formatCurrency(quality.total_despesas)}</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-1 text-xs">Diferença caixa</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
              <TableCell className="py-1 text-right text-xs">{formatCurrency(quality.diferenca_caixa)}</TableCell>
              <TableCell className="py-1 text-right text-xs">—</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
