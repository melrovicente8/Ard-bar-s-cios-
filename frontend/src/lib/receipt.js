import { euro } from "./api";

/**
 * Recibo A6 partilhado (Venda / Recibo de Pagamento / 2ª via).
 * Todos os tickets incluem: saldo de pontos, valor a pagar, valor entregue,
 * troco, valor unitário por produto e, na 2ª via, data original + data de impressão.
 *
 * tx        → documento da transação (sale | payment)
 * extras    → { client, quotaStatus, coveredSales, secondCopy }
 *   client      { name, member_number, points, balance }
 *   quotaStatus { status, label, detail } (estado das cotas do sócio)
 *   coveredSales [nºs de transação das vendas cobertas por este pagamento]
 */
export function printReceipt(tx, extras = {}) {
  if (!tx || !tx.tx_number) return { ok: false };
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return { ok: false };
  const isSale = !!tx.items;
  const client = extras.client || {};
  const quota = extras.quotaStatus || null;
  const covered = extras.coveredSales || tx.sale_tx_numbers || [];
  const secondCopy = extras.secondCopy !== false;
  const origDate = new Date(tx.created_at).toLocaleString("pt-PT");
  const printDate = new Date().toLocaleString("pt-PT");
  const itemsHtml = isSale
    ? tx.items
        .map(
          (it) =>
            `<div class="row"><span>${it.quantity}× ${it.product_name} <span class="muted">(${euro(it.unit_price || 0)}/un)</span></span><span>${euro(it.subtotal)}</span></div>`
        )
        .join("")
    : "";
  const tendered = tx.tendered || tx.amount || 0;
  const credited = tx.total_credited || tx.amount || 0;
  const change = tx.change_returned || 0;
  const tip = tx.tip || 0;
  const pointsBalance = client.points != null ? client.points : null;
  const balanceOwed = client.balance != null ? Math.max(client.balance, 0) : null;
  const quotaColor = { paid: "#059669", pending: "#b45309", debt: "#b91c1c" };
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Transação ${tx.tx_number}</title>
<style>body{font-family:'Courier New',monospace;max-width:320px;margin:14px auto;padding:0 12px;font-size:13px;color:#000}
h1{font-size:16px;text-align:center;margin:4px 0 0;letter-spacing:.18em}
h2{font-size:11px;text-align:center;margin:0 0 14px;color:#444;letter-spacing:.25em}
hr{border:0;border-top:1px dashed #000;margin:10px 0}
.row{display:flex;justify-content:space-between;margin:4px 0}
.big{font-size:20px;font-weight:bold}
.muted{color:#555;font-size:11px}
.txn{font-size:14px;font-weight:bold;background:#000;color:#fff;text-align:center;padding:4px;border-radius:3px;margin:8px 0}
@media print{ body{margin:0} button{display:none} }
</style></head><body>
<h1>ARD · NESPEREIRA</h1>
<h2>${isSale ? "VENDA" : "RECIBO DE PAGAMENTO"}${secondCopy ? " · 2ª VIA" : ""}${tx.house_offer ? " · OFERTA DA CASA" : ""}</h2>
${tx.house_offer ? '<div style="text-align:center;background:#a21caf;color:#fff;padding:4px;border-radius:3px;margin:6px 0;font-weight:bold">★ OFERTA DA CASA ★</div>' : ""}
<div class="txn">TRANSAÇÃO Nº ${tx.tx_number}</div>
<div class="muted">Data da transação: ${origDate}</div>
${secondCopy ? `<div class="muted">2ª via impressa em: ${printDate}</div>` : ""}
<div class="muted">Registado por: ${tx.user_email || "—"}</div>
<hr/>
<div class="row"><span>Cliente</span><strong>${tx.client_name || client.name || "—"}</strong></div>
${client.member_number ? `<div class="row"><span>Sócio</span><strong>nº ${client.member_number}</strong></div>` : ""}
${quota ? `<div class="row"><span>Cotas</span><strong style="color:${quotaColor[quota.status] || "#000"}">${quota.label}</strong></div>` : ""}
${isSale ? `<hr/>${itemsHtml}<hr/>
<div class="row big"><span>TOTAL</span><span>${euro(tx.total)}</span></div>
${tx.points_earned ? `<div class="row"><span>Pontos ganhos</span><span>+${tx.points_earned}</span></div>` : ""}` : `<hr/>
<div class="row"><span>Valor a pagar</span><span>${euro(balanceOwed != null ? balanceOwed + credited : credited)}</span></div>
<div class="row"><span>Numerário entregue</span><span>${euro(tendered)}</span></div>
${tx.points_used ? `<div class="row"><span>Pontos usados</span><span>${tx.points_used} pts (${euro(tx.points_value || tx.points_used / 5)})</span></div>` : ""}
<div class="row"><span>Abatido na dívida</span><span>${euro(credited)}</span></div>
${change > 0 ? `<div class="row"><span>Troco devolvido</span><span>${euro(change)}</span></div>` : ""}
${tip > 0 ? `<div class="row"><span>Gratificação (caixa)</span><span>${euro(tip)}</span></div>` : ""}
${covered.length ? `<div class="row"><span>Vendas cobertas</span><span>${covered.map((n) => "#" + n).join(", ")}</span></div>` : ""}
${tx.note ? `<div class="row"><span>Nota</span><span>${tx.note}</span></div>` : ""}
<hr/>
<div class="row big"><span>TOTAL ABATIDO</span><span>${euro(credited)}</span></div>`}
${pointsBalance != null ? `<hr/><div class="row"><span>Saldo de pontos</span><strong>${pointsBalance} pts</strong></div>` : ""}
${balanceOwed != null ? `<div class="row"><span>Conta corrente</span><strong>${balanceOwed > 0 ? "A pagar " + euro(balanceOwed) : "Sem dívida"}</strong></div>` : ""}
<hr/>
<div style="text-align:center" class="muted">Obrigado pela preferência</div>
<div style="text-align:center;margin-top:14px"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
  w.document.close();
  return { ok: true };
}
