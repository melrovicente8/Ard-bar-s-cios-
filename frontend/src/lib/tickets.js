import { euro } from "./api";
import { printReceipt } from "./receipt";

/**
 * Tickets A6 das transações que não são venda nem recibo de pagamento:
 * oferta da casa, nota de crédito (devolução de valor ao cliente),
 * movimentos de caixa/banco e fechos de caixa.
 * Todos incluem o nº de transação, data, responsável e o detalhe do que foi feito.
 */
const STYLE = `body{font-family:'Courier New',monospace;max-width:320px;margin:14px auto;padding:0 12px;font-size:13px;color:#000}
h1{font-size:16px;text-align:center;margin:4px 0 0;letter-spacing:.18em}
h2{font-size:11px;text-align:center;margin:0 0 14px;color:#444;letter-spacing:.25em}
hr{border:0;border-top:1px dashed #000;margin:10px 0}
.row{display:flex;justify-content:space-between;margin:4px 0;gap:8px}
.big{font-size:20px;font-weight:bold}
.muted{color:#555;font-size:11px}
.tag{color:#fff;text-align:center;padding:4px;border-radius:3px;margin:8px 0;font-weight:bold;letter-spacing:.06em}
.offer{background:#a21caf}
.credit{background:#1d4ed8}
.cash{background:#0f766e}
.alert{background:#b91c1c}
@media print{ body{margin:0} button{display:none} }`;

function openTicket({ title, heading, subtitle, txNumber, meta = [], body = "", footer = "" }) {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return { ok: false };
  const metaHtml = meta.filter(Boolean).map(([k, v]) => `<div class="row"><span>${k}</span><strong>${v}</strong></div>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>${STYLE}</style></head><body>
<h1>ARD · NESPEREIRA</h1>
<h2>${heading}</h2>
<div class="txn" style="font-size:14px;font-weight:bold;text-align:center;padding:4px;background:#000;color:#fff;border-radius:3px;margin:8px 0">TRANSAÇÃO Nº ${txNumber}</div>
${subtitle ? `<div class="muted">${subtitle}</div>` : ""}
${metaHtml}
<hr/>
${body}
<hr/>
${footer || ""}
<div style="text-align:center;margin-top:14px"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
  w.document.close();
  return { ok: true };
}

const dateStr = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT") : "—");

function itemsRows(items, { qtyKey = "quantity", amountKey = "subtotal" } = {}) {
  return (items || [])
    .map((it) => `<div class="row"><span>${it[qtyKey] ?? it.qty ?? 1}× ${it.product_name || it.description || "—"}${
      it.unit_price != null ? ` <span class="muted">(${euro(it.unit_price)}/un)</span>` : ""
    }</span><span>${euro(it[amountKey] ?? it.amount ?? 0)}</span></div>`)
    .join("");
}

/** Oferta da casa: o que foi oferecido, a quem, por quem e o valor assumido pelo bar. */
export function printHouseOfferTicket(tx, extras = {}) {
  const items = tx.house_items || extras.houseItems || [];
  const body = `
<div class="tag offer">★ OFERTA DA CASA ★</div>
${items.length ? `<div class="muted">O que foi oferecido:</div>${itemsRows(items, { qtyKey: "qty", amountKey: "amount" })}<hr/>` : ""}
<div class="row big"><span>TOTAL OFERTA</span><span>${euro(tx.amount || 0)}</span></div>
<div class="row"><span>Oferecido por (staff)</span><strong>${tx.user_email || "—"}</strong></div>
${tx.description ? `<div class="muted" style="margin-top:6px">${tx.description}</div>` : ""}
${extras.clientName ? `<div class="row"><span>Cliente / sócio</span><strong>${extras.clientName}</strong></div>` : ""}`;
  return openTicket({
    title: `Oferta ${tx.tx_number}`,
    heading: "OFERTA DA CASA · DESPESA DO BAR",
    subtitle: `Data: ${dateStr(tx.created_at)}`,
    txNumber: tx.tx_number,
    meta: [["Conta", "Conta da Casa (F00)"], ["Fornecedor", tx.supplier_name || "Conta da Casa"]],
    body,
    footer: `<div class="muted" style="text-align:center">Registo interno · despesa do bar</div>`,
  });
}

/** Nota de crédito: devolução de valor ao cliente, com origem e itens. */
export function printCreditNoteTicket(tx, extras = {}) {
  const origins = tx.credit_origins || [];
  const items = tx.credit_items || extras.creditItems || [];
  const amount = tx.amount || extras.amount || 0;
  const body = `
<div class="tag credit">NOTA DE CRÉDITO</div>
<div class="row"><span>Cliente</span><strong>${tx.client_name || extras.clientName || "—"}</strong></div>
${origins.length ? `<div class="muted" style="margin-top:6px">Devolvido em numerário ao cliente.</div><hr/><div class="muted">Movimentos que geraram o crédito:</div>${origins
    .map((o) => `<div class="row"><span>#${o.tx_number} · ${new Date(o.date).toLocaleDateString("pt-PT")}${o.kept_as_credit ? " · troco em crédito" : ""}</span><span>${euro(o.amount)}</span></div>`)
    .join("")}` : ""}
${items.length ? `<hr/><div class="muted">Itens abrangidos:</div>${itemsRows(items)}` : ""}
<hr/>
<div class="row big"><span>VALOR DEVOLVIDO</span><span>${euro(amount)}</span></div>
<div class="row"><span>Devolvido por (staff)</span><strong>${tx.user_email || "—"}</strong></div>
${tx.note ? `<div class="row"><span>Nota</span><span>${tx.note}</span></div>` : ""}`;
  return openTicket({
    title: `Nota de crédito ${tx.tx_number}`,
    heading: "NOTA DE CRÉDITO · DEVOLUÇÃO AO CLIENTE",
    subtitle: `Data: ${dateStr(tx.created_at)}`,
    txNumber: tx.tx_number,
    body,
    footer: `<div class="muted" style="text-align:center">Documento de devolução · ARD Nespereira</div>`,
  });
}

const MOVEMENT_LABEL = {
  bank_deposit: "DEPÓSITO NO BANCO",
  credit_refund: "DEVOLUÇÃO DE CRÉDITO",
  expense_cash: "PAGAMENTO DE DESPESA (CAIXA)",
  expense_bank: "PAGAMENTO DE DESPESA (BANCO)",
  transfer_bank_cash: "TRANSFERÊNCIA BANCO → CAIXA",
  deposit_in: "ENTRADA DE VALOR",
};

/** Movimentos de caixa/banco: depósitos, levantamentos, despesas pagas. */
export function printCashMovementTicket(tx) {
  const label = MOVEMENT_LABEL[tx.kind] || "MOVIMENTO DE CAIXA";
  const body = `
<div class="tag cash">${label}</div>
<div class="row big"><span>VALOR</span><span>${euro(tx.amount || 0)}</span></div>
${tx.deposit_note ? `<div class="row"><span>Nota de depósito</span><span>${tx.deposit_note}</span></div>` : ""}
${tx.deposit_date ? `<div class="row"><span>Data do depósito</span><span>${new Date(tx.deposit_date).toLocaleDateString("pt-PT")}</span></div>` : ""}
${tx.payment_ref ? `<div class="row"><span>Referência</span><span>${tx.payment_ref}</span></div>` : ""}
${tx.payment_source ? `<div class="row"><span>Origem do pagamento</span><span>${tx.payment_source}</span></div>` : ""}
${tx.supplier_name ? `<div class="row"><span>Fornecedor</span><span>${tx.supplier_name}</span></div>` : ""}
${tx.client_name ? `<div class="row"><span>Cliente</span><span>${tx.client_name}</span></div>` : ""}
${tx.note ? `<div class="row"><span>Descrição</span><span>${tx.note}</span></div>` : ""}
<div class="row"><span>Registado por</span><strong>${tx.user_email || "—"}</strong></div>`;
  return openTicket({
    title: `Movimento ${tx.tx_number}`,
    heading: `${label} · CAIXA / BANCO`,
    subtitle: `Data: ${dateStr(tx.created_at)}`,
    txNumber: tx.tx_number,
    body,
    footer: `<div class="muted" style="text-align:center">Comprovativo de movimento · ARD Nespereira</div>`,
  });
}

/** Fecho de caixa: contado, esperado e diferença. */
export function printCashCloseTicket(tx) {
  const diff = Number(tx.difference || 0);
  const body = `
<div class="tag ${Math.abs(diff) >= 0.01 ? "alert" : "cash"}">${Math.abs(diff) >= 0.01 ? (diff > 0 ? "VALOR A MAIS" : "VALOR A MENOS") : "CAIXA CONFERE"}</div>
<div class="row"><span>Contado em caixa</span><strong>${euro(tx.cash_counted || 0)}</strong></div>
<div class="row"><span>Esperado</span><strong>${euro(tx.expected_cash || 0)}</strong></div>
<div class="row big"><span>DIFERENÇA</span><span>${diff >= 0 ? "+" : ""}${euro(diff)}</span></div>
${tx.note ? `<div class="row"><span>Nota</span><span>${tx.note}</span></div>` : ""}
<div class="row"><span>Contado por</span><strong>${tx.user_email || "—"}</strong></div>`;
  return openTicket({
    title: `Fecho de caixa ${tx.tx_number}`,
    heading: "FECHO DE CAIXA",
    subtitle: `Data: ${dateStr(tx.created_at)}`,
    txNumber: tx.tx_number,
    body,
    footer: `<div class="muted" style="text-align:center">Fecho de caixa · ARD Nespereira</div>`,
  });
}

/** Escolhe o ticket certo para qualquer transação. */
export function printTransactionTicket(tx, extras = {}) {
  if (!tx) return { ok: false };
  if (tx._kind === "cash_close") return printCashCloseTicket(tx);
  if (tx._kind === "cash_withdrawal") {
    if (tx.kind === "credit_refund") {
      return printCreditNoteTicket(tx.linked_payment || { ...tx, _kind: "payment" }, extras);
    }
    return printCashMovementTicket(tx);
  }
  if (tx._kind === "expense") {
    if ((tx.house_items || []).length) return printHouseOfferTicket(tx, extras);
    return printCashMovementTicket({ ...tx, kind: "expense_bank" });
  }
  if (tx._kind === "order") return printCashMovementTicket({ ...tx, kind: "expense_bank" });
  if (tx._kind === "payment" && tx.source === "refund") return printCreditNoteTicket(tx, extras);
  if (tx._kind === "sale" || tx._kind === "payment") {
    return printReceipt(tx, { ...extras, secondCopy: extras.secondCopy !== false });
  }
  if (!tx.items && tx.amount != null && !tx.total_credited) return printCashMovementTicket(tx);
  return printReceipt(tx, { ...extras, secondCopy: extras.secondCopy !== false });
}
