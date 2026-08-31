import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ClockCounterClockwise, Printer, FunnelSimple, MagnifyingGlass, Scroll } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_LABEL = { paid: "Pago", partial: "Parcial", open: "Em aberto" };
const STATUS_CLASS = {
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  open: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};
const TYPE_LABEL = { sale_cancel: "Venda cancelada", sale_edit: "Venda editada" };

export default function Historico() {
  const [tab, setTab] = useState("sales"); // sales | audit | acta
  const [actaData, setActaData] = useState(null);
  const [actaDate, setActaDate] = useState(new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [filters, setFilters] = useState({ from: monthStart, to: today, user_email: "", client_id: "", status: "" });
  const [salesData, setSalesData] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUsers = async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch {
      /* not admin */
    }
  };

  const loadClients = async () => {
    try {
      const { data } = await api.get("/clients");
      setClients(data);
    } catch {
      /* ignore */
    }
  };

  const loadSales = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.date_from = filters.from;
      if (filters.to) params.date_to = filters.to;
      if (filters.user_email) params.user_email = filters.user_email;
      if (filters.client_id) params.client_id = filters.client_id;
      if (filters.status) params.status_filter = filters.status;
      const { data } = await api.get("/reports/sales", { params });
      setSalesData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.date_from = filters.from;
      if (filters.to) params.date_to = filters.to;
      if (filters.user_email) params.user_email = filters.user_email;
      const { data } = await api.get("/audit-log", { params });
      setAuditData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const loadActa = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/daily-actas/${actaDate}`);
      setActaData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const printActa = () => {
    if (!actaData) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permite popups");
    const salesRows = (actaData.sales || []).map((s) => `
      <tr><td>${new Date(s.created_at).toLocaleString("pt-PT")}</td><td>#${s.tx_number || "—"}</td><td>${s.client_name}</td><td>${(s.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td><td class="right">${euro(s.total)}</td></tr>`).join("");
    const payRows = (actaData.payments || []).map((p) => `
      <tr><td>${new Date(p.created_at).toLocaleString("pt-PT")}</td><td>#${p.tx_number || "—"}</td><td>${p.client_name}</td><td class="right">${euro(p.total_credited || p.amount)}</td></tr>`).join("");
    const expRows = (actaData.expenses || []).map((e) => `
      <tr><td>${new Date(e.created_at).toLocaleString("pt-PT")}</td><td>#${e.tx_number || "—"}</td><td>${e.supplier_name || "—"}</td><td>${e.description}</td><td class="right">${euro(e.amount)}</td></tr>`).join("");
    const auditRows = (actaData.audits || []).map((a) => `
      <tr><td>${new Date(a.at).toLocaleString("pt-PT")}</td><td>${a.by}</td><td>${a.type}</td><td>${a.summary || "—"}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Ata diária · ${actaData.date}</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:12px}
  header{border-bottom:3px solid #15803d;padding-bottom:12px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:16px;margin:6px 0}
  h2{font-size:13px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px}
  .right{text-align:right}
  .totals{display:flex;gap:12px;margin-top:14px}
  .card{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px}
  .card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.15em}
  .card .val{font-size:16px;font-weight:800;margin-top:3px}
  @media print{button{display:none}body{margin:10mm}}
</style></head><body>
  <header>
    <div class="brand">${"ARD Nespereira"}</div>
    <div class="sub">ATA DIÁRIA · ${actaData.date}</div>
    <h1>Registo completo de actividade</h1>
    <div style="font-size:11px;color:#555">Emitido em ${new Date(actaData.generated_at).toLocaleString("pt-PT")}</div>
  </header>
  <div class="totals">
    <div class="card"><div class="lbl">Vendas</div><div class="val">${actaData.totals?.sales_count || 0}</div></div>
    <div class="card"><div class="lbl">Total vendas</div><div class="val">${euro(actaData.totals?.sales || 0)}</div></div>
    <div class="card"><div class="lbl">Pagamentos</div><div class="val">${euro(actaData.totals?.payments || 0)}</div></div>
    <div class="card"><div class="lbl">Despesas</div><div class="val">${euro(actaData.totals?.expenses || 0)}</div></div>
  </div>
  <h2>Vendas</h2>
  <table><thead><tr><th>Data</th><th>Nº</th><th>Cliente</th><th>Itens</th><th class="right">Total</th></tr></thead><tbody>${salesRows || `<tr><td colspan="5" style="text-align:center;color:#666;padding:12px">Sem vendas</td></tr>`}</tbody></table>
  <h2>Pagamentos</h2>
  <table><thead><tr><th>Data</th><th>Nº</th><th>Cliente</th><th class="right">Valor</th></tr></thead><tbody>${payRows || `<tr><td colspan="4" style="text-align:center;color:#666;padding:12px">Sem pagamentos</td></tr>`}</tbody></table>
  <h2>Despesas</h2>
  <table><thead><tr><th>Data</th><th>Nº</th><th>Fornecedor</th><th>Descrição</th><th class="right">Valor</th></tr></thead><tbody>${expRows || `<tr><td colspan="5" style="text-align:center;color:#666;padding:12px">Sem despesas</td></tr>`}</tbody></table>
  <h2>Registo de auditoria</h2>
  <table><thead><tr><th>Data</th><th>Utilizador</th><th>Tipo</th><th>Detalhes</th></tr></thead><tbody>${auditRows || `<tr><td colspan="4" style="text-align:center;color:#666;padding:12px">Sem registos</td></tr>`}</tbody></table>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  useEffect(() => { loadUsers(); loadClients(); }, []);
  useEffect(() => {
    if (tab === "sales") loadSales();
    else if (tab === "audit") loadAudit();
    else if (tab === "acta") loadActa();
    // eslint-disable-next-line
  }, [tab]);

  const applyPreset = (preset) => {
    const t = new Date().toISOString().slice(0, 10);
    if (preset === "today") setFilters({ ...filters, from: t, to: t });
    else if (preset === "month") setFilters({ ...filters, from: t.slice(0, 7) + "-01", to: t });
    else if (preset === "year") setFilters({ ...filters, from: t.slice(0, 4) + "-01-01", to: t });
    else if (preset === "all") setFilters({ ...filters, from: "", to: "" });
  };

  const printSalesReport = () => {
    if (!salesData) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permite popups");
    const rows = salesData.sales.map((s) => `
      <tr>
        <td>${new Date(s.created_at).toLocaleString("pt-PT")}</td>
        <td>${s.client_name}</td>
        <td>${s.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td>
        <td>${s.user_email || "—"}</td>
        <td><span class="badge ${s.status}">${STATUS_LABEL[s.status]}</span></td>
        <td class="right"><strong>${euro(s.total)}</strong></td>
      </tr>
    `).join("");
    const byUserRows = Object.entries(salesData.totals.by_user).map(([u, v]) => `<tr><td>${u}</td><td class="right">${euro(v)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Relatório de vendas</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:12px}
  header{border-bottom:3px solid #15803d;padding-bottom:12px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:16px;margin:6px 0}
  h2{font-size:13px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px}
  .right{text-align:right}
  .badge{font-size:9px;padding:2px 6px;border-radius:10px;border:1px solid;font-weight:700}
  .paid{background:#dcfce7;color:#166534;border-color:#86efac}
  .partial{background:#fef3c7;color:#92400e;border-color:#fcd34d}
  .open{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
  .totals{display:flex;gap:12px;margin-top:18px}
  .card{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px}
  .card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.15em}
  .card .val{font-size:16px;font-weight:800;margin-top:3px}
  @media print{button{display:none}body{margin:10mm}}
</style></head><body>
  <header>
    <div class="brand">${salesData.club_name}</div>
    <div class="sub">RELATÓRIO DE VENDAS</div>
    <h1>Período: ${filters.from || "início"} → ${filters.to || "hoje"}</h1>
    <div style="font-size:11px;color:#555">
      ${filters.user_email ? "Vendedor: <strong>"+filters.user_email+"</strong> · " : ""}
      ${filters.status ? "Estado: <strong>"+STATUS_LABEL[filters.status]+"</strong> · " : ""}
      Emitido em ${new Date(salesData.generated_at).toLocaleString("pt-PT")}
    </div>
  </header>
  <div class="totals">
    <div class="card"><div class="lbl">Vendas</div><div class="val">${salesData.totals.count}</div></div>
    <div class="card"><div class="lbl">Total</div><div class="val">${euro(salesData.totals.amount)}</div></div>
  </div>
  <h2>Detalhe</h2>
  <table>
    <thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Vendedor</th><th>Estado</th><th class="right">Total</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#666;padding:20px">Sem vendas no período</td></tr>`}</tbody>
  </table>
  <h2>Por vendedor</h2>
  <table>
    <thead><tr><th>Vendedor</th><th class="right">Total</th></tr></thead>
    <tbody>${byUserRows}</tbody>
  </table>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="historico-page">
      <div className="flex items-center gap-3 mb-6">
        <ClockCounterClockwise size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Contabilidade</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Histórico</h1>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1 mb-6" data-testid="historico-tabs">
        <button
          data-testid="tab-sales"
          onClick={() => setTab("sales")}
          className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider ${tab === "sales" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
        >Vendas</button>
        <button
          data-testid="tab-audit"
          onClick={() => setTab("audit")}
          className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider ${tab === "audit" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
        >Audit log</button>
        <button
          data-testid="tab-acta"
          onClick={() => setTab("acta")}
          className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider ${tab === "acta" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
        >Ata diária</button>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <FunnelSimple size={12} /> Filtros
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            data-testid="filter-from"
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            data-testid="filter-to"
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
          />
          <select
            data-testid="filter-user"
            value={filters.user_email}
            onChange={(e) => setFilters({ ...filters, user_email: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">Todos os utilizadores</option>
            {users.map((u) => (
              <option key={u.id} value={u.email}>{u.name} · {u.email}</option>
            ))}
          </select>
          {tab === "sales" && (
            <select
              data-testid="filter-client"
              value={filters.client_id}
              onChange={(e) => setFilters({ ...filters, client_id: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Todos os clientes/sócios</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.member_number ? ` · nº ${c.member_number}` : ""}{c.is_member ? " · Sócio" : ""}
                </option>
              ))}
            </select>
          )}
          {tab === "sales" && (
            <select
              data-testid="filter-status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Pago + em aberto</option>
              <option value="paid">Pagas</option>
              <option value="open">Em aberto</option>
            </select>
          )}
          <button
            data-testid="apply-filters-btn"
            onClick={tab === "sales" ? loadSales : tab === "audit" ? loadAudit : loadActa}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-3 py-2 text-sm"
          >Aplicar</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { v: "today", l: "Hoje" },
            { v: "month", l: "Este mês" },
            { v: "year", l: "Este ano" },
            { v: "all", l: "Sempre" },
          ].map((p) => (
            <button
              key={p.v}
              data-testid={`preset-${p.v}`}
              onClick={() => applyPreset(p.v)}
              className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
            >{p.l}</button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : tab === "sales" ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          {salesData && (
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/60 flex-wrap gap-2">
              <div className="flex items-center gap-5 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Vendas</div>
                  <div data-testid="sales-count" className="font-outfit text-2xl font-bold text-slate-100">{salesData.totals.count}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total</div>
                  <div data-testid="sales-total" className="font-outfit text-2xl font-bold text-amber-300">{euro(salesData.totals.amount)}</div>
                </div>
              </div>
              <button
                data-testid="print-sales-report"
                onClick={printSalesReport}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2 border border-slate-700"
              >
                <Printer size={14} weight="duotone" /> Imprimir
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Itens</th>
                  <th className="px-5 py-3 font-medium">Vendedor</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(salesData?.sales || []).map((s) => (
                  <tr key={s.id} data-testid={`sales-report-row-${s.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                    <td className="px-5 py-2.5 text-slate-400 text-xs">{new Date(s.created_at).toLocaleString("pt-PT")}</td>
                    <td className="px-5 py-2.5 text-slate-200">
                      <Link to={`/clientes/${s.client_id}`} className="hover:text-amber-400">{s.client_name}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400 text-xs max-w-xs truncate">{s.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs font-mono">{s.user_email || "—"}</td>
                    <td className="px-5 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CLASS[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-amber-400 font-semibold">{euro(s.total)}</td>
                  </tr>
                ))}
                {salesData?.sales?.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-500 py-10">Sem vendas no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "audit" ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Utilizador</th>
                  <th className="px-5 py-3 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {auditData.map((e) => {
                  const sale = e.sale || e.before;
                  const changes = e.changes || {};
                  return (
                    <tr key={e.id} data-testid={`audit-row-${e.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                      <td className="px-5 py-2.5 text-slate-400 text-xs align-top">{new Date(e.at).toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-2.5 align-top">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/15 text-amber-300 border-amber-500/30">
                          {TYPE_LABEL[e.type] || e.type}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-slate-300 text-xs font-mono align-top">{e.by}</td>
                      <td className="px-5 py-2.5 text-slate-400 text-xs align-top">
                        {sale && (
                          <div className="mb-1">
                            <Link to={`/clientes/${sale.client_id}`} className="text-slate-200 hover:text-amber-400 font-medium">
                              {sale.client_name}
                            </Link>
                            <span className="text-slate-500"> · {euro(sale.total)} · {sale.items?.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</span>
                          </div>
                        )}
                        {Object.keys(changes).length > 0 && (
                          <div className="space-y-0.5 mt-1 pl-2 border-l-2 border-amber-500/30">
                            {changes.client && (
                              <div><span className="text-slate-500">Cliente:</span> <span className="text-rose-300 line-through">{changes.client.before}</span> → <span className="text-emerald-300">{changes.client.after}</span></div>
                            )}
                            {changes.total !== undefined && (
                              <div><span className="text-slate-500">Total:</span> <span className="text-rose-300 line-through">{euro(changes.total.before)}</span> → <span className="text-emerald-300">{euro(changes.total.after)}</span></div>
                            )}
                            {changes.items && (
                              <div>
                                <span className="text-slate-500">Itens antes:</span> <span className="text-rose-300">{changes.items.before.join(", ")}</span>
                                <br/>
                                <span className="text-slate-500">Itens depois:</span> <span className="text-emerald-300">{changes.items.after.join(", ")}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {auditData.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-500 py-10">Sem registos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "acta" ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/60 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Scroll size={20} weight="duotone" className="text-amber-400" />
              <input
                data-testid="acta-date"
                type="date"
                value={actaDate}
                onChange={(e) => setActaDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button
                data-testid="acta-load"
                onClick={loadActa}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-3 py-2 text-sm"
              >Carregar</button>
            </div>
            {actaData && (
              <button
                data-testid="acta-print"
                onClick={printActa}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2 border border-slate-700"
              >
                <Printer size={14} weight="duotone" /> Imprimir ata
              </button>
            )}
          </div>
          {actaData && (
            <div className="p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">
                Ata de {actaData.date} · Gerada em {new Date(actaData.generated_at).toLocaleString("pt-PT")}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Vendas</div>
                  <div className="font-outfit text-xl font-bold text-slate-100">{actaData.totals?.sales_count || 0}</div>
                  <div className="text-xs text-amber-300">{euro(actaData.totals?.sales || 0)}</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Pagamentos</div>
                  <div className="font-outfit text-xl font-bold text-slate-100">{actaData.totals?.payments_count || 0}</div>
                  <div className="text-xs text-emerald-300">{euro(actaData.totals?.payments || 0)}</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Despesas</div>
                  <div className="font-outfit text-xl font-bold text-slate-100">{euro(actaData.totals?.expenses || 0)}</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Saldo</div>
                  <div className={`font-outfit text-xl font-bold ${(actaData.totals?.sales || 0) + (actaData.totals?.payments || 0) - (actaData.totals?.expenses || 0) >= 0 ? "text-amber-300" : "text-rose-300"}`}>
                    {euro((actaData.totals?.sales || 0) + (actaData.totals?.payments || 0) - (actaData.totals?.expenses || 0))}
                  </div>
                </div>
              </div>
              {/* Vendas */}
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-2">Vendas ({(actaData.sales || []).length})</div>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-slate-500 text-xs uppercase bg-slate-950/40"><th className="px-3 py-2">Data</th><th className="px-3 py-2">Nº</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Itens</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {(actaData.sales || []).map((s) => (
                      <tr key={s.id} className="border-t border-slate-800/60">
                        <td className="px-3 py-2 text-xs text-slate-400">{new Date(s.created_at).toLocaleString("pt-PT")}</td>
                        <td className="px-3 py-2 text-xs text-amber-400">#{s.tx_number || "—"}</td>
                        <td className="px-3 py-2 text-slate-200">{s.client_name}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-xs">{(s.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td>
                        <td className="px-3 py-2 text-right text-amber-400 font-semibold">{euro(s.total)}</td>
                      </tr>
                    ))}
                    {(actaData.sales || []).length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Sem vendas</td></tr>}
                  </tbody>
                </table>
              </div>
              {/* Pagamentos */}
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/80 mb-2">Pagamentos ({(actaData.payments || []).length})</div>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-slate-500 text-xs uppercase bg-slate-950/40"><th className="px-3 py-2">Data</th><th className="px-3 py-2">Nº</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
                  <tbody>
                    {(actaData.payments || []).map((p) => (
                      <tr key={p.id} className="border-t border-slate-800/60">
                        <td className="px-3 py-2 text-xs text-slate-400">{new Date(p.created_at).toLocaleString("pt-PT")}</td>
                        <td className="px-3 py-2 text-xs text-emerald-400">#{p.tx_number || "—"}</td>
                        <td className="px-3 py-2 text-slate-200">{p.client_name}</td>
                        <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{euro(p.total_credited || p.amount)}</td>
                      </tr>
                    ))}
                    {(actaData.payments || []).length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">Sem pagamentos</td></tr>}
                  </tbody>
                </table>
              </div>
              {/* Auditoria */}
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-400/80 mb-2">Registo de auditoria ({(actaData.audits || []).length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-slate-500 text-xs uppercase bg-slate-950/40"><th className="px-3 py-2">Data</th><th className="px-3 py-2">Utilizador</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Detalhes</th></tr></thead>
                  <tbody>
                    {(actaData.audits || []).map((a) => (
                      <tr key={a.id} className="border-t border-slate-800/60">
                        <td className="px-3 py-2 text-xs text-slate-400">{new Date(a.at).toLocaleString("pt-PT")}</td>
                        <td className="px-3 py-2 text-xs text-slate-300 font-mono">{a.by}</td>
                        <td className="px-3 py-2 text-xs text-fuchsia-300">{a.type}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{a.summary || "—"}</td>
                      </tr>
                    ))}
                    {(actaData.audits || []).length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-6">Sem registos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!actaData && !loading && (
            <div className="p-10 text-center text-slate-500">Seleciona uma data e carrega a ata diária.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
