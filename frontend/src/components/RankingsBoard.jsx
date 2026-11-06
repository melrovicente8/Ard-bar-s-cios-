import React from "react";
import { Trophy, BeerStein, Coffee, House, Medal } from "@phosphor-icons/react";

const POSITIONS = ["🥇", "🥈", "🥉", "4.º", "5.º"];

const TABLES = [
  { key: "medals", title: "Mais Medalhados", subtitle: "Colecionadores de distinções", icon: Medal, accent: "text-amber-300 border-amber-500/30 bg-amber-500/5" },
  { key: "streak", title: "Os Residentes da Casa 🏠", subtitle: "Dias seguidos na sede", icon: House, accent: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5" },
  { key: "alcohol", title: "Os Mestres da Sede 🍺", subtitle: "Bebidas alcoólicas no mês", icon: BeerStein, accent: "text-amber-300 border-amber-500/30 bg-amber-500/5" },
  { key: "nonalcohol", title: "Os Hidratados & Acafeinados ☕", subtitle: "Bebidas não alcoólicas no mês", icon: Coffee, accent: "text-sky-300 border-sky-500/30 bg-sky-500/5" },
];

function RankingTable({ config, rows }) {
  const Icon = config.icon;
  return (
    <div className={`rounded-xl border p-4 ${config.accent}`} data-testid={`ranking-${config.key}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} weight="duotone" />
        <h3 className="font-outfit text-sm font-bold text-slate-100">{config.title}</h3>
      </div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mb-3">{config.subtitle}</div>
      {(rows || []).length === 0 ? (
        <div className="text-xs text-slate-500 py-3 text-center">Ainda sem registos este mês.</div>
      ) : (
        <ul className="space-y-1.5">
          {(rows || []).map((r) => (
            <li
              key={`${config.key}-${r.client_id}`}
              data-testid={`ranking-${config.key}-rank-${r.rank}`}
              className="flex items-center gap-2 text-xs bg-slate-950/50 border border-slate-800/70 rounded-lg px-2.5 py-2"
            >
              <span className="w-6 text-center font-bold text-slate-300 shrink-0">{POSITIONS[r.rank - 1] || r.rank}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium text-slate-100">
                  {r.name}{r.member_number ? <span className="text-slate-500"> (#{r.member_number})</span> : null}
                </span>
                {r.badge && config.key !== "medals" && r.rank <= 5 && (
                  <span className="block text-[10px] text-amber-300/90 truncate">{r.badge}</span>
                )}
                {config.key === "medals" && (r.medal_list || []).length > 0 && (
                  <span className="block text-[10px] text-amber-300/90 truncate">
                    {(r.medal_list || []).slice(0, 2).map((m) => `${m.label} · ${m.month_label}`).join(" | ")}
                  </span>
                )}
              </span>
              <span className="text-slate-300 font-bold shrink-0">{r.value_label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tabela de Feitos — 4 rankings Top 5 do mês (staff e App Sócio). */
export default function RankingsBoard({ data, onToggleEnabled, canManage = false, saving = false }) {
  if (!data) return null;
  const tables = data.tables || {};
  const enabled = data.enabled !== false;

  return (
    <div className="space-y-4" data-testid="rankings-board">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80 flex items-center gap-1.5">
            <Trophy size={12} weight="duotone" /> Tabela de Feitos
          </div>
          <h2 className="font-outfit text-xl font-bold">{data.month_label || "Rankings do clube"}</h2>
          <div className="text-[11px] text-slate-500">Atualizado em tempo real · consumo reinicia a 1 de cada mês</div>
        </div>
        {canManage && onToggleEnabled && (
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 cursor-pointer" data-testid="rankings-toggle-label">
            <input
              type="checkbox"
              data-testid="rankings-toggle"
              checked={enabled}
              disabled={saving}
              onChange={(e) => onToggleEnabled(e.target.checked)}
              className="accent-amber-500"
            />
            Rankings visíveis na App Sócio
          </label>
        )}
      </div>

      {data.my_badge && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm" data-testid="rankings-my-badge">
          <span className="text-amber-300 font-bold">{data.my_badge.label}</span>
          <span className="text-slate-400"> · distinção de {data.my_badge.month_label}</span>
        </div>
      )}

      {!enabled && (
        <div className="rounded-lg bg-slate-800/40 border border-slate-700 px-4 py-3 text-xs text-slate-400" data-testid="rankings-disabled-note">
          Os rankings estão desativados para os sócios. O staff continua a poder consultar.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {TABLES.map((config) => (
          <RankingTable key={config.key} config={config} rows={tables[config.key]} />
        ))}
      </div>
    </div>
  );
}
