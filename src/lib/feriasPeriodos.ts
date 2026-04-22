// ─── Utilities for vacation period computation ───────────────────────────────
// Used by FuncionarioFerias, Funcionarios (badge), and Dashboard (alerts)

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function addMonthsToStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMonths = (m - 1) + n;
  const year = y + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12; // 0-indexed
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function subOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function daysUntil(dateStr: string): number {
  const today = new Date().toISOString().split('T')[0];
  return daysBetween(today, dateStr);
}

export function periodLabel(inicio: string, fim: string): string {
  const [iy, im] = inicio.split('-');
  const [fy, fm] = fim.split('-');
  return `${MONTHS_SHORT[parseInt(im) - 1]}/${iy} – ${MONTHS_SHORT[parseInt(fm) - 1]}/${fy}`;
}

export interface Periodo {
  k: number;
  inicio: string;
  fim: string;
  vencimento: string; // last day to take vacation (end of período concessivo)
  label: string;
  started: boolean;
  completed: boolean; // aquisitivo fim < today
}

/** Returns all 12-month aquisitivo periods from dataAdmissao up to today. */
export function computePeriodos(dataAdmissao: string): Periodo[] {
  const today = new Date().toISOString().split('T')[0];
  const periods: Periodo[] = [];
  let k = 0;
  while (k < 60) {
    const inicio = addMonthsToStr(dataAdmissao, k * 12);
    if (inicio > today) break;
    const nextStart = addMonthsToStr(dataAdmissao, (k + 1) * 12);
    const fim = subOneDay(nextStart);
    // Vencimento = last day of período concessivo (12 months after fim)
    const vencimento = subOneDay(addMonthsToStr(dataAdmissao, (k + 2) * 12));
    periods.push({
      k,
      inicio,
      fim,
      vencimento,
      label: periodLabel(inicio, fim),
      started: inicio <= today,
      completed: fim < today,
    });
    k++;
  }
  return periods;
}

export interface FeriasAlertInfo {
  diasUntilVencimento: number; // negative = vencido
  vencimento: string;
  periodoLabel: string;
  saldo: number;
}

export type FeriasRecord = {
  periodo_aquisitivo_inicio: string;
  dias_gozados: number;
  dias_vendidos: number;
  alerta_meses: number;
};

/**
 * Returns alert info if there is a completed period with outstanding saldo
 * that is within (or past) the alert window. Returns null if no alert needed.
 * Checks periods in chronological order — most urgent first.
 */
export function computeFeriasAlert(
  dataAdmissao: string,
  feriasList: FeriasRecord[],
): FeriasAlertInfo | null {
  const periodos = computePeriodos(dataAdmissao);

  const stats = new Map<string, { gozados: number; vendidos: number; alerta_meses: number }>();
  feriasList.forEach((f) => {
    const cur = stats.get(f.periodo_aquisitivo_inicio) ?? { gozados: 0, vendidos: 0, alerta_meses: 6 };
    stats.set(f.periodo_aquisitivo_inicio, {
      gozados: cur.gozados + (f.dias_gozados ?? 0),
      vendidos: cur.vendidos + (f.dias_vendidos ?? 0),
      alerta_meses: Math.max(cur.alerta_meses, f.alerta_meses ?? 6),
    });
  });

  for (const p of periodos) {
    if (!p.completed) continue;
    const st = stats.get(p.inicio) ?? { gozados: 0, vendidos: 0, alerta_meses: 6 };
    const saldo = 30 - st.gozados - st.vendidos;
    if (saldo <= 0) continue; // fully used

    const daysLeft = daysUntil(p.vencimento);
    const alertThreshold = st.alerta_meses * 30;

    if (daysLeft <= alertThreshold) {
      return { diasUntilVencimento: daysLeft, vencimento: p.vencimento, periodoLabel: p.label, saldo };
    }
  }

  return null;
}
