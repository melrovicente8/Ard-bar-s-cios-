import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Bank, Printer, ArrowDown, ArrowUp, Equals } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Contas() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("summary"); // summary | income | expenses

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (range.from) params.date_from = range.from;
      if (range.to) params.date_to = range.to;
      const { data } = await api.get("/reports/finance", { params });
      setData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const applyPreset = (p) => {
    const t = today;
    if (p === "day") setRange({ from: t, to: t });
    else if (p === "week") {
      const d = new Date(); d.setDate(d.getDate() - 6);
      setRange({ from: d.toISOString().slice(0, 10), to: t });
    }
    else if (p === "month") setRange({ from: t.slice(0, 7) + "-01", to: t });
    else if (p === "year") setRange({ from: t.slice(0, 4) + "-01-01", to: t });
    else if (p === "all") setRange({ from: "", to: "" });
  };

  const printReport = () => {
    if (!data) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permite popups");
    const linesIncome = `
      <tr><td>Consumo no bar</td><td class="right">${data.counts.sales} vendas</td><td class="right pos"><strong>${euro(data.income.consumption)}</strong></td></tr>
      <tr><td>Cotas de sócios</td><td class="right">${data.counts.quotas}</td><td class="right pos"><strong>${euro(data.income.quotas)}</strong></td></tr>
      <tr><td><strong>TOTAL RECEITAS</strong></td><td></td><td class="right pos"><strong>${euro(data.income.total)}</strong></td></tr>`;
    const linesExp = `
      <tr><td>Encomendas a fornecedores</td><td class="right">${data.counts.orders}</td><td class="right neg"><strong>${euro(data.expenses.supplier_orders)}</strong></td></tr>
      <tr><td>Despesas mensais</td><td class="right">${data.counts.expenses}</td><td class="right neg"><strong>${euro(data.expenses.supplier_expenses)}</strong></td></tr>
      <tr><td><strong>TOTAL DESPESAS</strong></td><td></td><td class="right neg"><strong>${euro(data.expenses.total)}</strong></td></tr>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Contas · ${data.club_name}</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:13px}
  header{border-bottom:3px solid #15803d;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:22px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:17px;margin:6px 0}
  h2{font-size:14px;margin:22px 0 6px;color:#475569}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#444;text-align:left}
  .right{text-align:right}
  .pos{color:#15803d}
  .neg{color:#b91c1c}
  .balance{margin-top:22px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;display:flex;justify-content:space-between;align-items:center}
  .balance .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.2em;color:#666}
  .balance .val{font-size:24px;font-weight:800}
  @media print{button{display:none}body{margin:12mm}}
</style></head><body>
  <header>
    <div class="brand">${data.club_name}</div>
    <div class="sub">RELATÓRIO DE CONTAS · DEVE / HAVER</div>
    <h1>Período: ${range.from || "início"} → ${range.to || "hoje"}</h1>
    <div style="font-size:11px;color:#555">Emitido em ${new Date(data.generated_at).toLocaleString("pt-PT")}</div>
  </header>
  <h2>HAVER (Receitas)</h2>
  <table><thead><tr><th>Origem</th><th class="right">Qtd</th><th class="right">Valor</th></tr></thead><tbody>${linesIncome}</tbody></table>
  <h2>DEVE (Despesas)</h2>
  <table><thead><tr><th>Origem</th><th class="right">Qtd</th><th class="right">Valor</th></tr></thead><tbody>${linesExp}</tbody></table>
  <div class="balance">
    <span class="lbl">Saldo do período</span>
    <span class="val ${data.balance >= 0 ? "pos" : "neg"}">${data.balance >= 0 ? "+" : ""}${euro(data.balance)}</span>
  </div>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="contas-page">
      <div className="flex items-center gap-3 mb-6">
        <Bank size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Contabilidade</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Contas da Associação</h1>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        Deve / haver para apresentação aos sócios. Receitas (vendas no bar + cotas) menos despesas (encomendas + despesas mensais).
      </p>

      {/* Filtros */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">De</label>
          <input
            data-testid="contas-from"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
            className="mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Até</label>
          <input
            data-testid="contas-to"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
            className="mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <button data-testid="contas-apply" onClick={load} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-4 py-2 text-sm">
          Aplicar
        </button>
        <div className="flex gap-2 ml-auto flex-wrap">
          {[
            { v: "day", l: "Hoje" },
            { v: "week", l: "Semana" },
            { v: "month", l: "Mês" },
            { v: "year", l: "Ano" },
            { v: "all", l: "Sempre" },
          ].map((p) => (
            <button
              key={p.v}
              data-testid={`contas-preset-${p.v}`}
              onClick={() => applyPreset(p.v)}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
            >{p.l}</button>
          ))}
          <button data-testid="contas-print" onClick={printReport} disabled={!data} className="text-xs px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1.5">
            <Printer size={13} weight="duotone" /> Imprimir
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">
                <ArrowUp size={12} weight="bold" /> Receitas (Haver)
              </div>
              <div data-testid="contas-income" className="mt-2 font-outfit text-3xl font-bold text-emerald-300">{euro(data.income.total)}</div>
              <div className="text-[11px] text-slate-500 mt-2">
                Consumo {euro(data.income.consumption)} · Cotas {euro(data.income.quotas)}
              </div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400/80">
                <ArrowDown size={12} weight="bold" /> Despesas (Deve)
              </div>
              <div data-testid="contas-expenses" className="mt-2 font-outfit text-3xl font-bold text-rose-300">{euro(data.expenses.total)}</div>
              <div className="text-[11px] text-slate-500 mt-2">
                Encomendas {euro(data.expenses.supplier_orders)} · Despesas mensais {euro(data.expenses.supplier_expenses)}
              </div>
            </div>
            <div className={`${data.balance >= 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-rose-500/15 border-rose-500/40"} border rounded-xl p-5`}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
                <Equals size={12} weight="bold" /> Saldo
              </div>
              <div data-testid="contas-balance" className={`mt-2 font-outfit text-3xl font-bold ${data.balance >= 0 ? "text-amber-300" : "text-rose-300"}`}>
                {data.balance >= 0 ? "+" : ""}{euro(data.balance)}
              </div>
              <div className="text-[11px] text-slate-500 mt-2">{data.counts.sales + data.counts.quotas} entradas · {data.counts.orders + data.counts.expenses} saídas</div>
            </div>
          </div>

          {/* Tabs detalhe */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1 mb-4" data-testid="contas-tabs">
            <button onClick={() => setTab("income")} data-testid="contas-tab-income" className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${tab === "income" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400 hover:text-white"}`}>Detalhes receitas</button>
            <button onClick={() => setTab("expenses")} data-testid="contas-tab-expenses" className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${tab === "expenses" ? "bg-rose-500/20 text-rose-300" : "text-slate-400 hover:text-white"}`}>Detalhes despesas</button>
          </div>

          {tab === "income" && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-slate-500 text-xs uppercase bg-slate-950/40"><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Detalhes</th><th className="px-5 py-3 text-right">Valor</th></tr></thead>
                <tbody>
                  {[...data.details.sales, ...data.details.quotas].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((s) => (
                    <tr key={s.id} className="border-t border-slate-800/60">
                      <td className="px-5 py-2 text-xs text-slate-400">{new Date(s.created_at).toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-2">{s.source === "quota" ? <span className="text-amber-300">Cota</span> : <span className="text-emerald-300">Consumo</span>}</td>
                      <td className="px-5 py-2 text-slate-200"><a href={`/clientes/${s.client_id}`} className="hover:text-amber-400">{s.client_name}</a></td>
                      <td className="px-5 py-2 text-xs text-slate-500 truncate max-w-xs">{s.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td>
                      <td className="px-5 py-2 text-right text-amber-400 font-semibold">{euro(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "expenses" && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-slate-500 text-xs uppercase bg-slate-950/40"><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Fornecedor</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3 text-right">Valor</th></tr></thead>
                <tbody>
                  {[
                    ...data.details.orders.map((o) => ({ ...o, _kind: "Encomenda", _desc: o.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ") })),
                    ...data.details.expenses.map((e) => ({ ...e, _kind: "Despesa", _desc: e.description })),
                  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((r) => (
                    <tr key={r.id} className="border-t border-slate-800/60">
                      <td className="px-5 py-2 text-xs text-slate-400">{new Date(r.created_at).toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-2">{r._kind === "Encomenda" ? <span className="text-rose-300">Encomenda</span> : <span className="text-fuchsia-300">Despesa</span>}</td>
                      <td className="px-5 py-2 text-slate-200">{r.supplier_name || "—"}</td>
                      <td className="px-5 py-2 text-xs text-slate-500 truncate max-w-xs">
                        {r._desc}
                        {r.attachment_data && (
                          <a href={r.attachment_data} download={r.attachment_name || "fatura"} className="ml-2 text-amber-400 hover:underline">📎 fatura</a>
                        )}
                      </td>
                      <td className="px-5 py-2 text-right text-rose-300 font-semibold">{euro(r.total || r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
