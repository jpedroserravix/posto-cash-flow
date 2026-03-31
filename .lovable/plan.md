

# Corrigir Parsing de Datas/Horários na Importação XLSX

## Problema

Na função `parseXLSX` (linha 140), o `XLSX.read` usa `raw: false`, que converte datas seriais do Excel em strings usando um formato padrão do SheetJS — que frequentemente não preserva o horário original ou usa formato americano (MM/DD/YYYY). Isso causa divergência entre os horários da planilha original e os importados.

## Solução

Alterar `parseXLSX` para usar `cellDates: true` no `XLSX.read`, que converte datas seriais em objetos `Date` do JavaScript. Depois, formatar manualmente esses objetos para o formato esperado (DD/MM/YYYY HH:MM:SS), garantindo que horários sejam preservados fielmente.

## Mudanças em `src/pages/DepositosBrinks.tsx`

### 1. Alterar a leitura do XLSX (linha 140-142)

```typescript
const workbook = XLSX.read(data, { type: 'array', cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true });
```

### 2. Adicionar função auxiliar para formatar datas

Converter objetos `Date` para string `DD/MM/YYYY HH:MM:SS`:

```typescript
function formatExcelDate(val: any): string {
  if (val instanceof Date) {
    const d = val;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  }
  return (val || '').toString().trim();
}
```

### 3. Usar `formatExcelDate` no mapeamento de linhas (linha 157-171)

Aplicar a conversão na coluna de data antes de atribuir a `data_deposito`, garantindo que o horário original seja mantido.

