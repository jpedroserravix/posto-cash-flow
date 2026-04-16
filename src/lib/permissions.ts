export const ALL_PERMISSIONS = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'envio-rapido', label: 'Envio Rápido' },
  { key: 'brinks',       label: 'Depósitos Brinks' },
  { key: 'manuais',      label: 'Depósitos Manuais' },
  { key: 'resumo',       label: 'Resumo Diário' },
  { key: 'extrato',      label: 'Extrato Bancário' },
  { key: 'alvaras',      label: 'Alvarás e Licenças' },
  { key: 'garantias',    label: 'Notas e Garantias' },
  { key: 'docs-empresa', label: 'Documentos da Empresa' },
  { key: 'postos',       label: 'Postos' },
  { key: 'usuarios',     label: 'Usuários' },
  { key: 'bancos',       label: 'Contas Bancárias' },
  { key: 'pessoal',      label: 'Pessoal' },
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]['key'];

export const PROFILE_PRESETS: Record<string, string[]> = {
  admin:     ALL_PERMISSIONS.map((p) => p.key),
  gerente:   ['envio-rapido', 'brinks', 'manuais', 'resumo', 'pessoal', 'alvaras', 'garantias', 'docs-empresa'],
  frentista: ['envio-rapido'],
};

// Priority order for "first allowed page" redirect
export const ROUTE_PERMISSION_MAP: { path: string; permission: string }[] = [
  { path: '/',           permission: 'dashboard' },
  { path: '/envio-rapido', permission: 'envio-rapido' },
  { path: '/brinks',     permission: 'brinks' },
  { path: '/manuais',    permission: 'manuais' },
  { path: '/resumo',     permission: 'resumo' },
  { path: '/extrato',    permission: 'extrato' },
  { path: '/alvaras',       permission: 'alvaras' },
  { path: '/garantias',     permission: 'garantias' },
  { path: '/docs-empresa',  permission: 'docs-empresa' },
  { path: '/postos',     permission: 'postos' },
  { path: '/usuarios',   permission: 'usuarios' },
  { path: '/bancos',     permission: 'bancos' },
  { path: '/funcionarios',      permission: 'pessoal' },
  { path: '/ponto',             permission: 'pessoal' },
  { path: '/fechamento',        permission: 'pessoal' },
  { path: '/historico-pessoal', permission: 'pessoal' },
];

export function firstAllowedPath(hasPermission: (k: string) => boolean): string {
  return ROUTE_PERMISSION_MAP.find((r) => hasPermission(r.permission))?.path ?? '/login';
}
