import { euro } from "./api";

/**
 * Balanço mensal da associação — documento para consulta dos sócios.
 * Detalha o DEVE (despesas) por fornecedor e valor: encomendas a fornecedores
 * e despesas mensais. Transferências caixa ↔ banco não são despesas.
 */
export function openMonthlyDoc(d) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const lines = d.expense_lines || [];
  const rows = lines
    .map(
      (l) => `<tr>
        <td>${l.created_at ? new Date(l.created_at).toLocaleDateString("pt-PT") : "—"}</td>
        <td>${l.kind === "order" ? "Encomenda a fornecedor" : "Despesa mensal"}</td>
        <td>${l.supplier || "—"}${l.description ? `<div style="font-size:10px;color:#666">${l.description}</div>` : ""}</td>
        <td class="right neg"><strong>${euro(l.amount || 0)}</strong></td>
      </tr>`
    )
    .join("");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Balanço mensal ${d.month} · ${d.club_name}</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:13px}
  header{border-bottom:3px solid #15803d;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:22px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:17px;margin:6px 0}
  h2{font-size:14px;margin:22px 0 6px;color:#475569}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:left}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#444}
  .right{text-align:right}
  .pos{color:#15803d}.neg{color:#b91c1c}
  .total-row td{border-top:2px solid #0f172a;background:#f9fafb;font-weight:700}
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
    <div class="sub">Balanço mensal</div>
    <h1>Período: ${d.period?.from || "—"} → ${d.period?.to || "—"}</h1>
    <div style="font-size:11px;color:#555">Emitido em ${new Date(d.generated_at).toLocaleString("pt-PT")}</div>
  </header>

  <h2>HAVER (Receitas)</h2>
  <table><tbody>
    <tr><td>Consumo no bar</td><td class="right pos"><strong>${euro(d.income.consumption)}</strong></td></tr>
    <tr><td>Cotas de sócios</td><td class="right pos"><strong>${euro(d.income.quotas)}</strong></td></tr>
    ${(d.income.donations || 0) > 0 ? `<tr><td>Donativos / gratificações (superiores a 10 €)</td><td class="right pos"><strong>${euro(d.income.donations)}</strong></td></tr>` : ""}
    <tr class="total-row"><td><strong>TOTAL RECEITAS</strong></td><td class="right pos"><strong>${euro(d.income.total)}</strong></td></tr>
  </tbody></table>

  <h2>DEVE (Despesas) — fornecedor e valor</h2>
  <table><thead><tr><th>Data</th><th>Tipo</th><th>Fornecedor</th><th class="right">Valor</th></tr></thead><tbody>
    ${rows || `<tr><td colspan="4" style="text-align:center;color:#666;padding:14px">Sem despesas no mês</td></tr>`}
    <tr class="total-row"><td colspan="3">Encomendas a fornecedores</td><td class="right neg">${euro(d.expenses.supplier_orders)}</td></tr>
    <tr class="total-row"><td colspan="3">Despesas mensais</td><td class="right neg">${euro(d.expenses.supplier_expenses)}</td></tr>
    <tr class="total-row"><td colspan="3"><strong>TOTAL DESPESAS</strong></td><td class="right neg"><strong>${euro(d.expenses.total)}</strong></td></tr>
  </tbody></table>
  <p class="note">Transferências entre caixa e banco são movimentação de saldo e não são contabilizadas como despesa.</p>

  <div class="totals">
    <div class="box in"><div class="lbl">TOTAL RECEITAS</div><div class="val">${euro(d.income.total)}</div></div>
    <div class="box out"><div class="lbl">TOTAL DESPESAS</div><div class="val">${euro(d.expenses.total)}</div></div>
    <div class="box bal"><div class="lbl">SALDO DO MÊS</div><div class="val ${d.balance >= 0 ? "pos" : "neg"}">${d.balance >= 0 ? "+" : ""}${euro(d.balance)}</div></div>
  </div>

  <div class="totals">
    <div class="box bal" style="min-width:260px"><div class="lbl">SALDO FINANCEIRO (caixa + banco)</div><div class="val">${euro(d.total_balance ?? 0)}</div></div>
  </div>

  <p class="note">Documento destinado aos sócios da associação. Consulta as contas junto da direção para esclarecimentos.</p>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
  w.document.close();
  return true;
}
