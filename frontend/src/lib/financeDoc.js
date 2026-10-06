import { euro } from "./api";

/**
 * Abre o documento financeiro (Deve / Haver) em nova janela para imprimir/PDF.
 * 1ª página: HAVER (Receitas) + DEVE (Despesas) com destaque para TOTAL RECEITAS,
 * TOTAL DESPESAS e Saldo do período. Os detalhes ficam a partir da 2ª página
 * (quebra de página em impressão). O cliente aparece pelo nº de sócio quando existe.
 */
export function openFinanceDoc(d, fromLabel, toLabel, subtitle) {
  const memberLabel = (s) => {
    const n = s.client_member_number || s.member_number;
    return n ? `Sócio nº ${n}` : (s.client_name || "—");
  };
  const w = window.open("", "_blank");
  if (!w) return false;
  const linesIncome = `
    <tr><td>Consumo no bar</td><td class="right">${d.counts.sales} vendas</td><td class="right pos"><strong>${euro(d.income.consumption)}</strong></td></tr>
    <tr><td>Cotas de sócios</td><td class="right">${d.counts.quotas}</td><td class="right pos"><strong>${euro(d.income.quotas)}</strong></td></tr>
    <tr class="total-row"><td><strong>TOTAL RECEITAS</strong></td><td></td><td class="right pos"><strong>${euro(d.income.total)}</strong></td></tr>`;
  const linesExp = `
    <tr><td>Encomendas a fornecedores</td><td class="right">${d.counts.orders}</td><td class="right neg"><strong>${euro(d.expenses.supplier_orders)}</strong></td></tr>
    <tr><td>Despesas mensais</td><td class="right">${d.counts.expenses}</td><td class="right neg"><strong>${euro(d.expenses.supplier_expenses)}</strong></td></tr>
    <tr class="total-row"><td><strong>TOTAL DESPESAS</strong></td><td></td><td class="right neg"><strong>${euro(d.expenses.total)}</strong></td></tr>`;
  const incDetail = [...(d.details?.sales || []), ...(d.details?.quotas || [])]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((s) => `<tr><td>${new Date(s.created_at).toLocaleDateString("pt-PT")}</td><td>${s.source === "quota" ? "Cota" : "Consumo"}</td><td>${memberLabel(s)}</td><td>${(s.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td><td class="right pos"><strong>${euro(s.total)}</strong></td></tr>`)
    .join("");
  const supplierLabel = (r) => (r.supplier_member_number ? `Sócio nº ${r.supplier_member_number}` : (r.supplier_name || "—"));
  const expDetail = [
    ...(d.details?.orders || []).map((o) => ({ ...o, _kind: "Encomenda", _desc: o.description || (o.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ") })),
    ...(d.details?.expenses || []).map((x) => ({ ...x, _kind: "Despesa", _desc: x.description })),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => `<tr><td>${new Date(r.created_at).toLocaleDateString("pt-PT")}</td><td>${r._kind}</td><td>${supplierLabel(r)}</td><td>${r._desc}</td><td class="right neg"><strong>${euro(r.total || r.amount)}</strong></td></tr>`)
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${subtitle} · ${d.club_name}</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:13px}
  header{border-bottom:3px solid #15803d;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:22px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:17px;margin:6px 0}
  h2{font-size:14px;margin:22px 0 6px;color:#475569}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#444;text-align:left}
  .right{text-align:right}
  .pos{color:#15803d}
  .neg{color:#b91c1c}
  .total-row td{border-top:2px solid #0f172a;border-bottom:2px solid #0f172a;font-size:13px;background:#f9fafb}
  .totals{margin-top:26px;display:flex;gap:14px;flex-wrap:wrap}
  .totals .box{flex:1;min-width:180px;border-radius:10px;padding:16px;text-align:center;border:2px solid}
  .totals .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:#666}
  .totals .val{font-size:26px;font-weight:800;margin-top:4px}
  .totals .in{border-color:#15803d;background:#f0fdf4}.totals .in .val{color:#15803d}
  .totals .out{border-color:#b91c1c;background:#fef2f2}.totals .out .val{color:#b91c1c}
  .totals .bal{border-color:#0f172a;background:#f8fafc}.totals .bal .val{color:#0f172a}
  .balance{margin-top:22px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;display:flex;justify-content:space-between;align-items:center}
  .balance .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.2em;color:#666}
  .balance .val{font-size:24px;font-weight:800}
  .pagebreak{page-break-before:always;padding-top:10px}
  @media print{button{display:none}body{margin:12mm}}
</style></head><body>
  <header>
    <div class="brand">${d.club_name}</div>
    <div class="sub">${subtitle}</div>
    <h1>Período: ${fromLabel} → ${toLabel}</h1>
    <div style="font-size:11px;color:#555">Emitido em ${new Date(d.generated_at).toLocaleString("pt-PT")}</div>
  </header>

  <!-- Página 1: resumo Deve / Haver com totais em destaque -->
  <h2>HAVER (Receitas)</h2>
  <table><thead><tr><th>Origem</th><th class="right">Qtd</th><th class="right">Valor</th></tr></thead><tbody>${linesIncome}</tbody></table>
  <h2>DEVE (Despesas)</h2>
  <table><thead><tr><th>Origem</th><th class="right">Qtd</th><th class="right">Valor</th></tr></thead><tbody>${linesExp}</tbody></table>

  <div class="totals">
    <div class="box in"><div class="lbl">TOTAL RECEITAS</div><div class="val">${euro(d.income.total)}</div></div>
    <div class="box out"><div class="lbl">TOTAL DESPESAS</div><div class="val">${euro(d.expenses.total)}</div></div>
    <div class="box bal"><div class="lbl">SALDO DO PERÍODO</div><div class="val ${d.balance >= 0 ? "pos" : "neg"}">${d.balance >= 0 ? "+" : ""}${euro(d.balance)}</div></div>
  </div>

  <!-- Página 2: detalhes -->
  <div class="pagebreak">
    <h2 style="margin-top:0">Detalhe · Receitas</h2>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Sócio</th><th>Detalhes</th><th class="right">Valor</th></tr></thead><tbody>${incDetail || `<tr><td colspan="5" style="text-align:center;color:#666;padding:14px">Sem registos no período</td></tr>`}</tbody></table>
    <h2>Detalhe · Despesas</h2>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Fornecedor</th><th>Descrição</th><th class="right">Valor</th></tr></thead><tbody>${expDetail || `<tr><td colspan="5" style="text-align:center;color:#666;padding:14px">Sem registos no período</td></tr>`}</tbody></table>
    <div class="balance">
      <span class="lbl">Saldo do período</span>
      <span class="val ${d.balance >= 0 ? "pos" : "neg"}">${d.balance >= 0 ? "+" : ""}${euro(d.balance)}</span>
    </div>
  </div>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
  w.document.close();
  return true;
}
