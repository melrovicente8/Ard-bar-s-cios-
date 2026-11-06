import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Crown, ArrowRight, ClockCounterClockwise } from "@phosphor-icons/react";

const mandateText = (h) =>
  `${(h.role || "—").trim()} · ${h.start_year || "?"}–${h.end_year || "presente"}`;

// Lista os sócios que pertencem (cargo atual) ou pertenceram (mandatos anteriores)
// aos órgãos da direção, com hiperligação para a respetiva ficha de sócio.
export default function DirectionMembers() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/clients")
      .then(({ data }) => setClients(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const current = clients
    .filter((c) => (c.direction_role || "").trim())
    .sort((a, b) => a.name.localeCompare(b.name));

  // Mandato mais recente primeiro (mandato em curso conta como o mais recente)
  const lastYear = (c) =>
    Math.max(...(c.direction_history || []).map((h) => parseInt(h.end_year, 10) || 9999), 0);
  const previous = clients
    .filter((c) => (c.direction_history || []).length > 0)
    .sort((a, b) => lastYear(b) - lastYear(a) || a.name.localeCompare(b.name));

  return (
    <div className="mt-8 space-y-6" data-testid="direction-members">
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/40 flex items-center gap-2">
          <Crown size={18} weight="duotone" className="text-amber-400" />
          <h2 className="font-outfit text-lg font-semibold">Direção em funções</h2>
          <span className="text-xs text-slate-500">{loading ? "…" : `${current.length} sócio(s)`}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">A carregar...</div>
        ) : current.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Ainda não há cargos atribuídos nas fichas de sócio.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {current.map((c) => (
              <Link
                key={c.id}
                to={`/clientes/${c.id}`}
                data-testid={`direction-member-${c.id}`}
                className="group flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 hover:border-amber-500/40 hover:bg-slate-900/60"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-100 truncate group-hover:text-amber-300">{c.name}</div>
                  <div className="text-xs text-amber-300/90 mt-0.5">{c.direction_role.trim()}</div>
                  {c.member_number && (
                    <div className="text-[11px] text-slate-500 mt-1 font-mono">Sócio nº {c.member_number}</div>
                  )}
                </div>
                <ArrowRight size={14} className="text-slate-600 group-hover:text-amber-400 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/40 flex items-center gap-2">
          <ClockCounterClockwise size={18} weight="duotone" className="text-sky-400" />
          <h2 className="font-outfit text-lg font-semibold">Direções anteriores</h2>
          <span className="text-xs text-slate-500">{loading ? "…" : `${previous.length} sócio(s)`}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">A carregar...</div>
        ) : previous.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Ainda não há mandatos anteriores registados nas fichas de sócio.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                <th className="px-5 py-3 font-medium">Sócio</th>
                <th className="px-5 py-3 font-medium">Mandatos</th>
                <th className="px-5 py-3 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {previous.map((c) => (
                <tr key={c.id} data-testid={`direction-history-${c.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                  <td className="px-5 py-3">
                    <Link to={`/clientes/${c.id}`} className="font-medium text-slate-100 hover:text-amber-400">
                      {c.name}
                    </Link>
                    {c.member_number && (
                      <span className="ml-2 text-[11px] text-slate-500 font-mono">nº {c.member_number}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(c.direction_history || []).map((h, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full text-[11px] border border-slate-700 bg-slate-800/60 text-slate-300"
                        >
                          {mandateText(h)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link to={`/clientes/${c.id}`} title="Abrir ficha de sócio">
                      <ArrowRight size={14} className="text-slate-600 hover:text-amber-400" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
