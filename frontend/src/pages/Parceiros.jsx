import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Storefront, Plus, Trash, Check, X, ArrowClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_STYLE = {
  pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  validated: { label: "Validado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejected: { label: "Rejeitado", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

/**
 * Parceiros locais (staff): ativar/desativar a parceria e validar os talões enviados pelos sócios.
 */
export default function Parceiros() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [partners, setPartners] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [form, setForm] = useState({ name: "", emoji: "🤝", points_per_5eur: 0.5, active: true, auto_validate: true });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [p, t] = await Promise.all([
      api.get("/partners").catch(() => ({ data: [] })),
      api.get("/partner-tickets", { params: { status_filter: filter === "all" ? "all" : filter } }).catch(() => ({ data: [] })),
    ]);
    setPartners(p.data || []);
    setTickets(t.data || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Indica o nome do parceiro");
    setBusy(true);
    try {
      await api.post("/partners", form);
      setForm({ name: "", emoji: "🤝", points_per_5eur: 0.5, active: true, auto_validate: true });
      load();
      toast.success("Parceiro criado");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id, body) => {
    try {
      await api.put(`/partners/${id}`, body);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/partners/${id}`);
      load();
      toast.success("Parceiro removido");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const validate = async (id) => {
    try {
      await api.post(`/partner-tickets/${id}/validate`);
      load();
      toast.success("Talão validado · benefício creditado");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const reject = async (id) => {
    const reason = window.prompt("Motivo da rejeição (opcional):") || "";
    try {
      await api.post(`/partner-tickets/${id}/reject`, { reason });
      load();
      toast.success("Talão rejeitado");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-8 animate-in" data-testid="parceiros-page">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Receita indireta</div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <Storefront size={28} weight="duotone" className="text-sky-400" /> Parceiros Locais
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Os sócios enviam a fotografia do talão pela app; aqui validas (ou a validação é automática) e os pontos são creditados.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Parceiros */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
          <h2 className="font-outfit text-lg font-semibold mb-3">Parcerias</h2>
          <div className="space-y-2" data-testid="partners-list">
            {partners.length === 0 && (
              <div className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-lg">
                Sem parceiros registados.
              </div>
            )}
            {partners.map((p) => (
              <div key={p.id} data-testid={`partner-${p.id}`} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.emoji}</span>
                  <strong className="text-slate-100 flex-1 truncate">{p.name}</strong>
                  <span className="text-[10px] text-slate-500">{p.points_per_5eur} pts / 5,01 €</span>
                  {isAdmin && (
                    <button onClick={() => remove(p.id)} className="p-1 rounded text-rose-400 hover:bg-rose-500/10" title="Remover">
                      <Trash size={13} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      data-testid={`partner-active-${p.id}`}
                      type="checkbox"
                      checked={!!p.active}
                      disabled={!isAdmin}
                      onChange={(e) => patch(p.id, { active: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    Parceria ativa na app do sócio
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      data-testid={`partner-auto-${p.id}`}
                      type="checkbox"
                      checked={p.auto_validate !== false}
                      disabled={!isAdmin}
                      onChange={(e) => patch(p.id, { auto_validate: e.target.checked })}
                      className="accent-sky-500"
                    />
                    Validação automática
                  </label>
                </div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <form onSubmit={create} className="mt-4 pt-4 border-t border-slate-800 space-y-2" data-testid="partner-form">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Novo parceiro</div>
              <div className="flex gap-2">
                <input
                  data-testid="partner-emoji"
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                  className="w-14 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-center text-white"
                  maxLength={4}
                />
                <input
                  data-testid="partner-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome do estabelecimento"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-emerald-500" />
                  Ativa
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input type="checkbox" checked={form.auto_validate} onChange={(e) => setForm({ ...form, auto_validate: e.target.checked })} className="accent-sky-500" />
                  Validação automática
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 ml-auto">
                  pts / 5,01 €
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.points_per_5eur}
                    onChange={(e) => setForm({ ...form, points_per_5eur: Number(e.target.value) })}
                    className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white"
                  />
                </label>
              </div>
              <button
                data-testid="partner-create"
                disabled={busy}
                className="w-full py-2 rounded-lg bg-sky-500 text-slate-950 font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <Plus size={14} weight="bold" /> Criar parceiro
              </button>
            </form>
          )}
        </section>

        {/* Fila de validação */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-outfit text-lg font-semibold flex-1">Talões</h2>
            <button onClick={load} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700" title="Atualizar">
              <ArrowClockwise size={13} />
            </button>
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
              {[["pending", "Pendentes"], ["validated", "Validados"], ["rejected", "Rejeitados"], ["all", "Todos"]].map(([v, l]) => (
                <button
                  key={v}
                  data-testid={`tickets-filter-${v}`}
                  onClick={() => setFilter(v)}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    filter === v ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-lg">
              Sem talões neste filtro.
            </div>
          ) : (
            <ul className="space-y-2 max-h-[70vh] overflow-y-auto" data-testid="partner-tickets-list">
              {tickets.map((t) => {
                const st = STATUS_STYLE[t.status] || STATUS_STYLE.pending;
                return (
                  <li key={t.id} data-testid={`ticket-${t.id}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{t.partner_emoji}</span>
                      <strong className="text-sm text-slate-100 truncate">{t.client_name}</strong>
                      {t.member_number && <span className="text-[10px] text-slate-500">nº {t.member_number}</span>}
                      <span className="text-amber-300 font-bold text-sm ml-auto">{euro(t.amount)}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {t.partner_name} · compra {new Date(`${t.purchase_date}T12:00:00`).toLocaleDateString("pt-PT")}
                      {t.doc_number ? ` · doc. ${t.doc_number}` : ""}
                      {t.validation ? ` · validação ${t.validation === "auto" ? "automática" : "manual"}` : ""}
                      {t.points_awarded ? ` · +${t.points_awarded} pts` : ""}
                      {t.duplicate_of ? ` · ⚠️ duplicado de ${t.duplicate_of}` : ""}
                    </div>
                    {t.photo_data && (
                      <a href={t.photo_data} target="_blank" rel="noreferrer" className="mt-2 block">
                        <img src={t.photo_data} alt="talão" className="max-h-28 rounded border border-slate-800" />
                      </a>
                    )}
                    {t.status === "pending" && (
                      <div className="flex gap-2 mt-2">
                        <button
                          data-testid={`ticket-validate-${t.id}`}
                          onClick={() => validate(t.id)}
                          className="flex-1 py-1.5 rounded bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1"
                        >
                          <Check size={12} weight="bold" /> Validar
                        </button>
                        <button
                          data-testid={`ticket-reject-${t.id}`}
                          onClick={() => reject(t.id)}
                          className="flex-1 py-1.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1"
                        >
                          <X size={12} weight="bold" /> Rejeitar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
