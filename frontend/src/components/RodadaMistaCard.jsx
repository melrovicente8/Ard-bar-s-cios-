import React, { useCallback, useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { BeerStein, Users, ArrowRight, PencilSimple, Check, X } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Cartão "Rodada Mista" na aba Vender — mesmo formato do cartão de Cliente Ocasional.
 * Mostra as mesas de grupo abertas, permite renomear e abre o balcão da Rodada Mista.
 */
export default function RodadaMistaCard({ onOpen, refreshKey = 0 }) {
  const [tables, setTables] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(() => {
    api.get("/group-tables", { params: { status_filter: "open" } })
      .then(({ data }) => setTables(data || []))
      .catch(() => setTables([]));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const startRename = (t) => {
    setEditingId(t.id);
    setDraft(t.label || "");
  };

  const saveRename = async (id) => {
    const label = draft.trim();
    if (!label) {
      toast.error("Indica um nome para a mesa");
      return;
    }
    try {
      await api.put(`/group-tables/${id}`, { label });
      setEditingId(null);
      load();
      toast.success("Mesa renomeada");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div
      className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5"
      data-testid="rodada-mista-card"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400">
            <BeerStein size={20} weight="duotone" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Mesa de grupo</div>
            <h3 className="font-outfit text-lg font-semibold leading-tight">Rodada Mista</h3>
            <div className="text-[11px] text-slate-500">
              {tables.length > 0
                ? `${tables.length} mesa${tables.length === 1 ? "" : "s"} aberta${tables.length === 1 ? "" : "s"} · dividir conta ou rodar pagadores`
                : "Abre uma mesa com 2 ou mais sócios e divide a conta"}
            </div>
          </div>
        </div>
        <button
          data-testid="rodada-mista-btn"
          onClick={onOpen}
          className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
          title="Abrir uma mesa de grupo (2 ou mais sócios) e dividir a conta ou rodar os pagadores"
        >
          <Users size={13} weight="bold" /> Abrir Rodada Mista
        </button>
      </div>

      {tables.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tables.slice(0, 6).map((t) => {
            const openRounds = (t.rounds || []).filter((r) => r.status !== "paid");
            const openTotal = t.remaining_total != null
              ? t.remaining_total
              : openRounds.reduce((s, r) => s + (r.total || 0), 0);
            const editing = editingId === t.id;
            return (
              <div
                key={t.id}
                data-testid={`rodada-card-open-${t.id}`}
                className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-left hover:border-sky-400/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-sky-300/70">
                    {openRounds.length} rodada{openRounds.length === 1 ? "" : "s"} em aberto
                  </div>
                  {!editing && (
                    <button
                      type="button"
                      data-testid={`rodada-rename-${t.id}`}
                      onClick={() => startRename(t)}
                      className="p-1 rounded text-slate-400 hover:text-sky-300 hover:bg-slate-800"
                      title="Editar o nome da mesa"
                    >
                      <PencilSimple size={12} />
                    </button>
                  )}
                </div>
                {editing ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      autoFocus
                      data-testid={`rodada-rename-input-${t.id}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(t.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 min-w-0 bg-slate-950 border border-sky-500/50 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                    />
                    <button
                      data-testid={`rodada-rename-save-${t.id}`}
                      onClick={() => saveRename(t.id)}
                      className="p-1 rounded bg-sky-500 text-slate-950"
                      title="Guardar"
                    >
                      <Check size={11} weight="bold" />
                    </button>
                    <button
                      data-testid={`rodada-rename-cancel-${t.id}`}
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded bg-slate-800 text-slate-300"
                      title="Cancelar"
                    >
                      <X size={11} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={onOpen} className="block w-full text-left">
                    <div className="font-medium text-slate-100 truncate">{t.label}</div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      {(t.members || []).map((m) => m.name.split(" ")[0]).join(" · ")}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-outfit text-lg font-bold text-amber-300">{euro(openTotal)}</span>
                      <span className="text-[10px] font-bold text-sky-300 flex items-center gap-1">
                        Abrir <ArrowRight size={10} />
                      </span>
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
