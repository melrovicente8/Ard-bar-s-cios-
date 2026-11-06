import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { printReceipt } from "../lib/receipt";
import { ArrowLeft, Printer, Receipt, ShoppingBag, User, ClockCounterClockwise, ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function Transacao() {
  const { tx_number } = useParams();
  const { user } = useAuth();
  const canValidate = ["admin", "tesoureiro", "presidente"].includes(user?.role);
  const [tx, setTx] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

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
    const res = printReceipt(tx, {
      client,
      quotaStatus: client?.quota_status,
      coveredSales: tx.sale_tx_numbers || (tx.sale_ids ? [] : []),
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
  return (
    <div className="p-6 md:p-10 animate-in" data-testid="transacao-page">
      <Link to="/transacoes" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-6"><ArrowLeft size={16} /> Voltar</Link>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Transação</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Nº {tx.tx_number}</h1>
          <div className="text-sm text-slate-400 mt-1">{isSale ? "Venda" : "Pagamento"} · {new Date(tx.created_at).toLocaleString("pt-PT")} · por <span className="text-amber-300">{tx.user_email || "—"}</span></div>
        </div>
        <div className="flex gap-2">
          <button onClick={print2} data-testid="tx-print" className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-2 text-sm">
            <Printer size={14} weight="bold" /> Imprimir 2ª via
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
          <h2 className="font-outfit text-xl font-semibold">{isSale ? "Venda" : "Recibo de Pagamento"}</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cliente</div>
            <div className="text-slate-100 font-medium">{tx.client_name || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</div>
            <div className="text-amber-300 font-bold text-lg">{euro(isSale ? tx.total : (tx.total_credited || tx.amount || 0))}</div>
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
    </div>
  );
}
