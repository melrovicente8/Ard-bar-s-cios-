import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { PencilSimple, Trash, Gift } from "@phosphor-icons/react";

const rowKey = (saleId, productName) => `${saleId}||${productName}`;

/** Stepper de quantidade (pagar / oferecer) */
function QtyStepper({ label, accent = "amber", value, max, onChange }) {
  const accentCls =
    accent === "fuchsia"
      ? "text-fuchsia-300"
      : "text-amber-300";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-[9px] font-bold uppercase tracking-wider ${accentCls}`}>{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= 0}
          className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold disabled:opacity-30"
          title={`Retirar 1 (${label})`}
        >−</button>
        <span className="min-w-[18px] text-center font-bold text-xs">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold disabled:opacity-30"
          title={`Adicionar 1 (${label})`}
        >+</button>
      </div>
    </div>
  );
}

/**
 * Modal "Registar pagamento" — seleção por item com quantidades:
 * pagar (a pagar ao cliente) / oferecer (oferta da casa, com limite mensal por utilizador).
 * O restante fica em dívida.
 */
export default function PaymentModal({
  client,
  debt,
  unpaidSales,
  prefill,
  canEditSale,
  canCancelSale,
  onEditSale,
  onCancelSale,
  onClose,
  onDone,
}) {
  const [itemSel, setItemSel] = useState(() => prefill?.items || {}); // {"sale||prod": {pay, offer}}
  const [form, setForm] = useState(() =>
    prefill?.form || { amount: "", points_used: 0, note: "", keep_change_as_credit: false, tip: 0, tip_change: false }
  );
  const [allowance, setAllowance] = useState(null); // {limit, used, remaining}
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/house-offers/allowance").then(({ data }) => setAllowance(data)).catch(() => setAllowance(null));
  }, []);

  // Linhas de itens em dívida (exclui itens de conta da casa — já são gratuitos)
  const itemRows = unpaidSales.flatMap((s) =>
    (s.items || []).filter((it) => !it.is_house_account).map((it) => ({ sale: s, it, key: rowKey(s.id, it.product_name) }))
  );
  const selCount = Object.keys(itemSel).length;
  const target = itemRows.reduce((acc, r) => acc + (r.it.unit_price || 0) * ((itemSel[r.key] || {}).pay || 0), 0);
  const offerAmount = itemRows.reduce((acc, r) => acc + (r.it.unit_price || 0) * ((itemSel[r.key] || {}).offer || 0), 0);

  const applyAmount = (sel) => {
    const t = itemRows.reduce((acc, r) => acc + (r.it.unit_price || 0) * ((sel[r.key] || {}).pay || 0), 0);
    setForm((f) => ({ ...f, amount: t > 0 ? t.toFixed(2) : f.amount }));
  };

  const changeItem = (key, qty, field, delta) => {
    const cur = itemSel[key] || { pay: 0, offer: 0 };
    let pay = cur.pay;
    let offer = cur.offer;
    if (field === "pay") pay = Math.max(0, Math.min(qty - cur.offer, cur.pay + delta));
    else offer = Math.max(0, Math.min(qty - cur.pay, cur.offer + delta));
    const next = { ...itemSel, [key]: { pay, offer } };
    if (pay <= 0 && offer <= 0) delete next[key];
    setItemSel(next);
    applyAmount(next);
  };

  const selectAll = () => {
    const next = {};
    let total = 0;
    itemRows.forEach((r) => {
      next[r.key] = { pay: r.it.quantity, offer: 0 };
      total += (r.it.unit_price || 0) * r.it.quantity;
    });
    setItemSel(next);
    setForm((f) => ({ ...f, amount: total > 0 ? total.toFixed(2) : f.amount }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const item_targets = itemRows
        .filter((r) => itemSel[r.key] && (itemSel[r.key].pay > 0 || itemSel[r.key].offer > 0))
        .map((r) => ({
          sale_id: r.sale.id,
          product_name: r.it.product_name,
          unit_price: r.it.unit_price || 0,
          qty_pay: itemSel[r.key].pay || 0,
          qty_offer: itemSel[r.key].offer || 0,
        }));
      const payTarget = item_targets.length
        ? item_targets.reduce((s, t) => s + t.unit_price * t.qty_pay, 0)
        : Math.max(client.balance || 0, 0);
      const tipValue = form.tip_change
        ? Math.max(Number(form.amount || 0) - payTarget - Number(form.points_used || 0) / 5, 0)
        : Number(form.tip || 0);
      const { data: payment } = await api.post("/payments", {
        client_id: client.id,
        amount: parseFloat(form.amount || 0),
        points_used: Number(form.points_used || 0),
        note: form.note || null,
        keep_change_as_credit: !!form.keep_change_as_credit,
        tip: tipValue || 0,
        sale_ids: null,
        item_targets: item_targets.length ? item_targets : null,
      });
      toast.success("Pagamento registado");
      onDone(payment);
    } catch (e2) {
      toast.error(formatApiErrorDetail(e2.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const cash = Number(form.amount) || 0;
  const ptsValue = (Number(form.points_used) || 0) / 5;
  const total = cash + ptsValue;
  const payTarget = selCount ? target : debt;
  const keepCredit = !!form.keep_change_as_credit;
  const tipChange = !!form.tip_change;
  const excess = Math.max(total - payTarget, 0);
  const tipExplicit = Number(form.tip) || 0;
  const tipValue = tipChange ? excess : Math.min(tipExplicit, excess);
  const totalApplied = keepCredit ? total - tipValue : Math.min(total - tipValue, payTarget);
  const change = keepCredit || tipChange ? 0 : Math.max(excess - tipValue, 0);
  const newCredit = keepCredit && total - tipValue > payTarget ? total - tipValue - payTarget : 0;
  // Oferta da casa abate à dívida sem entrada de caixa (despesa do bar)
  const debtReduction = totalApplied + offerAmount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Caixa do bar</div>
        <h3 className="font-outfit text-xl font-semibold mb-5 mt-1">Registar pagamento</h3>

        {/* Valor em aberto */}
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-4 mb-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300/80">Valor em aberto</span>
          <span data-testid="payment-open-amount" className="font-outfit text-2xl font-bold text-rose-300">{euro(debt)}</span>
        </div>

        {/* Itens consumidos em aberto — escolhe o que pagar e o que oferecer */}
        {itemRows.length > 0 && (
          <details className="mb-4 bg-slate-950 border border-slate-800 rounded-lg" data-testid="payment-items-breakdown" open>
            <summary className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-amber-400 list-none flex items-center justify-between">
              <span>O que está em dívida</span>
              <span className="text-slate-500 normal-case tracking-normal">escolhe o que pagar e o que oferecer</span>
            </summary>
            <div className="px-3 pb-1 flex items-center gap-2 text-[10px] flex-wrap">
              <button type="button" data-testid="pay-select-all" onClick={selectAll} className="px-2 py-1 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">Pagar tudo</button>
              <button type="button" data-testid="pay-select-none" onClick={() => { setItemSel({}); }} className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">Limpar</button>
              {allowance && (
                <span className="ml-auto text-fuchsia-300/90 flex items-center gap-1" title="Oferta da casa: limite mensal por utilizador">
                  <Gift size={11} weight="duotone" /> Ofertas este mês: {euro(allowance.used)} / {euro(allowance.limit)}
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto px-3 pb-3 space-y-2 text-xs">
              {unpaidSales.slice(0, 20).map((s) => (
                <div key={s.id} data-testid={`pay-sale-${s.id}`} className="border-t border-slate-800/60 pt-2">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="flex items-center gap-2">
                      {new Date(s.created_at).toLocaleString("pt-PT")}
                      {s.tx_number && <span className="font-mono text-slate-500">#{s.tx_number}</span>}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <strong className="text-amber-400">{euro(s.total)}</strong>
                      {canEditSale && (
                        <button
                          type="button"
                          data-testid={`payment-edit-sale-${s.id}`}
                          onClick={() => { onClose(); onEditSale(s); }}
                          title="Editar itens / transferir"
                          className="p-1 rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                        >
                          <PencilSimple size={10} weight="bold" />
                        </button>
                      )}
                      {canCancelSale && (
                        <button
                          type="button"
                          data-testid={`payment-cancel-sale-${s.id}`}
                          onClick={() => onCancelSale(s)}
                          title="Eliminar venda"
                          className="p-1 rounded-md bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                        >
                          <Trash size={10} weight="bold" />
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className="mt-0.5 pl-1">
                    {(s.items || []).filter((it) => !it.is_house_account).map((it, i) => {
                      const key = rowKey(s.id, it.product_name);
                      const sel = itemSel[key] || { pay: 0, offer: 0 };
                      const remaining = it.quantity - sel.pay - sel.offer;
                      return (
                        <li key={i} data-testid={`pay-item-${s.id}-${i}`} className="flex items-center justify-between gap-2 py-1">
                          <span className="flex-1 min-w-0 truncate">
                            {it.quantity}× {it.product_name}
                            <span className="text-slate-500 text-[10px]"> ({euro(it.unit_price || 0)}/un)</span>
                          </span>
                          <div className="flex items-center gap-3 shrink-0">
                            <QtyStepper
                              label="Pagar"
                              accent="amber"
                              value={sel.pay}
                              max={it.quantity - sel.offer}
                              onChange={(v) => changeItem(key, it.quantity, "pay", v - sel.pay)}
                            />
                            <QtyStepper
                              label="Ofertar"
                              accent="fuchsia"
                              value={sel.offer}
                              max={it.quantity - sel.pay}
                              onChange={(v) => changeItem(key, it.quantity, "offer", v - sel.offer)}
                            />
                            <span className="w-10 text-right text-[10px] text-slate-500" title="Fica em dívida">
                              {remaining > 0 ? `${remaining}× fica` : "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              A pagar (dinheiro / MBWay) €
            </label>
            <input
              data-testid="payment-amount-input"
              type="number"
              step="0.01"
              required
              min="0"
              autoFocus
              placeholder="0,00 (valor que o cliente entrega)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          {(client.points || 0) >= 5 && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80">Descontar pontos</span>
                <span className="text-xs text-slate-500">
                  Disponíveis: <strong className="text-green-300">{client.points}</strong>
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Pontos a descontar (múltiplos de 5)
                </label>
                <input
                  data-testid="payment-points-input"
                  type="number"
                  min="0"
                  step="5"
                  max={Math.floor((client.points || 0) / 5) * 5}
                  value={form.points_used}
                  onChange={(e) => setForm({ ...form, points_used: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Valor dos pontos:</span>
                <span data-testid="payment-points-value" className="font-bold text-green-300">
                  {euro((Number(form.points_used) || 0) / 5)}
                </span>
              </div>
            </div>
          )}

          {/* Resumo */}
          <div className="space-y-2">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total recebido</span>
              <span className="font-outfit text-xl font-bold text-slate-100">{euro(total)}</span>
            </div>
            {selCount > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">Alvo da seleção ({selCount} item(ns))</span>
                <span className="text-slate-200 font-bold">{euro(payTarget)}</span>
              </div>
            )}
            {offerAmount > 0 && (
              <div className="bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg p-3 flex items-center justify-between text-xs">
                <span className="text-fuchsia-300/90 flex items-center gap-1.5">
                  <Gift size={12} weight="duotone" /> Oferta da casa (despesa do bar)
                </span>
                <span data-testid="payment-offer-amount" className="font-bold text-fuchsia-300">{euro(offerAmount)}</span>
              </div>
            )}
            <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Abate na dívida</span>
              <span data-testid="payment-total-credit" className="font-outfit text-xl font-bold text-amber-300">{euro(debtReduction)}</span>
            </div>
            {tipValue > 0 && (
              <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Gratificação (caixa)</span>
                <span data-testid="payment-tip" className="font-outfit text-xl font-bold text-fuchsia-300">{euro(tipValue)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">Troco a devolver (dinheiro)</span>
                <span data-testid="payment-change" className="font-outfit text-xl font-bold text-emerald-300">{euro(change)}</span>
              </div>
            )}
            {newCredit > 0 && (
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">Fica como crédito a favor</span>
                <span data-testid="payment-new-credit" className="font-outfit text-xl font-bold text-sky-300">{euro(newCredit)}</span>
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 px-3 py-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-sky-500/40">
            <input
              data-testid="payment-keep-credit-toggle"
              type="checkbox"
              checked={!!form.keep_change_as_credit}
              onChange={(e) => setForm({ ...form, keep_change_as_credit: e.target.checked, tip_change: e.target.checked ? false : form.tip_change })}
              className="mt-0.5 w-4 h-4 accent-sky-400"
            />
            <span className="text-xs text-slate-200">
              <strong>Deixar troco como crédito</strong> a favor do cliente — por defeito o excedente é devolvido em dinheiro.
            </span>
          </label>

          <label className="flex items-start gap-3 px-3 py-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-fuchsia-500/40">
            <input
              data-testid="payment-tip-change-toggle"
              type="checkbox"
              checked={!!form.tip_change}
              onChange={(e) => setForm({ ...form, tip_change: e.target.checked, keep_change_as_credit: e.target.checked ? false : form.keep_change_as_credit })}
              className="mt-0.5 w-4 h-4 accent-fuchsia-400"
            />
            <span className="text-xs text-slate-200">
              <strong>Cliente deixa o troco como gratificação</strong> — vai para a caixa do bar (receita extra), não fica em conta.
            </span>
          </label>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Gratificação manual (€)</label>
            <input
              data-testid="payment-tip-input"
              type="number"
              step="0.01"
              min="0"
              disabled={!!form.tip_change}
              placeholder="0,00"
              value={form.tip}
              onChange={(e) => setForm({ ...form, tip: e.target.value })}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nota</label>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Numerário, MBWay..."
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
            <button data-testid="payment-submit-btn" type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
