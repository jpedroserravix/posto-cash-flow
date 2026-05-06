import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Fuel, Briefcase, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

// ─── types ────────────────────────────────────────────────────────────────────

interface Experiencia {
  cargo: string;
  empresa: string;
  descricao: string;
  inicioMes: string;
  inicioAno: string;
  fimMes: string;
  fimAno: string;
  atual: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCPF(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function rawCPF(masked: string) { return masked.replace(/\D/g, ''); }

function expIsEmpty(e: Experiencia) {
  return !e.cargo.trim() && !e.empresa.trim() && !e.descricao.trim() && !e.inicioMes && !e.inicioAno && !e.fimMes && !e.fimAno && !e.atual;
}

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: ANO_ATUAL - 2009 }, (_, i) => String(ANO_ATUAL - i));

// ─── constants ────────────────────────────────────────────────────────────────

const CIDADES = ['Vitória', 'Serra', 'Vila Velha', 'Cariacica', 'Outra'];

const EMPTY_CURRICULO = { nome: '', cpf: '', rg: '', whatsapp: '', cidadeSel: '', cidadeOutra: '', bairro: '', cargo: '', posto_id: '' };
const EMPTY_FEEDBACK  = { nome: '', tipo: '', mensagem: '' };
const EMPTY_EXP = (): Experiencia => ({ cargo: '', empresa: '', descricao: '', inicioMes: '', inicioAno: '', fimMes: '', fimAno: '', atual: false });

// ─── component ────────────────────────────────────────────────────────────────

export default function Publico() {
  const [cargos, setCargos] = useState<string[]>([]);
  const [cargosLoading, setCargosLoading] = useState(true);
  const [postos, setPostos] = useState<{ id: string; nome: string }[]>([]);
  const [tab, setTab] = useState<'curriculo' | 'feedback'>('curriculo');

  useEffect(() => {
    (supabase as any)
      .from('listas_configuracoes')
      .select('valor')
      .eq('lista', 'cargos_publico')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .then(({ data }: any) => {
        setCargos(data?.map((r: any) => r.valor as string) ?? []);
        setCargosLoading(false);
      });

    (supabase as any)
      .from('postos')
      .select('id, nome')
      .order('nome', { ascending: true })
      .then(({ data }: any) => {
        setPostos(data ?? []);
      });
  }, []);

  // curriculo
  const [curriculo, setCurriculo] = useState({ ...EMPTY_CURRICULO });
  const [experiencias, setExperiencias] = useState<Experiencia[]>([EMPTY_EXP(), EMPTY_EXP(), EMPTY_EXP()]);
  const [curricuFile, setCurricuFile] = useState<File | null>(null);
  const [curriculoSent, setCurriculoSent] = useState(false);
  const [sendingCurriculo, setSendingCurriculo] = useState(false);

  // feedback
  const [feedback, setFeedback] = useState({ ...EMPTY_FEEDBACK });
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);

  function setExp(index: number, patch: Partial<Experiencia>) {
    setExperiencias((prev) => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  }

  // ── submit curriculo ────────────────────────────────────────────────────────

  async function handleSubmitCurriculo() {
    if (!curriculo.nome.trim()) { toast.error('Informe o nome completo'); return; }
    if (rawCPF(curriculo.cpf).length < 11) { toast.error('CPF inválido'); return; }
    if (!curriculo.whatsapp.trim()) { toast.error('Informe o WhatsApp'); return; }
    const cidadeFinal = curriculo.cidadeSel === 'Outra' ? curriculo.cidadeOutra.trim() : curriculo.cidadeSel;
    if (!cidadeFinal) { toast.error('Informe a cidade'); return; }
    if (!curriculo.bairro.trim()) { toast.error('Informe o bairro'); return; }
    if (!curriculo.cargo) { toast.error('Selecione o cargo desejado'); return; }
    if (curricuFile && curricuFile.size > 5 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 5MB'); return; }

    setSendingCurriculo(true);

    let arquivo_path: string | null = null;
    let arquivo_type: string | null = null;

    if (curricuFile) {
      const ext = curricuFile.name.split('.').pop()?.toLowerCase();
      const path = `curriculos/${Date.now()}-${rawCPF(curriculo.cpf)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('curriculos-publico')
        .upload(path, curricuFile, { contentType: curricuFile.type });
      if (upErr) {
        toast.error('Erro ao enviar arquivo. Tente novamente.');
        setSendingCurriculo(false);
        return;
      }
      arquivo_path = path;
      arquivo_type = curricuFile.type;
    }

    // Serialize only non-empty blocks
    const expsToSave = experiencias
      .filter((e) => !expIsEmpty(e))
      .map((e) => ({
        cargo:     e.cargo.trim(),
        empresa:   e.empresa.trim(),
        descricao: e.descricao.trim() || undefined,
        inicio:    e.inicioMes && e.inicioAno ? `${e.inicioMes}/${e.inicioAno}` : '',
        fim:       e.atual ? 'Atual' : (e.fimMes && e.fimAno ? `${e.fimMes}/${e.fimAno}` : ''),
      }));

    const { error } = await (supabase as any).from('publico_curriculos').insert({
      nome:          curriculo.nome.trim(),
      cpf:           rawCPF(curriculo.cpf),
      rg:            curriculo.rg.trim() || null,
      whatsapp:      curriculo.whatsapp.trim(),
      cidade:        cidadeFinal,
      bairro:        curriculo.bairro.trim(),
      posto_id:      curriculo.posto_id || null,
      cargo_desejado: curriculo.cargo,
      experiencia:   JSON.stringify(expsToSave),
      arquivo_path,
      arquivo_type,
    });

    if (error) { toast.error('Erro ao enviar. Tente novamente.'); setSendingCurriculo(false); return; }

    setCurriculoSent(true);
    setSendingCurriculo(false);
  }

  // ── submit feedback ─────────────────────────────────────────────────────────

  async function handleSubmitFeedback() {
    if (!feedback.tipo) { toast.error('Selecione o tipo'); return; }
    if (!feedback.mensagem.trim()) { toast.error('Escreva uma mensagem'); return; }

    setSendingFeedback(true);

    const { error } = await (supabase as any).from('publico_feedback').insert({
      nome:     feedback.nome.trim() || null,
      tipo:     feedback.tipo,
      mensagem: feedback.mensagem.trim(),
    });

    if (error) { toast.error('Erro ao enviar. Tente novamente.'); setSendingFeedback(false); return; }

    setFeedbackSent(true);
    setSendingFeedback(false);
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50">
      <Toaster richColors position="top-center" />

      {/* Header */}
      <header className="bg-gradient-to-r from-slate-800 via-slate-800 to-blue-900 px-4 py-5 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
            <Fuel className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight tracking-wider text-white">POSTO INTELIGENTE</div>
            <div className="text-xs text-blue-200 leading-tight">Fale conosco</div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Tab selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTab('curriculo')}
            className={`flex flex-col items-center gap-2 py-5 px-3 rounded-2xl border-2 transition-all active:scale-95 ${
              tab === 'curriculo'
                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600'
            }`}
          >
            <Briefcase className="w-7 h-7" />
            <span className="text-sm font-semibold leading-snug text-center">Trabalhe<br/>Conosco</span>
          </button>
          <button
            onClick={() => setTab('feedback')}
            className={`flex flex-col items-center gap-2 py-5 px-3 rounded-2xl border-2 transition-all active:scale-95 ${
              tab === 'feedback'
                ? 'border-purple-600 bg-purple-600 text-white shadow-lg shadow-purple-200'
                : 'border-slate-200 bg-white text-slate-500 hover:border-purple-200 hover:text-purple-600'
            }`}
          >
            <MessageSquare className="w-7 h-7" />
            <span className="text-sm font-semibold leading-snug text-center">Sugestões &<br/>Feedback</span>
          </button>
        </div>

        {/* ── Curriculo section ─────────────────────────────────────────── */}
        {tab === 'curriculo' && (
          curriculoSent ? (
            <div className="bg-white rounded-2xl border shadow-sm p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-green-700">Currículo enviado com sucesso!</p>
                <p className="text-sm text-muted-foreground mt-1">Entraremos em contato em breve.</p>
              </div>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setCurriculoSent(false);
                  setCurriculo({ ...EMPTY_CURRICULO });
                  setExperiencias([EMPTY_EXP(), EMPTY_EXP(), EMPTY_EXP()]);
                  setCurricuFile(null);
                  // posto_id já está em EMPTY_CURRICULO como ''
                }}
              >
                Enviar outro currículo
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <h2 className="font-semibold text-base">Envie seu currículo</h2>
              </div>

              <div className="space-y-4">
                {/* Nome */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nome completo *</Label>
                  <Input
                    className="h-12 text-base"
                    placeholder="Seu nome completo"
                    value={curriculo.nome}
                    onChange={(e) => setCurriculo((f) => ({ ...f, nome: e.target.value }))}
                  />
                </div>

                {/* CPF + RG */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">CPF *</Label>
                    <Input
                      className="h-12 text-base"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      value={curriculo.cpf}
                      onChange={(e) => setCurriculo((f) => ({ ...f, cpf: formatCPF(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">RG</Label>
                    <Input
                      className="h-12 text-base"
                      placeholder="Opcional"
                      value={curriculo.rg}
                      onChange={(e) => setCurriculo((f) => ({ ...f, rg: e.target.value }))}
                    />
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">WhatsApp *</Label>
                  <Input
                    className="h-12 text-base"
                    placeholder="(00) 00000-0000"
                    type="tel"
                    value={curriculo.whatsapp}
                    onChange={(e) => setCurriculo((f) => ({ ...f, whatsapp: e.target.value }))}
                  />
                </div>

                {/* Cidade + Bairro */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Cidade *</Label>
                    <Select
                      value={curriculo.cidadeSel}
                      onValueChange={(v) => setCurriculo((f) => ({ ...f, cidadeSel: v, cidadeOutra: '' }))}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {CIDADES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {curriculo.cidadeSel === 'Outra' && (
                      <Input
                        className="h-12 text-base mt-2"
                        placeholder="Digite a cidade"
                        value={curriculo.cidadeOutra}
                        onChange={(e) => setCurriculo((f) => ({ ...f, cidadeOutra: e.target.value }))}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Bairro *</Label>
                    <Input
                      className="h-12 text-base"
                      value={curriculo.bairro}
                      onChange={(e) => setCurriculo((f) => ({ ...f, bairro: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Posto desejado */}
                {postos.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Posto desejado</Label>
                    <Select
                      value={curriculo.posto_id}
                      onValueChange={(v) => setCurriculo((f) => ({ ...f, posto_id: v === '__nenhum__' ? '' : v }))}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Selecionar posto (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__nenhum__">Qualquer posto</SelectItem>
                        {postos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Cargo desejado */}
                {!cargosLoading && cargos.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 text-center">
                    Nenhuma vaga aberta no momento.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Cargo desejado *</Label>
                    <Select
                      value={curriculo.cargo}
                      onValueChange={(v) => setCurriculo((f) => ({ ...f, cargo: v }))}
                      disabled={cargosLoading}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder={cargosLoading ? 'Carregando...' : 'Selecionar cargo'} />
                      </SelectTrigger>
                      <SelectContent>
                        {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Experiências estruturadas */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Descreva suas últimas 3 experiências</p>

                  {experiencias.map((exp, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3"
                      >
                        <span className="text-sm font-bold text-slate-500">{i + 1}.</span>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Cargo</Label>
                            <Input
                              className="h-10 text-sm"
                              value={exp.cargo}
                              onChange={(e) => setExp(i, { cargo: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Empresa</Label>
                            <Input
                              className="h-10 text-sm"
                              value={exp.empresa}
                              onChange={(e) => setExp(i, { empresa: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Período início */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Início</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={exp.inicioMes} onValueChange={(v) => setExp(i, { inicioMes: v })}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Mês" /></SelectTrigger>
                              <SelectContent>
                                {MESES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select value={exp.inicioAno} onValueChange={(v) => setExp(i, { inicioAno: v })}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Ano" /></SelectTrigger>
                              <SelectContent>
                                {ANOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Período fim */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fim</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Select
                              value={exp.atual ? '__atual__' : exp.fimMes}
                              onValueChange={(v) => setExp(i, { fimMes: v })}
                              disabled={exp.atual}
                            >
                              <SelectTrigger className="h-10 text-sm">
                                <SelectValue placeholder={exp.atual ? 'Atual' : 'Mês'} />
                              </SelectTrigger>
                              <SelectContent>
                                {MESES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select
                              value={exp.atual ? '__atual__' : exp.fimAno}
                              onValueChange={(v) => setExp(i, { fimAno: v })}
                              disabled={exp.atual}
                            >
                              <SelectTrigger className="h-10 text-sm">
                                <SelectValue placeholder={exp.atual ? 'Atual' : 'Ano'} />
                              </SelectTrigger>
                              <SelectContent>
                                {ANOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`atual-${i}`}
                            checked={exp.atual}
                            onCheckedChange={(v) => setExp(i, { atual: !!v, fimMes: '', fimAno: '' })}
                          />
                          <label htmlFor={`atual-${i}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                            Trabalho aqui atualmente
                          </label>
                        </div>

                        {/* Descrição */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Descrição</Label>
                          <Textarea
                            className="text-sm min-h-[72px] resize-none"
                            value={exp.descricao}
                            onChange={(e) => setExp(i, { descricao: e.target.value })}
                          />
                        </div>
                      </div>
                    ))}
                </div>

                {/* Arquivo */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Currículo</Label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="h-12 text-sm file:mr-3 file:h-8 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium"
                    onChange={(e) => setCurricuFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">Opcional · PDF, JPEG ou PNG · Máximo 5 MB</p>
                </div>
              </div>

              <Button
                className="w-full text-base font-semibold bg-blue-600 hover:bg-blue-700 rounded-xl"
                style={{ height: '52px' }}
                onClick={handleSubmitCurriculo}
                disabled={sendingCurriculo || cargosLoading || cargos.length === 0}
              >
                {sendingCurriculo ? 'Enviando...' : 'Enviar Currículo'}
              </Button>
            </div>
          )
        )}

        {/* ── Feedback section ──────────────────────────────────────────── */}
        {tab === 'feedback' && (
          feedbackSent ? (
            <div className="bg-white rounded-2xl border shadow-sm p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-purple-700">Obrigado pelo seu feedback!</p>
                <p className="text-sm text-muted-foreground mt-1">Sua mensagem foi recebida com sucesso.</p>
              </div>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => { setFeedbackSent(false); setFeedback({ ...EMPTY_FEEDBACK }); }}
              >
                Enviar outro feedback
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                <div>
                  <h2 className="font-semibold text-base leading-tight">Envie seu feedback</h2>
                  <p className="text-xs text-muted-foreground">Você pode enviar de forma anônima.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Seu nome</Label>
                  <Input
                    className="h-12 text-base"
                    placeholder="Opcional — deixe em branco para ser anônimo"
                    value={feedback.nome}
                    onChange={(e) => setFeedback((f) => ({ ...f, nome: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Tipo *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Elogio', 'Sugestão', 'Crítica'] as const).map((tipo) => {
                      const active = feedback.tipo === tipo;
                      const colorMap: Record<string, string> = {
                        Elogio:   active ? 'border-green-600 bg-green-600 text-white' : 'border-slate-200 text-slate-600 hover:border-green-300',
                        Sugestão: active ? 'border-blue-600 bg-blue-600 text-white'   : 'border-slate-200 text-slate-600 hover:border-blue-300',
                        Crítica:  active ? 'border-red-600 bg-red-600 text-white'     : 'border-slate-200 text-slate-600 hover:border-red-300',
                      };
                      return (
                        <button
                          key={tipo}
                          onClick={() => setFeedback((f) => ({ ...f, tipo }))}
                          className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all active:scale-95 ${colorMap[tipo]}`}
                        >
                          {tipo}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Mensagem *</Label>
                  <Textarea
                    className="text-base min-h-[130px] resize-none"
                    placeholder="Escreva sua mensagem aqui..."
                    value={feedback.mensagem}
                    onChange={(e) => setFeedback((f) => ({ ...f, mensagem: e.target.value }))}
                  />
                </div>
              </div>

              <Button
                className="w-full text-base font-semibold bg-purple-600 hover:bg-purple-700 rounded-xl"
                style={{ height: '52px' }}
                onClick={handleSubmitFeedback}
                disabled={sendingFeedback}
              >
                {sendingFeedback ? 'Enviando...' : 'Enviar Feedback'}
              </Button>
            </div>
          )
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Posto Inteligente · Todos os direitos reservados
        </p>
      </main>
    </div>
  );
}
