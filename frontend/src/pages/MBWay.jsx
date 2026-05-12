import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { DeviceMobile, Check, X, Clock, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function MBWay() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/mbway-payments?status_filter=${filter}`);
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [filter]);

  const act = async (id, action) => {
    try {
      await api.post(`/mbway-payments/${id}/${action}`);
      toast.success(action === "confirm" ? "Pagamento confirmado" : "Pedido rejeitado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="mbway-page">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Pagamentos online
          </div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
            MBWay
          </h1>
        </div>
        <div className="flex gap-2">
          {[
            { v: "pending", label: "Pendentes" },
            { v: "confirmed", label: "Confirmados" },
            { v: "rejected", label: "Rejeitados" },
            { v: "", label: "Todos" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              data-testid={`mbway-filter-${f.v || "all"}`}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                filter === f.v
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : "bg-slate-900/40 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">A carregar...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <DeviceMobile size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
            <p className="text-slate-400">Sem pedidos {filter === "pending" ? "pendentes" : filter || ""}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">MBWay</th>
                  <th className="px-5 py-3 font-medium">Nota</th>
                  <th className="px-5 py-3 font-medium text-right">Valor</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr
                    key={m.id}
                    data-testid={`mbway-row-${m.id}`}
                    className="border-t border-slate-800/60 hover:bg-slate-900/60"
                  >
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(m.created_at).toLocaleString("pt-PT")}
                    </td>
                    <td className="px-5 py-3">
                      <Link to={`/clientes/${m.client_id}`} className="text-slate-100 hover:text-amber-400 flex items-center gap-1.5">
                        {m.client_name} <ArrowRight size={12} className="opacity-60" />
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-300 font-mono text-xs">{m.mbway_phone}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{m.note || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-outfit font-bold text-amber-300">{euro(m.amount)}</span>
                    </td>
                    <td className="px-5 py-3">
                      {m.status === "pending" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                          <Clock size={10} weight="fill" /> Pendente
                        </span>
                      ) : m.status === "confirmed" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Confirmado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          Rejeitado
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {m.status === "pending" ? (
                          <>
                            <button
                              data-testid={`mbway-confirm-${m.id}`}
                              onClick={() => act(m.id, "confirm")}
                              className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5"
                            >
                              <Check size={14} weight="bold" /> Confirmar
                            </button>
                            <button
                              data-testid={`mbway-reject-${m.id}`}
                              onClick={() => act(m.id, "reject")}
                              className="px-3 py-1.5 rounded-md text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center gap-1.5"
                            >
                              <X size={14} weight="bold" /> Rejeitar
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {m.confirmed_by ? `por ${m.confirmed_by.split("@")[0]}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
