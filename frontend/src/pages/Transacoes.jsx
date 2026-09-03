import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ListDashes, Printer, FileXls, FunnelSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";

const KIND_LABEL = { sale: "Venda", payment: "Pagamento", order: "Encomenda", expense: "Despesa", cash_close: "Fecho de caixa" };
const KIND_CLASS = {
  sale: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  payment: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  order: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  expense: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  cash_close: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export default function Transacoes() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [filters, setFilters] = useState({ from: monthStart, to: today, kind: "", q: "" });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.date_from = filters.from;
      if (filters.to) params.date_to = filters.to;
      if (filters.kind) params.kind = filters.kind;
      if (filters.q) params.q = filters.q;
      const { data } = await api.get("/transactions", { params });
      setItems(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const applyPreset = (p) => {
    const t = today;
    if (p === "today") setFilters({ ...filters, from: t, to: t });
    else if (p === "week") {
      const d = new Date(); d.setDate(d.getDate() - 6);
      setFilters({ ...filters, from: d.toISOString().slice(0, 10), to: t });
    } else if (p === "month") setFilters({ ...filters, from: monthStart, to: t });
    else if (p === "year") setFilters({ ...filters, from: t.slice(0, 4) + "-01-01", to: t });
    else if (p === "all") setFilters({ ...filters, from: "", to: "" });
  };

  const rowValue = (r) => {
    if (r._kind === "payment") return r.total_credited || r.amount || 0;
    if (r._kind === "expense") return r.amount || 0;
    if (r._kind === "cash_close") return r.cash_counted || 0;
    return r.total || 0;
  };

  const rowDesc = (r) => {
    if (r._kind === "cash_close") return `Contado ${euro(r.cash_counted)} · esperado ${euro(r.expected_cash)} · diferença ${euro(r.difference)}`;
    if (r._kind === "expense") return r.description || "";
    if (r._kind === "order") return `Encomenda a ${r.supplier_name || "—"}`;
    if (r.source === "quota") return "Cotas";
    return r.client_name || r.supplier_name || "";
  };

  const exportCsv = () => {
    const header = ["Nº Transação", "Data", "Tipo", "Entidade", "Detalhe", "Valor (EUR)"];
    const rows = items.map((r) => [
      r.tx_number,
      new Date(r.created_at).toLocaleString("pt-PT"),
      KIND_LABEL[r._kind] || r._kind,
      r.client_name || r.supplier_name || "",
      rowDesc(r),
      (rowValue(r) || 0).toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacoes_${filters.from || "inicio"}_a_${filters.to || "hoje"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Listagem exportada (abre no Excel)");
  };

  const printList = () => {
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permite popups");
    const rows = items.map((r) => `
      <tr>
        <td><strong>#${r.tx_number}</strong></td>
        <td>${new Date(r.created_at).toLocaleString("pt-PT")}</td>
        <td>${KIND_LABEL[r._kind] || r._kind}</td>
        <td>${r.client_name || r.supplier_name || ""}</td>
        <td>${rowDesc(r)}</td>
        <td class="right"><strong>${euro(rowValue(r))}</strong></td>
      </tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Transações</title>
<style>
body{font-family:Arial;color:#0f172a;margin:24px;font-size:12px}
header{border-bottom:3px solid #15803d;padding-bottom:12px;margin-bottom:16px}
.brand{font-size:20px;font-weight:800;color:#15803d;letter-spacing:.15em}
h1{font-size:16px;margin:6px 0}
table{width:100%;border-collapse:collapse}
th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px}
th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px}
.right{text-align:right}
.meta{font-size:11px;color:#555;margin-bottom:10px}
@media print{button{display:none}body{margin:10mm}}
</style></head><body>
<header><div class="brand">ARD · NESPEREIRA</div><h1>Todas as transações numeradas</h1></header>
<div class="meta">Período: ${filters.from || "início"} → ${filters.to || "hoje"} · ${items.length} transações · emitido em ${new Date().toLocaleString("pt-PT")}</div>
<table><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Entidade</th><th>Detalhe</th><th class="right">Valor</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>
<script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="transacoes-page">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <ListDashes size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Contabilidade</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Transações</h1>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-5">Todas as transações numeradas — vendas, pagamentos, encomendas, despesas e fechos de caixa.</p>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <FunnelSimple size={12} /> Filtros
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm" />
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm" />
          <select value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Cliente, fornecedor, nº..." className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-white text-sm" />
          </div>
          <button onClick={load} data-testid="transacoes-apply" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-3 py-2 text-sm">Aplicar</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          {[
            { v: "today", l: "Hoje" },
            { v: "week", l: "Semana" },
            { v: "month", l: "Este mês" },
            { v: "year", l: "Este ano" },
            { v: "all", l: "Sempre" },
          ].map((p) => (
            <button key={p.v} onClick={() => applyPreset(p.v)} className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300">{p.l}</button>
          ))}
          <div className="ml-auto flex gap-2">
            <button onClick={exportCsv} data-testid="transacoes-export-csv" className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1.5">
              <FileXls size={13} weight="duotone" /> Excel (CSV)
            </button>
            <button onClick={printList} data-testid="transacoes-export-print" className="text-xs px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1.5">
              <Printer size={13} weight="duotone" /> Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-slate-500 p-10 text-center">A carregar...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500">Sem transações no período/filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-5 py-3 font-medium">Nº</th>
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Entidade</th>
                  <th className="px-5 py-3 font-medium">Detalhe</th>
                  <th className="px-5 py-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={`${r._kind}-${r.id}`} data-testid={`tx-row-${r.tx_number}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                    <td className="px-5 py-2.5">
                      <Link to={`/transacoes/${r.tx_number}`} className="font-mono font-bold text-amber-300 hover:text-amber-200">#{r.tx_number}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400 text-xs">{new Date(r.created_at).toLocaleString("pt-PT")}</td>
                    <td className="px-5 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${KIND_CLASS[r._kind]}`}>{KIND_LABEL[r._kind] || r._kind}</span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-200">{r.client_name || r.supplier_name || "—"}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs max-w-xs truncate">{rowDesc(r)}</td>
                    <td className="px-5 py-2.5 text-right text-amber-400 font-semibold">{euro(rowValue(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
