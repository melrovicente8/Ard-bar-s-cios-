import React from "react";

/**
 * Grelha de medalhas de conquistas ("badges") — usada no portal do sócio
 * e na ficha do sócio (consulta do staff).
 */
export default function BadgesGrid({ badges = [], compact = false }) {
  if (!badges.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">A carregar conquistas...</div>;
  }
  return (
    <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"} gap-2.5`}>
      {badges.map((b) => (
        <div
          key={b.code}
          data-testid={`badge-${b.code}`}
          data-unlocked={b.unlocked ? "1" : "0"}
          className={`rounded-xl border p-3 flex gap-3 ${
            b.unlocked
              ? "bg-amber-500/10 border-amber-500/40"
              : "bg-slate-950/60 border-slate-800 opacity-70"
          }`}
        >
          <div className={`text-2xl leading-none ${b.unlocked ? "" : "grayscale opacity-60"}`}>{b.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-semibold truncate ${b.unlocked ? "text-amber-200" : "text-slate-300"}`}>
                {b.name}
              </span>
              {b.unlocked ? (
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300 shrink-0">✓</span>
              ) : (
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">🔒</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{b.description}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${b.unlocked ? "bg-amber-400" : "bg-slate-600"}`}
                  style={{ width: `${b.progress_pct || 0}%` }}
                />
              </div>
              <span className="text-[9px] text-slate-500 tabular-nums shrink-0">
                {Math.min(b.current, b.target)}/{b.target}
              </span>
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5 truncate">{b.unit}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
