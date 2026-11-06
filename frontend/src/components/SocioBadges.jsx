import React, { useEffect, useState } from "react";
import api from "../lib/api";
import BadgesGrid from "./BadgesGrid";
import { Medal, X } from "@phosphor-icons/react";

/**
 * Cartão + modal das medalhas de conquistas do sócio.
 */
export default function SocioBadges() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const load = () => {
    api.get("/socio/badges")
      .then(({ data: d }) => setData(d))
      .catch(() => setData(null));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div
        onClick={() => { setOpen(true); if (!data) load(); }}
        data-testid="socio-badges-card"
        title="Ver as medalhas de conquistas desbloqueadas"
        className="bg-slate-950/60 border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-5 transition-colors cursor-pointer"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 flex items-center gap-1.5">
          <Medal size={11} weight="fill" /> Conquistas
          <span className="text-amber-300/70 normal-case ml-auto">Ver ›</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span data-testid="socio-badges-count" className="font-outfit text-4xl font-bold text-amber-300">
            {data ? data.unlocked : 0}
          </span>
          <span className="text-slate-500 text-lg">/ {data ? data.total : 15}</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-2">
          {(data?.badges || []).filter((b) => b.unlocked).slice(0, 3).map((b) => b.emoji).join(" ") || "Desbloqueia medalhas na sede"}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
          data-testid="socio-badges-modal"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl p-5 my-6">
            <div className="flex items-center gap-2 mb-2">
              <Medal size={20} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-xl font-semibold flex-1">Medalhas de Conquistas</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded bg-slate-800"><X size={14} weight="bold" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Medalhas cômicas e prestigiantes que vais desbloqueando na ARDN. O staff também as consulta no teu perfil.
            </p>
            {data ? <BadgesGrid badges={data.badges} /> : <div className="text-sm text-slate-500 py-8 text-center">A carregar...</div>}
          </div>
        </div>
      )}
    </>
  );
}
