import { useState, useRef } from 'react';
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
import { toast } from 'sonner';
import { Camera, Paperclip, Send, X, FileText } from 'lucide-react';

// ─── constants ────────────────────────────────────────────────────────────────

const TURNOS_LEGADO = ['Turno 1', 'Turno 2', 'Turno 3'];
const TURNOS_MANUAL = ['Turno 1', 'Turno 2'];
const CENTROS_CUSTO = ['PISTA', 'CONVENIÊNCIA', 'TROCA DE ÓLEO'];
const NOMES_ALVARA  = [
  'Alvará de Funcionamento',
  'Licença Ambiental',
  'AVCB',
  'Certificado ANP',
  'Licença Sanitária',
  'Outros',
];
const PRAZOS = ['30', '60', '90'];

type Tipo =
  | 'Depósito Manual'
  | 'Documento/Alvará'
  | 'Nota Fiscal/Garantia'
  | 'Despesa'
  | 'Manutenção'
  | 'Outros';

// ─── form state ───────────────────────────────────────────────────────────────

interface FormState {
  // legado + manual
  data_caixa:  string;
  turno:       string;
  centro_custo: string;
  // depósito manual + nota
  valor:       string;
  // alvará
  nome_documento:        string;
  nome_documento_custom: string;
  numero:       string;
  data_vencimento: string;
  // nota fiscal
  fornecedor:   string;
  descricao_item: string;
  data_compra:  string;
  vencimento_garantia: string;
  // shared (alvará + nota)
  prazo_lembrete_dias: string;
  observacoes: string;
}

const emptyForm: FormState = {
  data_caixa:            '',
  turno:                 '',
  centro_custo:          'PISTA',
  valor:                 '',
  nome_documento:        '',
  nome_documento_custom: '',
  numero:                '',
  data_vencimento:       '',
  fornecedor:            '',
  descricao_item:        '',
  data_compra:           '',
  vencimento_garantia:   '',
  prazo_lembrete_dias:   '30',
  observacoes:           '',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseMoney(v: string): number | null {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function EnvioRapido() {
  const { selectedPostoId } = useAuth();

  const [tipo, setTipo]           = useState<Tipo>('Despesa');
  const [form, setForm]           = useState<FormState>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  // ── flags ──────────────────────────────────────────────────────────────────
  const isLegado = tipo === 'Despesa' || tipo === 'Manutenção' || tipo === 'Outros';
  const isManual = tipo === 'Depósito Manual';
  const isAlvara = tipo === 'Documento/Alvará';
  const isNota   = tipo === 'Nota Fiscal/Garantia';

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

  const uploadFile = async (bucket: string, folder: string) => {
    if (!selectedFile) return null;
    const safe = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, selectedFile, { upsert: false, contentType: selectedFile.type });
    if (error) throw error;
    return {
      path,
      fileType: selectedFile.type.startsWith('image/') ? 'image' : 'pdf',
    };
  };

  // ── canSubmit ──────────────────────────────────────────────────────────────
  const canSubmit = (() => {
    if (loading || !selectedPostoId) return false;
    if (isLegado) return !!selectedFile && !!form.data_caixa && !!form.turno;
    if (isManual) return !!form.valor && !!form.data_caixa && !!form.turno;
    if (isAlvara) {
      const nomeOk = !!form.nome_documento &&
        (form.nome_documento !== 'Outros' || !!form.nome_documento_custom);
      return nomeOk && !!selectedFile;
    }
    if (isNota) return !!form.fornecedor && !!form.descricao_item && !!selectedFile;
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

      // ── Documento / Alvará ───────────────────────────────────────────────
      else if (isAlvara) {
        const up = await uploadFile(
          'documentos-comprovantes',
          `alvaras/${selectedPostoId}`,
        );
        if (!up) throw new Error('Upload falhou');
        const nomeDoc = form.nome_documento === 'Outros'
          ? form.nome_documento_custom
          : form.nome_documento;
        const { error } = await (supabase as any).from('documentos_alvaras').insert({
          posto_id:           selectedPostoId,
          nome_documento:     nomeDoc,
          numero:             form.numero || null,
          data_vencimento:    form.data_vencimento || null,
          prazo_lembrete_dias: parseInt(form.prazo_lembrete_dias) || 30,
          observacoes:        form.observacoes || null,
          arquivo_path:       up.path,
          arquivo_type:       up.fileType,
        });
        if (error) throw error;
        toast.success('Documento enviado! Aparecerá em Alvarás e Licenças.');
      }

      // ── Nota Fiscal / Garantia ───────────────────────────────────────────
      else if (isNota) {
        const up = await uploadFile(
          'documentos-comprovantes',
          `notas/${selectedPostoId}`,
        );
        if (!up) throw new Error('Upload falhou');
        const { error } = await (supabase as any).from('notas_fiscais').insert({
          posto_id:           selectedPostoId,
          fornecedor:         form.fornecedor,
          descricao_item:     form.descricao_item,
          valor:              parseMoney(form.valor),
          data_compra:        form.data_compra || null,
          vencimento_garantia: form.vencimento_garantia || null,
          prazo_lembrete_dias: parseInt(form.prazo_lembrete_dias) || 30,
          observacoes:        form.observacoes || null,
          arquivo_path:       up.path,
          arquivo_type:       up.fileType,
        });
        if (error) throw error;
        toast.success('Nota fiscal enviada! Aparecerá em Notas Fiscais e Garantias.');
      }

      // reset
      setSelectedFile(null);
      setForm(emptyForm);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (fileInputRef.current)   fileInputRef.current.value   = '';

    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const previewUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
  const isImage    = selectedFile?.type.startsWith('image/');
  const fileRequired = !isManual; // manual: optional; all others: required

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

      {/* Hidden file inputs */}
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
              }}
            >
              <SelectTrigger className="h-12 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Financeiro</SelectLabel>
                  <SelectItem value="Depósito Manual">Depósito Manual</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Documentos</SelectLabel>
                  <SelectItem value="Documento/Alvará">Documento / Alvará</SelectItem>
                  <SelectItem value="Nota Fiscal/Garantia">Nota Fiscal / Garantia</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Comprovantes</SelectLabel>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                  <SelectItem value="Manutenção">Manutenção</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* ── Arquivo ── */}
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

          {/* ── Documento / Alvará ── */}
          {isAlvara && (
            <>
              <div className="space-y-2">
                <Label>Nome do Documento *</Label>
                <Select value={form.nome_documento} onValueChange={sel('nome_documento')}>
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOMES_ALVARA.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.nome_documento === 'Outros' && (
                <div className="space-y-2">
                  <Label>Nome do Documento (descritivo) *</Label>
                  <Input
                    value={form.nome_documento_custom}
                    onChange={field('nome_documento_custom')}
                    placeholder="Ex: Licença de Publicidade"
                    className="h-12 text-sm"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Número do Documento</Label>
                <Input
                  value={form.numero}
                  onChange={field('numero')}
                  placeholder="Ex: 2024/1234"
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={form.data_vencimento}
                  onChange={field('data_vencimento')}
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Lembrete de Vencimento</Label>
                <Select
                  value={form.prazo_lembrete_dias}
                  onValueChange={sel('prazo_lembrete_dias')}
                >
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRAZOS.map((p) => (
                      <SelectItem key={p} value={p}>{p} dias antes do vencimento</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input
                  value={form.observacoes}
                  onChange={field('observacoes')}
                  placeholder="Observações opcionais"
                  className="h-12 text-sm"
                />
              </div>
            </>
          )}

          {/* ── Nota Fiscal / Garantia ── */}
          {isNota && (
            <>
              <div className="space-y-2">
                <Label>Fornecedor *</Label>
                <Input
                  value={form.fornecedor}
                  onChange={field('fornecedor')}
                  placeholder="Ex: Electrolux, Schulz..."
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição do Item *</Label>
                <Input
                  value={form.descricao_item}
                  onChange={field('descricao_item')}
                  placeholder="Ex: Compressor de ar 50L"
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  value={form.valor}
                  onChange={field('valor')}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Data da Compra</Label>
                <Input
                  type="date"
                  value={form.data_compra}
                  onChange={field('data_compra')}
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Vencimento da Garantia</Label>
                <Input
                  type="date"
                  value={form.vencimento_garantia}
                  onChange={field('vencimento_garantia')}
                  className="h-12 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Lembrete de Garantia</Label>
                <Select
                  value={form.prazo_lembrete_dias}
                  onValueChange={sel('prazo_lembrete_dias')}
                >
                  <SelectTrigger className="h-12 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRAZOS.map((p) => (
                      <SelectItem key={p} value={p}>{p} dias antes do vencimento</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input
                  value={form.observacoes}
                  onChange={field('observacoes')}
                  placeholder="Observações opcionais"
                  className="h-12 text-sm"
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
