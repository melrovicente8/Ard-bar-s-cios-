import React, { useEffect, useState } from "react";
import { Storefront, Warning, TShirt } from "@phosphor-icons/react";
import api, { euro } from "../lib/api";

/**
 * Loja de merchandising (adeptos) — artigos visíveis mas indisponíveis para venda.
 * Endpoints: GET /api/socio/merch
 */
export default function SocioMerch({ onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/socio/merch")
      .then(({ data }) => setItems(data))
      .catch(() => setError("Não foi possível carregar a loja."));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="socio-merch-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center gap-2 mb-1">
          <Storefront size={22} weight="duotone" className="text-sky-400" />
          <h3 className="font-outfit text-xl font-semibold">Loja de Merchandising</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">Artigos de adeptos da ARD Nespereira. Em breve disponíveis na receção do clube.</p>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pr-1">
          {error && (
            <div className="col-span-2 flex items-center gap-2 text-sm text-rose-300" data-testid="socio-merch-error">
              <Warning size={14} /> {error}
            </div>
          )}
          {items && items.length === 0 && (
            <div className="col-span-2 text-center text-slate-500 py-8 text-sm">Sem artigos na loja.</div>
          )}
          {(items || []).map((m) => (
            <div
              key={m.id}
              data-testid={`socio-merch-${m.id}`}
              className="relative bg-slate-950/60 border border-slate-800 rounded-xl p-4 opacity-75 select-none"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                  <TShirt size={24} weight="duotone" className="text-sky-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-200 truncate">{m.name}</div>
                  <div className="text-amber-400 font-bold text-sm">{euro(m.price)}</div>
                </div>
              </div>
              <div className="mt-2">
                <span
                  data-testid="socio-merch-unavailable"
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30"
                >
                  Indisponível
                </span>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="mt-4 w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">
          Fechar
        </button>
      </div>
    </div>
  );
}
