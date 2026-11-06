import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { printTransactionTicket } from "../lib/tickets";
import { ArrowLeft, Printer, Receipt, ShoppingBag, User, ClockCounterClockwise, ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import SecondCopyDialog from "../components/SecondCopyDialog";

const Detail = ({ label, value, className = "text-slate-200" }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-slate-500 text-xs">{label}</span>
    <span className={`text-sm ${className}`}>{value}</span>
  </div>
);

export default function Transacao() {
  const { tx_number } = useParams();
  const { user } = useAuth();
  const canValidate = ["admin", "tesoureiro", "presidente"].includes(user?.role);
  const [tx, setTx] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  // 2ª via: pergunta se envia ao sócio do ticket ou só visualiza
  const [secondCopy, setSecondCopy] = useState(false);

  const reload = async () => {
    const { data } = await api.get(`/transactions/${tx_number}`);
    setTx(data);
  };

  const validateRemoval = async (removalId) => {
    try {
      await api.post(`/sales/${tx.id}/removals/${removalId}/validate`);
      toast.success("Exclusão validada");
      await reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  useEffect(() => {
    setLoading(true);
    api.get(`/transactions/${tx_number}`)
      .then(async ({ data }) => {
        // recibos de pagamento: buscar as vendas cobertas (com os itens vendidos)
        if (!data.items && (data.sale_tx_numbers || []).length) {
          const docs = await Promise.all(
            data.sale_tx_numbers.map((n) =>
              api.get(`/transactions/${n}`).then((r) => r.data).catch(() => null)
            )
          );
          data.covered_docs = docs.filter(Boolean);
        }
        setTx(data);
        // dados do cliente para o recibo (saldo de pontos + conta corrente + cotas)
        if (data.client_id) {
          try {
            const { data: cd } = await api.get(`/clients/${data.client_id}`);
            setClient(cd.client);
          } catch { /* cliente removido */ }
        }
      })
      .catch((e) => setErr(formatApiErrorDetail(e.response?.data?.detail) || "Erro"))
      .finally(() => setLoading(false));
  }, [tx_number]);

  const print2 = () => {
    if (!tx) return;
    const res = printTransactionTicket(tx, {
      client,
      clientName: tx.client_name,
      quotaStatus: client?.quota_status,
      coveredSales: tx.sale_tx_numbers || [],
      coveredSalesDocs: tx.covered_docs || [],
      secondCopy: true,
    });
    if (!res.ok) toast.error("Permite popups");
  };

  if (loading) return <div className="p-12 text-slate-500">A carregar transação...</div>;
  if (err) return (
    <div className="p-6 md:p-10 animate-in">
      <Link to="/historico" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-6"><ArrowLeft size={16} /> Voltar</Link>
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6 text-rose-300">{err}</div>
    </div>
  );
  if (!tx) return null;

  const isSale = !!tx.items;
  const KIND_TITLE = {
    sale: "Venda",
    payment: tx.source === "refund" ? "Nota de crédito (devolução)" : "Recibo de Pagamento",
    expense: "Despesa",
    order: "Encomenda",
    cash_withdrawal: "Movimento de caixa / banco",
    cash_close: "Fecho de caixa",
  };
  const kindTitle = KIND_TITLE[tx._kind] || "Transação";
  const totalShown = isSale
    ? tx.total
    : tx._kind === "payment"
    ? tx.total_credited || tx.amount || 0
    : tx._kind === "cash_close"
    ? tx.cash_counted || 0
    : tx.amount || tx.total || 0;
  return (
    <div className="p-6 md:p-10 animate-in" data-testid="transacao-page">
      <Link to="/transacoes" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-6"><ArrowLeft size={16} /> Voltar</Link>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Transação</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Nº {tx.tx_number}</h1>
          <div className="text-sm text-slate-400 mt-1">{kindTitle} · {new Date(tx.created_at).toLocaleString("pt-PT")} · por <span className="text-amber-300">{tx.user_email || "—"}</span></div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (tx._kind === "sale" || tx._kind === "payment") setSecondCopy(true); else print2(); }}
            data-testid="tx-print"
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-2 text-sm"
          >
            <Printer size={14} weight="bold" /> {isSale || tx._kind === "payment" ? "Imprimir 2ª via" : "Imprimir ticket"}
          </button>
          {tx.client_id && (
            <Link to={`/clientes/${tx.client_id}`} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm flex items-center gap-2">
              <User size={14} weight="duotone" /> Ver cliente
            </Link>
          )}
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          {isSale ? <ShoppingBag size={18} weight="duotone" className="text-amber-400" /> : <Receipt size={18} weight="duotone" className="text-emerald-400" />}
          <h2 className="font-outfit text-xl font-semibold">{kindTitle}</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cliente</div>
            <div className="text-slate-100 font-medium">{tx.client_name || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</div>
            <div className="text-amber-300 font-bold text-lg">{euro(totalShown)}</div>
          </div>
          {!isSale && tx.tendered !== undefined && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Numerário entregue</div>
              <div className="text-slate-200">{euro(tx.tendered)}</div>
            </div>
          )}
          {!isSale && (tx.change_returned || 0) > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Troco</div>
              <div className="text-emerald-300">{euro(tx.change_returned)}</div>
            </div>
          )}
          {!isSale && (tx.tip || 0) > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gratificação</div>
              <div className="text-fuchsia-300">{euro(tx.tip)}</div>
            </div>
          )}
          {!isSale && tx.points_used > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pontos usados</div>
              <div className="text-green-300">{tx.points_used} pts</div>
            </div>
          )}
          {!isSale && (tx.sale_tx_numbers || []).length > 0 && (
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vendas cobertas</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(tx.sale_tx_numbers || []).map((n) => (
                  <Link key={n} to={`/transacoes/${n}`} className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-xs">#{n}</Link>
                ))}
              </div>
            </div>
          )}
          {tx.note && (
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nota</div>
              <div className="text-slate-300">{tx.note}</div>
            </div>
          )}
        </div>
        {isSale && (
          <div className="mt-5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Itens</div>
            <ul className="space-y-1.5 text-sm">
              {tx.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <span><span className="text-slate-500">{it.quantity}×</span> {it.product_name} <span className="text-slate-500 text-xs">({euro(it.unit_price || 0)}/un)</span></span>
                  <span className="text-slate-300">{euro(it.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isSale && (tx.payment_offer_items || []).length > 0 && (
          <div className="mt-5" data-testid="tx-sale-offer">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300 mb-2">
              Oferta da casa · transação #{tx.payment_tx_number}
            </div>
            <ul className="space-y-1.5 text-sm">
              {(tx.payment_offer_items || []).map((o, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <span><span className="text-slate-500">{o.quantity}×</span> {o.product_name}</span>
                  <span className="text-fuchsia-300">−{euro(o.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-slate-400">A pagar pelo cliente</span>
              <span className="font-outfit text-lg font-bold text-amber-300">{euro(Math.max((tx.total || 0) - (tx.payment_offer_amount || 0), 0))}</span>
            </div>
            {tx.payment_offer_by && <div className="text-[11px] text-slate-500 mt-1">Oferecido por {tx.payment_offer_by}</div>}
          </div>
        )}

        {tx._kind === "expense" && (tx.house_items || []).length > 0 && (
          <div className="mt-5" data-testid="tx-house-offer-detail">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300 mb-2">O que foi oferecido</div>
            <ul className="space-y-1.5 text-sm">
              {(tx.house_items || []).map((o, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                  <span><span className="text-slate-500">{o.qty}×</span> {o.product_name} <span className="text-slate-500 text-xs">({euro(o.unit_price || 0)}/un)</span></span>
                  <span className="text-slate-300">{euro(o.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="text-[11px] text-slate-500 mt-1">Oferecido por {tx.user_email || "—"}</div>
          </div>
        )}

        {tx._kind === "cash_withdrawal" && (
          <div className="mt-5 space-y-1 text-sm" data-testid="tx-cash-movement-detail">
            <Detail label="Tipo" value={tx.kind === "bank_deposit" ? "Depósito no banco" : tx.kind === "credit_refund" ? "Devolução de crédito" : tx.kind} />
            {tx.client_name && <Detail label="Cliente" value={tx.client_name} />}
            {tx.supplier_name && <Detail label="Fornecedor" value={tx.supplier_name} />}
            {tx.deposit_note && <Detail label="Nota de depósito" value={tx.deposit_note} />}
            {tx.deposit_date && <Detail label="Data do depósito" value={new Date(tx.deposit_date).toLocaleDateString("pt-PT")} />}
            {tx.payment_ref && <Detail label="Referência" value={tx.payment_ref} />}
            {tx.note && <Detail label="Descrição" value={tx.note} />}
            {tx.linked_payment?.credit_origins?.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Crédito devolvido · origem</div>
                {tx.linked_payment.credit_origins.map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-400">
                    <span>#{o.tx_number} · {new Date(o.date).toLocaleDateString("pt-PT")}</span>
                    <span>{euro(o.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tx._kind === "cash_close" && (
          <div className="mt-5 space-y-1 text-sm" data-testid="tx-cash-close-detail">
            <Detail label="Contado em caixa" value={euro(tx.cash_counted || 0)} />
            <Detail label="Esperado" value={euro(tx.expected_cash || 0)} />
            <Detail
              label="Diferença"
              value={`${(tx.difference || 0) >= 0 ? "+" : ""}${euro(tx.difference || 0)}`}
              className={Math.abs(tx.difference || 0) >= 0.01 ? "text-rose-300" : "text-emerald-300"}
            />
          </div>
        )}

        {isSale && (tx.pending_removals || []).length > 0 && (
          <div className="mt-6 border-t border-slate-800 pt-4" data-testid="tx-pending-removals">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300/80 mb-2">
              Exclusões de itens por validar
            </div>
            <ul className="space-y-2">
              {(tx.pending_removals || []).map((r) => (
                <li key={r.id} className={`rounded-lg border p-3 text-xs ${r.status === "pending" ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-slate-200">
                      {(r.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}
                    </span>
                    <span className={r.status === "pending" ? "text-rose-300" : "text-emerald-300"}>
                      {r.status === "pending" ? "Pendente" : `Validada por ${r.validated_by || "—"}`}
                    </span>
                  </div>
                  <div className="text-slate-400 mt-1">Motivo: {r.reason}</div>
                  <div className="text-slate-500 mt-1">
                    {new Date(r.at).toLocaleString("pt-PT")} · por {r.by}
                  </div>
                  {r.status === "pending" && canValidate && (
                    <button
                      data-testid={`tx-validate-removal-${r.id}`}
                      onClick={() => validateRemoval(r.id)}
                      className="mt-2 px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <ShieldCheck size={12} weight="bold" /> Validar exclusão
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isSale && (tx.edits || []).length > 0 && (
          <div className="mt-6 border-t border-slate-800 pt-4" data-testid="tx-edit-history">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <ClockCounterClockwise size={12} /> Histórico de edições · antes / depois
            </div>
            <ul className="space-y-2">
              {(tx.edits || []).map((ed) => (
                <li key={ed.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs space-y-1">
                  <div className="text-slate-500">{new Date(ed.at).toLocaleString("pt-PT")} · por {ed.by}</div>
                  {ed.changes?.client && (
                    <div className="text-slate-300">Cliente: <span className="line-through text-slate-500">{ed.changes.client.before}</span> → <span className="text-slate-100">{ed.changes.client.after}</span></div>
                  )}
                  {ed.changes?.items && (
                    <div className="text-slate-300">
                      Itens: <span className="line-through text-slate-500">{(ed.changes.items.before || []).join(", ") || "—"}</span> → <span className="text-slate-100">{(ed.changes.items.after || []).join(", ") || "—"}</span>
                    </div>
                  )}
                  {ed.changes?.removed && (
                    <div className="text-rose-300">Removidos: {(ed.changes.removed || []).join(", ")}</div>
                  )}
                  {ed.changes?.removal_reason && (
                    <div className="text-slate-400">Motivo: {ed.changes.removal_reason}</div>
                  )}
                  {ed.changes?.total && (
                    <div className="text-slate-300">
                      Total: <span className="line-through text-slate-500">{euro(ed.changes.total.before)}</span> → <span className="text-amber-300">{euro(ed.changes.total.after)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {secondCopy && (
        <SecondCopyDialog
          tx={tx}
          client={client || (tx.client_id ? { id: tx.client_id, name: tx.client_name, member_number: tx.member_number } : null)}
          onView={print2}
          onClose={() => setSecondCopy(false)}
        />
      )}
    </div>
  );
}
