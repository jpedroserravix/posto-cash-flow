import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, FileText } from 'lucide-react';
import { openInNewTab } from '@/lib/utils';

// ─── types ──────────────────────────────────────────────────────────────────

interface Curso {
  id: string;
  nome: string;
  descricao: string | null;
  validade_meses: number | null;
  obrigatorio: boolean;
  cargos_obrigatorios: string[];
}

interface Treinamento {
  id: string;
  funcionario_id: string;
  curso_id: string;
  data_conclusao: string | null;
  data_vencimento: string | null;
  certificado_path: string | null;
  certificado_type: string | null;
  observacoes: string | null;
}

type TrainingStatus = 'Pendente' | 'Válido' | 'Vencido';

interface TrainingRow {
  curso: Curso;
  treinamento: Treinamento | null;
  status: TrainingStatus;
  isRequired: boolean;
}

interface Props {
  funcionarioId: string;
  cargo: string;
  onUpdate?: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function calcStatus(t: Treinamento | null, hoje: string): TrainingStatus {
  if (!t || !t.data_conclusao) return 'Pendente';
  if (!t.data_vencimento) return 'Válido';
  return t.data_vencimento >= hoje ? 'Válido' : 'Vencido';
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatDate(str: string | null): string {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_CLASS: Record<TrainingStatus, string> = {
  'Válido':   'bg-green-600 hover:bg-green-600 text-white',
  'Vencido':  'bg-red-500 hover:bg-red-500 text-white',
  'Pendente': 'bg-yellow-500 hover:bg-yellow-500 text-white',
};

// ─── component ──────────────────────────────────────────────────────────────

export default function FuncionarioTreinamentos({ funcionarioId, cargo, onUpdate }: Props) {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([]);
  const [loading, setLoading] = useState(false);

  // Registration / edit dialog
  const [regOpen, setRegOpen] = useState(false);
  const [regCurso, setRegCurso] = useState<Curso | null>(null);
  const [regExisting, setRegExisting] = useState<Treinamento | null>(null);
  const [regForm, setRegForm] = useState({ data_conclusao: '', observacoes: '' });
  const [regFile, setRegFile] = useState<File | null>(null);
  const [regSaving, setRegSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Add non-mandatory course dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addCursoId, setAddCursoId] = useState('');

  const hoje = new Date().toISOString().slice(0, 10);

  useEffect(() => { loadAll(); }, [funcionarioId]);

  async function loadAll() {
    setLoading(true);
    const [{ data: cs }, { data: ts }] = await Promise.all([
      (supabase as any).from('cursos').select('*').order('nome'),
      (supabase as any)
        .from('funcionario_treinamentos')
        .select('*')
        .eq('funcionario_id', funcionarioId),
    ]);
    setCursos(cs ?? []);
    setTreinamentos(ts ?? []);
    setLoading(false);
  }

  // Build ordered row list: mandatory first, then any voluntarily added courses
  const rows: TrainingRow[] = (() => {
    const result: TrainingRow[] = [];
    const usedIds = new Set<string>();

    for (const curso of cursos) {
      if (curso.obrigatorio && curso.cargos_obrigatorios?.includes(cargo)) {
        const t = treinamentos.find((t) => t.curso_id === curso.id) ?? null;
        result.push({ curso, treinamento: t, status: calcStatus(t, hoje), isRequired: true });
        usedIds.add(curso.id);
      }
    }

    for (const t of treinamentos) {
      if (!usedIds.has(t.curso_id)) {
        const curso = cursos.find((c) => c.id === t.curso_id);
        if (curso) {
          result.push({ curso, treinamento: t, status: calcStatus(t, hoje), isRequired: false });
          usedIds.add(t.curso_id);
        }
      }
    }

    return result;
  })();

  const availableToAdd = cursos.filter((c) => !rows.some((r) => r.curso.id === c.id));

  function openReg(row: TrainingRow) {
    setRegCurso(row.curso);
    setRegExisting(row.treinamento);
    setRegForm({
      data_conclusao: row.treinamento?.data_conclusao ?? '',
      observacoes: row.treinamento?.observacoes ?? '',
    });
    setRegFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setRegOpen(true);
  }

  async function handleSaveReg() {
    if (!regCurso || !regForm.data_conclusao) {
      toast.error('Informe a data de conclusão');
      return;
    }
    setRegSaving(true);

    let certificado_path = regExisting?.certificado_path ?? null;
    let certificado_type = regExisting?.certificado_type ?? null;

    if (regFile) {
      const ext = regFile.name.split('.').pop();
      const path = `certificados/${funcionarioId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('pessoal-documentos')
        .upload(path, regFile, { upsert: true });
      if (upErr) { toast.error('Erro ao enviar certificado'); setRegSaving(false); return; }
      certificado_path = path;
      certificado_type = regFile.type.startsWith('image/') ? 'image' : 'pdf';
    }

    const data_vencimento = regCurso.validade_meses && regForm.data_conclusao
      ? addMonths(regForm.data_conclusao, regCurso.validade_meses)
      : null;

    const payload = {
      funcionario_id: funcionarioId,
      curso_id: regCurso.id,
      data_conclusao: regForm.data_conclusao,
      data_vencimento,
      certificado_path,
      certificado_type,
      observacoes: regForm.observacoes || null,
    };

    let error;
    if (regExisting) {
      ({ error } = await (supabase as any)
        .from('funcionario_treinamentos')
        .update(payload)
        .eq('id', regExisting.id));
    } else {
      ({ error } = await (supabase as any)
        .from('funcionario_treinamentos')
        .insert(payload));
    }

    setRegSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Treinamento registrado');
    setRegOpen(false);
    await loadAll();
    onUpdate?.();
  }

  function openCertificado(path: string) {
    const { data } = supabase.storage.from('pessoal-documentos').getPublicUrl(path);
    openInNewTab(data.publicUrl);
  }

  function handleAddCourse() {
    if (!addCursoId) return;
    const curso = cursos.find((c) => c.id === addCursoId);
    if (!curso) return;
    setAddOpen(false);
    setAddCursoId('');
    setRegCurso(curso);
    setRegExisting(null);
    setRegForm({ data_conclusao: '', observacoes: '' });
    setRegFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setRegOpen(true);
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-6 text-center">Carregando...</div>;
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <div className="text-xs text-muted-foreground py-4 text-center">
          Nenhum curso obrigatório para o cargo de {cargo}.
        </div>
      )}

      {rows.map(({ curso, treinamento, status, isRequired }) => (
        <div key={curso.id} className="border rounded p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium">{curso.nome}</span>
                {isRequired && (
                  <Badge variant="outline" className="text-[10px] py-0">Obrigatório</Badge>
                )}
                <Badge className={`text-[10px] py-0 ${STATUS_CLASS[status]}`}>{status}</Badge>
              </div>
              {curso.descricao && (
                <div className="text-[10px] text-muted-foreground mt-0.5">{curso.descricao}</div>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              onClick={() => openReg({ curso, treinamento, status, isRequired })}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" />
              {treinamento ? 'Editar' : 'Registrar'}
            </Button>
          </div>

          {treinamento && (
            <div className="pt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground border-t mt-1">
              <div className="pt-1">
                <span>Conclusão: </span>
                <span className="text-foreground">{formatDate(treinamento.data_conclusao)}</span>
              </div>
              <div className="pt-1">
                <span>Vencimento: </span>
                <span className={
                  treinamento.data_vencimento && treinamento.data_vencimento < hoje
                    ? 'text-red-500 font-medium'
                    : 'text-foreground'
                }>
                  {treinamento.data_vencimento ? formatDate(treinamento.data_vencimento) : 'Não vence'}
                </span>
              </div>
              {treinamento.certificado_path && (
                <div className="col-span-2 mt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => openCertificado(treinamento.certificado_path!)}
                  >
                    <FileText className="w-3 h-3" />Ver Certificado
                  </Button>
                </div>
              )}
              {treinamento.observacoes && (
                <div className="col-span-2 italic">{treinamento.observacoes}</div>
              )}
            </div>
          )}
        </div>
      ))}

      {availableToAdd.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />Adicionar Curso
        </Button>
      )}

      {/* ── Add non-mandatory course ─────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Curso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={addCursoId} onValueChange={setAddCursoId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecionar curso" />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAddCourse} disabled={!addCursoId}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Register / edit treinamento ──────────────────────────── */}
      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {regExisting ? 'Editar Treinamento' : 'Registrar Conclusão'}
              {regCurso && <span className="font-normal text-muted-foreground"> — {regCurso.nome}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Data de Conclusão *</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={regForm.data_conclusao}
                onChange={(e) => setRegForm((f) => ({ ...f, data_conclusao: e.target.value }))}
              />
            </div>
            {regCurso?.validade_meses && regForm.data_conclusao && (
              <p className="text-xs text-muted-foreground">
                Vencimento calculado: {formatDate(addMonths(regForm.data_conclusao, regCurso.validade_meses))}
              </p>
            )}
            {regCurso && !regCurso.validade_meses && (
              <p className="text-xs text-muted-foreground">Este curso não vence.</p>
            )}
            <div className="space-y-1">
              <Label className="text-xs">
                Certificado {regExisting?.certificado_path ? '(substituir arquivo)' : '(opcional)'}
              </Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="h-8 text-xs"
                onChange={(e) => setRegFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                value={regForm.observacoes}
                onChange={(e) => setRegForm((f) => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRegOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveReg} disabled={regSaving}>
              {regSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
