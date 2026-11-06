import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Lock, LockOpen, ShieldCheck, CheckCircle, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const TARGETS = [
  { v: "cash", l: "Caixa (numerário)", key: "cash_balance" },
  { v: "bank", l: "Banco (depósitos)", key: "bank_deposits_balance" },
  { v: "mbway", l: "MBWay", key: "mbway_balance" },
];

const statusLabel = { pending: "Aguarda 2.º administrador", approved: "Confirmado", rejected: "Recusado" };
const statusClass = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

/**
 * Acertos de abertura com dois passos: o cadeado (palavra-passe do administrador)
 * e a confirmação de um SEGUNDO administrador antes de o acerto correr.
 */
export default function AcertoPanel({ balances, user, onDone }) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [requests, setRequests] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [clientId, setClientId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRequests = async () => {
    try {
      const { data } = await api.get("/acertos");
      setRequests(data || []);
    } catch {
      /* sem histórico ainda */
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    api.get("/clients")
      .then(({ data }) => setClients((data || []).filter((c) => Math.abs(Number(c.balance || 0)) >= 0.005)))
      .catch(() => {});
    api.get("/suppliers")
      .then(({ data }) => setSuppliers((data || []).filter((s) => Number(s.outstanding || 0) >= 0.005)))
      .catch(() => {});
  }, [unlocked]);

  const unlock = async () => {
    if (!password) return toast.error("Escreve a tua palavra-passe");
    try {
      await api.post("/acertos/unlock", { password });
      setUnlocked(true);
      toast.success("Cadeado aberto — os pedidos de acerto ficam disponíveis");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const ask = async (payload, label) => {
    if (!unlocked) return toast.error("Desbloqueia o cadeado primeiro");
    const reason = window.prompt(`Motivo do acerto (${label})`, "Acerto de abertura");
    if (reason === null) return;
    setBusy(true);
    try {
      await api.post("/acertos", { ...payload, password, reason });
      toast.success("Pedido criado — falta a confirmação de outro administrador");
      await loadRequests();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (req, action) => {
    const pw = window.prompt(
      `Confirma com a tua palavra-passe para ${action === "approve" ? "APROVAR" : "RECUSAR"} o acerto "${req.label}"`
    );
    if (!pw) return;
    setBusy(true);
    try {
      await api.post(`/acertos/${req.id}/${action}`, { password: pw });
      toast.success(action === "approve" ? "Acerto confirmado e aplicado" : "Acerto recusado");
      setPassword(pw);
      setUnlocked(true);
      await loadRequests();
      if (action === "approve" && onDone) await onDone();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5 space-y-4" data-testid="acerto-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {unlocked ? <LockOpen size={20} weight="duotone" className="text-emerald-400" /> : <Lock size={20} weight="duotone" className="text-amber-400" />}
          <h3 className="font-outfit text-lg font-semibold">Acertos de abertura</h3>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${unlocked ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}`} data-testid="acerto-lock-state">
            {unlocked ? "Cadeado aberto" : "Cadeado fechado"}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 max-w-md">
          Cada acerto é pedido por um administrador (cadeado) e só corre depois de um segundo administrador confirmar.
        </p>
      </div>

      {!unlocked ? (
        <div className="flex flex-col sm:flex-row gap-2" data-testid="acerto-unlock-row">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="A tua palavra-passe (administrador)"
            data-testid="acerto-password"
            className="flex-1 bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
          />
          <button onClick={unlock} data-testid="acerto-unlock" className="px-4 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400">
            Desbloquear
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Zerar valores da tesouraria</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TARGETS.map((t) => (
                <button
                  key={t.v}
                  disabled={busy}
                  onClick={() => ask({ kind: "balances", targets: [t.v] }, t.l)}
                  data-testid={`acerto-zero-${t.v}`}
                  className="text-left px-4 py-3 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Zerar {t.l}</div>
                  <div className="font-outfit text-xl font-bold text-rose-300">{euro(balances?.[t.key] || 0)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Zerar conta de sócio/cliente</div>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                data-testid="acerto-client-select"
                className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
              >
                <option value="">Escolhe o sócio/cliente…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.member_number ? ` · nº ${c.member_number}` : ""} · {euro(c.balance || 0)}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !clientId}
                onClick={() => ask({ kind: "client", entity_id: clientId }, clients.find((c) => c.id === clientId)?.name || "conta")}
                data-testid="acerto-client-submit"
                className="w-full px-4 py-2 rounded-lg border border-rose-500/30 text-rose-300 text-xs font-bold hover:bg-rose-500/10 disabled:opacity-50"
              >
                Pedir acerto da conta
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Zerar conta de fornecedor</div>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                data-testid="acerto-supplier-select"
                className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
              >
                <option value="">Escolhe o fornecedor…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {euro(s.outstanding || 0)}</option>
                ))}
              </select>
              <button
                disabled={busy || !supplierId}
                onClick={() => ask({ kind: "supplier", entity_id: supplierId }, suppliers.find((s) => s.id === supplierId)?.name || "fornecedor")}
                data-testid="acerto-supplier-submit"
                className="w-full px-4 py-2 rounded-lg border border-rose-500/30 text-rose-300 text-xs font-bold hover:bg-rose-500/10 disabled:opacity-50"
              >
                Pedir acerto da conta
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            <ShieldCheck size={14} weight="duotone" /> Pedidos de acerto
          </div>
          <span className="text-[11px] text-slate-500">{pending.length} por confirmar</span>
        </div>
        {requests.length === 0 ? (
          <div className="text-xs text-slate-500 py-3">Ainda não há pedidos de acerto.</div>
        ) : (
          <div className="space-y-2">
            {requests.slice(0, 8).map((r) => {
              const mine = r.requested_by === user?.email;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 justify-between bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2" data-testid={`acerto-row-${r.id}`}>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 truncate">{r.label} · <span className="text-rose-300">{euro(r.amount || 0)}</span></div>
                    <div className="text-[11px] text-slate-500">
                      pedido por {r.requested_by_name} · {new Date(r.requested_at).toLocaleString("pt-PT")}
                      {r.decided_by_name ? ` · decidido por ${r.decided_by_name}` : ""}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${statusClass[r.status]}`}>{statusLabel[r.status]}</span>
                    {r.status === "pending" && (
                      <>
                        <button
                          disabled={busy || mine}
                          title={mine ? "Tem de ser confirmado por outro administrador" : "Aprovar acerto"}
                          onClick={() => decide(r, "approve")}
                          data-testid={`acerto-approve-${r.id}`}
                          className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-500/25 disabled:opacity-40 flex items-center gap-1"
                        >
                          <CheckCircle size={12} weight="duotone" /> Aprovar
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => decide(r, "reject")}
                          data-testid={`acerto-reject-${r.id}`}
                          className="px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[11px] font-bold hover:bg-rose-500/20 disabled:opacity-40 flex items-center gap-1"
                        >
                          <XCircle size={12} weight="duotone" /> Recusar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
