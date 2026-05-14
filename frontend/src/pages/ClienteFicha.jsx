import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  ArrowLeft,
  CurrencyEur,
  ShoppingBag,
  Receipt,
  Medal,
  WhatsappLogo,
  EnvelopeSimple,
  ChatCircleText,
  Star,
  PencilSimple,
  Check,
  X as XIcon,
  Coins,
  Plus,
  Minus,
  Trash,
  Storefront,
  MagnifyingGlass,
  Wine,
  Printer,
  Phone,
  MapPin,
  Camera,
  CalendarBlank,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function ClienteFicha() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEditAll = user?.role === "admin" || user?.role === "tesoureiro";
  const canEditAny = !!user;
  const canCancelSale = !!user; // funcionários até 24h (backend faz cumprir)
  const canEditSale = !!user;
  const canDeleteClient = user?.role === "admin";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", points_used: 0, note: "", keep_change_as_credit: false, tip: 0, tip_change: false });
  const [paySelectedSales, setPaySelectedSales] = useState({}); // {sale_id: true}
  const [notifyPayment, setNotifyPayment] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    contact: "",
    email: "",
    morada: "",
    note: "",
    member_number: "",
    is_member: false,
    pin: "",
  });
  // Sell modal state
  const [showSell, setShowSell] = useState(false);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [sellSearch, setSellSearch] = useState("");
  // Edit payment modal
  const [editPay, setEditPay] = useState(null); // payment object
  const [editPayForm, setEditPayForm] = useState({ amount: "", note: "" });
  // Report modal
  const [showReport, setShowReport] = useState(false);
  const [reportRange, setReportRange] = useState({ from: "", to: "" });
  // Edit sale modal (alter itens + transferir cliente)
  const [editSale, setEditSale] = useState(null);
  const [editSaleItems, setEditSaleItems] = useState({}); // {product_id: qty}
  const [editSaleClient, setEditSaleClient] = useState("");
  const [allClients, setAllClients] = useState([]);
  const [editSaleSearch, setEditSaleSearch] = useState("");
  // Filtro temporal (Hoje por defeito) — afecta o cartão Consumo e o Histórico
  const [timeFilter, setTimeFilter] = useState("today");
  // Cotas mensais (só sócios)
  const [quotas, setQuotas] = useState(null); // {year, quotas:[12]}
  const [quotaYear, setQuotaYear] = useState(new Date().getFullYear());
  const [quotaSelection, setQuotaSelection] = useState({}); // {month: true}
  // Foto / data nascimento (admin/tesoureiro)
  const [showProfileExtra, setShowProfileExtra] = useState(false);
  const [profileForm, setProfileForm] = useState({ birthday: "", photo_data: "" });

  const loadQuotas = async (year = quotaYear) => {
    try {
      const { data } = await api.get(`/clients/${id}/quotas`, { params: { year } });
      setQuotas(data);
      setQuotaSelection({});
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitQuotaPayment = async () => {
    const months = Object.entries(quotaSelection).filter(([, v]) => v).map(([m]) => Number(m));
    if (!months.length) return toast.error("Seleciona pelo menos um mês");
    try {
      await api.post("/quotas/pay", { client_id: id, year: quotaYear, months });
      toast.success(`${months.length} cota(s) pagas`);
      await loadQuotas(quotaYear);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openProfileExtra = () => {
    const c = data.client;
    setProfileForm({ birthday: c.birthday || "", photo_data: "" });
    setShowProfileExtra(true);
  };

  const onProfilePhoto = (file) => {
    if (!file) return;
    if (file.size > 1_200_000) return toast.error("Imagem demasiado grande (máx 1 MB)");
    const reader = new FileReader();
    reader.onload = () => setProfileForm((f) => ({ ...f, photo_data: reader.result }));
    reader.readAsDataURL(file);
  };

  const submitProfileExtra = async (e) => {
    e.preventDefault();
    try {
      const body = {};
      if (profileForm.birthday !== (data.client.birthday || "")) body.birthday = profileForm.birthday;
      if (profileForm.photo_data) body.photo_data = profileForm.photo_data;
      if (!Object.keys(body).length) return toast.error("Sem alterações");
      await api.put(`/clients/${id}/profile-extra`, body);
      toast.success("Perfil atualizado");
      setShowProfileExtra(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const clearProfilePhoto = async () => {
    if (!window.confirm("Remover a foto deste sócio?")) return;
    try {
      await api.put(`/clients/${id}/profile-extra`, { clear_photo: true });
      toast.success("Foto removida");
      setShowProfileExtra(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  useEffect(() => {
    if (data?.client?.is_member) loadQuotas(quotaYear);
    // eslint-disable-next-line
  }, [data?.client?.id, quotaYear]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/clients/${id}`);
      setData(data);
      setPayForm({ amount: "", points_used: 0, note: "", keep_change_as_credit: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  const submitPay = async (e) => {
    e.preventDefault();
    try {
      const selectedIds = Object.entries(paySelectedSales).filter(([, v]) => v).map(([k]) => k);
      const tipValue = payForm.tip_change
        ? Math.max(Number(payForm.amount || 0) - (selectedIds.length
            ? Object.entries(paySelectedSales).filter(([, v]) => v).reduce((s, [sid]) => s + (sales.find((x) => x.id === sid)?.total || 0), 0)
            : Math.max(c.balance || 0, 0)) - (Number(payForm.points_used || 0) / 5), 0)
        : Number(payForm.tip || 0);
      const { data: payment } = await api.post("/payments", {
        client_id: id,
        amount: parseFloat(payForm.amount || 0),
        points_used: Number(payForm.points_used || 0),
        note: payForm.note || null,
        keep_change_as_credit: !!payForm.keep_change_as_credit,
        tip: tipValue || 0,
        sale_ids: selectedIds.length ? selectedIds : null,
      });
      toast.success("Pagamento registado");
      setShowPay(false);
      setPaySelectedSales({});
      await load();
      // Open notify modal
      setNotifyPayment(payment);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const reversePayment = async (p) => {
    if (!window.confirm(`Estornar pagamento de ${euro(p.total_credited || p.amount)}?`)) return;
    try {
      await api.post(`/payments/${p.id}/reverse`);
      toast.success("Pagamento estornado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const canReversePayment = (p) => {
    if (!user) return false;
    if (canEditAll) return true;
    if (p.user_email !== user.email) return false;
    const created = new Date(p.created_at).getTime();
    return (Date.now() - created) < 5 * 60 * 1000;
  };

  const sendNotification = async (channel) => {
    try {
      const { data } = await api.post("/notify/payment", {
        payment_id: notifyPayment.id,
        channel,
      });
      if (channel === "email") {
        if (data.sent) toast.success(`Email enviado para ${data.to}`);
        else toast.message("Resend não está configurado", { description: "Adiciona RESEND_API_KEY para ativar envio automático." });
      } else if (data.url) {
        window.open(data.url, "_blank");
        toast.success(`A abrir ${channel === "whatsapp" ? "WhatsApp" : "SMS"}...`);
      }
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openSell = async () => {
    try {
      const { data } = await api.get("/products");
      setProducts(data);
      setCart({});
      setShowSell(true);
    } catch (e) {
      toast.error("Não foi possível carregar produtos");
    }
  };

  const sellAddItem = (p) => {
    const cur = cart[p.id] || 0;
    if (cur >= p.quantity) return toast.error(`Stock máximo: ${p.quantity}`);
    setCart({ ...cart, [p.id]: cur + 1 });
  };
  const sellDecItem = (pid) => {
    const cur = cart[pid] || 0;
    if (cur <= 1) {
      const c = { ...cart };
      delete c[pid];
      setCart(c);
    } else setCart({ ...cart, [pid]: cur - 1 });
  };
  const sellRemoveItem = (pid) => {
    const c = { ...cart };
    delete c[pid];
    setCart(c);
  };
  const sellTotal = Object.entries(cart).reduce((s, [pid, qty]) => {
    const p = products.find((x) => x.id === pid);
    return s + (p ? p.price * qty : 0);
  }, 0);
  const submitSale = async () => {
    const items = Object.entries(cart).map(([pid, qty]) => ({ product_id: pid, quantity: qty }));
    if (!items.length) return toast.error("Carrinho vazio");
    try {
      await api.post("/sales", { client_id: id, items });
      toast.success(`Venda registada · ${euro(sellTotal)}`);
      setShowSell(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const cancelSale = async (sale) => {
    if (!window.confirm(`Cancelar esta venda de ${euro(sale.total)}? O stock será reposto.`)) return;
    try {
      await api.delete(`/sales/${sale.id}`);
      toast.success("Venda cancelada · stock reposto");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openEditSale = async (sale) => {
    try {
      const [pRes, cRes] = await Promise.all([api.get("/products"), api.get("/clients")]);
      setProducts(pRes.data);
      setAllClients(cRes.data);
      const items = {};
      sale.items.forEach((it) => { items[it.product_id] = it.quantity; });
      setEditSaleItems(items);
      setEditSaleClient(sale.client_id);
      setEditSale(sale);
      setEditSaleSearch("");
    } catch (e) {
      toast.error("Erro a carregar produtos/clientes");
    }
  };

  const submitEditSale = async () => {
    const items = Object.entries(editSaleItems)
      .filter(([, qty]) => qty > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) return toast.error("Tem de existir pelo menos 1 item");
    const body = { items };
    if (editSaleClient && editSaleClient !== editSale.client_id) body.client_id = editSaleClient;
    try {
      await api.put(`/sales/${editSale.id}`, body);
      const transferred = body.client_id && body.client_id !== id;
      toast.success(transferred ? "Venda transferida para outro cliente" : "Venda atualizada");
      setEditSale(null);
      if (transferred) {
        // saiu desta ficha
        navigate(`/clientes/${id}`); // recarrega
        await load();
      } else {
        await load();
      }
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openEditPay = (p) => {
    setEditPay(p);
    setEditPayForm({ amount: String(Number(p.amount || 0).toFixed(2)), note: p.note || "" });
  };

  const submitEditPay = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/payments/${editPay.id}`, {
        amount: parseFloat(editPayForm.amount || 0),
        note: editPayForm.note || "",
      });
      toast.success("Pagamento atualizado");
      setEditPay(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const deletePayment = async (p) => {
    if (!window.confirm(`Eliminar pagamento de ${euro(p.amount)}? A dívida será reposta.`)) return;
    try {
      await api.delete(`/payments/${p.id}`);
      toast.success("Pagamento eliminado · dívida reposta");
      setEditPay(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const printTransaction = (tx) => {
    if (!tx || !tx.tx_number) {
      return toast.error("Transação sem nº — não pode ser impressa individualmente");
    }
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) return toast.error("Permite popups");
    const isSale = !!tx.items;
    const dateStr = new Date(tx.created_at).toLocaleString("pt-PT");
    const itemsHtml = isSale ? tx.items.map((it) => `<div class="row"><span>${it.quantity}× ${it.product_name}</span><span>${euro(it.subtotal)}</span></div>`).join("") : "";
    const isPaid = !isSale;
    const tendered = tx.tendered || tx.amount;
    const credited = tx.total_credited || tx.amount;
    const change = tx.change_returned || 0;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Transação ${tx.tx_number}</title>
<style>body{font-family:'Courier New',monospace;max-width:320px;margin:14px auto;padding:0 12px;font-size:13px;color:#000}
h1{font-size:16px;text-align:center;margin:4px 0 0;letter-spacing:.18em}
h2{font-size:11px;text-align:center;margin:0 0 14px;color:#444;letter-spacing:.25em}
hr{border:0;border-top:1px dashed #000;margin:10px 0}
.row{display:flex;justify-content:space-between;margin:4px 0}
.big{font-size:20px;font-weight:bold}
.muted{color:#555;font-size:11px}
.txn{font-size:14px;font-weight:bold;background:#000;color:#fff;text-align:center;padding:4px;border-radius:3px;margin:8px 0}
@media print{ body{margin:0} button{display:none} }
</style></head><body>
<h1>ARD · NESPEREIRA</h1>
<h2>${isSale ? "VENDA" : "RECIBO DE PAGAMENTO"} · 2ª VIA</h2>
<div class="txn">TRANSAÇÃO Nº ${tx.tx_number}</div>
<div class="muted">${dateStr}</div>
<div class="muted">Registado por: ${tx.user_email || "—"}</div>
<hr/>
<div class="row"><span>Cliente</span><strong>${tx.client_name}</strong></div>
${isSale ? `<hr/>${itemsHtml}<hr/><div class="row big"><span>TOTAL</span><span>${euro(tx.total)}</span></div>${tx.points_earned ? `<div class="row"><span>Pontos ganhos</span><span>+${tx.points_earned}</span></div>` : ""}` : `<hr/>
<div class="row"><span>Numerário entregue</span><span>${euro(tendered)}</span></div>
${tx.points_used ? `<div class="row"><span>Pontos usados</span><span>${tx.points_used} pts</span></div>` : ""}
<div class="row"><span>Valor da despesa</span><span>${euro(credited)}</span></div>
${change > 0 ? `<div class="row"><span>Troco devolvido</span><span>${euro(change)}</span></div>` : ""}
${tx.note ? `<div class="row"><span>Nota</span><span>${tx.note}</span></div>` : ""}
<hr/>
<div class="row big"><span>${change > 0 ? "ABATIDO" : "TOTAL ABATIDO"}</span><span>${euro(credited)}</span></div>`}
<hr/>
<div style="text-align:center" class="muted">Obrigado pela preferência</div>
<div style="text-align:center;margin-top:14px"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  const printReceipt = () => {
    if (!notifyPayment) return;
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return toast.error("Permite popups para imprimir");
    const dateStr = new Date(notifyPayment.created_at || Date.now()).toLocaleString("pt-PT");
    // Vendas que estavam em aberto antes deste pagamento (snapshot atual de unpaid + vendas pagas recentemente)
    const totalRecv = Number(notifyPayment.total_credited || notifyPayment.amount || 0);
    let cover = totalRecv;
    const saleRows = [];
    salesAsc.slice().reverse().forEach((s) => {
      // mostra vendas que este pagamento cobriu (parcial ou totalmente)
      if (cover <= 0) return;
      const applied = Math.min(cover, s.total);
      cover -= applied;
      saleRows.unshift({ sale: s, applied });
    });
    const itemsHtml = saleRows.length === 0 ? "" : `<hr/>
    <div class="muted">Itens abatidos por este pagamento:</div>
    ${saleRows.map(({sale, applied}) => `
      <div style="margin-top:6px">
        <div class="row"><span class="muted">${new Date(sale.created_at).toLocaleDateString("pt-PT")}</span><span>${euro(sale.total)}</span></div>
        ${sale.items.map((it) => `<div class="row" style="font-size:11px"><span>· ${it.quantity}× ${it.product_name}</span><span>${euro(it.subtotal)}</span></div>`).join("")}
        ${applied < sale.total ? `<div class="row" style="font-size:10px;color:#888"><span>aplicado:</span><span>${euro(applied)}</span></div>` : ""}
      </div>
    `).join("")}`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Recibo</title>
<style>
  body{font-family:'Courier New',monospace;color:#000;max-width:320px;margin:14px auto;padding:0 12px;font-size:13px}
  h1{font-size:16px;text-align:center;margin:4px 0 0;letter-spacing:.18em}
  h2{font-size:11px;text-align:center;margin:0 0 14px;color:#444;letter-spacing:.25em}
  hr{border:0;border-top:1px dashed #000;margin:10px 0}
  .row{display:flex;justify-content:space-between;margin:4px 0}
  .big{font-size:20px;font-weight:bold}
  .center{text-align:center}
  .muted{color:#555;font-size:11px}
  @media print{ body{margin:0} button{display:none} }
</style></head><body>
  <h1>ARD · NESPEREIRA</h1>
  <h2>RECIBO DE PAGAMENTO</h2>
  ${notifyPayment.tx_number ? `<div style="font-size:14px;font-weight:bold;background:#000;color:#fff;text-align:center;padding:4px;border-radius:3px;margin:8px 0">TRANSAÇÃO Nº ${notifyPayment.tx_number}</div>` : ""}
  <div class="muted">${dateStr}</div>
  <div class="muted">Registado por: ${notifyPayment.user_email || "—"}</div>
  <hr/>
  <div class="row"><span>Cliente</span><strong>${c.name}</strong></div>
  ${c.member_number ? `<div class="row"><span>Nº Sócio</span><strong>${c.member_number}</strong></div>` : ""}
  ${itemsHtml}
  <hr/>
  <div class="row"><span>Numerário entregue</span><span>${euro(notifyPayment.tendered || notifyPayment.amount || 0)}</span></div>
  ${notifyPayment.points_used ? `<div class="row"><span>Pontos descontados</span><span>${notifyPayment.points_used} pts (${euro((notifyPayment.points_value)||(notifyPayment.points_used/5))})</span></div>` : ""}
  <div class="row"><span>Valor da despesa</span><span>${euro(notifyPayment.total_credited || notifyPayment.amount || 0)}</span></div>
  ${(notifyPayment.change_returned || 0) > 0 ? `<div class="row"><span>Troco devolvido</span><span>${euro(notifyPayment.change_returned)}</span></div>` : ""}
  ${notifyPayment.note ? `<div class="row"><span>Nota</span><span>${notifyPayment.note}</span></div>` : ""}
  <hr/>
  <div class="row big"><span>TOTAL ABATIDO</span><span>${euro(notifyPayment.total_credited || notifyPayment.amount || 0)}</span></div>
  <div class="row"><span>Dívida actual</span><strong>${euro(Math.max(c.balance || 0, 0))}</strong></div>
  <div class="row"><span>Pontos actuais</span><strong>${c.points || 0}</strong></div>
  <hr/>
  <div class="center muted">Obrigado pela preferência</div>
  <div class="center" style="margin-top:14px"><button onclick="window.print()">Imprimir</button></div>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  const printReport = async () => {
    try {
      const params = {};
      if (reportRange.from) params.date_from = reportRange.from;
      if (reportRange.to) params.date_to = reportRange.to;
      const { data } = await api.get(`/reports/client/${id}`, { params });
      const w = window.open("", "_blank");
      if (!w) return toast.error("Permite popups para imprimir");
      const rows = [
        ...data.sales.map((s) => ({ d: s.created_at, t: "Consumo", desc: s.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", "), v: -s.total })),
        ...data.payments.map((p) => ({ d: p.created_at, t: "Pagamento", desc: p.note || (p.source || "—"), v: +(p.total_credited || p.amount) })),
      ].sort((a, b) => (a.d < b.d ? -1 : 1));
      const fmtD = (iso) => new Date(iso).toLocaleString("pt-PT");
      const periodLabel = `${reportRange.from || "início"} → ${reportRange.to || "hoje"}`;
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Conta-corrente · ${data.client.name}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #15803d;padding-bottom:14px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:800;letter-spacing:.15em;color:#15803d}
  .sub{font-size:10px;letter-spacing:.3em;color:#666}
  h1{font-size:18px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px}
  th{background:#f3f4f6;text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#444}
  .right{text-align:right}
  .neg{color:#b91c1c}
  .pos{color:#15803d}
  .totals{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}
  .card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px}
  .card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.15em}
  .card .val{font-size:18px;font-weight:800;margin-top:4px}
  footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#666;display:flex;justify-content:space-between}
  .meta{font-size:11px;color:#555;margin-top:4px}
  @media print{ button{display:none} body{margin:12mm} }
</style></head><body>
  <header>
    <div>
      <div class="brand">${data.club_name || "ARD NESPEREIRA"}</div>
      <div class="sub">CONTA-CORRENTE · CLIENTE</div>
    </div>
    <div style="text-align:right">
      <h1>${data.client.name}</h1>
      <div class="meta">${data.client.member_number ? `Nº Sócio: ${data.client.member_number} · ` : ""}${data.client.contact || ""}${data.client.email ? " · "+data.client.email : ""}</div>
      <div class="meta">Período: <strong>${periodLabel}</strong></div>
      <div class="meta">Emitido em ${new Date(data.generated_at).toLocaleString("pt-PT")}</div>
    </div>
  </header>
  <table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="right">Valor</th></tr></thead>
    <tbody>
      ${rows.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:#666;padding:24px">Sem movimentos no período</td></tr>` : ""}
      ${rows.map((r) => `<tr><td>${fmtD(r.d)}</td><td>${r.t}</td><td>${r.desc}</td><td class="right ${r.v < 0 ? "neg" : "pos"}"><strong>${r.v < 0 ? "-" : "+"}${euro(Math.abs(r.v))}</strong></td></tr>`).join("")}
    </tbody>
  </table>
  <div class="totals">
    <div class="card"><div class="lbl">Total consumido</div><div class="val neg">${euro(data.totals.sales)}</div></div>
    <div class="card"><div class="lbl">Total pago</div><div class="val pos">${euro(data.totals.paid)}</div></div>
    <div class="card"><div class="lbl">Em dívida (período)</div><div class="val">${euro(Math.max(data.totals.diff, 0))}</div></div>
  </div>
  <div class="meta" style="margin-top:18px">Saldo atual em dívida: <strong>${euro(Math.max(data.client.balance || 0, 0))}</strong> · Pontos: <strong>${data.client.points || 0}</strong></div>
  <footer>
    <span>${data.club_name}</span>
    <span><button onclick="window.print()">Imprimir</button></span>
  </footer>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
      w.document.close();
      setShowReport(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const deleteClient = async () => {
    if (!window.confirm(`Eliminar definitivamente "${data?.client?.name}"? Esta ação não pode ser revertida.`)) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success("Cliente eliminado");
      navigate("/clientes");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openEdit = () => {
    const c = data.client;
    setEditForm({
      name: c.name || "",
      contact: c.contact || "",
      email: c.email || "",
      morada: c.morada || "",
      note: c.note || "",
      member_number: c.member_number || "",
      is_member: !!c.is_member,
      pin: "",
    });
    setShowEdit(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    const body = {};
    const c = data.client;
    const canEditName = canEditAll || !c.is_member; // funcionário só pode editar nome se NÃO for sócio
    if (canEditAll) {
      body.note = editForm.note || null;
      body.member_number = editForm.member_number || null;
      body.is_member = editForm.is_member;
      if (editForm.pin) body.pin = editForm.pin;
    }
    if (canEditName) body.name = editForm.name;
    body.contact = editForm.contact || null;
    body.email = editForm.email || null;
    body.morada = editForm.morada || null;
    try {
      await api.put(`/clients/${id}`, body);
      toast.success("Ficha atualizada");
      setShowEdit(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  if (loading || !data)
    return <div className="p-12 text-slate-500">A carregar...</div>;

  const { client: c, sales, payments } = data;
  const balance = c.balance || 0;
  const debt = Math.max(balance, 0);
  const credit = Math.max(-balance, 0);

  // Marcar cada venda como paga/em dívida.
  // Step 1: pagamentos com sale_ids específicos marcam directamente
  // Step 2: pagamentos sem sale_ids contribuem para um "pool" FIFO sobre as restantes vendas
  const targetedPaid = new Set();
  let pool = 0;
  payments.forEach((p) => {
    if (p.sale_ids && p.sale_ids.length) {
      p.sale_ids.forEach((sid) => targetedPaid.add(sid));
    } else {
      pool += Number(p.total_credited || p.amount || 0);
    }
  });
  const salesAsc = [...sales].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const paidStatus = {}; // sale_id → 'paid' | 'partial' | 'open'
  salesAsc.forEach((s) => {
    if (targetedPaid.has(s.id)) {
      paidStatus[s.id] = "paid";
      return;
    }
    if (pool >= s.total - 1e-9) {
      paidStatus[s.id] = "paid";
      pool -= s.total;
    } else if (pool > 1e-9) {
      paidStatus[s.id] = "partial";
      pool = 0;
    } else {
      paidStatus[s.id] = "open";
    }
  });
  // Subset of unpaid sales (open or partial) for payment modal breakdown
  const unpaidSales = sales.filter((s) => paidStatus[s.id] !== "paid");

  // Filtro temporal (Hoje por defeito) para Consumo e Histórico
  const inRange = (iso) => {
    if (timeFilter === "all") return true;
    const d = new Date(iso);
    const now = new Date();
    if (timeFilter === "today") return d.toDateString() === now.toDateString();
    if (timeFilter === "week") {
      const ago = new Date(now); ago.setDate(now.getDate() - 7);
      return d >= ago;
    }
    if (timeFilter === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (timeFilter === "year") return d.getFullYear() === now.getFullYear();
    return true;
  };
  const filteredSales = sales.filter((s) => inRange(s.created_at));
  // Build a timeline of sales + payments
  const events = [
    ...sales.filter((s) => inRange(s.created_at)).map((s) => ({ type: "sale", date: s.created_at, ...s })),
    ...payments.filter((p) => inRange(p.created_at)).map((p) => ({ type: "payment", date: p.created_at, ...p })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="ficha-page">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-6"
        data-testid="back-to-clientes"
      >
        <ArrowLeft size={16} /> Voltar
      </Link>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {c.photo_data ? (
            <img src={c.photo_data} alt={c.name} data-testid="ficha-client-photo" className="w-16 h-16 rounded-full object-cover border-2 border-amber-400" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-2xl">
              {c.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
              Ficha do cliente
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight" data-testid="ficha-client-name">
                {c.name}
              </h1>
              {canEditAny && (
                <button
                  data-testid="ficha-edit-btn"
                  onClick={openEdit}
                  title="Editar ficha"
                  className="p-2 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  <PencilSimple size={16} weight="bold" />
                </button>
              )}
              {canEditAll && c.member_number && (
                <button
                  data-testid="ficha-photo-btn"
                  onClick={openProfileExtra}
                  title="Foto / Data nascimento"
                  className="p-2 rounded-md bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 transition-colors"
                >
                  <Camera size={16} weight="duotone" />
                </button>
              )}
              {c.is_member ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/15 text-green-300 border border-green-500/30 flex items-center gap-1.5">
                  <Medal size={14} weight="fill" />
                  Sócio {c.member_number ? `nº ${c.member_number}` : ""} · Cotas pagas
                </span>
              ) : c.member_number ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                  <Medal size={14} />
                  Sócio nº {c.member_number} · Por regularizar
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-700/50 text-slate-300 border border-slate-600/30">
                  Não-sócio
                </span>
              )}
            </div>
            {c.birthday && (
              <div className="text-xs text-slate-400 mt-1" data-testid="ficha-bday">
                Data de nascimento: <span className="text-slate-300 font-medium">{new Date(c.birthday).toLocaleDateString("pt-PT")}</span>
              </div>
            )}
            {(c.contact || c.email || c.morada) && (
              <div className="text-sm text-slate-400 mt-1 space-y-0.5" data-testid="client-links">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {c.contact && (
                    <a
                      href={`tel:${c.contact}`}
                      data-testid="client-phone-link"
                      className="inline-flex items-center gap-1.5 text-slate-300 hover:text-amber-400 underline-offset-2 hover:underline"
                    >
                      <Phone size={13} weight="duotone" /> {c.contact}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      data-testid="client-email-link"
                      className="inline-flex items-center gap-1.5 text-slate-300 hover:text-amber-400 underline-offset-2 hover:underline"
                    >
                      <EnvelopeSimple size={13} weight="duotone" /> {c.email}
                    </a>
                  )}
                  {c.contact && (
                    <a
                      href={`https://wa.me/${(c.contact || "").replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="client-wa-link"
                      className="inline-flex items-center gap-1.5 text-green-400 hover:text-green-300 underline-offset-2 hover:underline"
                    >
                      <WhatsappLogo size={13} weight="fill" /> WhatsApp
                    </a>
                  )}
                </div>
                {c.morada && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.morada)}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="client-morada-link"
                    className="inline-flex items-center gap-1.5 text-slate-500 hover:text-amber-400 underline-offset-2 hover:underline"
                  >
                    <MapPin size={13} weight="duotone" /> {c.morada}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            data-testid="sell-from-ficha-btn"
            onClick={openSell}
            className="bg-green-600 hover:bg-green-500 text-white font-bold px-5 py-3 rounded-lg flex items-center gap-2"
          >
            <Storefront size={18} weight="duotone" /> Vender
          </button>
          <button
            data-testid="register-payment-btn"
            onClick={() => setShowPay(true)}
            disabled={debt <= 0}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold px-5 py-3 rounded-lg flex items-center gap-2"
          >
            <CurrencyEur size={18} weight="bold" /> Registar pagamento
          </button>
          <button
            data-testid="print-report-btn"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              const monthStart = today.slice(0, 7) + "-01";
              setReportRange({ from: monthStart, to: today });
              setShowReport(true);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold px-4 py-3 rounded-lg flex items-center gap-2 border border-slate-700"
            title="Imprimir conta-corrente"
          >
            <Printer size={18} weight="duotone" /> Imprimir
          </button>
          {canDeleteClient && (
            <button
              data-testid="delete-client-btn"
              onClick={deleteClient}
              title="Eliminar cliente"
              className="p-3 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
            >
              <Trash size={18} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className={`bg-gradient-to-br ${credit > 0 ? "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20" : "from-amber-500/10 to-amber-500/5 border-amber-500/20"} border rounded-xl p-5`}>
          <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${credit > 0 ? "text-emerald-400/80" : "text-amber-500/80"}`}>
            {credit > 0 ? "Crédito a favor" : "A pagar"}
          </div>
          <div
            data-testid="ficha-debt"
            className={`mt-2 font-outfit text-3xl font-bold ${credit > 0 ? "text-emerald-300" : "text-amber-300"}`}
          >
            {euro(credit > 0 ? credit : debt)}
          </div>
          {credit > 0 && (
            <div data-testid="ficha-credit-badge" className="mt-1 text-[10px] text-emerald-400/80">Cliente tem saldo positivo</div>
          )}
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Total consumido
          </div>
          <div className="mt-2 font-outfit text-3xl font-bold text-slate-200">
            {euro(c.total_spent || 0)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-600/10 to-green-600/5 border border-green-500/20 rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80 flex items-center gap-1.5">
            <Star size={11} weight="fill" /> Pontos
          </div>
          <div data-testid="ficha-points" className="mt-2 font-outfit text-3xl font-bold text-green-300">
            {c.points || 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {c.is_member ? "1 pt cada 5€" : "1 pt cada 10€"}
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Vendas
          </div>
          <div className="mt-2 font-outfit text-3xl font-bold text-slate-200">
            {sales.length}
          </div>
        </div>
      </div>

      {/* Consumption breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="consumption-breakdown">
        <BreakdownCard label="Consumo hoje" value={euro((data.consumption || {}).day || 0)} />
        <BreakdownCard label="Esta semana" value={euro((data.consumption || {}).week || 0)} />
        <BreakdownCard label="Este mês" value={euro((data.consumption || {}).month || 0)} />
        <BreakdownCard label="Este ano" value={euro((data.consumption || {}).year || 0)} highlight />
      </div>

      {/* Cotas mensais — apenas sócios */}
      {c.member_number && quotas && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6 mb-8" data-testid="quotas-section">
          <div className="flex items-center gap-2 mb-4">
            <CalendarBlank size={20} weight="duotone" className="text-amber-400" />
            <h3 className="font-outfit text-xl font-semibold">Cotas mensais</h3>
            <select
              data-testid="quotas-year"
              value={quotaYear}
              onChange={(e) => setQuotaYear(Number(e.target.value))}
              className="ml-auto bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm"
            >
              {[0, -1, -2].map((delta) => {
                const y = new Date().getFullYear() + delta;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          {(() => {
            const paid = quotas.quotas.filter((q) => q.status === "paid").length;
            const total = quotas.quotas.length;
            const pct = Math.round((paid / total) * 100);
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">{paid}/{total} meses pagos em {quotaYear}</span>
                  <span className={paid === total ? "text-emerald-400 font-bold" : "text-amber-300 font-bold"} data-testid="quotas-pct">{pct}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${paid === total ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                </div>
                {paid === total && (
                  <div data-testid="quotas-up-to-date" className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                    <Check size={12} weight="bold" /> Cotas {quotaYear} em dia
                  </div>
                )}
              </div>
            );
          })()}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            {quotas.quotas.map((q) => {
              const paid = q.status === "paid";
              const selected = !!quotaSelection[q.month];
              return (
                <button
                  key={q.month}
                  type="button"
                  disabled={paid || !canEditAll}
                  data-testid={`quota-${q.month}`}
                  onClick={() => setQuotaSelection({ ...quotaSelection, [q.month]: !selected })}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                    paid
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                      : selected
                      ? "bg-amber-500/25 text-amber-200 border-amber-500/60"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-amber-500/40"
                  } ${!canEditAll && !paid ? "opacity-60" : ""}`}
                >
                  <div className="text-[10px] uppercase font-bold tracking-wider opacity-70">{q.label}</div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[11px]">{euro(q.amount)}</span>
                    {paid ? <Check size={12} weight="bold" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
          {canEditAll && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {Object.values(quotaSelection).filter(Boolean).length > 0
                  ? `${Object.values(quotaSelection).filter(Boolean).length} mês(es) selecionados · ${euro(Object.entries(quotaSelection).filter(([, v]) => v).length * (quotas.quotas[0]?.amount || 0))}`
                  : "Seleciona meses por pagar"}
              </span>
              <button
                type="button"
                data-testid="quotas-pay-btn"
                onClick={submitQuotaPayment}
                disabled={Object.values(quotaSelection).filter(Boolean).length === 0}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm"
              >Pagar selecionadas</button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Sales history */}
        <div className="lg:col-span-3 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <ShoppingBag size={20} weight="duotone" className="text-amber-500" />
            <h3 className="font-outfit text-xl font-semibold">Consumo</h3>
          </div>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/60 p-1 mb-3 flex-wrap" data-testid="ficha-time-filter">
            {[
              { v: "today", l: "Hoje" },
              { v: "week", l: "Semana" },
              { v: "month", l: "Mês" },
              { v: "year", l: "Ano" },
              { v: "all", l: "Sempre" },
            ].map((opt) => (
              <button
                key={opt.v}
                data-testid={`ficha-filter-${opt.v}`}
                onClick={() => setTimeFilter(opt.v)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${timeFilter === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >{opt.l}</button>
            ))}
          </div>
          {filteredSales.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Sem consumos.</div>
          ) : (
            <ul className="space-y-3" data-testid="sales-list">
              {filteredSales.map((s) => {
                const status = paidStatus[s.id] || "open";
                const statusBadge = status === "paid"
                  ? { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", text: "Pago" }
                  : status === "partial"
                  ? { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", text: "Parcial" }
                  : { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", text: "Em dívida" };
                return (
                <li
                  key={s.id}
                  data-testid={`sale-${s.id}`}
                  data-status={status}
                  className="bg-slate-950/60 border border-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {new Date(s.created_at).toLocaleString("pt-PT")}
                      </span>
                      <span
                        data-testid={`sale-status-${s.id}`}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.cls}`}
                      >
                        {statusBadge.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.points_earned > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/30 flex items-center gap-1">
                          <Star size={10} weight="fill" /> +{s.points_earned} pts
                        </span>
                      )}
                      <span className="font-outfit text-lg font-bold text-amber-400">
                        {euro(s.total)}
                      </span>
                      <button
                        data-testid={`print-sale-${s.id}`}
                        onClick={() => printTransaction(s)}
                        title={`Imprimir transação Nº ${s.tx_number || "?"}`}
                        className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:text-amber-400"
                      >
                        <Printer size={12} weight="duotone" />
                      </button>
                      {canEditSale && (
                        <button
                          data-testid={`edit-sale-${s.id}`}
                          onClick={() => openEditSale(s)}
                          title="Editar itens / transferir cliente"
                          className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        >
                          <PencilSimple size={12} weight="bold" />
                        </button>
                      )}
                      {canCancelSale && (
                        <button
                          data-testid={`cancel-sale-${s.id}`}
                          onClick={() => cancelSale(s)}
                          title="Cancelar venda (repõe stock)"
                          className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                        >
                          <Trash size={12} weight="bold" />
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {s.items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span>
                          <span className="text-slate-500">{it.quantity}×</span> {it.product_name}
                        </span>
                        <span className="text-slate-500">{euro(it.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                    <span data-testid={`sale-by-${s.id}`}>Registado por <strong className="text-slate-400">{s.user_email || "—"}</strong></span>
                    {s.edited_at && (
                      <span title={`Editado em ${new Date(s.edited_at).toLocaleString("pt-PT")} por ${s.edited_by}`}>
                        ✎ editado {new Date(s.edited_at).toLocaleDateString("pt-PT")}
                      </span>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Activity */}
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Receipt size={20} weight="duotone" className="text-amber-500" />
            <h3 className="font-outfit text-xl font-semibold">Histórico</h3>
          </div>
          {events.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Sem atividade.</div>
          ) : (
            <ul className="space-y-2 max-h-[420px] overflow-y-auto">
              {events.map((ev, i) => (
                <li
                  key={i}
                  data-testid={ev.type === "payment" ? `event-payment-${ev.id}` : `event-sale-${ev.id}`}
                  onClick={() => ev.type === "payment" && canEditAll && openEditPay(ev)}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                    ev.type === "sale"
                      ? "bg-rose-500/5 border-rose-500/10"
                      : `bg-emerald-500/5 border-emerald-500/10 ${canEditAll ? "cursor-pointer hover:bg-emerald-500/10" : ""}`
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500">
                      {new Date(ev.date).toLocaleString("pt-PT")}
                    </div>
                    <div className="text-sm font-medium text-slate-200">
                      {ev.type === "sale" ? "Venda" : "Pagamento"}
                      {ev.type === "payment" && ev.note ? (
                        <span className="text-xs text-slate-500 ml-2">· {ev.note}</span>
                      ) : null}
                    </div>
                    {ev.user_email && (
                      <div className="text-[10px] text-slate-500 mt-0.5">por {ev.user_email}</div>
                    )}
                  </div>
                  <div className={`font-bold flex items-center gap-2 ${ev.type === "sale" ? "text-rose-400" : "text-emerald-400"}`}>
                    <span>
                      {ev.type === "sale" ? "+" : "-"}
                      {euro(ev.type === "sale" ? ev.total : (ev.total_credited || ev.amount))}
                    </span>
                    {ev.tip > 0 && (
                      <span className="text-[9px] text-fuchsia-400 font-mono" title="Gratificação">+{euro(ev.tip)} gorj.</span>
                    )}
                    {ev.tx_number && (
                      <Link
                        to={`/transacoes/${ev.tx_number}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[9px] text-slate-500 hover:text-amber-400 font-mono underline-offset-2 hover:underline"
                        title="Consultar transação"
                      >#{ev.tx_number}</Link>
                    )}
                    <button
                      data-testid={`print-event-${ev.id}`}
                      onClick={(e) => { e.stopPropagation(); printTransaction(ev); }}
                      title="Imprimir 2ª via"
                      className="text-slate-500 hover:text-amber-400"
                    >
                      <Printer size={12} weight="duotone" />
                    </button>
                    {ev.type === "payment" && canReversePayment(ev) && (
                      <button
                        data-testid={`reverse-event-${ev.id}`}
                        onClick={(e) => { e.stopPropagation(); reversePayment(ev); }}
                        title="Estornar pagamento"
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash size={12} weight="duotone" />
                      </button>
                    )}
                    {ev.type === "payment" && canEditAll && (
                      <PencilSimple size={12} weight="bold" className="text-emerald-400/60" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showPay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowPay(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Caixa do bar</div>
            <h3 className="font-outfit text-xl font-semibold mb-5 mt-1">Registar pagamento</h3>

            {/* Valor em aberto */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-4 mb-4 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300/80">Valor em aberto</span>
              <span data-testid="payment-open-amount" className="font-outfit text-2xl font-bold text-rose-300">{euro(debt)}</span>
            </div>

            {/* Itens consumidos em aberto (descrição) */}
            {unpaidSales.length > 0 && (
              <details className="mb-4 bg-slate-950 border border-slate-800 rounded-lg" data-testid="payment-items-breakdown" open>
                <summary className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-amber-400 list-none flex items-center justify-between">
                  <span>O que está em dívida</span>
                  <span className="text-slate-500 normal-case tracking-normal">{unpaidSales.length} venda(s) por pagar · marca as que vais cobrar</span>
                </summary>
                <div className="px-3 pb-3 flex items-center gap-2 text-[10px]">
                  <button type="button" data-testid="pay-select-all" onClick={() => { const o = {}; unpaidSales.forEach((s) => { o[s.id] = true; }); setPaySelectedSales(o); }} className="px-2 py-1 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">Selecionar tudo</button>
                  <button type="button" data-testid="pay-select-none" onClick={() => setPaySelectedSales({})} className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">Limpar</button>
                  <span className="ml-auto text-slate-500">{Object.values(paySelectedSales).filter(Boolean).length} selecionada(s)</span>
                </div>
                <div className="max-h-44 overflow-y-auto px-3 pb-3 space-y-2 text-xs">
                  {unpaidSales.slice(0, 20).map((s) => {
                    const selected = !!paySelectedSales[s.id];
                    return (
                    <label key={s.id} data-testid={`pay-sale-${s.id}`} className={`block border-t border-slate-800/60 pt-2 cursor-pointer rounded ${selected ? "bg-amber-500/5" : ""}`}>
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            data-testid={`pay-sale-check-${s.id}`}
                            checked={selected}
                            onChange={(e) => setPaySelectedSales({ ...paySelectedSales, [s.id]: e.target.checked })}
                            className="w-3.5 h-3.5 accent-amber-400"
                          />
                          {new Date(s.created_at).toLocaleString("pt-PT")}
                          {s.tx_number && <span className="font-mono text-slate-500">#{s.tx_number}</span>}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-amber-400">{euro(s.total)}</strong>
                          {canEditSale && (
                            <button
                              type="button"
                              data-testid={`payment-edit-sale-${s.id}`}
                              onClick={(ev) => { ev.preventDefault(); setShowPay(false); openEditSale(s); }}
                              title="Editar itens / transferir"
                              className="p-1 rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                            >
                              <PencilSimple size={10} weight="bold" />
                            </button>
                          )}
                          {canCancelSale && (
                            <button
                              type="button"
                              data-testid={`payment-cancel-sale-${s.id}`}
                              onClick={(ev) => { ev.preventDefault(); cancelSale(s); }}
                              title="Eliminar venda"
                              className="p-1 rounded-md bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                            >
                              <Trash size={10} weight="bold" />
                            </button>
                          )}
                        </div>
                      </div>
                      <ul className="text-slate-300 mt-0.5 pl-6">
                        {s.items.map((it, i) => (
                          <li key={i} className="flex items-center justify-between">
                            <span><span className="text-slate-500">{it.quantity}×</span> {it.product_name}</span>
                            <span className="text-slate-500">{euro(it.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                    </label>
                    );
                  })}
                </div>
              </details>
            )}

            <form onSubmit={submitPay} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  A pagar (dinheiro / MBWay) €
                </label>
                <input
                  data-testid="payment-amount-input"
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  autoFocus
                  placeholder="0,00 (valor que o cliente entrega)"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              {(c.points || 0) >= 5 && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80 flex items-center gap-1.5">
                      <Coins size={12} weight="duotone" /> Descontar pontos
                    </span>
                    <span className="text-xs text-slate-500">
                      Disponíveis: <strong className="text-green-300">{c.points}</strong>
                    </span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Pontos a descontar (múltiplos de 5)
                    </label>
                    <input
                      data-testid="payment-points-input"
                      type="number"
                      min="0"
                      step="5"
                      max={Math.floor((c.points || 0) / 5) * 5}
                      value={payForm.points_used}
                      onChange={(e) => setPayForm({ ...payForm, points_used: e.target.value })}
                      className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Valor dos pontos:</span>
                    <span data-testid="payment-points-value" className="font-bold text-green-300">
                      {euro((Number(payForm.points_used) || 0) / 5)}
                    </span>
                  </div>
                </div>
              )}

              {/* Resumo: total recebido, abatido, troco, gratificação */}
              {(() => {
                const cash = Number(payForm.amount) || 0;
                const ptsValue = (Number(payForm.points_used) || 0) / 5;
                const total = cash + ptsValue;
                const selectedIds = Object.entries(paySelectedSales).filter(([, v]) => v).map(([k]) => k);
                const target = selectedIds.length
                  ? selectedIds.reduce((s, sid) => s + (sales.find((x) => x.id === sid)?.total || 0), 0)
                  : debt;
                const keepCredit = !!payForm.keep_change_as_credit;
                const tipChange = !!payForm.tip_change;
                const excess = Math.max(total - target, 0);
                const tipExplicit = Number(payForm.tip) || 0;
                const tipValue = tipChange ? excess : Math.min(tipExplicit, excess);
                const totalApplied = keepCredit ? total - tipValue : Math.min(total - tipValue, target);
                const change = (keepCredit || tipChange) ? 0 : Math.max(excess - tipValue, 0);
                const newCredit = keepCredit && total - tipValue > target ? total - tipValue - target : 0;
                return (
                  <div className="space-y-2">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total recebido</span>
                      <span className="font-outfit text-xl font-bold text-slate-100">{euro(total)}</span>
                    </div>
                    {selectedIds.length > 0 && (
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Total das vendas selecionadas</span>
                        <span className="text-slate-200 font-bold">{euro(target)}</span>
                      </div>
                    )}
                    <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Abate na dívida</span>
                      <span data-testid="payment-total-credit" className="font-outfit text-xl font-bold text-amber-300">{euro(totalApplied)}</span>
                    </div>
                    {tipValue > 0 && (
                      <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Gratificação (caixa)</span>
                        <span data-testid="payment-tip" className="font-outfit text-xl font-bold text-fuchsia-300">{euro(tipValue)}</span>
                      </div>
                    )}
                    {change > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">Troco a devolver (dinheiro)</span>
                        <span data-testid="payment-change" className="font-outfit text-xl font-bold text-emerald-300">{euro(change)}</span>
                      </div>
                    )}
                    {newCredit > 0 && (
                      <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">Fica como crédito a favor</span>
                        <span data-testid="payment-new-credit" className="font-outfit text-xl font-bold text-sky-300">{euro(newCredit)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <label className="flex items-start gap-3 px-3 py-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-sky-500/40">
                <input
                  data-testid="payment-keep-credit-toggle"
                  type="checkbox"
                  checked={!!payForm.keep_change_as_credit}
                  onChange={(e) => setPayForm({ ...payForm, keep_change_as_credit: e.target.checked, tip_change: e.target.checked ? false : payForm.tip_change })}
                  className="mt-0.5 w-4 h-4 accent-sky-400"
                />
                <span className="text-xs text-slate-200">
                  <strong>Deixar troco como crédito</strong> a favor do cliente — por defeito o excedente é devolvido em dinheiro.
                </span>
              </label>

              <label className="flex items-start gap-3 px-3 py-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-fuchsia-500/40">
                <input
                  data-testid="payment-tip-change-toggle"
                  type="checkbox"
                  checked={!!payForm.tip_change}
                  onChange={(e) => setPayForm({ ...payForm, tip_change: e.target.checked, keep_change_as_credit: e.target.checked ? false : payForm.keep_change_as_credit })}
                  className="mt-0.5 w-4 h-4 accent-fuchsia-400"
                />
                <span className="text-xs text-slate-200">
                  <strong>Cliente deixa o troco como gratificação</strong> — vai para a caixa do bar (receita extra), não fica em conta.
                </span>
              </label>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Gratificação manual (€)</label>
                <input
                  data-testid="payment-tip-input"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!!payForm.tip_change}
                  placeholder="0,00"
                  value={payForm.tip}
                  onChange={(e) => setPayForm({ ...payForm, tip: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nota</label>
                <input
                  value={payForm.note}
                  onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Numerário, MBWay..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPay(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
                <button data-testid="payment-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {notifyPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setNotifyPayment(null)}
          data-testid="notify-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
              Pagamento confirmado
            </div>
            <h3 className="font-outfit text-2xl font-semibold mt-1 mb-1">
              Enviar recibo?
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              {euro(notifyPayment.amount)} de {c.name}. Pontos atuais: {c.points || 0}.
            </p>
            <div className="space-y-2">
              <button
                data-testid="notify-whatsapp-btn"
                onClick={() => sendNotification("whatsapp")}
                disabled={!c.contact}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-green-600/10 border border-green-500/30 text-green-300 hover:bg-green-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <WhatsappLogo size={20} weight="fill" /> Enviar por WhatsApp
                </span>
                <span className="text-xs text-slate-400">{c.contact || "sem contacto"}</span>
              </button>
              <button
                data-testid="notify-sms-btn"
                onClick={() => sendNotification("sms")}
                disabled={!c.contact}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-sky-600/10 border border-sky-500/30 text-sky-300 hover:bg-sky-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <ChatCircleText size={20} weight="duotone" /> Enviar SMS
                </span>
                <span className="text-xs text-slate-400">{c.contact || "sem contacto"}</span>
              </button>
              <button
                data-testid="notify-email-btn"
                onClick={() => sendNotification("email")}
                disabled={!c.email}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <EnvelopeSimple size={20} weight="duotone" /> Enviar Email
                </span>
                <span className="text-xs text-slate-400">{c.email || "sem email"}</span>
              </button>
              <button
                data-testid="notify-print-btn"
                onClick={printReceipt}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-slate-700/30 border border-slate-600/40 text-slate-100 hover:bg-slate-700/50 transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <Printer size={20} weight="duotone" /> Emitir recibo (imprimir)
                </span>
                <span className="text-xs text-slate-400">Talão A6</span>
              </button>
            </div>
            <button
              onClick={() => setNotifyPayment(null)}
              data-testid="notify-skip-btn"
              className="w-full mt-4 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              Saltar
            </button>
          </div>
        </div>
      )}

      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setShowEdit(false)}
          data-testid="ficha-edit-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-outfit text-xl font-semibold mb-5">Editar ficha</h3>
            <form onSubmit={submitEdit} className="space-y-4">
              {(canEditAll || !c.is_member) && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nome *</label>
                  <input
                    data-testid="edit-name-input"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              )}
              {!canEditAll && c.is_member && (
                <p className="text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                  Nome de sócio só pode ser alterado por administrador ou tesoureiro.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Telemóvel</label>
                  <input
                    data-testid="edit-contact-input"
                    value={editForm.contact}
                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                    className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Email</label>
                  <input
                    data-testid="edit-email-input"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Morada</label>
                <input
                  data-testid="edit-morada-input"
                  value={editForm.morada}
                  onChange={(e) => setEditForm({ ...editForm, morada: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              {canEditAll && (
                <>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nota</label>
                    <input
                      value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nº de Sócio</label>
                      <input
                        data-testid="edit-member-number-input"
                        value={editForm.member_number}
                        onChange={(e) => setEditForm({ ...editForm, member_number: e.target.value })}
                        className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                    </div>
                    <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-green-600/40">
                      <input
                        data-testid="edit-is-member-toggle"
                        type="checkbox"
                        checked={editForm.is_member}
                        onChange={(e) => setEditForm({ ...editForm, is_member: e.target.checked })}
                        className="w-4 h-4 accent-green-500"
                      />
                      <span className="text-xs font-medium text-slate-200">Sócio com cotas pagas</span>
                    </label>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      PIN do portal de sócio (deixar vazio = não alterar)
                    </label>
                    <input
                      data-testid="edit-pin-input"
                      type="password"
                      value={editForm.pin}
                      onChange={(e) => setEditForm({ ...editForm, pin: e.target.value })}
                      placeholder="Definir/alterar PIN para o sócio aceder ao portal"
                      className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 tracking-widest"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Permite ao sócio fazer login em <code className="text-amber-400">/socio/login</code> com o nº de sócio e PIN.
                    </p>
                  </div>
                </>
              )}
              {!canEditAll && (
                <p className="text-[11px] text-slate-500">
                  Como funcionário só podes editar telemóvel, email e morada.
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center justify-center gap-2"
                >
                  <XIcon size={16} /> Cancelar
                </button>
                <button
                  data-testid="edit-submit-btn"
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2"
                >
                  <Check size={16} weight="bold" /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowSell(false)}
          data-testid="sell-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl p-6 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Storefront size={22} weight="duotone" className="text-green-400" />
              <h3 className="font-outfit text-xl font-semibold">Vender a {c.name}</h3>
            </div>
            <div className="relative mb-3">
              <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={sellSearch}
                onChange={(e) => setSellSearch(e.target.value)}
                placeholder="Procurar produto..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-11 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto flex-1 -mx-2 px-2 pb-2">
              {products
                .filter((p) => !sellSearch || p.name.toLowerCase().includes(sellSearch.toLowerCase()))
                .map((p) => {
                  const inCart = cart[p.id] || 0;
                  const out = p.quantity <= 0;
                  return (
                    <button
                      key={p.id}
                      data-testid={`sell-product-${p.id}`}
                      disabled={out}
                      onClick={() => sellAddItem(p)}
                      className="text-left bg-slate-950 border border-slate-800 hover:border-amber-500/40 rounded-lg p-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all relative"
                    >
                      {inCart > 0 && (
                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center">{inCart}</span>
                      )}
                      <div className="font-medium text-slate-100 text-sm truncate">{p.name}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-amber-400 font-bold text-sm">{euro(p.price)}</span>
                        <span className="text-[10px] text-slate-500">{p.quantity} un.</span>
                      </div>
                    </button>
                  );
                })}
            </div>

            {Object.keys(cart).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {Object.entries(cart).map(([pid, qty]) => {
                    const p = products.find((x) => x.id === pid);
                    if (!p) return null;
                    return (
                      <div key={pid} className="flex items-center gap-2 text-sm bg-slate-950 border border-slate-800 rounded px-3 py-1.5">
                        <span className="flex-1 truncate">{p.name}</span>
                        <button onClick={() => sellDecItem(pid)} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"><Minus size={11} /></button>
                        <span className="w-6 text-center text-xs font-bold">{qty}</span>
                        <button onClick={() => sellAddItem(p)} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"><Plus size={11} /></button>
                        <span className="w-16 text-right text-xs text-slate-400">{euro(p.price * qty)}</span>
                        <button onClick={() => sellRemoveItem(pid)} className="text-rose-400 hover:text-rose-300"><Trash size={12} /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Total</span>
                  <span data-testid="sell-total" className="font-outfit text-3xl font-bold text-amber-300">{euro(sellTotal)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setShowSell(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
              <button data-testid="sell-submit-btn" disabled={!Object.keys(cart).length} onClick={submitSale} className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold">
                Registar venda
              </button>
            </div>
          </div>
        </div>
      )}

      {editPay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setEditPay(null)}
          data-testid="edit-payment-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Caixa do bar</div>
            <h3 className="font-outfit text-xl font-semibold mb-1 mt-1">Editar pagamento</h3>
            <p className="text-xs text-slate-500 mb-5">
              {new Date(editPay.created_at).toLocaleString("pt-PT")}
              {editPay.points_used ? ` · ${editPay.points_used} pts descontados` : ""}
            </p>
            <form onSubmit={submitEditPay} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Valor em numerário €</label>
                <input
                  data-testid="edit-payment-amount-input"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editPayForm.amount}
                  onChange={(e) => setEditPayForm({ ...editPayForm, amount: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <p className="text-[11px] text-slate-500 mt-1">Descrição do pagamento — usa a nota para indicar a que itens / vendas se refere.</p>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nota / Descrição</label>
                <input
                  data-testid="edit-payment-note-input"
                  value={editPayForm.note}
                  onChange={(e) => setEditPayForm({ ...editPayForm, note: e.target.value })}
                  placeholder="Ex: refere-se aos consumos de 12/02..."
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  data-testid="delete-payment-btn"
                  onClick={() => deletePayment(editPay)}
                  className="px-4 py-2.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-medium flex items-center gap-2"
                >
                  <Trash size={16} weight="bold" /> Eliminar
                </button>
                <button type="button" onClick={() => setEditPay(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
                <button data-testid="edit-payment-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowReport(false)}
          data-testid="report-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Contabilidade</div>
            <h3 className="font-outfit text-xl font-semibold mb-5 mt-1">Imprimir conta-corrente</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">De</label>
                <input
                  data-testid="report-from-input"
                  type="date"
                  value={reportRange.from}
                  onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Até</label>
                <input
                  data-testid="report-to-input"
                  type="date"
                  value={reportRange.to}
                  onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                data-testid="report-preset-month"
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
                data-testid="report-preset-year"
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
                data-testid="report-preset-all"
                onClick={() => setReportRange({ from: "", to: "" })}
                className="text-xs px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
              >
                Sempre
              </button>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowReport(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
              <button data-testid="report-print-btn" onClick={printReport} className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2">
                <Printer size={16} weight="bold" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
      {editSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setEditSale(null)}
          data-testid="edit-sale-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl p-6 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Editar venda</div>
            <h3 className="font-outfit text-xl font-semibold mb-1 mt-1">Itens / transferir cliente</h3>
            <p className="text-[11px] text-slate-500 mb-4">
              Registo original: {new Date(editSale.created_at).toLocaleString("pt-PT")} · por {editSale.user_email || "—"}
              {user?.role === "funcionario" && (
                <span className="text-amber-400 ml-2">⚠ funcionários só podem editar até 24h após o registo</span>
              )}
            </p>

            {/* Selector de cliente */}
            <div className="mb-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Cliente</label>
              <input
                value={editSaleSearch}
                onChange={(e) => setEditSaleSearch(e.target.value)}
                placeholder="Procurar para transferir..."
                className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <select
                data-testid="edit-sale-client-select"
                value={editSaleClient}
                onChange={(e) => setEditSaleClient(e.target.value)}
                className="mt-2 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                size={4}
              >
                {allClients
                  .filter((cl) => !editSaleSearch || cl.name.toLowerCase().includes(editSaleSearch.toLowerCase()) || (cl.member_number || "").includes(editSaleSearch))
                  .slice(0, 80)
                  .map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.name}{cl.member_number ? ` · nº ${cl.member_number}` : ""}{cl.is_member ? " · Sócio" : ""}
                    </option>
                  ))}
              </select>
              {editSaleClient !== editSale.client_id && (
                <p className="text-[11px] text-amber-300 mt-1">
                  ⚠ Esta venda será transferida para outro cliente. A dívida e os pontos serão movidos.
                </p>
              )}
            </div>

            {/* Itens */}
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Itens</div>
            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1 border-t border-b border-slate-800/50 py-3">
              {Object.entries(editSaleItems).filter(([,q]) => q > 0).length === 0 && (
                <div className="text-xs text-slate-500 text-center py-3">Sem itens. Adicione pelo menos um abaixo.</div>
              )}
              {Object.entries(editSaleItems).filter(([,q]) => q > 0).map(([pid, qty]) => {
                const p = products.find((x) => x.id === pid) || { name: "(produto removido)", price: 0 };
                return (
                  <div key={pid} data-testid={`edit-sale-item-${pid}`} className="flex items-center gap-2 text-sm bg-slate-950 border border-slate-800 rounded px-3 py-2">
                    <span className="flex-1 truncate">{p.name}</span>
                    <button onClick={() => setEditSaleItems({ ...editSaleItems, [pid]: Math.max(0, qty - 1) })} className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"><Minus size={11} /></button>
                    <span className="w-8 text-center text-sm font-bold">{qty}</span>
                    <button onClick={() => setEditSaleItems({ ...editSaleItems, [pid]: qty + 1 })} className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"><Plus size={11} /></button>
                    <span className="w-20 text-right text-xs text-slate-400">{euro((p.price || 0) * qty)}</span>
                    <button onClick={() => { const c = { ...editSaleItems }; delete c[pid]; setEditSaleItems(c); }} data-testid={`edit-sale-remove-${pid}`} className="text-rose-400 hover:text-rose-300"><Trash size={13} /></button>
                  </div>
                );
              })}
            </div>

            {/* Adicionar item */}
            <details className="mt-3 bg-slate-950 border border-slate-800 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-amber-400 list-none">+ Adicionar item</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-2 max-h-40 overflow-y-auto">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEditSaleItems({ ...editSaleItems, [p.id]: (editSaleItems[p.id] || 0) + 1 })}
                    className="text-left px-2 py-1.5 rounded bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-xs"
                  >
                    <div className="truncate">{p.name}</div>
                    <div className="text-amber-400 font-bold text-[11px]">{euro(p.price)}</div>
                  </button>
                ))}
              </div>
            </details>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
              <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Total</span>
              <span data-testid="edit-sale-total" className="font-outfit text-2xl font-bold text-amber-300">
                {euro(Object.entries(editSaleItems).reduce((s, [pid, q]) => {
                  const p = products.find((x) => x.id === pid);
                  return s + (p ? p.price * q : 0);
                }, 0))}
              </span>
            </div>

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setEditSale(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
              <button data-testid="edit-sale-submit-btn" onClick={submitEditSale} className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Guardar alterações</button>
            </div>
          </div>
        </div>
      )}

      {showProfileExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowProfileExtra(false)} data-testid="ficha-profile-extra-modal">
          <form onSubmit={submitProfileExtra} onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Camera size={22} weight="duotone" className="text-pink-400" />
              <h3 className="font-outfit text-xl font-semibold">Foto / Data nascimento</h3>
            </div>
            <p className="text-xs text-slate-400">Como administrador, podes actualizar a foto e a data sempre que o sócio entender.</p>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Data de nascimento</label>
              <input
                data-testid="ficha-bday-input"
                type="date"
                value={profileForm.birthday || ""}
                onChange={(e) => setProfileForm({ ...profileForm, birthday: e.target.value })}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Foto (jpg/png, máx 1 MB)</label>
              <input
                data-testid="ficha-photo-input"
                type="file"
                accept="image/*"
                onChange={(e) => onProfilePhoto(e.target.files?.[0])}
                className="mt-1 w-full text-xs text-slate-300"
              />
              {(profileForm.photo_data || data.client.photo_data) && (
                <img src={profileForm.photo_data || data.client.photo_data} alt="foto" className="mt-2 w-24 h-24 rounded-full object-cover border-2 border-amber-400" />
              )}
            </div>
            <div className="flex gap-2 pt-2 flex-wrap">
              <button type="button" onClick={() => setShowProfileExtra(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              {data.client.photo_data && (
                <button type="button" data-testid="ficha-photo-clear" onClick={clearProfilePhoto} className="px-4 py-2.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300">Remover foto</button>
              )}
              <button data-testid="ficha-profile-submit" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const BreakdownCard = ({ label, value, highlight }) => {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed) {
      const t = setTimeout(() => setRevealed(false), 8000);
      return () => clearTimeout(t);
    }
  }, [revealed]);
  return (
    <div className={`rounded-xl p-4 border ${highlight ? "bg-amber-500/5 border-amber-500/20" : "bg-slate-900/40 border-slate-800"}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center justify-between gap-1.5">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          data-testid={`reveal-${label.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-slate-500 hover:text-amber-400"
          title={revealed ? "Mascarar" : "Mostrar"}
        >{revealed ? "🙈" : "👁"}</button>
      </div>
      <div className={`mt-2 font-outfit text-xl font-bold ${revealed ? (highlight ? "text-amber-300" : "text-slate-100") : "text-slate-500"}`}>
        {revealed ? value : "••••"}
      </div>
    </div>
  );
};
