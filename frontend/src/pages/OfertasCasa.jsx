import React, { useEffect, useState } from "react";
import api, { euro } from "../lib/api";
import { Gift, Crown, User } from "@phosphor-icons/react";

const ROLE_LABEL = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  presidente: "Pres. da Assembleia",
  funcionario: "Funcionário",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function OfertasCasa() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1..12
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/house-offers", { params: { year, month } })
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="ofertas-page">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Despesa do bar</div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1 flex items-center gap-3">
          <Gift size={32} weight="duotone" className="text-fuchsia-400" /> Ofertas da casa
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Consulta de quem ofereceu mais · limites mensais: funcionário 20 € · admin/tesoureiro 50 €. Cada oferta é lançada como despesa "Conta da Casa".
        </p>
      </div>

      {/* Filtros de período */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} data-testid="ofertas-month" className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm">
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="ofertas-year" className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">A carregar...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-900/40 border border-fuchsia-500/20 rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-400/80">Total ofertado no mês</div>
              <div data-testid="ofertas-total" className="mt-2 font-outfit text-3xl font-bold text-fuchsia-300">{euro(data?.total || 0)}</div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Ofertas registadas</div>
              <div className="mt-2 font-outfit text-3xl font-bold text-slate-200">{data?.items?.length || 0}</div>
            </div>
            <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 flex items-center gap-1.5">
                <Crown size={11} weight="fill" /> Quem ofereceu mais
              </div>
              <div data-testid="ofertas-top" className="mt-2 font-outfit text-xl font-bold text-amber-300 truncate">
                {data?.by_user?.[0] ? `${data.by_user[0].user_email} · ${euro(data.by_user[0].total)}` : "—"}
              </div>
            </div>
          </div>

          {/* Ranking por funcionário */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6 mb-6">
            <h3 className="font-outfit text-xl font-semibold mb-4">Por funcionário</h3>
            {!data?.by_user?.length ? (
              <div className="text-sm text-slate-500 py-6 text-center">Sem ofertas neste mês. 🎉</div>
            ) : (
              <ul className="space-y-2" data-testid="ofertas-by-user">
                {data.by_user.map((u, i) => (
                  <li key={u.user_email} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-slate-950/50 border-slate-800">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate flex items-center gap-2">
                        <User size={13} className="text-slate-500" /> {u.user_email}
                        {i === 0 && <Crown size={13} weight="fill" className="text-amber-400" title="Quem ofereceu mais" />}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {ROLE_LABEL[u.role] || u.role} · {u.count} oferta(s) · limite {euro(u.limit)}
                      </div>
                      <div className="mt-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-xs">
                        <div className={`h-full ${u.total >= u.limit ? "bg-rose-500" : "bg-fuchsia-500"}`} style={{ width: `${Math.min((u.total / u.limit) * 100, 100)}%` }} />
                      </div>
                    </div>
                    <span className={`font-outfit text-lg font-bold ${u.total >= u.limit ? "text-rose-300" : "text-fuchsia-300"}`}>{euro(u.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Entradas detalhadas */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h3 className="font-outfit text-xl font-semibold">Ofertas registadas</h3>
            </div>
            {!data?.items?.length ? (
              <div className="p-8 text-center text-slate-500 text-sm">Sem registos.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                      <th className="px-5 py-3 font-medium">Data</th>
                      <th className="px-5 py-3 font-medium">Funcionário</th>
                      <th className="px-5 py-3 font-medium">Cliente</th>
                      <th className="px-5 py-3 font-medium">Item</th>
                      <th className="px-5 py-3 font-medium text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it, i) => (
                      <tr key={it.id || i} data-testid={`oferta-row-${i}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                        <td className="px-5 py-3 text-slate-400 text-xs">{new Date(it.created_at).toLocaleString("pt-PT")}</td>
                        <td className="px-5 py-3 text-slate-200">{it.user_email}</td>
                        <td className="px-5 py-3 text-slate-400">{it.client_name || "—"}</td>
                        <td className="px-5 py-3 text-slate-300">{it.qty}× {it.product_name}</td>
                        <td className="px-5 py-3 text-right font-bold text-fuchsia-300">{euro(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
