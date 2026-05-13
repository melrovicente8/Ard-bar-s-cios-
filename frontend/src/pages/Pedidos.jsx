import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ShoppingCart, Check, X as XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_CLASS = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function Pedidos() {
  const [filter, setFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = filter ? { status_filter: filter } : {};
      const { data } = await api.get("/consumption-requests", { params });
      setRequests(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const approve = async (r) => {
    if (!window.confirm(`Aprovar este pedido (${euro(r.total)}) de ${r.client_name}? Será criada uma venda e descontado o stock.`)) return;
    try {
      await api.post(`/consumption-requests/${r.id}/approve`);
      toast.success("Pedido aprovado · venda criada");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };
  const reject = async (r) => {
    if (!window.confirm(`Rejeitar este pedido de ${r.client_name}?`)) return;
    try {
      await api.post(`/consumption-requests/${r.id}/reject`);
      toast.success("Pedido rejeitado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="pedidos-page">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Validação</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Pedidos de sócio</h1>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        Os sócios podem submeter pedidos de consumo pelo portal. Aqui validas — ao aprovar é criada uma venda na ficha do sócio e descontado o stock.
      </p>

      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1 mb-5" data-testid="pedidos-filter">
        {[
          { v: "pending", l: "Pendentes" },
          { v: "approved", l: "Aprovados" },
          { v: "rejected", l: "Rejeitados" },
          { v: "", l: "Todos" },
        ].map((opt) => (
          <button
            key={opt.v}
            data-testid={`pedidos-filter-${opt.v || "all"}`}
            onClick={() => setFilter(opt.v)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${filter === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >{opt.l}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <ShoppingCart size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
          <p className="text-slate-400">Sem pedidos {filter || "(qualquer estado)"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} data-testid={`pedido-${r.id}`} className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div>
                  <Link to={`/clientes/${r.client_id}`} className="font-outfit text-lg font-semibold text-slate-100 hover:text-amber-400">
                    {r.client_name}
                  </Link>
                  <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString("pt-PT")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CLASS[r.status]}`}>
                    {r.status === "pending" ? "Pendente" : r.status === "approved" ? "Aprovado" : "Rejeitado"}
                  </span>
                  <span className="font-outfit text-xl font-bold text-amber-300">{euro(r.total)}</span>
                </div>
              </div>
              <ul className="text-sm text-slate-300 space-y-1 mb-3">
                {r.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between bg-slate-950/40 rounded px-3 py-1.5">
                    <span><span className="text-slate-500">{it.quantity}×</span> {it.product_name}</span>
                    <span className="text-slate-500">{euro(it.subtotal)}</span>
                  </li>
                ))}
              </ul>
              {r.note && <p className="text-xs text-slate-400 mb-3 italic">"{r.note}"</p>}
              {r.status === "pending" ? (
                <div className="flex gap-2">
                  <button
                    data-testid={`approve-${r.id}`}
                    onClick={() => approve(r)}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg py-2.5 flex items-center justify-center gap-2"
                  >
                    <Check size={16} weight="bold" /> Aprovar e criar venda
                  </button>
                  <button
                    data-testid={`reject-${r.id}`}
                    onClick={() => reject(r)}
                    className="bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 font-bold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2"
                  >
                    <XIcon size={16} weight="bold" /> Rejeitar
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  {r.status === "approved" && r.sale_id ? (
                    <>Aprovado por {r.decided_by} · venda <Link to={`/clientes/${r.client_id}`} className="text-amber-400 hover:underline">#{r.sale_id.slice(0,8)}</Link></>
                  ) : (
                    <>Decidido por {r.decided_by} em {new Date(r.decided_at).toLocaleString("pt-PT")}</>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
