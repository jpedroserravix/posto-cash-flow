import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Camera, Paperclip, Send, X, FileText, ExternalLink, CalendarDays, Building2, StickyNote } from 'lucide-react';

// ─── constants ────────────────────────────────────────────────────────────────

const TURNOS_LEGADO = ['Turno 1', 'Turno 2', 'Turno 3'];
const TURNOS_MANUAL = ['Turno 1', 'Turno 2'];
const CENTROS_CUSTO = ['PISTA', 'CONVENIÊNCIA', 'TROCA DE ÓLEO'];
type Tipo =
  | 'Depósito Manual'
  | 'Nota Fiscal de Compra'
  | 'Despesa'
  | 'Manutenção'
  | 'Outros';

// ─── form state ───────────────────────────────────────────────────────────────

interface FormState {
  // legado + manual
  data_caixa:  string;
  turno:       string;
  centro_custo: string;
  // depósito manual
  valor:       string;
  // nota fiscal de compra
  data_chegada: string;
  fornecedor:   string;
  observacoes: string;
}

const emptyForm: FormState = {
  data_caixa:   '',
  turno:        '',
  centro_custo: 'PISTA',
  valor:        '',
  data_chegada: '',
  fornecedor:   '',
  observacoes:  '',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseMoney(v: string): number | null {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function formatDate(iso: string): string {
  const d = iso.split('T')[0]; // "2026-04-16"
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function EnvioRapido() {
  const { selectedPostoId, user, nome, username } = useAuth();

  const [tipo, setTipo]           = useState<Tipo>('Despesa');
  const [form, setForm]           = useState<FormState>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBoleto, setSelectedBoleto]         = useState<File | null>(null);
  const [selectedMercadoria, setSelectedMercadoria] = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);

  // ── pedidos pendentes (para Nota Fiscal de Compra) ────────────────────────
  interface PedidoPendente {
    id: string;
    numero: string | null;
    fornecedor: string | null;
    observacoes: string | null;
    arquivo_path: string | null;
    arquivo_type: string | null;
    created_at: string;
  }
  const [pedidosPendentes, setPedidosPendentes] = useState<PedidoPendente[]>([]);
  const [selectedPedidoId, setSelectedPedidoId] = useState<string>('');

  const cameraInputRef         = useRef<HTMLInputElement>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const boletoCameraRef        = useRef<HTMLInputElement>(null);
  const boletoFileRef          = useRef<HTMLInputElement>(null);
  const mercadoriaCameraRef    = useRef<HTMLInputElement>(null);
  const mercadoriaFileRef      = useRef<HTMLInputElement>(null);

  // ── flags ──────────────────────────────────────────────────────────────────
  const isLegado     = tipo === 'Despesa' || tipo === 'Manutenção' || tipo === 'Outros';
  const isManual     = tipo === 'Depósito Manual';
  const isNotaCompra = tipo === 'Nota Fiscal de Compra';

  // Carrega pedidos aguardando entrega quando tipo = Nota Fiscal de Compra
  useEffect(() => {
    if (tipo !== 'Nota Fiscal de Compra' || !selectedPostoId) {
      setPedidosPendentes([]);
      setSelectedPedidoId('');
      return;
    }
    (supabase as any)
      .from('pedidos_compra')
      .select('id, numero, fornecedor, observacoes, arquivo_path, arquivo_type, created_at')
      .eq('posto_id', selectedPostoId)
      .eq('status', 'Aguardando Entrega')
      .order('created_at', { ascending: false })
      .then(({ data, error }: any) => {
        if (error) { console.error('pedidos_compra query error:', error); return; }
        setPedidosPendentes(data || []);
      });
  }, [tipo, selectedPostoId]);

  const field = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const sel = (key: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  // ── file helpers ───────────────────────────────────────────────────────────
  const clearFile = () => {
    setSelectedFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current)   fileInputRef.current.value   = '';
  };

  const clearBoleto = () => {
    setSelectedBoleto(null);
    if (boletoCameraRef.current) boletoCameraRef.current.value = '';
    if (boletoFileRef.current)   boletoFileRef.current.value   = '';
  };

  const clearMercadoria = () => {
    setSelectedMercadoria(null);
    if (mercadoriaCameraRef.current) mercadoriaCameraRef.current.value = '';
    if (mercadoriaFileRef.current)   mercadoriaFileRef.current.value   = '';
  };

  const uploadFile = async (bucket: string, folder: string, file = selectedFile) => {
    if (!file) return null;
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return {
      path,
      fileType: file.type.startsWith('image/') ? 'image' : 'pdf',
    };
  };

  // ── canSubmit ──────────────────────────────────────────────────────────────
  const canSubmit = (() => {
    if (loading || !selectedPostoId) return false;
    if (isLegado)     return !!selectedFile && !!form.data_caixa && !!form.turno;
    if (isManual)     return !!form.valor && !!form.data_caixa && !!form.turno;
    if (isNotaCompra) return !!form.fornecedor && !!form.data_chegada && !!selectedFile;
    return false;
  })();

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedPostoId || !canSubmit) return;
    setLoading(true);

    try {
      // ── Legado (Despesa / Manutenção / Outros) ───────────────────────────
      if (isLegado) {
        const up = await uploadFile(
          'despesas-comprovantes',
          `${selectedPostoId}/${form.data_caixa}`,
        );
        if (!up) throw new Error('Upload falhou');
        const { error } = await (supabase as any).from('comprovantes_despesas').insert({
          posto_id:   selectedPostoId,
          data_caixa: form.data_caixa,
          file_path:  up.path,
          file_name:  selectedFile!.name,
          file_type:  up.fileType,
          turno:      form.turno,
          tipo,
          centro_custo: form.centro_custo,
        });
        if (error) throw error;
        toast.success('Comprovante enviado!');
      }

      // ── Depósito Manual ──────────────────────────────────────────────────
      else if (isManual) {
        let comprovante_path: string | null = null;
        let comprovante_type: string | null = null;
        if (selectedFile) {
          const up = await uploadFile(
            'despesas-comprovantes',
            `${selectedPostoId}/${form.data_caixa}`,
          );
          if (up) { comprovante_path = up.path; comprovante_type = up.fileType; }
        }
        const valorNum = parseMoney(form.valor);
        if (!valorNum) throw new Error('Valor inválido');
        const { error } = await (supabase as any).from('depositos_manuais').insert({
          posto_id:      selectedPostoId,
          data:          form.data_caixa,
          turno:         form.turno.toUpperCase(),   // "Turno 1" → "TURNO 1"
          centro_custo:  form.centro_custo,
          valor_lancado: valorNum,
          valor_depositado: null,
          conferido:     'PENDENTE',
          ...(comprovante_path ? { comprovante_path, comprovante_type } : {}),
        });
        if (error) throw error;
        toast.success('Depósito manual registrado! Aparecerá em Depósitos Manuais.');
      }

      // ── Nota Fiscal de Compra ────────────────────────────────────────────
      else if (isNotaCompra) {
        const nfUp = await uploadFile(
          'documentos-comprovantes',
          `notas-compra/${selectedPostoId}`,
        );
        if (!nfUp) throw new Error('Upload da NF falhou');

        let boletoPath: string | null = null;
        let boletoType: string | null = null;
        if (selectedBoleto) {
          const bUp = await uploadFile(
            'documentos-comprovantes',
            `notas-compra-boleto/${selectedPostoId}`,
            selectedBoleto,
          );
          if (bUp) { boletoPath = bUp.path; boletoType = bUp.fileType; }
        }

        let mercadoriaPath: string | null = null;
        let mercadoriaType: string | null = null;
        if (selectedMercadoria) {
          const mUp = await uploadFile(
            'documentos-comprovantes',
            `notas-compra-mercadoria/${selectedPostoId}`,
            selectedMercadoria,
          );
          if (mUp) { mercadoriaPath = mUp.path; mercadoriaType = mUp.fileType; }
        }

        const enviadoPorNome = nome || username || user?.email || null;
        const pedidoId = selectedPedidoId || null;
        const { error } = await (supabase as any).from('notas_fiscais_compra').insert({
          posto_id:           selectedPostoId,
          enviado_por:        user?.id ?? null,
          enviado_por_nome:   enviadoPorNome,
          fornecedor:         form.fornecedor,
          data_chegada:       form.data_chegada,
          observacoes:        form.observacoes || null,
          nf_path:            nfUp.path,
          nf_type:            nfUp.fileType,
          boleto_path:        boletoPath,
          boleto_type:        boletoType,
          mercadoria_path:    mercadoriaPath,
          mercadoria_type:    mercadoriaType,
          pedido_id:          pedidoId,
          status:             'Pendente',
        });
        if (error) throw error;

        // Se vinculou a um pedido, marca como Recebido automaticamente
        if (pedidoId) {
          const now = new Date().toISOString();
          await (supabase as any)
            .from('pedidos_compra')
            .update({ status: 'Recebido', updated_at: now })
            .eq('id', pedidoId);
          await (supabase as any).from('pedidos_compra_historico').insert({
            pedido_id:       pedidoId,
            status_anterior: 'Aguardando Entrega',
            status_novo:     'Recebido',
            observacao:      'Nota fiscal de compra vinculada via Envio Rápido',
            feito_por:       user?.id ?? null,
            feito_por_nome:  enviadoPorNome,
          });
        }

        toast.success('Nota fiscal de compra enviada! Aparecerá em Lançamento de Notas.');
      }

      // reset
      setSelectedFile(null);
      setSelectedBoleto(null);
      setSelectedMercadoria(null);
      setSelectedPedidoId('');
      setForm(emptyForm);
      if (cameraInputRef.current)      cameraInputRef.current.value      = '';
      if (fileInputRef.current)        fileInputRef.current.value        = '';
      if (boletoCameraRef.current)     boletoCameraRef.current.value     = '';
      if (boletoFileRef.current)       boletoFileRef.current.value       = '';
      if (mercadoriaCameraRef.current) mercadoriaCameraRef.current.value = '';
      if (mercadoriaFileRef.current)   mercadoriaFileRef.current.value   = '';

    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const previewUrl         = selectedFile       ? URL.createObjectURL(selectedFile)       : null;
  const boletoPreview      = selectedBoleto     ? URL.createObjectURL(selectedBoleto)     : null;
  const mercadoriaPreview  = selectedMercadoria ? URL.createObjectURL(selectedMercadoria) : null;
  const isImage            = selectedFile?.type.startsWith('image/');
  const isBoletoImage      = selectedBoleto?.type.startsWith('image/');
  const isMercadoriaImage  = selectedMercadoria?.type.startsWith('image/');
  const fileRequired  = !isManual && !isNotaCompra; // for isNotaCompra, NF is required but handled separately

  if (!selectedPostoId) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Selecione um posto para continuar.
      </p>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-4 px-2 py-4">
      <h1 className="text-xl font-bold">Envio Rápido</h1>

      {/* Hidden file inputs — NF / main file */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        {...({ capture: 'environment' } as any)}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
      />
      {/* Hidden file inputs — Boleto */}
      <input
        ref={boletoCameraRef}
        type="file"
        accept="image/*"
        {...({ capture: 'environment' } as any)}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && setSelectedBoleto(e.target.files[0])}
      />
      <input
        ref={boletoFileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && setSelectedBoleto(e.target.files[0])}
      />
      {/* Hidden file inputs — Mercadoria */}
      <input
        ref={mercadoriaCameraRef}
        type="file"
        accept="image/*"
        {...({ capture: 'environment' } as any)}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && setSelectedMercadoria(e.target.files[0])}
      />
      <input
        ref={mercadoriaFileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && setSelectedMercadoria(e.target.files[0])}
      />

      <Card>
        <CardContent className="space-y-5 pt-6">

          {/* ── Tipo ── */}
          <div className="space-y-2">
            <Label>Tipo de Envio</Label>
            <Select
              value={tipo}
              onValueChange={(v) => {
                setTipo(v as Tipo);
                setForm(emptyForm);
                clearFile();
                clearBoleto();
                clearMercadoria();
                setSelectedPedidoId('');
              }}
            >
              <SelectTrigger className="h-12 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Compras</SelectLabel>
                  <SelectItem value="Nota Fiscal de Compra">Nota Fiscal de Compra</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Comprovante Caixa</SelectLabel>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                  <SelectItem value="Manutenção">Aferição</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Financeiro</SelectLabel>
                  <SelectItem value="Depósito Manual">Depósito Manual</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* ── Arquivo(s) ── */}
          {isNotaCompra ? (
            <>
              {/* NF obrigatória */}
              <FilePickerField
                label="Foto da Nota Fiscal *"
                file={selectedFile}
                previewUrl={previewUrl}
                isImage={!!isImage}
                onClear={clearFile}
                onCamera={() => cameraInputRef.current?.click()}
                onFile={() => fileInputRef.current?.click()}
              />
              {/* Boleto opcional */}
              <FilePickerField
                label="Foto do Boleto"
                optional
                file={selectedBoleto}
                previewUrl={boletoPreview}
                isImage={!!isBoletoImage}
                onClear={clearBoleto}
                onCamera={() => boletoCameraRef.current?.click()}
                onFile={() => boletoFileRef.current?.click()}
              />
              {/* Mercadoria opcional */}
              <FilePickerField
                label="Foto da Mercadoria"
                optional
                file={selectedMercadoria}
                previewUrl={mercadoriaPreview}
                isImage={!!isMercadoriaImage}
                onClear={clearMercadoria}
                onCamera={() => mercadoriaCameraRef.current?.click()}
                onFile={() => mercadoriaFileRef.current?.click()}
              />
            </>
          ) : (
            <div className="space-y-2">
              <Label>
                Arquivo{' '}
                {!fileRequired && (
                  <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                )}
              </Label>
              {selectedFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  {isImage && previewUrl ? (
                    <img
                      src={previewUrl}
                      className="h-16 w-16 shrink-0 rounded object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted">
                      <FileText className="h-8 w-8 text-red-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={clearFile}
                    className="shrink-0 rounded-full p-1.5 hover:bg-muted"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-20 flex-col gap-2 text-sm"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-6 w-6" />
                    Tirar Foto
                  </Button>
                  <Button
                    variant="outline"
                    className="h-20 flex-col gap-2 text-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-6 w-6" />
                    Escolher Arquivo
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CAMPOS DINÂMICOS
          ══════════════════════════════════════════════════════════════ */}

          {/* ── Legado: Despesa / Manutenção / Outros ── */}
          {isLegado && (
            <>
              <div className="space-y-2">
                <Label>Data do Caixa</Label>
                <Input
                  type="date"
                  value={form.data_caixa}
                  onChange={field('data_caixa')}
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Turno</Label>
                <Select value={form.turno} onValueChange={sel('turno')}>
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue placeholder="Selecione o turno" />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNOS_LEGADO.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Centro de Custo</Label>
                <Select value={form.centro_custo} onValueChange={sel('centro_custo')}>
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CENTROS_CUSTO.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── Depósito Manual ── */}
          {isManual && (
            <>
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input
                  value={form.valor}
                  onChange={field('valor')}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Data do Caixa *</Label>
                <Input
                  type="date"
                  value={form.data_caixa}
                  onChange={field('data_caixa')}
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Turno *</Label>
                <Select value={form.turno} onValueChange={sel('turno')}>
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue placeholder="Selecione o turno" />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNOS_MANUAL.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Centro de Custo</Label>
                <Select value={form.centro_custo} onValueChange={sel('centro_custo')}>
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CENTROS_CUSTO.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── Nota Fiscal de Compra ── */}
          {isNotaCompra && (
            <>
              <div className="space-y-2">
                <Label>Data de Chegada *</Label>
                <Input
                  type="date"
                  value={form.data_chegada}
                  onChange={field('data_chegada')}
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Fornecedor *</Label>
                <Input
                  value={form.fornecedor}
                  onChange={field('fornecedor')}
                  placeholder="Ex: Distribuidora ABC"
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Observações{' '}
                  <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Informações adicionais sobre esta nota..."
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Vincular a Pedido{' '}
                  <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </Label>
                <Select
                  value={selectedPedidoId || '__none__'}
                  onValueChange={(v) => setSelectedPedidoId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue placeholder="Sem vínculo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem vínculo</SelectItem>
                    {pedidosPendentes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.numero ? `#${p.numero}` : 'S/N'}
                        {p.fornecedor ? ` — ${p.fornecedor}` : ''}
                        {` — ${formatDate(p.created_at)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pedidosPendentes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum pedido aguardando entrega neste posto.
                  </p>
                )}
              </div>

              {/* Card resumo do pedido selecionado */}
              {selectedPedidoId && (() => {
                const p = pedidosPendentes.find((x) => x.id === selectedPedidoId);
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
                      <StickyNote className="h-3.5 w-3.5 text-primary" />
                      Resumo do Pedido
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] shrink-0">Número</span>
                        <span className="font-medium">{p.numero ? `#${p.numero}` : 'S/N'}</span>
                      </div>
                      {p.fornecedor && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <span>{p.fornecedor}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{formatDate(p.created_at)}</span>
                      </div>
                      {p.observacoes && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground min-w-[80px] shrink-0">Obs.</span>
                          <span className="text-muted-foreground">{p.observacoes}</span>
                        </div>
                      )}
                    </div>
                    {p.arquivo_path && (
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline"
                        onClick={async () => {
                          const { data } = await supabase.storage
                            .from('documentos-comprovantes')
                            .createSignedUrl(p.arquivo_path!, 60);
                          if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ver PDF do pedido
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {/* ── Enviar ── */}
          <Button
            className="h-14 w-full gap-2 text-base"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            <Send className="h-5 w-5" />
            {loading ? 'Enviando...' : 'Enviar'}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}

// ─── sub-component ─────────────────────────────────────────────────────────

interface FilePickerFieldProps {
  label: string;
  optional?: boolean;
  file: File | null;
  previewUrl: string | null;
  isImage: boolean;
  onClear: () => void;
  onCamera: () => void;
  onFile: () => void;
}

function FilePickerField({ label, optional, file, previewUrl, isImage, onClear, onCamera, onFile }: FilePickerFieldProps) {
  return (
    <div className="space-y-2">
      <Label>
        {label}{' '}
        {optional && (
          <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
        )}
      </Label>
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          {isImage && previewUrl ? (
            <img src={previewUrl} className="h-16 w-16 shrink-0 rounded object-cover" alt="" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted">
              <FileText className="h-8 w-8 text-red-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button onClick={onClear} className="shrink-0 rounded-full p-1.5 hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-20 flex-col gap-2 text-sm" onClick={onCamera}>
            <Camera className="h-6 w-6" />
            Tirar Foto
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2 text-sm" onClick={onFile}>
            <Paperclip className="h-6 w-6" />
            Escolher Arquivo
          </Button>
        </div>
      )}
    </div>
  );
}
