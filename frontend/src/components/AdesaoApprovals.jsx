import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { UserPlus, Check, X as XIcon, SealCheck, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

/**
 * Direção: adesões pendentes (aprovar/rejeitar) e lista dos sócios aprovados recentemente.
 * Alimenta-se de /api/membership-applications e do contador do aviso do cabeçalho.
 */
export default function AdesaoApprovals() {
  const { user } = useAuth();
  const canDecide = ["admin", "tesoureiro", "presidente"].includes(user?.role);
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    if (!canDecide) return;
    try {
      const [p, a] = await Promise.all([
        api.get("/membership-applications", { params: { status_filter: "pending" } }),
        api.get("/membership-applications", { params: { status_filter: "accepted" } }),
      ]);
      setPending(p.data || []);
      setApproved((a.data || []).slice(0, 10));
    } catch {
      /* sem permissões */
    }
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [canDecide]);

  const decide = async (id, verb) => {
    setBusy(id);
    try {
      await api.post(`/membership-applications/${id}/${verb}`);
      toast.success(verb === "accept" ? "Adesão aprovada — novo sócio criado" : "Adesão rejeitada");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id) => {
    setBusy(id);
    try {
      await api.delete(`/membership-applications/${id}`);
      toast.success("Registo de adesão removido");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(null);
    }
  };

  if (!canDecide) return null;

  const fmt = (v) => (v ? new Date(v).toLocaleString("pt-PT") : "—");

  return (
    <div className="space-y-4 mb-6" data-testid="adesao-approvals">
      <div className="bg-slate-900/60 border border-amber-500/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={20} weight="duotone" className="text-amber-400" />
          <h2 className="font-outfit text-lg font-semibold">Pedidos de adesão pendentes</h2>
          <span className="text-xs text-slate-500 ml-auto" data-testid="adesao-pending-count">
            {pending.length} a aprovar
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="adesao-pending-empty">
            Sem pedidos pendentes — os novos pedidos aparecem aqui e no aviso do cabeçalho.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((a) => (
              <li key={a.id} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3" data-testid={`adesao-pending-${a.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="text-sm min-w-0">
                    <div className="font-semibold text-slate-100">{a.name}</div>
                    <div className="text-[11px] text-slate-400">
                      Nasc. {a.birthday ? new Date(a.birthday).toLocaleDateString("pt-PT") : "—"} · {a.contact || "—"}
                      {a.localidade ? ` · ${a.localidade}` : ""}
                      {a.email ? ` · ${a.email}` : ""}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {a.sponsor_member_number ? `Padrinho nº ${a.sponsor_member_number} · ` : ""}
                      Assinatura: {fmt(a.signed_at || a.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => decide(a.id, "accept")}
                      disabled={busy === a.id}
                      data-testid={`adesao-accept-${a.id}`}
                      className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check size={12} weight="bold" /> Aprovar sócio
                    </button>
                    <button
                      onClick={() => decide(a.id, "reject")}
                      disabled={busy === a.id}
                      data-testid={`adesao-reject-${a.id}`}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <XIcon size={12} weight="bold" /> Rejeitar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <SealCheck size={18} weight="duotone" className="text-emerald-400" />
          <h2 className="font-outfit text-lg font-semibold">Novos sócios aprovados</h2>
        </div>
        {approved.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="adesao-approved-empty">Ainda não há sócios aprovados por este formulário.</p>
        ) : (
          <ul className="divide-y divide-slate-800" data-testid="adesao-approved-list">
            {approved.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-100">{a.name}</span>
                  <span className="text-[11px] text-slate-500"> · aprovado em {fmt(a.decided_at)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    nº {a.member_number || "—"}
                  </span>
                  {user?.role === "admin" && (
                    <button
                      onClick={() => remove(a.id)}
                      disabled={busy === a.id}
                      title="Remover registo de adesão"
                      data-testid={`adesao-remove-${a.id}`}
                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 disabled:opacity-50"
                    >
                      <Trash size={13} weight="bold" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
