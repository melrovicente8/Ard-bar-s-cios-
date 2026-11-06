import React, { useMemo } from "react";
import { CalendarBlank, Fire, Trophy, LockSimple, CheckCircle, CaretLeft, CaretRight, Cake } from "@phosphor-icons/react";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
  "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Mapa de presenças na sede + contador de dias seguidos (streak).
 * Um dia conta quando o sócio tem pelo menos um pedido servido.
 */
export default function PresenceCalendar({ data, compact = false, onMonthChange = null }) {
  const grid = useMemo(() => {
    if (!data?.month) return { cells: [], label: "" };
    const [y, m] = data.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lead = first.getDay();
    const marked = new Set(data.days || []);
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push({ empty: true, key: `e${i}` });
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = `${data.month}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso, present: marked.has(iso), today: iso === data.today, key: iso });
    }
    return { cells, label: `${MONTHS_PT[m - 1]} ${y}` };
  }, [data]);

  if (!data) {
    return <div className="text-sm text-slate-500 py-6 text-center">A carregar presenças...</div>;
  }

  const currentMonth = (data.today || "").slice(0, 7);
  const shiftMonth = (delta) => {
    if (!onMonthChange || !data.month) return;
    const [y, m] = data.month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const statusLabel = data.quota_status === "paid"
    ? "🟢 Cotas em dia — os pontos do streak contam"
    : data.quota_status === "pending"
    ? "🟡 Cotas por regularizar — os pontos ficam bloqueados até regularização (depois valem metade)"
    : "🔴 Em dívida — as presenças ficam no histórico, mas não somam pontos";

  return (
    <div className="space-y-4" data-testid="presence-calendar">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/60 border border-amber-500/30 rounded-xl p-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-400/80 flex items-center gap-1">
            <Fire size={11} weight="fill" /> Streak
          </div>
          <div className="font-outfit text-3xl font-bold text-amber-300" data-testid="presence-streak">{data.streak}</div>
          <div className="text-[10px] text-slate-500">dia{data.streak === 1 ? "" : "s"} seguido{data.streak === 1 ? "" : "s"}</div>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Presenças no mês</div>
          <div className="font-outfit text-3xl font-bold text-slate-200" data-testid="presence-month-count">{data.month_presences}</div>
          <div className="text-[10px] text-slate-500">melhor streak {data.best_streak_month}</div>
        </div>
        <div className="bg-slate-950/60 border border-green-500/30 rounded-xl p-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-green-400/80 flex items-center gap-1">
            <Trophy size={11} weight="duotone" /> Próxima recompensa
          </div>
          <div className="font-outfit text-3xl font-bold text-green-300">+{data.next_reward_day ? data.rewards.find((r) => r.day === data.next_reward_day)?.points : 0}</div>
          <div className="text-[10px] text-slate-500">
            {data.next_reward_day ? `faltam ${data.days_to_next} dia${data.days_to_next === 1 ? "" : "s"} (dia ${data.next_reward_day})` : "escalão máximo atingido"}
          </div>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Pontos do mês</div>
          <div className="font-outfit text-3xl font-bold text-slate-200" data-testid="presence-month-points">{data.month_points}</div>
          <div className="text-[10px] text-slate-500">{data.today_marked ? "hoje já conta ✓" : "hoje ainda sem presença"}</div>
        </div>
      </div>

      <div className={`rounded-xl border p-3 ${data.points_blocked ? "bg-amber-500/5 border-amber-500/30 text-amber-200" : "bg-emerald-500/5 border-emerald-500/30 text-emerald-200"}`} data-testid="presence-quota-note">
        <div className="text-[11px] flex items-center gap-1.5">
          {data.points_blocked ? <LockSimple size={12} weight="duotone" /> : <CheckCircle size={12} weight="duotone" />}
          {statusLabel}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <CalendarBlank size={14} weight="duotone" className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-200" data-testid="presence-month-label">{grid.label}</span>
          {onMonthChange && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                data-testid="presence-month-prev"
                onClick={() => shiftMonth(-1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Mês anterior"
              >
                <CaretLeft size={12} weight="bold" />
              </button>
              <button
                type="button"
                data-testid="presence-month-next"
                onClick={() => shiftMonth(1)}
                disabled={data.month >= currentMonth}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                title="Mês seguinte"
              >
                <CaretRight size={12} weight="bold" />
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <div key={`${w}-${i}`} className="text-[9px] font-bold uppercase tracking-wider text-slate-600 py-0.5">{w}</div>
          ))}
          {grid.cells.map((c) => {
            const bdays = c.empty ? [] : (data.birthdays || {})[c.iso] || [];
            const myBday = bdays.some((b) => b.me);
            const bdayNumbers = bdays.map((b) => b.member_number).filter(Boolean).join(",");
            return (
              <div
                key={c.key}
                data-testid={c.empty ? undefined : `presence-day-${c.iso}`}
                className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-[11px] border relative ${
                  c.empty
                    ? "border-transparent"
                    : c.present
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-bold"
                    : c.today
                    ? "bg-slate-900 border-amber-500/50 text-slate-300"
                    : "bg-slate-950/40 border-slate-800 text-slate-500"
                } ${myBday ? "ring-2 ring-amber-400" : ""} ${
                  !myBday && bdays.length ? "border-amber-500/40" : ""
                }`}
                title={[
                  c.present
                    ? `${c.iso} · ${(data.partner_days || {})[c.iso] ? "presença validada por parceiro local" : "presença na sede"}`
                    : c.iso,
                  bdays.length
                    ? `🎂 Aniversário: ${bdays.map((b) => `nº ${b.member_number || "—"}${b.me ? " (tu)" : ""}`).join(", ")}`
                    : "",
                ].filter(Boolean).join(" · ")}
              >
                {c.empty ? "" : c.present ? ((data.partner_days || {})[c.iso] || "🏠") : c.day}
                {bdays.length > 0 && (
                  <span
                    data-testid={`presence-birthday-${c.iso}`}
                    className={`text-[8px] leading-none font-bold ${myBday ? "text-amber-300" : "text-amber-500/80"}`}
                  >
                    🎂{bdayNumbers}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-1.5" data-testid="presence-rewards">
          {(data.rewards || []).map((r) => {
            const reached = (data.streak || 0) >= r.day;
            return (
              <span
                key={r.day}
                className={`px-2 py-1 rounded-full text-[10px] font-bold border ${
                  reached ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-slate-950/60 text-slate-500 border-slate-800"
                }`}
              >
                dia {r.day} · +{r.points} pt{r.points === 1 ? "" : "s"}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
