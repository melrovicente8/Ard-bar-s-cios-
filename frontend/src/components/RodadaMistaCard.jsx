import React, { useEffect, useState } from "react";
import api, { euro } from "../lib/api";
import { BeerStein, Users, ArrowRight } from "@phosphor-icons/react";

/**
 * Cartão "Rodada Mista" na aba Vender — mesmo formato do cartão de Cliente Ocasional.
 * Mostra as mesas de grupo abertas e abre o balcão da Rodada Mista.
 */
export default function RodadaMistaCard({ onOpen, refreshKey = 0 }) {
  const [tables, setTables] = useState([]);

  useEffect(() => {
    api.get("/group-tables", { params: { status_filter: "open" } })
      .then(({ data }) => setTables(data || []))
      .catch(() => setTables([]));
  }, [refreshKey]);

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
            const openTotal = openRounds.reduce((s, r) => s + (r.total || 0), 0);
            return (
              <button
                key={t.id}
                data-testid={`rodada-card-open-${t.id}`}
                onClick={onOpen}
                className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-left hover:border-sky-400/60 transition-colors"
              >
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-sky-300/70">
                  {openRounds.length} rodada{openRounds.length === 1 ? "" : "s"} em aberto
                </div>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
