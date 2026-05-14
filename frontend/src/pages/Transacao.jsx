import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ArrowLeft, Printer, Receipt, ShoppingBag, User } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Transacao() {
  const { tx_number } = useParams();
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/transactions/${tx_number}`)
      .then(({ data }) => setTx(data))
      .catch((e) => setErr(formatApiErrorDetail(e.response?.data?.detail) || "Erro"))
      .finally(() => setLoading(false));
  }, [tx_number]);

  const print2 = () => {
    if (!tx) return;
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) return toast.error("Permite popups");
    const isSale = !!tx.items;
    const dateStr = new Date(tx.created_at).toLocaleString("pt-PT");
    const itemsHtml = isSale ? tx.items.map((it) => `<div class="row"><span>${it.quantity}× ${it.product_name}</span><span>${euro(it.subtotal)}</span></div>`).join("") : "";
    const tendered = tx.tendered || tx.amount || 0;
    const credited = tx.total_credited || tx.amount || 0;
    const change = tx.change_returned || 0;
    const tip = tx.tip || 0;
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
<h2>${isSale ? "VENDA" : "RECIBO"} · 2ª VIA</h2>
<div class="txn">TRANSAÇÃO Nº ${tx.tx_number}</div>
<div class="muted">${dateStr}</div>
<div class="muted">Registado por: ${tx.user_email || "—"}</div>
<hr/>
<div class="row"><span>Cliente</span><strong>${tx.client_name || "—"}</strong></div>
${isSale ? `<hr/>${itemsHtml}<hr/><div class="row big"><span>TOTAL</span><span>${euro(tx.total)}</span></div>` : `<hr/>
<div class="row"><span>Numerário entregue</span><span>${euro(tendered)}</span></div>
${tx.points_used ? `<div class="row"><span>Pontos usados</span><span>${tx.points_used} pts</span></div>` : ""}
<div class="row"><span>Valor da despesa</span><span>${euro(credited)}</span></div>
${change > 0 ? `<div class="row"><span>Troco devolvido</span><span>${euro(change)}</span></div>` : ""}
${tip > 0 ? `<div class="row"><span>Gratificação</span><span>${euro(tip)}</span></div>` : ""}
${tx.note ? `<div class="row"><span>Nota</span><span>${tx.note}</span></div>` : ""}`}
<hr/>
<div style="text-align:center" class="muted">Obrigado pela preferência</div>
<div style="text-align:center;margin-top:14px"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
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
      <Link to="/historico" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-6"><ArrowLeft size={16} /> Voltar</Link>
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
              <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/80">Gratificação</div>
              <div className="text-fuchsia-300">{euro(tx.tip)}</div>
            </div>
          )}
          {!isSale && tx.points_used > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pontos usados</div>
              <div className="text-green-300">{tx.points_used} pts</div>
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
                  <span><span className="text-slate-500">{it.quantity}×</span> {it.product_name}</span>
                  <span className="text-slate-300">{euro(it.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
