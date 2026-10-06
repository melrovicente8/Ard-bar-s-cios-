import React, { useEffect, useState } from "react";
import { Users, Plus, CalendarBlank, Warning, User, Check } from "@phosphor-icons/react";
import { toast } from "sonner";
import api, { euro, formatApiErrorDetail } from "../lib/api";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Agregado familiar do titular — dependentes, inscrição e pagamento de quotas por MBWay.
 * Endpoints: GET/POST /api/socio/family · POST /api/socio/family/quotas/pay
 */
export default function SocioFamily({ titular, onClose }) {
  const [deps, setDeps] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", birthday: "" });
  const [sel, setSel] = useState({}); // { depId: [months] }

  const load = async () => {
    try {
      const { data } = await api.get("/socio/family");
      setDeps(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  useEffect(() => { load(); }, []);

  const addDependent = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Indica o nome do dependente");
    try {
      await api.post("/socio/family", {
        name: form.name,
        contact: form.contact || null,
        birthday: form.birthday || null,
      });
      toast.success("Dependente inscrito no agregado familiar");
      setForm({ name: "", contact: "", birthday: "" });
      setAdding(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const toggleMonth = (depId, month, unpaid) => {
    if (!unpaid) return;
    setSel((s) => {
      const cur = s[depId] || [];
      return { ...s, [depId]: cur.includes(month) ? cur.filter((m) => m !== month) : [...cur, month] };
    });
  };

  const payQuotas = async (dep) => {
    const months = sel[dep.id] || [];
    if (!months.length) return toast.error("Seleciona pelo menos um mês");
    try {
      await api.post("/socio/family/quotas/pay", {
        dependent_id: dep.id,
        year: new Date().getFullYear(),
        months,
        mbway_phone: titular.contact || "",
      });
      toast.success(`Pedido MBWay enviado para as cotas de ${dep.name}`);
      setSel((s) => ({ ...s, [dep.id]: [] }));
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="socio-family-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center gap-2 mb-1">
          <Users size={22} weight="duotone" className="text-teal-400" />
          <h3 className="font-outfit text-xl font-semibold">Agregado Familiar</h3>
          {!adding && (
            <button
              data-testid="socio-family-add-toggle"
              onClick={() => setAdding(true)}
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 flex items-center gap-1.5"
            >
              <Plus size={13} weight="bold" /> Inscrever dependente
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">Filha(o)s e agregados que consomem na tua conta. Pagas as cotas deles pelo teu MBWay.</p>

        {adding && (
          <form onSubmit={addDependent} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-2 mb-4">
            <input
              data-testid="socio-family-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do dependente *"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                data-testid="socio-family-contact"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="Telemóvel"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
              />
              <input
                data-testid="socio-family-bday"
                type="date"
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAdding(false)} className="flex-1 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">Cancelar</button>
              <button data-testid="socio-family-add-submit" type="submit" className="flex-1 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm">Inscrever</button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {deps === null && <div className="text-center text-slate-500 py-8 text-sm">A carregar...</div>}
          {deps && deps.length === 0 && (
            <div className="text-center text-slate-500 py-8 text-sm">Ainda sem dependentes inscritos.</div>
          )}
          {(deps || []).map((d) => {
            const year = new Date().getFullYear();
            const quotas = (d.quotas || []).filter((q) => q.year === year);
            const unpaid = quotas.filter((q) => q.status !== "paid");
            const months = sel[d.id] || [];
            return (
              <div key={d.id} data-testid={`socio-family-dep-${d.id}`} className="bg-slate-950/60 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-500/15 text-teal-300 flex items-center justify-center shrink-0">
                    <User size={18} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-200 truncate">{d.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {d.birthday ? `Nascimento: ${new Date(d.birthday).toLocaleDateString("pt-PT")} · ` : ""}
                      {d.contact || "sem contacto"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Cotas {year}</div>
                    <div className={`text-sm font-bold ${unpaid.length ? "text-amber-300" : "text-emerald-300"}`}>
                      {quotas.filter((q) => q.status === "paid").length}/{quotas.length || 12}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Pagar quotas {year} (MBWay {titular.contact || "—"})
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 mb-2">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const q = quotas.find((x) => x.month === m);
                      const paid = q && q.status === "paid";
                      const isSel = months.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          data-testid={`socio-family-m-${d.id}-${m}`}
                          onClick={() => toggleMonth(d.id, m, !paid)}
                          className={`text-[10px] px-1 py-1.5 rounded border font-bold ${
                            paid
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                              : isSel
                              ? "bg-amber-500 text-slate-950 border-amber-500"
                              : "bg-slate-900 text-slate-300 border-slate-800 hover:border-amber-500/40"
                          }`}
                        >
                          {MONTHS_PT[m - 1]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {months.length} mês(es) · {euro(months.length * (quotas[0]?.amount || 1))}
                    </span>
                    <button
                      data-testid={`socio-family-pay-${d.id}`}
                      onClick={() => payQuotas(d)}
                      disabled={!months.length}
                      className="text-xs px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold flex items-center gap-1.5"
                    >
                      <CalendarBlank size={12} weight="bold" /> Pagar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="mt-4 w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">
          Fechar
        </button>
      </div>
    </div>
  );
}
