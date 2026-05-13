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
import { Camera, Paperclip, Send, X, FileText, ExternalLink, CalendarDays, Building2, StickyNote, Plus, Trash2 } from 'lucide-react';
import { openInNewTab } from '@/lib/utils';
import { useListaConfig } from '@/hooks/useListaConfig';

// ─── constants ────────────────────────────────────────────────────────────────

const TURNOS_LEGADO = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno 4'];
const TURNOS_MANUAL = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno 4'];
const CENTROS_CUSTO = ['PISTA', 'CONVENIÊNCIA', 'TROCA DE ÓLEO'];

type Tipo =
  | 'Depósito Manual'
  | 'Nota Fiscal de Compra'
  | 'Despesa'
  | 'Manutenção'
  | 'Outros'
  | 'Entrega de Uniforme/EPI'
  | 'Atestado'
  | 'Advertência';

// Ordem dos grupos e itens no seletor de tipo.
// O primeiro item do primeiro grupo é o padrão ao abrir a tela.
const TIPO_GROUPS: { label: string; items: { value: Tipo; label: string }[] }[] = [
  {
    label: 'Comprovante Caixa',
    items: [
      { value: 'Depósito Manual', label: 'Depósito Manual' },
      { value: 'Despesa',         label: 'Despesa' },
      { value: 'Manutenção',      label: 'Aferição' },
      { value: 'Outros',          label: 'Outros' },
    ],
  },
  {
    label: 'Compras / Pedidos',
    items: [{ value: 'Nota Fiscal de Compra', label: 'Nota Fiscal de Compra' }],
  },
  {
    label: 'Pessoal',
    items: [
      { value: 'Entrega de Uniforme/EPI', label: 'Entrega de Uniforme/EPI' },
      { value: 'Atestado',                label: 'Atestado' },
      { value: 'Advertência',             label: 'Advertência' },
    ],
  },
];

const TIPO_DEFAULT: Tipo = TIPO_GROUPS[0].items[0].value;

// ─── form state ───────────────────────────────────────────────────────────────

interface FormState {
  // legado + manual
  data_caixa:   string;
  turno:        string;
  centro_custo: string;
  // depósito manual
  valor:        string;
  // nota fiscal de compra
  data_chegada: string;
  fornecedor:   string;
  observacoes:  string;
  // entrega de uniforme/epi
  funcionario_epi: string;
  data_entrega:    string;
  // outros (comprovante caixa)
  titulo:          string;
  // atestado / advertência
  funcionario_pessoal: string;
  data_ocorrencia:     string;
}

const emptyForm: FormState = {
  data_caixa:   '',
  turno:        '',
  centro_custo: 'PISTA',
  valor:        '',
  data_chegada: '',
  fornecedor:   '',
  observacoes:  '',
  funcionario_epi:     '',
  data_entrega:        '',
  titulo:              '',
  funcionario_pessoal: '',
  data_ocorrencia:     '',
};

// EPI item row
interface EPIItem { tipo: string; quantidade: string; }
const emptyEPIItem = (): EPIItem => ({ tipo: '', quantidade: '1' });

const EPI_FALLBACK = ['Bota', 'Boné', 'Calça', 'Camisa', 'Crachá', 'Luva', 'Óculos de Proteção', 'Outros'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseMoney(v: string): number | null {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function formatDate(iso: string): string {
  const d = iso.split('T')[0];
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function EnvioRapido() {
  const { selectedPostoId, user, nome, username } = useAuth();

  const [tipo, setTipo]                 = useState<Tipo>(TIPO_DEFAULT);
  const [form, setForm]                 = useState<FormState>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBoleto, setSelectedBoleto]         = useState<File | null>(null);
  const [selectedMercadoria, setSelectedMercadoria] = useState<File | null>(null);
  const [loading, setLoading]           = useState(false);

  // ── EPI / Pessoal funcionários ─────────────────────────────────────────────
  const tiposEPI = useListaConfig('tipos_uniforme_epi', EPI_FALLBACK);
  const [epiItems, setEpiItems]         = useState<EPIItem[]>([emptyEPIItem()]);
  const [epiFuncionarios, setEpiFuncionarios] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    const needs = tipo === 'Entrega de Uniforme/EPI' || tipo === 'Atestado' || tipo === 'Advertência';
    if (!needs || !selectedPostoId) {
      setEpiFuncionarios([]);
      return;
    }
    (supabase as any)
      .from('pessoal_funcionarios')
      .select('id, nome')
      .eq('posto_id', selectedPostoId)
      .eq('status', 'ativo')
      .order('nome')
      .then(({ data }: any) => setEpiFuncionarios(data ?? []));
  }, [tipo, selectedPostoId]);

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

  const cameraInputRef      = useRef<HTMLInputElement>(null);
  const fileInputRef        = useRef<HTMLInputElement>(null);
  const boletoCameraRef     = useRef<HTMLInputElement>(null);
  const boletoFileRef       = useRef<HTMLInputElement>(null);
  const mercadoriaCameraRef = useRef<HTMLInputElement>(null);
  const mercadoriaFileRef   = useRef<HTMLInputElement>(null);

  // ── flags ──────────────────────────────────────────────────────────────────
  const isLegado            = tipo === 'Despesa' || tipo === 'Manutenção' || tipo === 'Outros';
  const isOutros            = tipo === 'Outros';
  const isManual            = tipo === 'Depósito Manual';
  const isNotaCompra        = tipo === 'Nota Fiscal de Compra';
  const isEPI               = tipo === 'Entrega de Uniforme/EPI';
  const isAtestado          = tipo === 'Atestado';
  const isAdvertencia       = tipo === 'Advertência';
  const isPessoalOcorrencia = isAtestado || isAdvertencia;

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
    if (isLegado) {
      const base = !!selectedFile && !!form.data_caixa && !!form.turno;
      if (isOutros) return base && !!form.titulo;
      return base;
    }
    if (isManual)     return !!form.valor && !!form.data_caixa && !!form.turno;
    if (isNotaCompra) return !!form.fornecedor && !!form.data_chegada && !!selectedFile;
    if (isEPI) {
      const hasValidItem = epiItems.some((i) => i.tipo && parseInt(i.quantidade) > 0);
      return !!form.funcionario_epi && !!form.data_entrega && !!selectedFile && hasValidItem;
    }
    if (isPessoalOcorrencia) {
      return !!selectedFile && !!form.funcionario_pessoal && !!form.data_ocorrencia;
    }
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
          posto_id:     selectedPostoId,
          data_caixa:   form.data_caixa,
          file_path:    up.path,
          file_name:    selectedFile!.name,
          file_type:    up.fileType,
          turno:        form.turno,
          tipo,
          centro_custo: form.centro_custo,
          ...(isOutros ? {
            titulo:     form.titulo,
            observacao: form.observacoes || null,
          } : {}),
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
          posto_id:         selectedPostoId,
          data:             form.data_caixa,
          turno:            form.turno.toUpperCase(),
          centro_custo:     form.centro_custo,
          valor_lancado:    valorNum,
          valor_depositado: null,
          conferido:        'PENDENTE',
          criado_por_nome:  nome || username || user?.email || null,
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
          posto_id:         selectedPostoId,
          enviado_por:      user?.id ?? null,
          enviado_por_nome: enviadoPorNome,
          fornecedor:       form.fornecedor,
          data_chegada:     form.data_chegada,
          observacoes:      form.observacoes || null,
          nf_path:          nfUp.path,
          nf_type:          nfUp.fileType,
          boleto_path:      boletoPath,
          boleto_type:      boletoType,
          mercadoria_path:  mercadoriaPath,
          mercadoria_type:  mercadoriaType,
          pedido_id:        pedidoId,
          status:           'Pendente',
        });
        if (error) throw error;

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

      // ── Entrega de Uniforme/EPI ──────────────────────────────────────────
      else if (isEPI) {
        const up = await uploadFile('pessoal-documentos', `epi/${selectedPostoId}`);
        if (!up) throw new Error('Upload do comprovante falhou');

        const { data: entrega, error: entregaErr } = await (supabase as any)
          .from('pessoal_entregas_epi')
          .insert({
            funcionario_id:   form.funcionario_epi,
            posto_id:         selectedPostoId,
            data_entrega:     form.data_entrega,
            comprovante_path: up.path,
            comprovante_type: up.fileType,
            observacoes:      form.observacoes || null,
          })
          .select()
          .single();
        if (entregaErr) throw entregaErr;

        const itemsPayload = epiItems
          .filter((i) => i.tipo && parseInt(i.quantidade) > 0)
          .map((i) => ({ entrega_id: entrega.id, tipo_item: i.tipo, quantidade: parseInt(i.quantidade) }));
        if (itemsPayload.length > 0) {
          const { error: itemsErr } = await (supabase as any)
            .from('pessoal_entregas_epi_itens')
            .insert(itemsPayload);
          if (itemsErr) throw itemsErr;
        }

        toast.success('Entrega de EPI registrada com sucesso!');
        setEpiItems([emptyEPIItem()]);
      }

      // ── Atestado / Advertência ───────────────────────────────────────────
      else if (isPessoalOcorrencia) {
        const up = await uploadFile(
          'pessoal-documentos',
          `ocorrencias/${form.funcionario_pessoal}`,
        );
        if (!up) throw new Error('Upload do arquivo falhou');

        const { error } = await (supabase as any).from('pessoal_ocorrencias').insert({
          funcionario_id: form.funcionario_pessoal,
          posto_id:       selectedPostoId,
          data:           form.data_ocorrencia,
          tipo,
          descricao:      form.observacoes || null,
          arquivo_path:   up.path,
        });
        if (error) throw error;

        toast.success(`${tipo} registrado! Aparecerá em Ponto e Ocorrências.`);
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
  const previewUrl        = selectedFile       ? URL.createObjectURL(selectedFile)       : null;
  const boletoPreview     = selectedBoleto     ? URL.createObjectURL(selectedBoleto)     : null;
  const mercadoriaPreview = selectedMercadoria ? URL.createObjectURL(selectedMercadoria) : null;
  const isImage           = selectedFile?.type.startsWith('image/');
  const isBoletoImage     = selectedBoleto?.type.startsWith('image/');
  const isMercadoriaImage = selectedMercadoria?.type.startsWith('image/');
  const fileRequired      = !isManual && !isNotaCompra && !isEPI && !isPessoalOcorrencia;

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
                const newTipo = v as Tipo;
                setTipo(newTipo);
                const today = new Date().toISOString().split('T')[0];
                setForm({
                  ...emptyForm,
                  data_entrega:    newTipo === 'Entrega de Uniforme/EPI' ? today : '',
                  data_ocorrencia: (newTipo === 'Atestado' || newTipo === 'Advertência') ? today : '',
                });
                clearFile();
                clearBoleto();
                clearMercadoria();
                setSelectedPedidoId('');
                setEpiItems([emptyEPIItem()]);
              }}
            >
              <SelectTrigger className="h-12 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs text-muted-foreground">{group.label}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Arquivo(s) ── */}
          {isEPI ? (
            <FilePickerField
              label="Comprovante assinado *"
              file={selectedFile}
              previewUrl={previewUrl}
              isImage={!!isImage}
              onClear={clearFile}
              onCamera={() => cameraInputRef.current?.click()}
              onFile={() => fileInputRef.current?.click()}
            />
          ) : isAtestado ? (
            <FilePickerField
              label="Foto do Atestado *"
              file={selectedFile}
              previewUrl={previewUrl}
              isImage={!!isImage}
              onClear={clearFile}
              onCamera={() => cameraInputRef.current?.click()}
              onFile={() => fileInputRef.current?.click()}
            />
          ) : isAdvertencia ? (
            <FilePickerField
              label="Foto da Advertência assinada *"
              file={selectedFile}
              previewUrl={previewUrl}
              isImage={!!isImage}
              onClear={clearFile}
              onCamera={() => cameraInputRef.current?.click()}
              onFile={() => fileInputRef.current?.click()}
            />
          ) : isNotaCompra ? (
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
              {isOutros && (
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    value={form.titulo}
                    onChange={field('titulo')}
                    placeholder="Ex: Pagamento de frete"
                    className="h-12 text-sm"
                  />
                </div>
              )}
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
              {isOutros && (
                <div className="space-y-2">
                  <Label>
                    Observação{' '}
                    <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                  </Label>
                  <Textarea
                    value={form.observacoes}
                    onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                    placeholder="Informações adicionais..."
                    className="text-sm resize-none"
                    rows={3}
                  />
                </div>
              )}
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
                        onClick={() => {
                          const url = supabase.storage
                            .from('documentos-comprovantes')
                            .getPublicUrl(p.arquivo_path!).data.publicUrl;
                          openInNewTab(url);
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

          {/* ── Entrega de Uniforme/EPI ── */}
          {isEPI && (
            <>
              {/* Funcionário */}
              <div className="space-y-2">
                <Label>Funcionário *</Label>
                <Select value={form.funcionario_epi} onValueChange={(v) => setForm((f) => ({ ...f, funcionario_epi: v }))}>
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue placeholder="Selecionar funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {epiFuncionarios.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                    {epiFuncionarios.length === 0 && (
                      <SelectItem value="__none__" disabled>Nenhum funcionário ativo</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Itens entregues */}
              <div className="space-y-2">
                <Label>Itens entregues *</Label>
                <div className="space-y-2">
                  {epiItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <Select
                        value={item.tipo}
                        onValueChange={(v) => setEpiItems((prev) => prev.map((it, i) => i === idx ? { ...it, tipo: v } : it))}
                      >
                        <SelectTrigger className="h-10 text-sm flex-1">
                          <SelectValue placeholder="Tipo de item" />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposEPI.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) => setEpiItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantidade: e.target.value } : it))}
                        className="h-10 text-sm w-20 shrink-0"
                        placeholder="Qtd"
                      />
                      {epiItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEpiItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="shrink-0 rounded-full p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1 w-full"
                    onClick={() => setEpiItems((prev) => [...prev, emptyEPIItem()])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar item
                  </Button>
                </div>
              </div>

              {/* Data da entrega */}
              <div className="space-y-2">
                <Label>Data da entrega *</Label>
                <Input
                  type="date"
                  value={form.data_entrega}
                  onChange={(e) => setForm((f) => ({ ...f, data_entrega: e.target.value }))}
                  className="h-12 text-sm"
                />
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label>
                  Observações{' '}
                  <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Informações adicionais..."
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* ── Atestado / Advertência ── */}
          {isPessoalOcorrencia && (
            <>
              {/* Funcionário */}
              <div className="space-y-2">
                <Label>Funcionário *</Label>
                <Select
                  value={form.funcionario_pessoal}
                  onValueChange={(v) => setForm((f) => ({ ...f, funcionario_pessoal: v }))}
                >
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue placeholder="Selecionar funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {epiFuncionarios.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                    {epiFuncionarios.length === 0 && (
                      <SelectItem value="__none__" disabled>Nenhum funcionário ativo</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Data */}
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={form.data_ocorrencia}
                  onChange={(e) => setForm((f) => ({ ...f, data_ocorrencia: e.target.value }))}
                  className="h-12 text-sm"
                />
              </div>

              {/* Observação */}
              <div className="space-y-2">
                <Label>
                  Observação{' '}
                  <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Informações adicionais..."
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>
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
