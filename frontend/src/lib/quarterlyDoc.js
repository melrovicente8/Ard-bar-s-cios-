import { euro } from "./api";

/**
 * Balanço trimestral da associação — visão do sócio (apenas totalizadores,
 * sem detalhes nominais). Abre em nova janela para imprimir/guardar como PDF.
 */
export function openQuarterlyDoc(d) {
  const w = window.open("", "_blank");
  if (!w) return false;
  // Retiradas de caixa transitam para conta bancária — não são despesa real.
  const despesasReais = (d.expenses.supplier_orders || 0) + (d.expenses.supplier_expenses || 0);
  const saldo = d.income.total - despesasReais;
  // Saldos contabilísticos (todas as datas): banco = depósitos registados; caixa = numerário em gaveta
  const banco = d.bank_balance ?? (d.expenses.cash_withdrawals || 0);
  const caixa = d.cash_balance ?? (d.cash_in_drawer || 0);
  // Saldo final financeiro do trimestre — dinheiro contabilístico (banco + caixa)
  const saldoFinal = d.total_balance ?? (banco + caixa);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Balanço trimestral ${d.quarter} · ${d.club_name}</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:13px}
  header{border-bottom:3px solid #15803d;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:22px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:17px;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:left}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#444}
  .right{text-align:right}
  .pos{color:#15803d}.neg{color:#b91c1c}
  .totals{margin-top:26px;display:flex;gap:14px;flex-wrap:wrap}
  .totals .box{flex:1;min-width:180px;border-radius:10px;padding:16px;text-align:center;border:2px solid}
  .totals .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:#666}
  .totals .val{font-size:26px;font-weight:800;margin-top:4px}
  .totals .in{border-color:#15803d;background:#f0fdf4}.totals .in .val{color:#15803d}
  .totals .out{border-color:#b91c1c;background:#fef2f2}.totals .out .val{color:#b91c1c}
  .totals .bal{border-color:#0f172a;background:#f8fafc}.totals .bal .val{color:#0f172a}
  .note{margin-top:20px;font-size:11px;color:#666}
  @media print{button{display:none}body{margin:12mm}}
</style></head><body>
  <header>
    <div class="brand">${d.club_name}</div>
    <div class="sub">Balanço trimestral ${d.quarter}</div>
    <h1>Período: ${d.period?.from || "—"} → ${d.period?.to || "—"}</h1>
    <div style="font-size:11px;color:#555">Emitido em ${new Date(d.generated_at).toLocaleString("pt-PT")}</div>
  </header>

  <h2 style="font-size:14px;margin:22px 0 6px;color:#475569">HAVER (Receitas)</h2>
  <table><tbody>
    <tr><td>Consumo no bar</td><td class="right pos"><strong>${euro(d.income.consumption)}</strong></td></tr>
    <tr><td>Cotas de sócios</td><td class="right pos"><strong>${euro(d.income.quotas)}</strong></td></tr>
    <tr style="border-top:2px solid #0f172a"><td><strong>TOTAL RECEITAS</strong></td><td class="right pos"><strong>${euro(d.income.total)}</strong></td></tr>
  </tbody></table>

  <h2 style="font-size:14px;margin:22px 0 6px;color:#475569">DEVE (Despesas)</h2>
  <table><tbody>
    <tr><td>Encomendas a fornecedores</td><td class="right neg"><strong>${euro(d.expenses.supplier_orders)}</strong></td></tr>
    <tr><td>Despesas mensais</td><td class="right neg"><strong>${euro(d.expenses.supplier_expenses)}</strong></td></tr>
    <tr style="border-top:2px solid #0f172a"><td><strong>TOTAL DESPESAS</strong></td><td class="right neg"><strong>${euro(despesasReais)}</strong></td></tr>
  </tbody></table>

  <h2 style="font-size:14px;margin:22px 0 6px;color:#475569">SALDOS CONTABILÍSTICOS (BANCO + CAIXA)</h2>
  <table><tbody>
    <tr><td>Saldo em banco (depósitos registados)</td><td class="right" style="color:#15803d"><strong>${euro(banco)}</strong></td></tr>
    <tr><td>Saldo em caixa (numerário em gaveta)</td><td class="right" style="color:#b45309"><strong>${euro(caixa)}</strong></td></tr>
    <tr style="border-top:2px solid #0f172a"><td><strong>TOTAL (banco + caixa)</strong></td><td class="right"><strong>${euro(banco + caixa)}</strong></td></tr>
  </tbody></table>

  <div class="totals" style="margin-top:10px">
    <div class="box bal" style="min-width:260px"><div class="lbl">SALDO FINAL FINANCEIRO DO TRIMESTRE (caixa + banco)</div><div class="val ${saldoFinal >= 0 ? "pos" : "neg"}">${euro(saldoFinal)}</div></div>
  </div>

  <div class="totals">
    <div class="box in"><div class="lbl">TOTAL RECEITAS</div><div class="val">${euro(d.income.total)}</div></div>
    <div class="box out"><div class="lbl">TOTAL DESPESAS</div><div class="val">${euro(despesasReais)}</div></div>
    <div class="box bal"><div class="lbl">SALDO DO TRIMESTRE</div><div class="val ${saldo >= 0 ? "pos" : "neg"}">${saldo >= 0 ? "+" : ""}${euro(saldo)}</div></div>
  </div>

  <p class="note">Documento destinado aos sócios da associação (apenas totalizadores). Consulta as contas junto da direção para esclarecimentos.</p>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
  w.document.close();
  return true;
}
