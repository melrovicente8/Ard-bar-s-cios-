import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ClockCounterClockwise, Printer, FunnelSimple, MagnifyingGlass, DownloadSimple, X as XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_LABEL = { paid: "Pago", partial: "Parcial", open: "Em aberto" };
const STATUS_CLASS = {
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  open: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};
// Etiquetas legíveis para o audit log (o backend guarda o tipo em código)
const AUDIT_TONE = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  pink: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  teal: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  red: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  gray: "bg-slate-700/40 text-slate-300 border-slate-600/50",
};

const AUDIT_META = {
  payment_create: ["Pagamento registado", "green"],
  payment_edit: ["Pagamento editado", "green"],
  payment_reverse: ["Pagamento anulado", "red"],
  payment_delete: ["Pagamento eliminado", "red"],
  payment_tip: ["Gratificação registada", "green"],
  mbway_confirm: ["MBWay confirmado", "blue"],
  mbway_reject: ["MBWay rejeitado", "red"],
  sale_create: ["Venda registada", "amber"],
  sale_cancel: ["Venda anulada", "red"],
  sale_edit: ["Venda editada", "amber"],
  house_offer: ["Oferta da casa", "pink"],
  quota_bill: ["Cotas lançadas", "purple"],
  quota_bulk_launch: ["Cotas lançadas (direção)", "purple"],
  quota_reverse: ["Cotas extornadas", "red"],
  client_create: ["Sócio criado", "blue"],
  client_edit: ["Ficha editada", "blue"],
  client_delete: ["Sócio eliminado", "red"],
  client_profile_extra_edit: ["Perfil do sócio atualizado", "blue"],
  pin_recovery_request: ["Pedido de recuperação de PIN", "red"],
  pin_change: ["PIN alterado", "red"],
  request_notify_pickup: ["Aviso de levantamento", "amber"],
  request_deliver: ["Pedido entregue", "amber"],
  request_cancel: ["Pedido anulado", "red"],
  request_picked_up_socio: ["Sócio marcou como levantado", "amber"],
  socio_gift_delegated: ["Pagamento delegado", "pink"],
  socio_gift_prepaid: ["Consumo pago a outro sócio", "pink"],
  socio_gift_accepted: ["Pagamento aceite", "pink"],
  socio_gift_rejected: ["Pagamento recusado", "red"],
  socio_gift_confirmed: ["Pagamento confirmado", "pink"],
  socio_gift_claimed: ["Bónus solicitado", "pink"],
  socio_gift_served: ["Consumo servido", "pink"],
  socio_gift_consumed: ["Consumo concluído", "pink"],
  socio_gift_charged: ["Consumo lançado ao servir", "pink"],
  family_limit_set: ["Limite do agregado definido", "blue"],
  family_dependent_add: ["Tutor adicionado ao agregado", "blue"],
  bar_open: ["Bar aberto", "teal"],
  bar_close: ["Bar fechado", "teal"],
  bar_auto_close: ["Bar fechado automaticamente", "red"],
  bar_status_toggle: ["Estado do bar alterado", "teal"],
  cash_difference: ["Diferença de caixa", "red"],
  cash_withdrawal: ["Saída de caixa", "teal"],
  credit_refund: ["Devolução de crédito", "red"],
  expense_payment: ["Despesa paga", "teal"],
  temp_client_create: ["Não cliente criado", "amber"],
  temp_client_discard: ["Não cliente descartado", "red"],
  temp_client_archive: ["Não cliente arquivado", "amber"],
  temp_client_reopen: ["Não cliente reaberto", "amber"],
  temp_client_transfer: ["Ficha transferida para sócio", "amber"],
  user_create: ["Utilizador criado", "gray"],
  user_delete: ["Utilizador eliminado", "red"],
  site_content_edit: ["Texto do portal editado", "gray"],
  site_content_reset: ["Texto do portal reposto", "gray"],
  community_staff_post: ["Publicação no chat", "gray"],
  community_delete: ["Mensagem removida", "red"],
  supplier_order_auto: ["Encomenda automática", "teal"],
  simulation_create: ["Simulação de consumos", "pink"],
  simulation_clear: ["Simulação removida", "pink"],
  simulation_commit: ["Simulação efetivada", "green"],
};

// Operações que a direção deve ver destacadas
const AUDIT_SENSITIVE = new Set([
  "pin_recovery_request", "pin_change", "payment_reverse", "payment_delete", "sale_cancel",
  "quota_reverse", "credit_refund", "house_offer", "client_delete", "user_delete",
  "cash_difference", "bar_auto_close", "temp_client_discard", "site_content_reset", "community_delete",
]);

const auditMeta = (type) => {
  const meta = AUDIT_META[type];
  if (meta) return { label: meta[0], tone: meta[1] };
  const pretty = String(type || "—").replace(/_/g, " ");
  return { label: pretty.charAt(0).toUpperCase() + pretty.slice(1), tone: "gray" };
};

// Resumo rápido do impacto da ação (uma linha, para a coluna Detalhes)
const auditDetailText = (e) => {
  const bits = [];
  if (e.tx_number) bits.push(`#${e.tx_number}`);
  if (e.summary) bits.push(e.summary);
  const sale = e.sale || (e.before && e.before.items ? e.before : null);
  if (sale?.client_name) bits.push(`${sale.client_name}${sale.total != null ? ` · ${euro(sale.total)}` : ""}`);
  if (e.changes?.client) bits.push(`cliente ${e.changes.client.before} → ${e.changes.client.after}`);
  if (e.changes?.total) bits.push(`total ${euro(e.changes.total.before)} → ${euro(e.changes.total.after)}`);
  if (!bits.length) bits.push("—");
  return bits.join(" · ");
};

export default function Historico() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "audit" ? "audit" : "sales"); // sales | audit
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  // Filtros podem vir por URL (ex.: ficha do cliente → detalhe de vendas desse cliente)
  const urlPreset = searchParams.get("preset");
  const [filters, setFilters] = useState({
    from: urlPreset === "all" ? "" : (searchParams.get("from") || monthStart),
    to: urlPreset === "all" ? "" : (searchParams.get("to") || today),
    user_email: searchParams.get("user_email") || "",
    client_id: searchParams.get("client_id") || "",
    status: searchParams.get("status") || "",
  });
  const [actaDate, setActaDate] = useState(today);
  const [salesData, setSalesData] = useState(null);
  const [auditData, setAuditData] = useState([]);
  // Filtros próprios do audit log
  const [auditType, setAuditType] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditDetail, setAuditDetail] = useState(null);
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
      if (auditType) params.event_type = auditType;
      if (auditSearch.trim()) params.search = auditSearch.trim();
      const { data } = await api.get("/audit-log", { params });
      setAuditData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); loadClients(); }, []);
  useEffect(() => {
    if (tab === "sales") loadSales();
    else loadAudit();
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

  const printDailyActa = async () => {
    const day = actaDate || today;
    try {
      const [{ data: sales }, { data: audit }] = await Promise.all([
        api.get("/reports/sales", { params: { date_from: day, date_to: day } }),
        api.get("/audit-log", { params: { date_from: day, date_to: day } }),
      ]);
      const w = window.open("", "_blank");
      if (!w) return toast.error("Permite popups");
      const salesRows = (sales.sales || []).map((s) => `
        <tr>
          <td>${new Date(s.created_at).toLocaleString("pt-PT")}</td>
          <td>#${s.tx_number ?? "—"}</td>
          <td>${s.client_name}</td>
          <td>${(s.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td>
          <td><span class="badge ${s.status}">${STATUS_LABEL[s.status]}</span></td>
          <td class="right"><strong>${euro(s.total)}</strong></td>
        </tr>
      `).join("");
      const auditRows = (Array.isArray(audit) ? audit : []).map((e) => {
        const sale = e.sale || e.before;
        const changes = e.changes || {};
        const detail = [
          e.tx_number ? `#${e.tx_number}` : "",
          e.summary,
          sale ? `${sale.client_name || ""} · ${euro(sale.total || 0)} · ${(sale.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}` : "",
          changes.total !== undefined ? `Total: ${euro(changes.total.before)} → ${euro(changes.total.after)}` : "",
        ].filter(Boolean).join(" — ");
        return `<tr><td>${new Date(e.at).toLocaleTimeString("pt-PT")}</td><td>${auditMeta(e.type).label}</td><td>${e.by}</td><td>${detail}</td></tr>`;
      }).join("");
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Acta diária · ${day}</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:12px}
  header{border-bottom:3px solid #15803d;padding-bottom:12px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:16px;margin:6px 0}
  h2{font-size:13px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px;vertical-align:top}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px}
  .right{text-align:right}
  .badge{font-size:9px;padding:2px 6px;border-radius:10px;border:1px solid;font-weight:700}
  .paid{background:#dcfce7;color:#166534;border-color:#86efac}
  .partial{background:#fef3c7;color:#92400e;border-color:#fcd34d}
  .open{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
  .totals{display:flex;gap:12px;margin-top:14px}
  .card{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px}
  .card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.15em}
  .card .val{font-size:16px;font-weight:800;margin-top:3px}
  .meta{font-size:11px;color:#555}
  @media print{button{display:none}body{margin:10mm}}
</style></head><body>
  <header>
    <div class="brand">${sales.club_name || "ARD Nespereira"}</div>
    <div class="sub">ACTA DIÁRIA · TRANSAÇÕES E REGISTOS</div>
    <h1>Dia: ${new Date(day + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</h1>
    <div class="meta">Emitido em ${new Date().toLocaleString("pt-PT")}</div>
  </header>
  <div class="totals">
    <div class="card"><div class="lbl">Vendas do dia</div><div class="val">${sales.totals?.count ?? 0}</div></div>
    <div class="card"><div class="lbl">Total faturado</div><div class="val">${euro(sales.totals?.amount || 0)}</div></div>
    <div class="card"><div class="lbl">Registos de auditoria</div><div class="val">${(Array.isArray(audit) ? audit : []).length}</div></div>
  </div>
  <h2>Transações do dia</h2>
  <table>
    <thead><tr><th>Hora</th><th>Nº</th><th>Cliente</th><th>Itens</th><th>Estado</th><th class="right">Total</th></tr></thead>
    <tbody>${salesRows || `<tr><td colspan="6" style="text-align:center;color:#666;padding:16px">Sem transações neste dia</td></tr>`}</tbody>
  </table>
  <h2>Registos e operações (audit log)</h2>
  <table>
    <thead><tr><th>Hora</th><th>Tipo</th><th>Utilizador</th><th>Detalhes</th></tr></thead>
    <tbody>${auditRows || `<tr><td colspan="4" style="text-align:center;color:#666;padding:16px">Sem registos neste dia</td></tr>`}</tbody>
  </table>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
      w.document.close();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const printAuditReport = () => {
    if (!auditData.length) return toast.error("Sem registos para imprimir");
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permite popups");
    const rows = auditData.map((e) => {
      const sale = e.sale || e.before;
      const changes = e.changes || {};
      const detail = [
        e.summary,
        sale ? `${sale.client_name || ""} · ${euro(sale.total || 0)} · ${(sale.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}` : "",
        changes.total !== undefined ? `Total: ${euro(changes.total.before)} → ${euro(changes.total.after)}` : "",
        changes.items ? `Itens: ${changes.items.before.join(", ")} → ${changes.items.after.join(", ")}` : "",
      ].filter(Boolean).join(" — ");
      return `<tr><td>${new Date(e.at).toLocaleString("pt-PT")}</td><td>${auditMeta(e.type).label}</td><td>${e.by}</td><td>${detail}</td></tr>`;
    }).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Audit log</title>
<style>
  body{font-family:Arial;color:#0f172a;margin:24px;font-size:12px}
  header{border-bottom:3px solid #15803d;padding-bottom:12px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:800;color:#15803d;letter-spacing:.15em}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:16px;margin:6px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:11px;vertical-align:top}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px}
  .meta{font-size:11px;color:#555}
  @media print{button{display:none}body{margin:10mm}}
</style></head><body>
  <header>
    <div class="brand">${salesData?.club_name || "ARD Nespereira"}</div>
    <div class="sub">AUDIT LOG · REGISTO DE OPERAÇÕES</div>
    <h1>Período: ${filters.from || "início"} → ${filters.to || "hoje"}</h1>
    <div class="meta">${filters.user_email ? "Utilizador: <strong>" + filters.user_email + "</strong> · " : ""}${auditData.length} registos · Emitido em ${new Date().toLocaleString("pt-PT")}</div>
  </header>
  <table><thead><tr><th>Data</th><th>Tipo</th><th>Utilizador</th><th>Detalhes</th></tr></thead><tbody>${rows}</tbody></table>
  <p style="margin-top:18px;text-align:center"><button onclick="window.print()">Imprimir</button></p>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  const exportAuditCsv = () => {
    if (!auditData.length) return toast.error("Sem registos para exportar");
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Data", "Ação", "Utilizador", "Transação", "Detalhes", "Entidade", "ID entidade"]];
    auditData.forEach((e) => {
      rows.push([
        new Date(e.at).toLocaleString("pt-PT"),
        auditMeta(e.type).label,
        e.by || "",
        e.tx_number ? `#${e.tx_number}` : "",
        auditDetailText(e),
        e.entity || "",
        e.entity_id || "",
      ]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${filters.from || "inicio"}_${filters.to || "hoje"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
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
      </div>

      {/* Acta diária (PDF) */}
      <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="daily-acta-bar">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Acta diária</label>
        <input
          data-testid="acta-date"
          type="date"
          value={actaDate}
          onChange={(e) => setActaDate(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
        />
        <button
          data-testid="acta-daily-btn"
          onClick={printDailyActa}
          className="bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2 border border-slate-700"
        >
          <Printer size={14} weight="duotone" /> Abrir acta (PDF)
        </button>
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
          {tab === "audit" && (
            <select
              data-testid="filter-audit-type"
              value={auditType}
              onChange={(e) => setAuditType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Todas as ações</option>
              {Object.keys(AUDIT_META)
                .sort((a, b) => AUDIT_META[a][0].localeCompare(AUDIT_META[b][0], "pt"))
                .map((t) => (
                  <option key={t} value={t}>{AUDIT_META[t][0]}</option>
                ))}
              {[...new Set(auditData.map((e) => e.type))]
                .filter((t) => !AUDIT_META[t])
                .map((t) => (
                  <option key={t} value={t}>{auditMeta(t).label}</option>
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
            onClick={tab === "sales" ? loadSales : loadAudit}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-3 py-2 text-sm"
          >Aplicar</button>
        </div>
        {tab === "audit" && (
          <div className="mt-3" data-testid="audit-search-bar">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                data-testid="audit-search-input"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadAudit(); }}
                placeholder="Procurar por nome, nº de sócio, funcionário, referência ou nº de transação…"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-slate-500"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              A lupa procura em todos os detalhes: nome do sócio/cliente, nº de sócio, funcionário, referência MBWay e nº de transação (no período escolhido — usa “Sempre” para todo o histórico).
            </p>
          </div>
        )}
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
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/60 flex-wrap gap-2">
            <div className="flex items-center gap-5 text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Registos</div>
                <div data-testid="audit-count" className="font-outfit text-2xl font-bold text-slate-100">{auditData.length}</div>
              </div>
              <div className="text-[11px] text-slate-500">
                {filters.from || "início"} → {filters.to || "hoje"}{filters.user_email ? ` · ${filters.user_email}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                data-testid="export-audit-csv"
                onClick={exportAuditCsv}
                disabled={!auditData.length}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2 border border-emerald-500/40"
              >
                <DownloadSimple size={14} weight="bold" /> Exportar CSV
              </button>
              <button
                data-testid="print-audit-report"
                onClick={printAuditReport}
                disabled={!auditData.length}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2 border border-slate-700"
              >
                <Printer size={14} weight="duotone" /> Imprimir
              </button>
            </div>
          </div>
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
                  const meta = auditMeta(e.type);
                  const sensitive = AUDIT_SENSITIVE.has(e.type);
                  const sale = e.sale || e.before;
                  return (
                    <tr
                      key={e.id}
                      data-testid={`audit-row-${e.id}`}
                      onClick={() => setAuditDetail(e)}
                      className={`border-t border-slate-800/60 hover:bg-slate-900/60 cursor-pointer ${sensitive ? "bg-rose-500/[0.04]" : ""}`}
                    >
                      <td className="px-5 py-2.5 text-slate-400 text-xs align-top whitespace-nowrap">{new Date(e.at).toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-2.5 align-top">
                        <span className="flex items-center gap-1.5">
                          {sensitive && (
                            <span data-testid={`audit-warn-${e.id}`} title="Operação sensível — verificar" className="text-amber-400">⚠️</span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${AUDIT_TONE[meta.tone]}`}>
                            {meta.label}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-slate-300 text-xs font-mono align-top break-all">{e.by || "—"}</td>
                      <td className="px-5 py-2.5 text-slate-300 text-xs align-top">
                        <div className="flex items-start gap-2">
                          <span className="flex-1 min-w-0">{auditDetailText(e)}</span>
                          <span className="text-slate-600 shrink-0" aria-hidden="true">›</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {e.tx_number ? (
                            <Link
                              to={`/transacoes/${e.tx_number}`}
                              onClick={(ev) => ev.stopPropagation()}
                              data-testid={`audit-tx-${e.id}`}
                              className="text-[10px] font-mono text-amber-400 hover:underline"
                            >
                              abrir transação #{e.tx_number}
                            </Link>
                          ) : null}
                          {sale?.client_id ? (
                            <Link
                              to={`/clientes/${sale.client_id}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-[10px] text-slate-400 hover:text-amber-400"
                            >
                              {sale.client_name}
                            </Link>
                          ) : null}
                          <span className="text-[10px] text-slate-600 font-mono">{e.entity ? `${e.entity}` : ""}</span>
                        </div>
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
      )}

      {auditDetail && (
        <div
          className="fixed inset-0 z-[70] flex justify-end bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setAuditDetail(null)}
          data-testid="audit-detail-drawer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 overflow-y-auto p-6"
          >
            <div className="flex items-start gap-2 mb-4">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Detalhe do registo</div>
                <h3 className="font-outfit text-xl font-semibold mt-1 flex items-center gap-2 flex-wrap">
                  {auditMeta(auditDetail.type).label}
                  {AUDIT_SENSITIVE.has(auditDetail.type) && <span className="text-amber-400" title="Operação sensível">⚠️</span>}
                </h3>
                <div className="text-xs text-slate-400 mt-1">
                  {new Date(auditDetail.at).toLocaleString("pt-PT")} · {auditDetail.by || "—"}
                </div>
              </div>
              <button onClick={() => setAuditDetail(null)} className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700" aria-label="Fechar">
                <XIcon size={16} weight="bold" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Transação</div>
                <div className="text-amber-300 font-mono">{auditDetail.tx_number ? `#${auditDetail.tx_number}` : "—"}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Entidade</div>
                <div className="text-slate-200 font-mono break-all">{auditDetail.entity || "—"}</div>
              </div>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Registo completo</div>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(auditDetail, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
