export interface QualityData {
  data_caixa: string; // YYYY-MM-DD
  total_dinheiro_apurado: number | null;
  total_cartao: number | null;
  total_pix: number | null;
  total_vendas: number | null;
  total_despesas: number | null;
  diferenca_caixa: number | null;
  raw_text: string;
}

function parseNumber(str: string | undefined): number | null {
  if (!str) return null;
  const cleaned = str.replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function parseQualityPDF(text: string): QualityData {
  const raw_text = text;

  // data_caixa: "Caixa: DD/MM/YYYY" or "Caixa:DD/MM/YYYY"
  const dateMatch = text.match(/Caixa\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  let data_caixa = '';
  if (dateMatch) {
    const [dd, mm, yyyy] = dateMatch[1].split('/');
    data_caixa = `${yyyy}-${mm}-${dd}`;
  }

  // total_dinheiro_apurado: line with "Dinheiro" then number in "Apurado" column
  // Pattern: "Dinheiro ... <number> ... <number(apurado)> ... <number>"
  const dinheiroMatch = text.match(/Dinheiro\s+[\d.,]+\s+([\d.,]+)/i);
  const total_dinheiro_apurado = parseNumber(dinheiroMatch?.[1]);

  // total_cartao: "Subtotal" after "Tipo: POS" or "Tipo:POS"
  let total_cartao: number | null = null;
  const posSection = text.match(/Tipo\s*:\s*POS([\s\S]*?)(?:Tipo\s*:|$)/i);
  if (posSection) {
    const subtotalMatch = posSection[1].match(/Subtotal\s+([\d.,]+)/i);
    total_cartao = parseNumber(subtotalMatch?.[1]);
  }

  // total_pix: "GETNET PIX" line value
  const pixMatch = text.match(/GETNET\s+PIX\s+([\d.,]+)/i);
  const total_pix = parseNumber(pixMatch?.[1]);

  // total_vendas: "Total Geral" value
  const totalGeralMatch = text.match(/Total\s+Geral\s+([\d.,]+)/i);
  const total_vendas = parseNumber(totalGeralMatch?.[1]);

  // total_despesas: "Subtotal" after "Tipo: Despesa"
  let total_despesas: number | null = null;
  const despSection = text.match(/Tipo\s*:\s*Despesa([\s\S]*?)(?:Tipo\s*:|$)/i);
  if (despSection) {
    const subtotalMatch = despSection[1].match(/Subtotal\s+([\d.,]+)/i);
    total_despesas = parseNumber(subtotalMatch?.[1]);
  }

  // diferenca_caixa: last "Total" line with "Diferença" column
  // Pattern: line starting with "Total" and containing a negative or positive value at end
  const diffLines = text.match(/^Total\s+.*?([-]?[\d.,]+)\s*$/gim);
  let diferenca_caixa: number | null = null;
  if (diffLines && diffLines.length > 0) {
    const lastLine = diffLines[diffLines.length - 1];
    const nums = lastLine.match(/([-]?[\d.,]+)/g);
    if (nums && nums.length > 0) {
      diferenca_caixa = parseNumber(nums[nums.length - 1]);
    }
  }

  return {
    data_caixa,
    total_dinheiro_apurado,
    total_cartao,
    total_pix,
    total_vendas,
    total_despesas,
    diferenca_caixa,
    raw_text,
  };
}
