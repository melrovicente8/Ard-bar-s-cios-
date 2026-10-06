import React, { useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { SealCheck, X } from "@phosphor-icons/react";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function QuotaBulkLaunchModal({ onClose, onDone }) {
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selected, setSelected] = useState(() => new Set(Array.from({ length: 12 }, (_, i) => i + 1)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [quotaValue, setQuotaValue] = useState(5);

  React.useEffect(() => {
    api.get("/club/info").then(({ data }) => {
      if (data?.quota_monthly_value) setQuotaValue(Number(data.quota_monthly_value));
    }).catch(() => {});
  }, []);

  const toggle = (m) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(m)) s.delete(m);
      else s.add(m);
      return s;
    });

  const preset = (kind) => {
    if (kind === "year") setSelected(new Set(Array.from({ length: 12 }, (_, i) => i + 1)));
    else if (kind === "untilnow") setSelected(new Set(Array.from({ length: currentMonth }, (_, i) => i + 1)));
    else setSelected(new Set());
  };

  const submit = async () => {
    if (selected.size === 0) return toast.error("Seleciona pelo menos um mês");
    setBusy(true);
    try {
      const { data } = await api.post("/quotas/bulk-launch", {
        year,
        months: [...selected].sort((a, b) => a - b),
        note,
      });
      toast.success(
        `Cotas lançadas e pagas: ${data.launched.length} sócios · ${euro(data.total)}` +
          (data.skipped.length ? ` · ${data.skipped.length} já em dia` : "")
      );
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()} data-testid="quota-bulk-modal">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Direção · cotas</div>
            <h3 className="font-outfit text-2xl font-semibold mt-1">Lançar cotas {year} a todos</h3>
            <p className="text-xs text-slate-400 mt-1">
              Lança as cotas na conta corrente de todos os sócios e regista logo o pagamento — ficam <strong className="text-emerald-300">pagas</strong> e o saldo volta a zero.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800" data-testid="quota-bulk-close">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => preset("year")} className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300">Ano completo (12 meses)</button>
          <button onClick={() => preset("untilnow")} className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300">Até mês corrente</button>
          <button onClick={() => preset("none")} className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300">Limpar</button>
        </div>
        <div className="grid grid-cols-6 gap-2 mb-4">
          {MONTHS_PT.map((label, i) => {
            const m = i + 1;
            const on = selected.has(m);
            return (
              <button
                key={m}
                data-testid={`quota-month-${m}`}
                onClick={() => toggle(m)}
                className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                  on ? "bg-amber-500 text-slate-950 border-amber-500" : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nota (opcional)</label>
          <input
            data-testid="quota-bulk-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: Direção 2025/2027 — cotas lançadas e pagas"
            className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-5 flex items-center justify-between text-sm">
          <span className="text-slate-400">
            {selected.size} {selected.size === 1 ? "mês" : "meses"} × {euro(quotaValue)} por sócio
          </span>
          <span className="font-outfit font-bold text-amber-300">
            {euro(selected.size * quotaValue)} / sócio
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
          >
            Cancelar
          </button>
          <button
            data-testid="quota-bulk-submit"
            onClick={submit}
            disabled={busy || selected.size === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold flex items-center justify-center gap-2"
          >
            <SealCheck size={16} weight="fill" /> {busy ? "A lançar..." : "Lançar e pagar"}
          </button>
        </div>
      </div>
    </div>
  );
}
