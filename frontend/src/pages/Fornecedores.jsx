import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  Plus,
  Truck,
  PencilSimple,
  Trash,
  ArrowRight,
  CurrencyEur,
  Package,
  Check,
  Receipt,
  Calendar,
  Printer,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-slate-900 border border-slate-800 rounded-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} p-6 my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-outfit text-xl font-semibold mb-5">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function Fornecedores() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "tesoureiro";
  const canDelete = user?.role === "admin";

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("suppliers"); // suppliers | orders | expenses

  const [showSupplier, setShowSupplier] = useState(null);
  const [supForm, setSupForm] = useState({ name: "", contact: "", email: "", nif: "", note: "" });

  const [showOrder, setShowOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({
    supplier_id: "",
    items: [{ product_id: "", quantity: 1, unit_cost: 0 }],
    paid: false,
    invoice_ref: "",
    note: "",
  });

  const [payOrder, setPayOrder] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "" });

  // Report modal
  const [reportSupplier, setReportSupplier] = useState(null);
  const [reportRange, setReportRange] = useState({ from: "", to: "" });

  const [showExpense, setShowExpense] = useState(null); // null/false | {mode:"new"} | {mode:"edit",id}
  const [expForm, setExpForm] = useState({ supplier_id: "", description: "", amount: "", due_date: "", paid: false, recurring: "", note: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [s, p, o, e] = await Promise.all([
        api.get("/suppliers"),
        api.get("/products"),
        api.get("/supplier-orders"),
        api.get("/supplier-expenses"),
      ]);
      setSuppliers(s.data);
      setProducts(p.data);
      setOrders(o.data);
      setExpenses(e.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalDebt = suppliers.reduce((s, x) => s + (x.outstanding || 0), 0);
  const expensesDebt = expenses.filter((x) => !x.paid).reduce((s, x) => s + (x.amount || 0), 0);

  const openNewSupplier = () => {
    setSupForm({ name: "", contact: "", email: "", nif: "", note: "" });
    setShowSupplier({ mode: "new" });
  };
  const openEditSupplier = (s) => {
    setSupForm({ name: s.name, contact: s.contact || "", email: s.email || "", nif: s.nif || "", note: s.note || "" });
    setShowSupplier({ mode: "edit", id: s.id });
  };
  const submitSupplier = async (e) => {
    e.preventDefault();
    try {
      if (showSupplier.mode === "new") {
        await api.post("/suppliers", supForm);
        toast.success("Fornecedor criado");
      } else {
        await api.put(`/suppliers/${showSupplier.id}`, supForm);
        toast.success("Fornecedor atualizado");
      }
      setShowSupplier(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };
  const removeSupplier = async (s) => {
    if (!window.confirm(`Eliminar ${s.name}?`)) return;
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success("Eliminado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  // order form helpers
  const setItem = (i, patch) => {
    const items = orderForm.items.slice();
    items[i] = { ...items[i], ...patch };
    setOrderForm({ ...orderForm, items });
  };
  const addItem = () => setOrderForm({ ...orderForm, items: [...orderForm.items, { product_id: "", quantity: 1, unit_cost: 0 }] });
  const removeItem = (i) => setOrderForm({ ...orderForm, items: orderForm.items.filter((_, idx) => idx !== i) });

  const orderTotal = orderForm.items.reduce((t, it) => t + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.supplier_id) return toast.error("Escolhe fornecedor");
    const items = orderForm.items
      .filter((x) => x.product_id && x.quantity > 0)
      .map((x) => ({ product_id: x.product_id, quantity: Number(x.quantity), unit_cost: Number(x.unit_cost) }));
    if (!items.length) return toast.error("Sem itens válidos");
    try {
      await api.post("/supplier-orders", {
        supplier_id: orderForm.supplier_id,
        items,
        paid: orderForm.paid,
        invoice_ref: orderForm.invoice_ref || null,
        note: orderForm.note || null,
      });
      toast.success("Encomenda registada — stock atualizado");
      setShowOrder(false);
      setOrderForm({ supplier_id: "", items: [{ product_id: "", quantity: 1, unit_cost: 0 }], paid: false, invoice_ref: "", note: "" });
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitPay = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/supplier-orders/${payOrder.id}/pay`, { amount: parseFloat(payForm.amount) });
      toast.success("Pagamento ao fornecedor registado");
      setPayOrder(null);
      setPayForm({ amount: "" });
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openNewExpense = () => {
    setExpForm({ supplier_id: "", description: "", amount: "", due_date: "", paid: false, recurring: "monthly", note: "" });
    setShowExpense({ mode: "new" });
  };
  const openEditExpense = (e) => {
    setExpForm({
      supplier_id: e.supplier_id || "",
      description: e.description || "",
      amount: String(e.amount),
      due_date: e.due_date || "",
      paid: !!e.paid,
      recurring: e.recurring || "",
      note: e.note || "",
    });
    setShowExpense({ mode: "edit", id: e.id });
  };
  const submitExpense = async (e) => {
    e.preventDefault();
    const body = {
      supplier_id: expForm.supplier_id || null,
      description: expForm.description,
      amount: parseFloat(expForm.amount),
      due_date: expForm.due_date || null,
      paid: !!expForm.paid,
      recurring: expForm.recurring || null,
      note: expForm.note || null,
    };
    try {
      if (showExpense.mode === "new") {
        await api.post("/supplier-expenses", body);
        toast.success("Despesa criada");
      } else {
        await api.put(`/supplier-expenses/${showExpense.id}`, body);
        toast.success("Despesa atualizada");
      }
      setShowExpense(null);
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };
  const toggleExpensePaid = async (e) => {
    try {
      await api.put(`/supplier-expenses/${e.id}`, { paid: !e.paid });
      toast.success(e.paid ? "Marcada como em aberto" : "Marcada como paga");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };
  const deleteExpense = async (e) => {
    if (!window.confirm("Eliminar despesa?")) return;
    try {
      await api.delete(`/supplier-expenses/${e.id}`);
      toast.success("Eliminada");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const openReport = (s) => {
    const today = new Date().toISOString().slice(0, 10);
    setReportRange({ from: today.slice(0, 7) + "-01", to: today });
    setReportSupplier(s);
  };

  const printSupplierReport = async () => {
    try {
      const params = {};
      if (reportRange.from) params.date_from = reportRange.from;
      if (reportRange.to) params.date_to = reportRange.to;
      const { data } = await api.get(`/reports/supplier/${reportSupplier.id}`, { params });
      const w = window.open("", "_blank");
      if (!w) return toast.error("Permite popups para imprimir");
      const fmtD = (iso) => new Date(iso).toLocaleString("pt-PT");
      const periodLabel = `${reportRange.from || "início"} → ${reportRange.to || "hoje"}`;
      const ordersRows = data.orders.map((o) => `
        <tr>
          <td>${fmtD(o.created_at)}</td>
          <td>${o.invoice_ref || "—"}</td>
          <td>${o.items.map((it) => `${it.quantity}× ${it.product_name}`).join("<br/>")}</td>
          <td class="right"><strong>${euro(o.total)}</strong></td>
          <td class="right">${euro(o.amount_paid || 0)}</td>
          <td class="right ${o.balance_due > 0 ? "neg" : "pos"}">${euro(o.balance_due || 0)}</td>
          <td>${o.paid ? "Pago" : "Em dívida"}</td>
        </tr>
      `).join("");
      const expensesRows = data.expenses.map((e) => `
        <tr>
          <td>${e.due_date || fmtD(e.created_at).slice(0,10)}</td>
          <td>${e.description}</td>
          <td>${e.recurring || "—"}</td>
          <td class="right ${e.paid ? "pos" : "neg"}"><strong>${euro(e.amount)}</strong></td>
          <td>${e.paid ? `Pago ${e.paid_at ? "em " + fmtD(e.paid_at) : ""}` : "Em dívida"}</td>
        </tr>
      `).join("");
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Conta-corrente · ${data.supplier.name}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #15803d;padding-bottom:14px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:800;letter-spacing:.15em;color:#15803d}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:18px;margin:0}
  h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px;vertical-align:top}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#444}
  .right{text-align:right}
  .neg{color:#b91c1c}
  .pos{color:#15803d}
  .totals{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}
  .card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px}
  .card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.15em}
  .card .val{font-size:16px;font-weight:800;margin-top:4px}
  .meta{font-size:11px;color:#555;margin-top:4px}
  footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#666;display:flex;justify-content:space-between}
  @media print{ button{display:none} body{margin:12mm} }
</style></head><body>
  <header>
    <div>
      <div class="brand">${data.club_name || "ARD NESPEREIRA"}</div>
      <div class="sub">CONTA-CORRENTE · FORNECEDOR</div>
    </div>
    <div style="text-align:right">
      <h1>${data.supplier.name}</h1>
      <div class="meta">${data.supplier.nif ? "NIF: " + data.supplier.nif + " · " : ""}${data.supplier.contact || ""}${data.supplier.email ? " · "+data.supplier.email : ""}</div>
      <div class="meta">Período: <strong>${periodLabel}</strong></div>
      <div class="meta">Emitido em ${new Date(data.generated_at).toLocaleString("pt-PT")}</div>
    </div>
  </header>
  <h2>Encomendas</h2>
  <table>
    <thead><tr><th>Data</th><th>Fatura</th><th>Itens</th><th class="right">Total</th><th class="right">Pago</th><th class="right">Em dívida</th><th>Estado</th></tr></thead>
    <tbody>${ordersRows || `<tr><td colspan="7" style="text-align:center;color:#666;padding:18px">Sem encomendas no período</td></tr>`}</tbody>
  </table>
  <h2>Despesas / Contratos</h2>
  <table>
    <thead><tr><th>Vencimento</th><th>Descrição</th><th>Recorrência</th><th class="right">Valor</th><th>Estado</th></tr></thead>
    <tbody>${expensesRows || `<tr><td colspan="5" style="text-align:center;color:#666;padding:18px">Sem despesas no período</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div class="card"><div class="lbl">Total encomendas</div><div class="val">${euro(data.totals.orders)}</div></div>
    <div class="card"><div class="lbl">Pago</div><div class="val pos">${euro(data.totals.paid_orders)}</div></div>
    <div class="card"><div class="lbl">Dívida encomendas</div><div class="val neg">${euro(data.totals.debt_orders)}</div></div>
    <div class="card"><div class="lbl">Dívida despesas</div><div class="val neg">${euro(data.totals.debt_expenses)}</div></div>
  </div>
  <div class="meta" style="margin-top:14px">Dívida total no período: <strong>${euro(data.totals.total_debt)}</strong></div>
  <footer>
    <span>${data.club_name}</span>
    <span><button onclick="window.print()">Imprimir</button></span>
  </footer>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
      w.document.close();
      setReportSupplier(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="fornecedores-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Compras
          </div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
            Fornecedores
          </h1>
        </div>
        <div className="flex gap-2">
          {canManage && tab === "expenses" && (
            <button
              data-testid="add-expense-btn"
              onClick={openNewExpense}
              className="bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-bold px-4 py-2.5 rounded-lg flex items-center gap-2"
            >
              <Plus size={16} weight="bold" /> Despesa
            </button>
          )}
          {canManage && tab !== "expenses" && (
            <button
              data-testid="add-supplier-btn"
              onClick={openNewSupplier}
              className="bg-slate-800 hover:bg-slate-700 text-white font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 border border-slate-700"
            >
              <Plus size={16} weight="bold" /> Fornecedor
            </button>
          )}
          {canManage && tab !== "expenses" && (
            <button
              data-testid="add-order-btn"
              onClick={() => setShowOrder(true)}
              disabled={!suppliers.length || !products.length}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold px-4 py-2.5 rounded-lg flex items-center gap-2"
            >
              <Plus size={16} weight="bold" /> Encomenda
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatBox label="Fornecedores" value={suppliers.length} />
        <StatBox label="Dívida encomendas" value={euro(totalDebt)} accent="text-rose-300" />
        <StatBox label="Despesas em aberto" value={euro(expensesDebt)} accent="text-fuchsia-300" />
        <StatBox label="Encomendas" value={orders.length} />
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setTab("suppliers")}
          data-testid="tab-suppliers"
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${tab === "suppliers" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-slate-900/40 text-slate-400 border-slate-800"}`}
        >
          Fornecedores
        </button>
        <button
          onClick={() => setTab("orders")}
          data-testid="tab-orders"
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${tab === "orders" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-slate-900/40 text-slate-400 border-slate-800"}`}
        >
          Encomendas
        </button>
        <button
          onClick={() => setTab("expenses")}
          data-testid="tab-expenses"
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${tab === "expenses" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-slate-900/40 text-slate-400 border-slate-800"}`}
        >
          Despesas mensais
        </button>
      </div>

      {tab === "suppliers" && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-slate-500">A carregar...</div>
          ) : suppliers.length === 0 ? (
            <div className="p-12 text-center">
              <Truck size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              <p className="text-slate-400">Sem fornecedores. Adiciona o primeiro.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                    <th className="px-5 py-3 font-medium">Nome</th>
                    <th className="px-5 py-3 font-medium">Contacto</th>
                    <th className="px-5 py-3 font-medium">NIF</th>
                    <th className="px-5 py-3 font-medium text-right">Em dívida</th>
                    <th className="px-5 py-3 font-medium text-right">Encomendas</th>
                    <th className="px-5 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} data-testid={`supplier-row-${s.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                      <td className="px-5 py-3 font-medium text-slate-100">{s.name}</td>
                      <td className="px-5 py-3 text-slate-400">{s.contact || "—"}</td>
                      <td className="px-5 py-3 text-slate-400">{s.nif || "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={(s.outstanding || 0) > 0 ? "text-rose-400 font-semibold" : "text-slate-500"}>
                          {euro(s.outstanding || 0)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-300">{s.orders_count || 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            data-testid={`supplier-report-${s.id}`}
                            onClick={() => openReport(s)}
                            title="Imprimir conta-corrente"
                            className="p-2 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                          >
                            <Printer size={14} weight="duotone" />
                          </button>
                          {canManage && (
                            <button
                              data-testid={`supplier-edit-${s.id}`}
                              onClick={() => openEditSupplier(s)}
                              className="p-2 rounded-md bg-slate-800 hover:bg-slate-700"
                            >
                              <PencilSimple size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              data-testid={`supplier-delete-${s.id}`}
                              onClick={() => removeSupplier(s)}
                              className="p-2 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === "orders" && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              <p className="text-slate-400">Sem encomendas registadas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                    <th className="px-5 py-3 font-medium">Data</th>
                    <th className="px-5 py-3 font-medium">Fornecedor</th>
                    <th className="px-5 py-3 font-medium">Fatura</th>
                    <th className="px-5 py-3 font-medium">Itens</th>
                    <th className="px-5 py-3 font-medium text-right">Total</th>
                    <th className="px-5 py-3 font-medium text-right">Em dívida</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} data-testid={`order-row-${o.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                      <td className="px-5 py-3 text-slate-400 text-xs">{new Date(o.created_at).toLocaleString("pt-PT")}</td>
                      <td className="px-5 py-3 text-slate-200">{o.supplier_name}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{o.invoice_ref || "—"}</td>
                      <td className="px-5 py-3 text-slate-400">{o.items.reduce((s, i) => s + i.quantity, 0)} un.</td>
                      <td className="px-5 py-3 text-right text-amber-300 font-semibold">{euro(o.total)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={o.balance_due > 0 ? "text-rose-400" : "text-slate-500"}>
                          {euro(o.balance_due)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {o.paid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Pago</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">Em dívida</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          {!o.paid && canManage && (
                            <button
                              data-testid={`order-pay-${o.id}`}
                              onClick={() => { setPayOrder(o); setPayForm({ amount: String(o.balance_due.toFixed(2)) }); }}
                              className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5"
                            >
                              <CurrencyEur size={14} weight="bold" /> Pagar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === "expenses" && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
          {expenses.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              <p className="text-slate-400">Sem despesas registadas. Adiciona contratos como luz, água, internet, renda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                    <th className="px-5 py-3 font-medium">Descrição</th>
                    <th className="px-5 py-3 font-medium">Fornecedor</th>
                    <th className="px-5 py-3 font-medium">Periodicidade</th>
                    <th className="px-5 py-3 font-medium">Data prevista</th>
                    <th className="px-5 py-3 font-medium text-right">Valor</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} data-testid={`expense-row-${e.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                      <td className="px-5 py-3 font-medium text-slate-100">{e.description}</td>
                      <td className="px-5 py-3 text-slate-400">{e.supplier_name || "—"}</td>
                      <td className="px-5 py-3 text-slate-500 capitalize">{e.recurring || "única"}</td>
                      <td className="px-5 py-3 text-slate-400 flex items-center gap-1">
                        <Calendar size={12} weight="duotone" /> {e.due_date || "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-amber-300 font-semibold">{euro(e.amount)}</td>
                      <td className="px-5 py-3">
                        {e.paid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Pago{e.paid_at ? ` · ${new Date(e.paid_at).toLocaleDateString("pt-PT")}` : ""}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">Em aberto</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {canManage && (
                            <button
                              data-testid={`expense-toggle-${e.id}`}
                              onClick={() => toggleExpensePaid(e)}
                              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${e.paid ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25" : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"}`}
                            >
                              {e.paid ? "Reabrir" : "Marcar pago"}
                            </button>
                          )}
                          {canManage && (
                            <button data-testid={`expense-edit-${e.id}`} onClick={() => openEditExpense(e)} className="p-2 rounded-md bg-slate-800 hover:bg-slate-700">
                              <PencilSimple size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button data-testid={`expense-delete-${e.id}`} onClick={() => deleteExpense(e)} className="p-2 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20">
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={!!showSupplier} onClose={() => setShowSupplier(null)} title={showSupplier?.mode === "edit" ? "Editar fornecedor" : "Novo fornecedor"}>
        <form onSubmit={submitSupplier} className="space-y-3">
          <Field label="Nome *">
            <input data-testid="supplier-name-input" required value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacto">
              <input value={supForm.contact} onChange={(e) => setSupForm({ ...supForm, contact: e.target.value })} className={inputCls} />
            </Field>
            <Field label="NIF">
              <input value={supForm.nif} onChange={(e) => setSupForm({ ...supForm, nif: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={supForm.email} onChange={(e) => setSupForm({ ...supForm, email: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Nota">
            <input value={supForm.note} onChange={(e) => setSupForm({ ...supForm, note: e.target.value })} className={inputCls} />
          </Field>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setShowSupplier(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
            <button data-testid="supplier-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Guardar</button>
          </div>
        </form>
      </Modal>

      <Modal open={showOrder} onClose={() => setShowOrder(false)} title="Nova encomenda · adiciona ao stock" wide>
        <form onSubmit={submitOrder} className="space-y-3">
          <Field label="Fornecedor *">
            <select data-testid="order-supplier-select" required value={orderForm.supplier_id} onChange={(e) => setOrderForm({ ...orderForm, supplier_id: e.target.value })} className={inputCls}>
              <option value="">— escolher —</option>
              {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Itens</div>
            <div className="space-y-2">
              {orderForm.items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    data-testid={`order-item-product-${i}`}
                    value={it.product_id}
                    onChange={(e) => setItem(i, { product_id: e.target.value })}
                    className={inputCls + " col-span-6"}
                  >
                    <option value="">— produto —</option>
                    {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <input
                    data-testid={`order-item-qty-${i}`}
                    type="number" min="1" placeholder="qtd"
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: e.target.value })}
                    className={inputCls + " col-span-2"}
                  />
                  <input
                    data-testid={`order-item-cost-${i}`}
                    type="number" step="0.01" min="0" placeholder="custo €"
                    value={it.unit_cost}
                    onChange={(e) => setItem(i, { unit_cost: e.target.value })}
                    className={inputCls + " col-span-3"}
                  />
                  <button type="button" onClick={() => removeItem(i)} disabled={orderForm.items.length === 1} className="col-span-1 p-2 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed">
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="mt-2 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <Plus size={12} weight="bold" /> Adicionar item
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fatura/Ref">
              <input value={orderForm.invoice_ref} onChange={(e) => setOrderForm({ ...orderForm, invoice_ref: e.target.value })} className={inputCls} />
            </Field>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer mt-5">
              <input
                data-testid="order-paid-toggle"
                type="checkbox"
                checked={orderForm.paid}
                onChange={(e) => setOrderForm({ ...orderForm, paid: e.target.checked })}
                className="w-4 h-4 accent-green-500"
              />
              <span className="text-xs font-medium text-slate-200">Já pago (não fica em dívida)</span>
            </label>
          </div>

          <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80">Total</span>
            <span className="font-outfit text-2xl font-bold text-amber-300" data-testid="order-total">
              {euro(orderTotal)}
            </span>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setShowOrder(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
            <button data-testid="order-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2">
              <Check size={16} weight="bold" /> Registar (adiciona ao stock)
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!payOrder} onClose={() => setPayOrder(null)} title={`Pagar encomenda · ${payOrder?.supplier_name || ""}`}>
        <form onSubmit={submitPay} className="space-y-3">
          <div className="text-xs text-slate-400">
            Em dívida: <strong className="text-rose-300">{euro(payOrder?.balance_due || 0)}</strong>
          </div>
          <Field label="Valor a pagar € *">
            <input data-testid="pay-order-amount-input" type="number" step="0.01" min="0.01" required value={payForm.amount} onChange={(e) => setPayForm({ amount: e.target.value })} className={inputCls + " text-lg font-bold"} />
          </Field>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setPayOrder(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
            <button data-testid="pay-order-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Pagar</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showExpense} onClose={() => setShowExpense(null)} title={showExpense?.mode === "edit" ? "Editar despesa" : "Nova despesa mensal"}>
        <form onSubmit={submitExpense} className="space-y-3">
          <Field label="Descrição *">
            <input
              data-testid="expense-description-input"
              required
              value={expForm.description}
              onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
              placeholder="Ex: Renda, Eletricidade, Internet..."
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor € *">
              <input
                data-testid="expense-amount-input"
                type="number" step="0.01" min="0.01" required
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Data prevista">
              <input
                data-testid="expense-due-input"
                type="date"
                value={expForm.due_date}
                onChange={(e) => setExpForm({ ...expForm, due_date: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Periodicidade">
              <select
                value={expForm.recurring}
                onChange={(e) => setExpForm({ ...expForm, recurring: e.target.value })}
                className={inputCls}
              >
                <option value="">Única</option>
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </select>
            </Field>
            <Field label="Fornecedor (opcional)">
              <select
                value={expForm.supplier_id}
                onChange={(e) => setExpForm({ ...expForm, supplier_id: e.target.value })}
                className={inputCls}
              >
                <option value="">—</option>
                {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
            <input
              data-testid="expense-paid-toggle"
              type="checkbox"
              checked={expForm.paid}
              onChange={(e) => setExpForm({ ...expForm, paid: e.target.checked })}
              className="w-4 h-4 accent-green-500"
            />
            <span className="text-xs font-medium text-slate-200">Já está pago</span>
          </label>
          <Field label="Nota">
            <input value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} className={inputCls} />
          </Field>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setShowExpense(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
            <button data-testid="expense-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-bold">Guardar</button>
          </div>
        </form>
      </Modal>
      <Modal open={!!reportSupplier} onClose={() => setReportSupplier(null)} title={`Imprimir conta-corrente · ${reportSupplier?.name || ""}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="De">
              <input
                data-testid="supplier-report-from"
                type="date"
                value={reportRange.from}
                onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Até">
              <input
                data-testid="supplier-report-to"
                type="date"
                value={reportRange.to}
                onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                const t = new Date().toISOString().slice(0, 10);
                setReportRange({ from: t.slice(0, 7) + "-01", to: t });
              }}
              className="text-xs px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
            >
              Este mês
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date().toISOString().slice(0, 10);
                setReportRange({ from: t.slice(0, 4) + "-01-01", to: t });
              }}
              className="text-xs px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
            >
              Este ano
            </button>
            <button
              type="button"
              onClick={() => setReportRange({ from: "", to: "" })}
              className="text-xs px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
            >
              Sempre
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setReportSupplier(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
            <button
              data-testid="supplier-report-print-btn"
              onClick={printSupplierReport}
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2"
            >
              <Printer size={16} weight="bold" /> Imprimir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const inputCls = "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50";

const Field = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</label>
    <div className="mt-1.5">{children}</div>
  </div>
);

const StatBox = ({ label, value, accent = "text-slate-200" }) => (
  <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
    <div className={`mt-2 font-outfit text-2xl font-bold ${accent}`}>{value}</div>
  </div>
);
