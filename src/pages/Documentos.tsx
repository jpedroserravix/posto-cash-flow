import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Copy, Paperclip, FileText, X, Save, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';

// ─── helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr + 'T00:00:00');
  const now = new Date(todayStr() + 'T00:00:00');
  return Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
}

type DocStatus = 'ok' | 'proximo' | 'vencido';

function computeStatus(days: number | null, lembrete: number): DocStatus {
  if (days === null) return 'ok';
  if (days < 0) return 'vencido';
  if (days <= lembrete) return 'proximo';
  return 'ok';
}

const STATUS_ORDER: Record<DocStatus, number> = { vencido: 0, proximo: 1, ok: 2 };

function StatusBadge({ status }: { status: DocStatus }) {
  if (status === 'vencido')
    return <Badge className="bg-red-500 hover:bg-red-500 text-white text-[10px] whitespace-nowrap">Vencido</Badge>;
  if (status === 'proximo')
    return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white text-[10px] whitespace-nowrap">Próximo de Vencer</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">OK</Badge>;
}

function DaysCell({ days, lembrete }: { days: number | null; lembrete: number }) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  if (days < 0)
    return <span className="text-red-600 font-bold">{Math.abs(days)}d atrás</span>;
  if (days <= lembrete)
    return <span className="text-yellow-600 font-medium">{days}d</span>;
  return <span>{days}d</span>;
}

// ─── types ──────────────────────────────────────────────────────────────────

interface AlvaraDoc {
  id: string;
  posto_id: string;
  nome_documento: string;
  numero: string | null;
  data_vencimento: string | null;
  prazo_lembrete_dias: number;
  observacoes: string | null;
  arquivo_path: string | null;
  arquivo_type: string | null;
}

interface NotaDoc {
  id: string;
  posto_id: string;
  fornecedor: string;
  descricao_item: string;
  valor: number | null;
  data_compra: string | null;
  vencimento_garantia: string | null;
  prazo_lembrete_dias: number;
  observacoes: string | null;
  arquivo_path: string | null;
  arquivo_type: string | null;
}

interface EmpresaDoc {
  id: string;
  posto_id: string;
  tipo: string;
  tipo_custom: string | null;
  numero: string | null;
  observacoes: string | null;
  arquivo_path: string | null;
  arquivo_type: string | null;
}

interface PreviewFile {
  url: string;
  type: 'image' | 'pdf';
}

const TIPOS_EMPRESA = [
  'Cartão CNPJ',
  'Contrato Social',
  'Inscrição Estadual',
  'Inscrição Municipal',
  'Certidão Negativa',
  'Outros',
] as const;

const emptyAlvForm = {
  posto_id: '', nome_documento: '', numero: '',
  data_vencimento: '', prazo_lembrete_dias: '30', observacoes: '',
};

const emptyNotForm = {
  posto_id: '', fornecedor: '', descricao_item: '', valor: '',
  data_compra: '', vencimento_garantia: '', prazo_lembrete_dias: '30', observacoes: '',
};

const emptyEmpForm = {
  posto_id: '', tipo: '', tipo_custom: '', numero: '', observacoes: '',
};

// ─── main component ──────────────────────────────────────────────────────────

export default function Documentos() {
  const location = useLocation();
  const isAlvaras = location.pathname === '/alvaras';
  const isEmpresa = location.pathname === '/docs-empresa';

  const { role, allPostos, selectedPostoId } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = role === 'admin';
  // show posto selector when admin or multi-posto user
  const showPostoSelector = allPostos.length > 0;
  const autoPostoId = showPostoSelector ? '' : (selectedPostoId || '');

  // ── alvarás state ──────────────────────────────────────────────────────────
  const [alvaras, setAlvaras] = useState<AlvaraDoc[]>([]);
  const [alvFormOpen, setAlvFormOpen] = useState(false);
  const [alvEditId, setAlvEditId] = useState<string | null>(null);
  const [alvForm, setAlvForm] = useState(emptyAlvForm);
  const [alvFile, setAlvFile] = useState<File | null>(null);
  const alvFileRef = useRef<HTMLInputElement>(null);

  // ── notas state ────────────────────────────────────────────────────────────
  const [notas, setNotas] = useState<NotaDoc[]>([]);
  const [notFormOpen, setNotFormOpen] = useState(false);
  const [notEditId, setNotEditId] = useState<string | null>(null);
  const [notForm, setNotForm] = useState(emptyNotForm);
  const [notFile, setNotFile] = useState<File | null>(null);
  const notFileRef = useRef<HTMLInputElement>(null);

  // ── empresa state ──────────────────────────────────────────────────────────
  const [empresa, setEmpresa] = useState<EmpresaDoc[]>([]);
  const [empFormOpen, setEmpFormOpen] = useState(false);
  const [empEditId, setEmpEditId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState(emptyEmpForm);
  const [empFile, setEmpFile] = useState<File | null>(null);
  const empFileRef = useRef<HTMLInputElement>(null);

  // ── shared filter/ui state ─────────────────────────────────────────────────
  const [filterPostoId, setFilterPostoId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFornecedor, setFilterFornecedor] = useState('');
  const [searchDescricao, setSearchDescricao] = useState('');
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── postos lookup ──────────────────────────────────────────────────────────
  const postoNomeMap = useMemo(() => {
    const m: Record<string, string> = {};
    allPostos.forEach((p) => { m[p.id] = p.nome; });
    return m;
  }, [allPostos]);

  // ── data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAlvaras) loadAlvaras();
    else if (isEmpresa) loadEmpresa();
    else loadNotas();
  }, [isAlvaras, isEmpresa, selectedPostoId]);

  const loadAlvaras = async () => {
    const { data, error } = await (supabase as any)
      .from('documentos_alvaras')
      .select('*')
      .order('data_vencimento', { ascending: true, nullsFirst: false });
    if (error) { console.error(error); return; }
    setAlvaras(data || []);
  };

  const loadNotas = async () => {
    const { data, error } = await (supabase as any)
      .from('notas_fiscais')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    setNotas(data || []);
  };

  const loadEmpresa = async () => {
    const { data, error } = await (supabase as any)
      .from('documentos_empresa')
      .select('*')
      .order('tipo', { ascending: true });
    if (error) { console.error(error); return; }
    setEmpresa(data || []);
  };

  const getUrl = (path: string) =>
    supabase.storage.from('documentos-comprovantes').getPublicUrl(path).data.publicUrl;

  const uploadFile = async (file: File, folder: string) => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage
      .from('documentos-comprovantes')
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return {
      path,
      type: file.type.startsWith('image/') ? ('image' as const) : ('pdf' as const),
    };
  };

  // ── alvarás CRUD ───────────────────────────────────────────────────────────
  const openAlvNew = () => {
    setAlvEditId(null);
    setAlvForm({ ...emptyAlvForm, posto_id: autoPostoId });
    setAlvFile(null);
    setAlvFormOpen(true);
  };

  const openAlvEdit = (d: AlvaraDoc) => {
    setAlvEditId(d.id);
    setAlvForm({
      posto_id: d.posto_id,
      nome_documento: d.nome_documento,
      numero: d.numero || '',
      data_vencimento: d.data_vencimento || '',
      prazo_lembrete_dias: d.prazo_lembrete_dias.toString(),
      observacoes: d.observacoes || '',
    });
    setAlvFile(null);
    setAlvFormOpen(true);
  };

  const handleAlvSubmit = async () => {
    if (!alvForm.nome_documento) { toast.error('Informe o nome do documento'); return; }
    const postoId = alvForm.posto_id || autoPostoId;
    if (!postoId) { toast.error('Selecione o posto'); return; }

    try {
      let arquivo_path: string | null = null;
      let arquivo_type: string | null = null;
      if (alvFile) {
        const up = await uploadFile(alvFile, `alvaras/${postoId}`);
        arquivo_path = up.path;
        arquivo_type = up.type;
      }

      const record: any = {
        posto_id: postoId,
        nome_documento: alvForm.nome_documento,
        numero: alvForm.numero || null,
        data_vencimento: alvForm.data_vencimento || null,
        prazo_lembrete_dias: parseInt(alvForm.prazo_lembrete_dias) || 30,
        observacoes: alvForm.observacoes || null,
        ...(arquivo_path ? { arquivo_path, arquivo_type } : {}),
      };

      if (alvEditId) {
        const { error } = await (supabase as any).from('documentos_alvaras').update(record).eq('id', alvEditId);
        if (error) throw error;
        toast.success('Documento atualizado');
      } else {
        const { error } = await (supabase as any).from('documentos_alvaras').insert(record);
        if (error) throw error;
        toast.success('Documento adicionado');
      }
      setAlvFormOpen(false);
      loadAlvaras();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  const handleAlvDelete = async (id: string) => {
    const { error } = await (supabase as any).from('documentos_alvaras').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Excluído');
    setDeletingId(null);
    loadAlvaras();
  };

  // ── notas CRUD ─────────────────────────────────────────────────────────────
  const openNotNew = () => {
    setNotEditId(null);
    setNotForm({ ...emptyNotForm, posto_id: autoPostoId });
    setNotFile(null);
    setNotFormOpen(true);
  };

  const openNotEdit = (d: NotaDoc) => {
    setNotEditId(d.id);
    setNotForm({
      posto_id: d.posto_id,
      fornecedor: d.fornecedor,
      descricao_item: d.descricao_item,
      valor: d.valor?.toString() || '',
      data_compra: d.data_compra || '',
      vencimento_garantia: d.vencimento_garantia || '',
      prazo_lembrete_dias: d.prazo_lembrete_dias.toString(),
      observacoes: d.observacoes || '',
    });
    setNotFile(null);
    setNotFormOpen(true);
  };

  const handleNotSubmit = async () => {
    if (!notForm.fornecedor) { toast.error('Informe o fornecedor'); return; }
    if (!notForm.descricao_item) { toast.error('Informe a descrição do item'); return; }
    const postoId = notForm.posto_id || autoPostoId;
    if (!postoId) { toast.error('Selecione o posto'); return; }

    try {
      let arquivo_path: string | null = null;
      let arquivo_type: string | null = null;
      if (notFile) {
        const up = await uploadFile(notFile, `notas/${postoId}`);
        arquivo_path = up.path;
        arquivo_type = up.type;
      }

      const record: any = {
        posto_id: postoId,
        fornecedor: notForm.fornecedor,
        descricao_item: notForm.descricao_item,
        valor: notForm.valor ? parseFloat(notForm.valor.replace(/\./g, '').replace(',', '.')) : null,
        data_compra: notForm.data_compra || null,
        vencimento_garantia: notForm.vencimento_garantia || null,
        prazo_lembrete_dias: parseInt(notForm.prazo_lembrete_dias) || 30,
        observacoes: notForm.observacoes || null,
        ...(arquivo_path ? { arquivo_path, arquivo_type } : {}),
      };

      if (notEditId) {
        const { error } = await (supabase as any).from('notas_fiscais').update(record).eq('id', notEditId);
        if (error) throw error;
        toast.success('Nota atualizada');
      } else {
        const { error } = await (supabase as any).from('notas_fiscais').insert(record);
        if (error) throw error;
        toast.success('Nota adicionada');
      }
      setNotFormOpen(false);
      loadNotas();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  const handleNotDelete = async (id: string) => {
    const { error } = await (supabase as any).from('notas_fiscais').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Excluído');
    setDeletingId(null);
    loadNotas();
  };

  // ── empresa CRUD ───────────────────────────────────────────────────────────
  const openEmpNew = () => {
    setEmpEditId(null);
    setEmpForm({ ...emptyEmpForm, posto_id: autoPostoId });
    setEmpFile(null);
    setEmpFormOpen(true);
  };

  const openEmpEdit = (d: EmpresaDoc) => {
    setEmpEditId(d.id);
    setEmpForm({
      posto_id: d.posto_id,
      tipo: d.tipo,
      tipo_custom: d.tipo_custom || '',
      numero: d.numero || '',
      observacoes: d.observacoes || '',
    });
    setEmpFile(null);
    setEmpFormOpen(true);
  };

  const handleEmpSubmit = async () => {
    if (!empForm.tipo) { toast.error('Selecione o tipo de documento'); return; }
    if (empForm.tipo === 'Outros' && !empForm.tipo_custom) { toast.error('Informe o tipo do documento'); return; }
    const postoId = empForm.posto_id || autoPostoId;
    if (!postoId) { toast.error('Selecione o posto'); return; }

    try {
      let arquivo_path: string | null = null;
      let arquivo_type: string | null = null;
      if (empFile) {
        const up = await uploadFile(empFile, `empresa/${postoId}`);
        arquivo_path = up.path;
        arquivo_type = up.type;
      }

      const record: any = {
        posto_id: postoId,
        tipo: empForm.tipo,
        tipo_custom: empForm.tipo === 'Outros' ? (empForm.tipo_custom || null) : null,
        numero: empForm.numero || null,
        observacoes: empForm.observacoes || null,
        ...(arquivo_path ? { arquivo_path, arquivo_type } : {}),
      };

      if (empEditId) {
        const { error } = await (supabase as any).from('documentos_empresa').update(record).eq('id', empEditId);
        if (error) throw error;
        toast.success('Documento atualizado');
      } else {
        const { error } = await (supabase as any).from('documentos_empresa').insert(record);
        if (error) throw error;
        toast.success('Documento adicionado');
      }
      setEmpFormOpen(false);
      loadEmpresa();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  const handleEmpDelete = async (id: string) => {
    const { error } = await (supabase as any).from('documentos_empresa').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Excluído');
    setDeletingId(null);
    loadEmpresa();
  };

  // ── derived: alvarás ───────────────────────────────────────────────────────
  const processedAlvaras = useMemo(() => {
    let list = alvaras.map((d) => {
      const days = daysUntil(d.data_vencimento);
      const status = computeStatus(days, d.prazo_lembrete_dias);
      return { ...d, days, status };
    });
    if (filterPostoId) list = list.filter((d) => d.posto_id === filterPostoId);
    if (filterStatus) list = list.filter((d) => d.status === filterStatus);
    list.sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (so !== 0) return so;
      return (a.days ?? 9999) - (b.days ?? 9999);
    });
    return list;
  }, [alvaras, filterPostoId, filterStatus]);

  // ── derived: notas ─────────────────────────────────────────────────────────
  const uniqueFornecedores = useMemo(
    () => [...new Set(notas.map((d) => d.fornecedor))].sort(),
    [notas],
  );

  const processedNotas = useMemo(() => {
    let list = notas.map((d) => {
      const days = daysUntil(d.vencimento_garantia);
      const status = computeStatus(days, d.prazo_lembrete_dias);
      return { ...d, days, status };
    });
    if (filterPostoId) list = list.filter((d) => d.posto_id === filterPostoId);
    if (filterStatus) list = list.filter((d) => d.status === filterStatus);
    if (filterFornecedor) list = list.filter((d) => d.fornecedor === filterFornecedor);
    if (searchDescricao)
      list = list.filter((d) =>
        d.descricao_item.toLowerCase().includes(searchDescricao.toLowerCase()),
      );
    list.sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (so !== 0) return so;
      return (a.days ?? 9999) - (b.days ?? 9999);
    });
    return list;
  }, [notas, filterPostoId, filterStatus, filterFornecedor, searchDescricao]);

  // ── derived: empresa ──────────────────────────────────────────────────────
  const processedEmpresa = useMemo(() => {
    let list = [...empresa];
    if (filterPostoId) list = list.filter((d) => d.posto_id === filterPostoId);
    list.sort((a, b) => {
      const ta = a.tipo === 'Outros' ? (a.tipo_custom || 'z') : a.tipo;
      const tb = b.tipo === 'Outros' ? (b.tipo_custom || 'z') : b.tipo;
      return ta.localeCompare(tb, 'pt-BR');
    });
    return list;
  }, [empresa, filterPostoId]);

  // ── utils ──────────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success('Número copiado'));

  const formatDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  const formatCurrency = (v: number | null) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

  const rowBg = (status: DocStatus) =>
    status === 'vencido'
      ? 'bg-red-50 dark:bg-red-950/20'
      : status === 'proximo'
        ? 'bg-yellow-50 dark:bg-yellow-950/20'
        : '';

  // ─────────────────────────────────────────────────────────────────────────
  // render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {isAlvaras ? 'Alvarás e Licenças' : isEmpresa ? 'Documentos da Empresa' : 'Notas Fiscais e Garantias'}
        </h1>
        <Button size="sm" onClick={isAlvaras ? openAlvNew : isEmpresa ? openEmpNew : openNotNew}>
          <Plus className="w-4 h-4 mr-1" />Adicionar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {showPostoSelector && (
          <Select
            value={filterPostoId || '__all__'}
            onValueChange={(v) => setFilterPostoId(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <SelectValue placeholder="Todos os postos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os postos</SelectItem>
              {allPostos.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {!isEmpresa && (
          <Select
            value={filterStatus || '__all__'}
            onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[170px] text-sm">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="proximo">Próximo de Vencer</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
            </SelectContent>
          </Select>
        )}

        {!isAlvaras && !isEmpresa && (
          <>
            <Select
              value={filterFornecedor || '__all__'}
              onValueChange={(v) => setFilterFornecedor(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="h-9 w-[180px] text-sm">
                <SelectValue placeholder="Todos os fornecedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os fornecedores</SelectItem>
                {uniqueFornecedores.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar por descrição..."
              value={searchDescricao}
              onChange={(e) => setSearchDescricao(e.target.value)}
              className="h-9 w-[200px] text-sm"
            />
          </>
        )}
      </div>

      {/* ── Alvarás table ── */}
      {isAlvaras && (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            {processedAlvaras.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">
                Nenhum documento cadastrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Documento</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Número</th>
                    {showPostoSelector && (
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Posto</th>
                    )}
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Vencimento</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Dias</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Observações</th>
                    <th className="px-3 py-2" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {processedAlvaras.map((d) => (
                    <TableRow key={d.id} className={rowBg(d.status)}>
                      <TableCell className="text-xs font-medium px-3">{d.nome_documento}</TableCell>
                      <TableCell className="text-xs px-3">
                        {d.numero ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono">{d.numero}</span>
                            <button
                              onClick={() => copyToClipboard(d.numero!)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Copiar número"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {showPostoSelector && (
                        <TableCell className="text-xs px-3">{postoNomeMap[d.posto_id] || '—'}</TableCell>
                      )}
                      <TableCell className="text-xs px-3">{formatDate(d.data_vencimento)}</TableCell>
                      <TableCell className="text-xs px-3">
                        <DaysCell days={d.days} lembrete={d.prazo_lembrete_dias} />
                      </TableCell>
                      <TableCell className="px-3">
                        <StatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-xs px-3 max-w-[160px] truncate">
                        {d.observacoes || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1">
                          {d.arquivo_path && (
                            <FilePreviewButton
                              path={d.arquivo_path}
                              type={d.arquivo_type}
                              getUrl={getUrl}
                              onOpen={setPreviewFile}
                            />
                          )}
                          <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => openAlvEdit(d)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeletingId(d.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Notas table ── */}
      {!isAlvaras && !isEmpresa && (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            {processedNotas.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">
                Nenhuma nota fiscal cadastrada.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Fornecedor</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Descrição</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Valor</th>
                    {showPostoSelector && (
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Posto</th>
                    )}
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Data Compra</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Venc. Garantia</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Dias</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {processedNotas.map((d) => (
                    <TableRow key={d.id} className={rowBg(d.status)}>
                      <TableCell className="text-xs font-medium px-3 whitespace-nowrap">{d.fornecedor}</TableCell>
                      <TableCell
                        className="text-xs px-3 max-w-[200px] truncate"
                        title={d.descricao_item}
                      >
                        {d.descricao_item}
                      </TableCell>
                      <TableCell className="text-xs px-3 font-medium whitespace-nowrap">
                        {formatCurrency(d.valor)}
                      </TableCell>
                      {showPostoSelector && (
                        <TableCell className="text-xs px-3 whitespace-nowrap">
                          {postoNomeMap[d.posto_id] || '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-xs px-3 whitespace-nowrap">{formatDate(d.data_compra)}</TableCell>
                      <TableCell className="text-xs px-3 whitespace-nowrap">{formatDate(d.vencimento_garantia)}</TableCell>
                      <TableCell className="text-xs px-3">
                        {d.vencimento_garantia ? (
                          <DaysCell days={d.days} lembrete={d.prazo_lembrete_dias} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3">
                        {d.vencimento_garantia ? (
                          <StatusBadge status={d.status} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem garantia</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1">
                          {d.arquivo_path && (
                            <FilePreviewButton
                              path={d.arquivo_path}
                              type={d.arquivo_type}
                              getUrl={getUrl}
                              onOpen={setPreviewFile}
                            />
                          )}
                          <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => openNotEdit(d)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeletingId(d.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Empresa table ── */}
      {isEmpresa && (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            {processedEmpresa.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">
                Nenhum documento cadastrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Tipo</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Número / Valor</th>
                    {showPostoSelector && (
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Posto</th>
                    )}
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Observações</th>
                    <th className="px-3 py-2" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {processedEmpresa.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs font-medium px-3 whitespace-nowrap">
                        {d.tipo === 'Outros' ? (d.tipo_custom || 'Outros') : d.tipo}
                      </TableCell>
                      <TableCell className="text-xs px-3">
                        {d.numero ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono">{d.numero}</span>
                            <button
                              onClick={() => copyToClipboard(d.numero!)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Copiar"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {showPostoSelector && (
                        <TableCell className="text-xs px-3 whitespace-nowrap">
                          {postoNomeMap[d.posto_id] || '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-xs px-3 max-w-[200px] truncate">
                        {d.observacoes || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1">
                          {d.arquivo_path && (
                            <FilePreviewButton
                              path={d.arquivo_path}
                              type={d.arquivo_type}
                              getUrl={getUrl}
                              onOpen={setPreviewFile}
                            />
                          )}
                          <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => openEmpEdit(d)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeletingId(d.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Alvarás form dialog ── */}
      <Dialog open={alvFormOpen} onOpenChange={setAlvFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{alvEditId ? 'Editar Documento' : 'Novo Documento'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {showPostoSelector && (
              <div>
                <Label className="text-xs">Posto *</Label>
                <Select
                  value={alvForm.posto_id}
                  onValueChange={(v) => setAlvForm((f) => ({ ...f, posto_id: v }))}
                >
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue placeholder="Selecionar posto" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPostos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Nome do Documento *</Label>
              <Input
                value={alvForm.nome_documento}
                onChange={(e) => setAlvForm((f) => ({ ...f, nome_documento: e.target.value }))}
                placeholder="Ex: Alvará de Funcionamento"
                className="h-9 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Número</Label>
                <Input
                  value={alvForm.numero}
                  onChange={(e) => setAlvForm((f) => ({ ...f, numero: e.target.value }))}
                  placeholder="Ex: 2024/1234"
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Data de Vencimento</Label>
                <Input
                  type="date"
                  value={alvForm.data_vencimento}
                  onChange={(e) => setAlvForm((f) => ({ ...f, data_vencimento: e.target.value }))}
                  className="h-9 mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Lembrete (dias antes do vencimento)</Label>
              <Input
                type="number" min="1"
                value={alvForm.prazo_lembrete_dias}
                onChange={(e) => setAlvForm((f) => ({ ...f, prazo_lembrete_dias: e.target.value }))}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input
                value={alvForm.observacoes}
                onChange={(e) => setAlvForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Observações opcionais"
                className="h-9 mt-1"
              />
            </div>
            <FileField file={alvFile} fileRef={alvFileRef} onFile={setAlvFile} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAlvFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAlvSubmit}>
              <Save className="w-3.5 h-3.5 mr-1" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Notas form dialog ── */}
      <Dialog open={notFormOpen} onOpenChange={setNotFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{notEditId ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {showPostoSelector && (
              <div>
                <Label className="text-xs">Posto *</Label>
                <Select
                  value={notForm.posto_id}
                  onValueChange={(v) => setNotForm((f) => ({ ...f, posto_id: v }))}
                >
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue placeholder="Selecionar posto" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPostos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Fornecedor *</Label>
                <Input
                  value={notForm.fornecedor}
                  onChange={(e) => setNotForm((f) => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Ex: Electrolux"
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  value={notForm.valor}
                  onChange={(e) => setNotForm((f) => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                  className="h-9 mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição do Item *</Label>
              <Input
                value={notForm.descricao_item}
                onChange={(e) => setNotForm((f) => ({ ...f, descricao_item: e.target.value }))}
                placeholder="Ex: Compressor de ar 50L"
                className="h-9 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data da Compra</Label>
                <Input
                  type="date"
                  value={notForm.data_compra}
                  onChange={(e) => setNotForm((f) => ({ ...f, data_compra: e.target.value }))}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Vencimento da Garantia</Label>
                <Input
                  type="date"
                  value={notForm.vencimento_garantia}
                  onChange={(e) => setNotForm((f) => ({ ...f, vencimento_garantia: e.target.value }))}
                  className="h-9 mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Lembrete (dias antes do vencimento)</Label>
              <Input
                type="number" min="1"
                value={notForm.prazo_lembrete_dias}
                onChange={(e) => setNotForm((f) => ({ ...f, prazo_lembrete_dias: e.target.value }))}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input
                value={notForm.observacoes}
                onChange={(e) => setNotForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Observações opcionais"
                className="h-9 mt-1"
              />
            </div>
            <FileField file={notFile} fileRef={notFileRef} onFile={setNotFile} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNotFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleNotSubmit}>
              <Save className="w-3.5 h-3.5 mr-1" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Empresa form dialog ── */}
      <Dialog open={empFormOpen} onOpenChange={setEmpFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{empEditId ? 'Editar Documento' : 'Novo Documento da Empresa'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {showPostoSelector && (
              <div>
                <Label className="text-xs">Posto *</Label>
                <Select
                  value={empForm.posto_id}
                  onValueChange={(v) => setEmpForm((f) => ({ ...f, posto_id: v }))}
                >
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue placeholder="Selecionar posto" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPostos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Tipo de Documento *</Label>
              <Select
                value={empForm.tipo}
                onValueChange={(v) => setEmpForm((f) => ({ ...f, tipo: v, tipo_custom: v !== 'Outros' ? '' : f.tipo_custom }))}
              >
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder="Selecionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_EMPRESA.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {empForm.tipo === 'Outros' && (
              <div>
                <Label className="text-xs">Descreva o tipo *</Label>
                <Input
                  value={empForm.tipo_custom}
                  onChange={(e) => setEmpForm((f) => ({ ...f, tipo_custom: e.target.value }))}
                  placeholder="Ex: Licença Ambiental"
                  className="h-9 mt-1"
                  autoFocus
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Número / Valor do Documento</Label>
              <Input
                value={empForm.numero}
                onChange={(e) => setEmpForm((f) => ({ ...f, numero: e.target.value }))}
                placeholder="Ex: 12.345.678/0001-90"
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input
                value={empForm.observacoes}
                onChange={(e) => setEmpForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Observações opcionais"
                className="h-9 mt-1"
              />
            </div>
            <FileField file={empFile} fileRef={empFileRef} onFile={setEmpFile} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEmpFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleEmpSubmit}>
              <Save className="w-3.5 h-3.5 mr-1" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewFile?.type === 'image' ? (
            <img src={previewFile.url} className="w-full rounded" alt="" />
          ) : isMobile ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12 bg-muted/30 rounded">
              <FileText className="w-14 h-14 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center px-4">
                Pré-visualização de PDF não disponível no celular.
              </p>
              <a href={previewFile?.url} target="_blank" rel="noreferrer">
                <Button className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Abrir PDF
                </Button>
              </a>
            </div>
          ) : (
            <iframe src={previewFile?.url} className="w-full h-[70vh] rounded" title="Documento" />
          )}
          <div className="flex justify-end pt-1">
            <a href={previewFile?.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="text-xs">Abrir em nova aba</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Este registro será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!deletingId) return;
                if (isAlvaras) handleAlvDelete(deletingId);
                else if (isEmpresa) handleEmpDelete(deletingId);
                else handleNotDelete(deletingId);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function FilePreviewButton({
  path, type, getUrl, onOpen,
}: {
  path: string;
  type: string | null;
  getUrl: (p: string) => string;
  onOpen: (f: PreviewFile) => void;
}) {
  const isMobile = useIsMobile();
  const isImage = type === 'image';
  const url = getUrl(path);
  const handleClick = () => {
    if (!isImage && isMobile) { openInNewTab(url); return; }
    onOpen({ url, type: isImage ? 'image' : 'pdf' });
  };
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
          onClick={handleClick}
          title="Ver arquivo"
        >
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="left" className="w-48 p-1">
        {isImage ? (
          <img src={url} className="w-full rounded object-cover" alt="" />
        ) : (
          <iframe src={url} className="w-full h-36 rounded" title="preview" />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function FileField({
  file, fileRef, onFile,
}: {
  file: File | null;
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File | null) => void;
}) {
  return (
    <div>
      <Label className="text-xs">
        Arquivo <span className="text-muted-foreground font-normal">(opcional)</span>
      </Label>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {file ? (
        <div className="flex items-center gap-2 h-9 rounded-md border px-3 text-xs mt-1">
          <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">{file.name}</span>
          <button
            type="button"
            onClick={() => { onFile(null); if (fileRef.current) fileRef.current.value = ''; }}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      ) : (
        <Button
          type="button" variant="outline" size="sm"
          className="h-9 gap-1.5 text-xs mt-1"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="w-3.5 h-3.5" />Anexar arquivo
        </Button>
      )}
    </div>
  );
}
