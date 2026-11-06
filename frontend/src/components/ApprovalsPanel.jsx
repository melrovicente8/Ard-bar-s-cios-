import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { UserPlus, Check, X as XIcon, Users } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

/** Aprovação de adesões digitais e pedidos de agregado familiar (direção). */
export default function ApprovalsPanel() {
  const { user } = useAuth();
  const canDecide = ["admin", "tesoureiro", "presidente"].includes(user?.role);
  const [apps, setApps] = useState([]);
  const [family, setFamily] = useState([]);

  const load = async () => {
    if (!canDecide) return;
    try {
      const [a, f] = await Promise.all([
        api.get("/membership-applications", { params: { status_filter: "pending" } }),
        api.get("/family-requests", { params: { status_filter: "pending" } }),
      ]);
      setApps(a.data || []);
      setFamily(f.data || []);
    } catch {
      /* sem permissões */
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const decide = async (kind, id, verb) => {
    try {
      await api.post(`/${kind}/${id}/${verb}`);
      toast.success(verb === "approve" ? "Aprovado" : "Rejeitado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  if (!canDecide || (apps.length === 0 && family.length === 0)) return null;

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5" data-testid="approvals-panel">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={20} weight="duotone" className="text-sky-400" />
        <h2 className="font-outfit text-xl font-semibold">Aprovações pendentes</h2>
        <span className="text-xs text-slate-500 ml-auto">{apps.length + family.length} pedido(s)</span>
      </div>

      {apps.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Adesões a sócio</div>
          <ul className="space-y-2">
            {apps.map((a) => (
              <li key={a.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3" data-testid={`approval-app-${a.id}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="text-sm">
                    <div className="font-semibold text-slate-100">{a.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Nasc. {a.birthday ? new Date(a.birthday).toLocaleDateString("pt-PT") : "—"} · {a.contact || "—"}
                      {a.sponsor_member_number ? ` · padrinho nº ${a.sponsor_member_number}` : ""}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Assinatura: {new Date(a.signed_at || a.created_at).toLocaleString("pt-PT")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => decide("membership-applications", a.id, "accept")} data-testid={`approve-app-${a.id}`} className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1">
                      <Check size={12} weight="bold" /> Aprovar sócio
                    </button>
                    <button onClick={() => decide("membership-applications", a.id, "reject")} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1">
                      <XIcon size={12} weight="bold" /> Rejeitar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {family.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-1">
            <Users size={11} weight="duotone" /> Agregado familiar
          </div>
          <ul className="space-y-2">
            {family.map((f) => (
              <li key={f.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3" data-testid={`approval-family-${f.id}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="text-sm">
                    <div className="font-semibold text-slate-100">{f.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Titular: {f.family_head_name} · Nasc. {f.birthday ? new Date(f.birthday).toLocaleDateString("pt-PT") : "—"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => decide("family-requests", f.id, "approve")} data-testid={`approve-family-${f.id}`} className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1">
                      <Check size={12} weight="bold" /> Aprovar
                    </button>
                    <button onClick={() => decide("family-requests", f.id, "reject")} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1">
                      <XIcon size={12} weight="bold" /> Rejeitar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
