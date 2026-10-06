import React, { useEffect, useState } from "react";
import api, { euro } from "../lib/api";
import { Gift, Package, Users } from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "../lib/api";

const GIFT_STATUS = {
  requested: { label: "À espera de aceitação", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  accepted: { label: "Aceite · por confirmar", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  rejected: { label: "Recusado", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  paid: { label: "Pago · por solicitar", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  claimed: { label: "Solicitado · por servir", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  pending: { label: "Pendente a servir", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  served: { label: "Servido · por confirmar", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  consumed: { label: "Consumido", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

export default function GiftsStaff() {
  const [gifts, setGifts] = useState([]);

  const load = async () => {
    try {
      const { data } = await api.get("/socio-gifts");
      setGifts(data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const serve = async (g) => {
    try {
      await api.post(`/socio-gifts/${g.id}/serve`);
      toast.success(`Consumo servido a ${g.recipient_name} · fica por confirmar no portal`);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const active = gifts.filter((g) => ["claimed", "pending", "served"].includes(g.status));

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 mt-8" data-testid="gifts-staff">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Gift size={20} weight="duotone" className="text-pink-400" />
        <h2 className="font-outfit text-xl font-semibold">Consumos entre sócios</h2>
        <span className="text-xs text-slate-500 ml-auto">
          Pagos por um sócio para outro · servir quando solicitado ou confirmado
        </span>
      </div>
      {gifts.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">Sem consumos entre sócios.</div>
      ) : (
        <ul className="space-y-2 mt-3">
          {[...active, ...gifts.filter((g) => !active.includes(g))].slice(0, 20).map((g) => {
            const st = GIFT_STATUS[g.status] || { label: g.status, cls: "" };
            const servable = g.status === "claimed" || g.status === "pending";
            return (
              <li key={g.id} data-testid={`gift-${g.id}`} className="bg-slate-950/40 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <Users size={14} weight="duotone" className="text-slate-500 shrink-0" />
                    <span className="font-semibold truncate">
                      {g.payer_name} <span className="text-slate-500">(nº {g.payer_member_number})</span>
                      <span className="text-slate-500"> → </span>
                      <span className={g.status === "claimed" || g.status === "pending" ? "text-amber-300" : ""}>{g.recipient_name}</span>
                      <span className="text-slate-500"> (nº {g.recipient_member_number})</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-outfit text-lg font-bold text-amber-300">{euro(g.total)}</span>
                    {servable && (
                      <button
                        data-testid={`gift-serve-${g.id}`}
                        onClick={() => serve(g)}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs"
                      >
                        <Package size={13} weight="bold" /> Servir
                      </button>
                    )}
                  </div>
                </div>
                <ul className="text-xs text-slate-400 space-y-0.5">
                  {(g.items || []).map((it, i) => (
                    <li key={i}>{it.quantity}× {it.product_name} · {euro(it.subtotal)}</li>
                  ))}
                </ul>
                <div className="text-[10px] text-slate-500 mt-1">
                  {g.kind === "prepaid" ? "Deixado pago" : "Pagamento delegado"}
                  {g.tx_number ? <> · <span className="font-mono">#{g.tx_number}</span></> : null} · {new Date(g.created_at).toLocaleString("pt-PT")}
                  {g.served_at && <> · servido por {g.served_by} em {new Date(g.served_at).toLocaleString("pt-PT")}</>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
