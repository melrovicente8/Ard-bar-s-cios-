import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocio } from "../context/SocioContext";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  SoccerBall,
  SignOut,
  Star,
  Medal,
  CurrencyEur,
  Receipt,
  PencilSimple,
  Check,
  X,
  DeviceMobile,
  Clock,
  Coins,
  Printer,
  CalendarBlank,
  BookOpen,
  ChatCircle,
  ChatCircleDots,
  Camera,
  Plus,
  Ticket,
  Storefront,
  IdentificationCard,
  Users,
  Crown,
  ChartLine,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import CommunityChat from "../components/CommunityChat";
import SocioDigitalCard from "../components/SocioDigitalCard";
import SocioMerch from "../components/SocioMerch";
import SocioFamily from "../components/SocioFamily";
import { openQuarterlyDoc } from "../lib/quarterlyDoc";

export default function SocioPortal() {
  const { data, logout, refresh } = useSocio();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ contact: "", email: "", morada: "" });
  const [club, setClub] = useState({});
  const [showMb, setShowMb] = useState(false);
  const [mbForm, setMbForm] = useState({ amount: "", mbway_phone: "", note: "", use_points: false, points_to_use: 0 });
  const [showPoints, setShowPoints] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(5);
  const [historyFilter, setHistoryFilter] = useState("today"); // default Hoje
  const [showPointsHist, setShowPointsHist] = useState(false);
  const [pointsHist, setPointsHist] = useState(null);
  const [showQuotas, setShowQuotas] = useState(false);
  const [quotas, setQuotas] = useState({ year: new Date().getFullYear(), quotas: [] });
  const [selectedMonths, setSelectedMonths] = useState([]);
  // Foto + aniversário
  const [showProfileExtra, setShowProfileExtra] = useState(false);
  const [profileForm, setProfileForm] = useState({ birthday: "", photo_data: "" });
  // Mensagens
  const [showMessages, setShowMessages] = useState(false);
  const [myMessages, setMyMessages] = useState([]);
  const [newMsg, setNewMsg] = useState({ subject: "", message: "" });
  // Chat da comunidade
  const [showCommunity, setShowCommunity] = useState(false);
  // Pedido de consumo
  const [showRequest, setShowRequest] = useState(false);
  const [products, setProducts] = useState([]);
  const [reqCart, setReqCart] = useState({});
  // Bar aberto/fechado (pedir consumo bloqueado quando fechado)
  const [barOpen, setBarOpen] = useState(null);
  // Alerta de cota em dívida ao fazer pedido
  const [quotaPrompt, setQuotaPrompt] = useState(null); // {year, month, label, amount}
  // Comprar bilhete (em breve)
  const [showTickets, setShowTickets] = useState(false);
  // Detalhe do que está por pagar
  const [showDebtDetail, setShowDebtDetail] = useState(false);
  // Cartão de Sócio Digital (QR dinâmico)
  const [showCard, setShowCard] = useState(false);
  // Loja de merchandising (indisponível)
  const [showMerch, setShowMerch] = useState(false);
  // Agregado familiar
  const [showFamily, setShowFamily] = useState(false);
  // Financeiro do clube: movimento do mês (todos os sócios) + balanço trimestral (cotas em dia)
  const [monthly, setMonthly] = useState(null);
  const [quarterly, setQuarterly] = useState(null);

  useEffect(() => {
    api.get("/club/info").then((r) => setClub(r.data)).catch(() => {});
    api.get("/socio/bar-status").then((r) => setBarOpen(!!r.data.open)).catch(() => setBarOpen(null));
    // Resumo discreto do mês corrente — todos os sócios (apenas totalizadores)
    api.get("/socio/finance").then((r) => setMonthly(r.data)).catch(() => {});
    // Balanço trimestral — só devolve dados se as cotas estiverem em dia (403 caso contrário)
    api.get("/socio/balance-quarterly").then((r) => setQuarterly(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (data === false) navigate("/socio/login", { replace: true });
  }, [data, navigate]);

  useEffect(() => {
    if (data && data.client) {
      setForm({
        contact: data.client.contact || "",
        email: data.client.email || "",
        morada: data.client.morada || "",
      });
      setMbForm((f) => ({
        ...f,
        amount: String(Math.max(data.client.balance || 0, 0).toFixed(2)),
        mbway_phone: data.client.contact || "",
      }));
      // Pré-carrega resumo das cotas para mostrar X/12 no dashboard
      api.get("/socio/quotas").then(({ data: qd }) => setQuotas(qd)).catch(() => {});
    }
  }, [data]);

  if (!data || !data.client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-500">
        A carregar...
      </div>
    );
  }

  const { client: c, sales, payments, mbway } = data;
  // Épsilon: resíduos de vírgula flutuante (ex.: 4e-16) não são dívida
  const debt = (c.balance || 0) > 0.004 ? c.balance : 0;

  const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const quotaItem = (pid) => {
    const parts = pid.split("-");
    return { label: `Cota ${MONTHS_PT[Number(parts[2]) - 1]}/${parts[1]}`, price: club.quota_monthly_value || 5 };
  };
  const priceOf = (pid) => (pid.startsWith("quota-") ? quotaItem(pid).price : (products.find((x) => x.id === pid)?.price || 0));
  const nameOf = (pid) => (pid.startsWith("quota-") ? quotaItem(pid).label : (products.find((x) => x.id === pid)?.name || ""));
  // Disponível = stock menos o que já está reservado em pedidos pendentes (vem do backend)
  const availOf = (p) => (p.available_quantity != null ? p.available_quantity : p.quantity || 0);

  // Vendas ainda em dívida (FIFO igual ao histórico do clube)
  const debtSales = (() => {
    const targeted = new Set();
    let pool = 0;
    payments.forEach((p) => {
      if (p.sale_ids && p.sale_ids.length) p.sale_ids.forEach((sid) => targeted.add(sid));
      else pool += Number(p.total_credited || p.amount || 0);
    });
    const asc = [...sales].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const out = [];
    asc.forEach((s) => {
      if (targeted.has(s.id)) return;
      if (pool >= s.total - 1e-9) { pool -= s.total; return; }
      if (pool > 1e-9) { pool = 0; out.push({ ...s, partial: true }); return; }
      out.push(s);
    });
    return out;
  })();

  const onLogout = async () => {
    await logout();
    navigate("/socio/login");
  };

  const saveProfile = async () => {
    try {
      await api.put("/socio/me", {
        contact: form.contact || null,
        email: form.email || null,
        morada: form.morada || null,
      });
      toast.success("Dados atualizados");
      setEditing(false);
      await refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitMb = async (e) => {
    e.preventDefault();
    try {
      await api.post("/socio/mbway-request", {
        amount: parseFloat(mbForm.amount),
        mbway_phone: mbForm.mbway_phone,
        note: mbForm.note || null,
        use_points: !!mbForm.use_points,
        points_to_use: mbForm.use_points ? Number(mbForm.points_to_use) || 0 : 0,
      });
      toast.success("Pedido enviado — aguarda confirmação do clube.");
      setShowMb(false);
      await refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitPoints = async (e) => {
    e.preventDefault();
    try {
      const { data: pay } = await api.post("/socio/pay-with-points", { points: Number(pointsToUse) });
      toast.success(`Pago ${euro(pay.amount)} com ${pay.points_used} pontos`);
      setShowPoints(false);
      await refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const events = [
    ...sales.map((s) => ({ type: "sale", date: s.created_at, ...s })),
    ...payments.map((p) => ({ type: "payment", date: p.created_at, ...p })),
    ...mbway.map((m) => ({ type: "mbway", date: m.created_at, ...m })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const inHistoryRange = (iso) => {
    if (historyFilter === "all") return true;
    const d = new Date(iso);
    const now = new Date();
    if (historyFilter === "today") return d.toDateString() === now.toDateString();
    if (historyFilter === "week") {
      const ago = new Date(now); ago.setDate(now.getDate() - 7);
      return d >= ago;
    }
    if (historyFilter === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (historyFilter === "year") return d.getFullYear() === now.getFullYear();
    return true;
  };
  const filteredEvents = events.filter((e) => inHistoryRange(e.date));
  const totalConsumed = filteredEvents.filter((e) => e.type === "sale").reduce((s, e) => s + (e.total || 0), 0);
  const totalPaid = filteredEvents.filter((e) => e.type === "payment").reduce((s, e) => s + (e.amount || 0), 0);

  const loadPointsHist = async () => {
    try {
      const { data } = await api.get("/socio/points-history");
      setPointsHist(data);
      setShowPointsHist(true);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const loadQuotas = async (year) => {
    try {
      const { data } = await api.get("/socio/quotas", { params: year ? { year } : {} });
      setQuotas(data);
      setSelectedMonths([]);
      setShowQuotas(true);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const changeQuotaYear = async (year) => {
    try {
      const { data } = await api.get("/socio/quotas", { params: { year } });
      setQuotas(data);
      setSelectedMonths([]);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const loadMessages = async () => {
    try {
      const { data } = await api.get("/socio/messages");
      setMyMessages(data);
      setShowMessages(true);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.subject.trim() || !newMsg.message.trim()) return toast.error("Preenche assunto e mensagem");
    try {
      await api.post("/socio/messages", newMsg);
      toast.success("Mensagem enviada à associação");
      setNewMsg({ subject: "", message: "" });
      await loadMessages();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const loadRequest = async () => {
    try {
      const { data } = await api.get("/socio/products");
      setProducts(data);
    } catch {
      // Fallback: use full products list if available; else show empty
      try {
        const { data } = await api.get("/products");
        setProducts(data);
      } catch { setProducts([]); }
    }
    setReqCart({});
    // Alerta: cota do mês em dívida — pergunta se quer pagar junto ao pedido
    try {
      const y = new Date().getFullYear();
      const m = new Date().getMonth() + 1;
      const { data: qd } = await api.get("/socio/quotas", { params: { year: y } });
      const cur = (qd.quotas || []).find((q) => q.month === m);
      if (cur && cur.status !== "paid") {
        setQuotaPrompt({ year: y, month: m, label: cur.label, amount: cur.amount });
        return;
      }
    } catch { /* sem info de cotas — segue o pedido */ }
    setShowRequest(true);
  };

  const openRequestAfterQuota = (payQuota) => {
    if (quotaPrompt && payQuota) {
      setReqCart({ [`quota-${quotaPrompt.year}-${String(quotaPrompt.month).padStart(2, "0")}`]: 1 });
    }
    setQuotaPrompt(null);
    setShowRequest(true);
  };

  const submitRequest = async () => {
    const items = Object.entries(reqCart).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) return toast.error("Adiciona pelo menos um item");
    try {
      await api.post("/socio/consumption-request", { items });
      toast.success("Pedido enviado · aguarda validação do staff");
      setShowRequest(false);
      await refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const submitProfileExtra = async (e) => {
    e.preventDefault();
    try {
      const body = {};
      if (profileForm.birthday) body.birthday = profileForm.birthday;
      if (profileForm.photo_data) body.photo_data = profileForm.photo_data;
      if (!Object.keys(body).length) return toast.error("Adiciona uma data ou foto");
      const { data } = await api.put("/socio/profile-extra", body);
      if (data.bonus_points) {
        toast.success(`+${data.bonus_points} pontos por completar o perfil!`);
      } else {
        toast.success("Perfil atualizado");
      }
      setShowProfileExtra(false);
      await refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const onPhotoSelect = (file) => {
    if (!file) return;
    if (file.size > 1_200_000) return toast.error("Imagem demasiado grande (máx 1 MB)");
    const reader = new FileReader();
    reader.onload = () => setProfileForm((f) => ({ ...f, photo_data: reader.result }));
    reader.readAsDataURL(file);
  };

  const submitQuotas = async () => {
    if (!selectedMonths.length) return toast.error("Seleciona pelo menos um mês");
    try {
      await api.post("/socio/quotas/pay", {
        year: quotas.year,
        months: selectedMonths,
        mbway_phone: c.contact || "",
      });
      toast.success("Pedido de pagamento enviado · aguarda confirmação do clube");
      setShowQuotas(false);
      await refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const printReceipt = (p) => {
    // Vendas que este pagamento cobriu: usa os sale_ids registados pelo backend;
    // só como fallback (pagamentos antigos sem sale_ids) aplica FIFO sobre vendas anteriores.
    let covered = [];
    if (p.sale_ids && p.sale_ids.length) {
      covered = p.sale_ids
        .map((sid) => sales.find((s) => s.id === sid))
        .filter(Boolean)
        .map((sale) => ({ sale, applied: sale.total }));
    } else {
      const earlierSales = sales.filter((s) => s.created_at <= p.created_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      let cover = p.total_credited || p.amount;
      for (const s of earlierSales) {
        if (cover <= 0) break;
        const applied = Math.min(cover, s.total);
        cover -= applied;
        covered.push({ sale: s, applied });
      }
    }
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return toast.error("Permite popups para imprimir");
    const itemsHtml = covered.length === 0 ? "" : `<hr/><div class="muted">Itens abatidos:</div>${covered.map(({ sale, applied }) => `
      <div style="margin-top:6px">
        <div class="row"><span class="muted">${new Date(sale.created_at).toLocaleDateString("pt-PT")}</span><span>${euro(sale.total)}</span></div>
        ${sale.items.map((it) => `<div class="row" style="font-size:11px"><span>· ${it.quantity}× ${it.product_name}</span><span>${euro(it.subtotal)}</span></div>`).join("")}
        ${applied < sale.total ? `<div class="row" style="font-size:10px;color:#888"><span>aplicado:</span><span>${euro(applied)}</span></div>` : ""}
      </div>`).join("")}`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Recibo</title>
<style>
  body{font-family:'Courier New',monospace;color:#000;max-width:320px;margin:14px auto;padding:0 12px;font-size:13px}
  h1{font-size:16px;text-align:center;margin:4px 0 0;letter-spacing:.18em}
  h2{font-size:11px;text-align:center;margin:0 0 14px;color:#444;letter-spacing:.25em}
  hr{border:0;border-top:1px dashed #000;margin:10px 0}
  .row{display:flex;justify-content:space-between;margin:4px 0}
  .big{font-size:20px;font-weight:bold}
  .muted{color:#555;font-size:11px}
  @media print{ body{margin:0} button{display:none} }
</style></head><body>
  <h1>ARD · NESPEREIRA</h1>
  <h2>RECIBO DE PAGAMENTO</h2>
  <div class="muted">${new Date(p.created_at).toLocaleString("pt-PT")}</div>
  ${p.user_email ? `<div class="muted">Registado por: ${p.user_email}</div>` : ""}
  <hr/>
  <div class="row"><span>Sócio</span><strong>${c.name}</strong></div>
  ${c.member_number ? `<div class="row"><span>Nº</span><strong>${c.member_number}</strong></div>` : ""}
  ${itemsHtml}
  <hr/>
  <div class="row"><span>Em numerário</span><span>${euro(p.amount || 0)}</span></div>
  ${p.points_used ? `<div class="row"><span>Pontos</span><span>${p.points_used} pts</span></div>` : ""}
  ${p.note ? `<div class="row"><span>Nota</span><span>${p.note}</span></div>` : ""}
  <hr/>
  <div class="row big"><span>TOTAL ABATIDO</span><span>${euro(p.total_credited || p.amount)}</span></div>
  <hr/>
  <div style="text-align:center" class="muted">Obrigado pela preferência</div>
  <div style="text-align:center;margin-top:14px"><button onclick="window.print()">Imprimir / PDF</button></div>
  <script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grain-bg" data-testid="socio-portal-page">
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-600 to-green-700 border-2 border-amber-400 flex items-center justify-center">
              <SoccerBall size={22} weight="duotone" className="text-amber-400" />
            </div>
            <div>
              <div className="font-outfit text-lg font-bold tracking-tight leading-tight">
                ARD<span className="text-amber-400">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">
                Portal do sócio
              </div>
            </div>
          </div>
          <button
            data-testid="socio-logout-btn"
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <SignOut size={16} /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-5 md:p-8 space-y-6 animate-in">
        {/* Hero */}
        <div className="bg-gradient-to-br from-green-600/10 via-slate-900/40 to-amber-500/10 border border-slate-800 rounded-2xl p-6 md:p-8">
          <div className="flex items-start gap-4 flex-wrap">
            {c.photo_data ? (
              <img src={c.photo_data} alt={c.name} data-testid="socio-photo" className="w-16 h-16 rounded-full object-cover border-2 border-amber-400" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-2xl">
                {c.name[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight" data-testid="socio-name">
                  Olá, {c.name.split(" ")[0]}!
                </h1>
                {c.is_member ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/15 text-green-300 border border-green-500/30 flex items-center gap-1.5">
                    <Medal size={14} weight="fill" /> Sócio nº {c.member_number} · Cotas pagas
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                    <Medal size={14} /> Sócio nº {c.member_number} · Por regularizar
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Conta corrente do bar · {club.name || "ARD Nespereira"}
              </p>
              {c.direction_role && (
                <div className="flex items-center gap-2 mt-2" data-testid="socio-direction">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                    <Crown size={12} weight="fill" /> Direção · {c.direction_role}
                  </span>
                </div>
              )}
              {(c.direction_history || []).length > 0 && (
                <div className="text-[11px] text-slate-500 mt-1.5" data-testid="socio-direction-history">
                  Mandatos anteriores: {(c.direction_history || []).map((h) => `${h.role || "—"} ${h.start_year || "?"}–${h.end_year || "presente"}`).join(" · ")}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setShowDebtDetail(true)}
              data-testid="socio-debt-detail-btn"
              title="Ver o que está por pagar"
              className="bg-slate-950/60 border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-5 transition-colors cursor-pointer"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 flex items-center justify-between">
                <span>A pagar</span>
                <span className="text-amber-300/70 normal-case">Detalhe ›</span>
              </div>
              <div data-testid="socio-debt" className="mt-2 font-outfit text-4xl font-bold text-amber-300">
                {euro(debt)}
              </div>
              {debt > 0 && (
                <button
                  data-testid="socio-pay-mbway-btn"
                  onClick={() => { setMbForm((f) => ({ ...f, use_points: false, points_to_use: 0 })); setShowMb(true); }}
                  className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
                >
                  <DeviceMobile size={18} weight="bold" /> Pagar por MBWay
                </button>
              )}
            </div>
            <div
              onClick={() => loadPointsHist()}
              data-testid="socio-points-detail-btn"
              title="Ver extrato de pontos"
              className="bg-slate-950/60 border border-green-500/30 hover:border-green-500/60 rounded-xl p-5 transition-colors cursor-pointer"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80 flex items-center gap-1.5">
                <Star size={11} weight="fill" /> Pontos
                <span className="text-green-300/70 normal-case ml-auto">Extrato ›</span>
              </div>
              <div data-testid="socio-points" className="mt-2 font-outfit text-4xl font-bold text-green-300">
                {c.points || 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                {c.is_member ? "Acumula 1 pt cada 5€" : "Acumula 1 pt cada 10€"} · troca 5 pts = 1€
              </div>
              {(c.points || 0) >= 5 && debt > 0 && (
                <button
                  data-testid="socio-pay-points-btn"
                  onClick={() => { setPointsToUse(Math.min(Math.floor(c.points / 5) * 5, Math.floor(debt * 5))); setShowPoints(true); }}
                  className="mt-4 w-full bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-200 font-bold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                  <Coins size={16} weight="bold" /> Pagar com pontos
                </button>
              )}
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Total consumido
              </div>
              <div className="mt-2 font-outfit text-4xl font-bold text-slate-200">
                {euro(c.total_spent || 0)}
              </div>
              <div className="text-[10px] text-slate-500 mt-2">{sales.length} vendas</div>
            </div>
            {c.member_number && quotas && (
              <div className="bg-slate-950/60 border border-amber-500/30 rounded-xl p-5" data-testid="socio-quotas-card">
                {(() => {
                  const paid = quotas.quotas.filter((q) => q.status === "paid").length;
                  const total = quotas.quotas.length || 12;
                  const pct = Math.round((paid / total) * 100);
                  const upToDate = paid >= total;
                  return (
                    <>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 flex items-center gap-1.5">
                        <CalendarBlank size={11} weight="fill" /> Cotas {quotas.year}
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span data-testid="socio-quotas-paid" className={`font-outfit text-4xl font-bold ${upToDate ? "text-emerald-300" : "text-amber-300"}`}>{paid}</span>
                        <span className="text-slate-500 text-lg">/ {total}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${upToDate ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] mt-2">
                        {upToDate ? (
                          <span className="text-emerald-300 font-bold" data-testid="socio-quotas-up">✓ Cotas em dia</span>
                        ) : (
                          <span className="text-amber-300">{total - paid} mês(es) por pagar</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Movimento do clube no mês corrente — discreto, apenas totalizadores */}
        {monthly && (
          <div
            className="bg-slate-900/30 border border-slate-800/60 rounded-lg px-4 py-2.5 text-[11px] text-slate-500 flex items-center gap-3 flex-wrap"
            data-testid="socio-finance-month"
          >
            <span className="flex items-center gap-1.5 uppercase tracking-[0.15em] text-[10px]">
              <ChartLine size={12} /> Movimento do clube · {new Date().toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}
            </span>
            <span>Receitas <span className="text-slate-300 font-medium">{euro(monthly.income.total)}</span></span>
            <span>Despesas <span className="text-slate-300 font-medium">{euro(monthly.expenses.total)}</span></span>
            <span>Saldo <span className="text-slate-300 font-medium">{euro(monthly.balance)}</span></span>
            {quarterly && (
              <button
                data-testid="socio-quarterly-pdf-btn"
                onClick={() => { if (!openQuarterlyDoc(quarterly)) toast.error("Permite popups para imprimir o balanço"); }}
                className="ml-auto text-amber-400/80 hover:text-amber-300 flex items-center gap-1.5 font-medium"
                title="Balanço trimestral — sócio com cotas em dia"
              >
                <Printer size={12} /> Balanço trimestral ({quarterly.quarter}) · PDF
              </button>
            )}
          </div>
        )}

        {/* Bar fechado — aviso bem visível, pedir consumo bloqueado */}
        {barOpen === false && (
          <div
            data-testid="socio-bar-closed-banner"
            className="bg-rose-500/10 border-2 border-rose-500/40 rounded-2xl p-5 flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
              <Storefront size={26} weight="duotone" className="text-rose-400" />
            </div>
            <div>
              <div className="font-outfit text-xl font-bold text-rose-300">Estamos Fechados</div>
              <p className="text-sm text-rose-200/80">Voltamos em breve, fica atento. Enquanto o bar estiver fechado não é possível pedir consumo.</p>
            </div>
          </div>
        )}

        {/* Personal info */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-outfit text-xl font-semibold">Os meus dados</h3>
            {!editing ? (
              <button
                data-testid="socio-edit-toggle"
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 flex items-center gap-1.5"
              >
                <PencilSimple size={14} weight="bold" /> Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  data-testid="socio-save-btn"
                  onClick={saveProfile}
                  className="px-3 py-1.5 rounded-md text-xs font-bold bg-green-500/15 text-green-300 hover:bg-green-500/25 flex items-center gap-1.5"
                >
                  <Check size={14} weight="bold" /> Guardar
                </button>
                <button
                  data-testid="socio-cancel-btn"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5"
                >
                  <X size={14} weight="bold" /> Cancelar
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Telemóvel">
              {editing ? (
                <input
                  data-testid="socio-contact-input"
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              ) : (
                <div className="text-slate-200">{c.contact || <span className="text-slate-500">—</span>}</div>
              )}
            </Field>
            <Field label="Email">
              {editing ? (
                <input
                  data-testid="socio-email-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              ) : (
                <div className="text-slate-200">{c.email || <span className="text-slate-500">—</span>}</div>
              )}
            </Field>
            <Field label="Morada">
              {editing ? (
                <input
                  data-testid="socio-morada-input"
                  value={form.morada}
                  onChange={(e) => setForm({ ...form, morada: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              ) : (
                <div className="text-slate-200">{c.morada || <span className="text-slate-500">—</span>}</div>
              )}
            </Field>
          </div>
        </div>

        {/* MBWay pending */}
        {mbway.filter((m) => m.status === "pending").length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={18} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-lg font-semibold">Pedidos MBWay pendentes</h3>
            </div>
            <ul className="space-y-2">
              {mbway.filter((m) => m.status === "pending").map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                    {new Date(m.created_at).toLocaleString("pt-PT")} · {m.mbway_phone}
                  </span>
                  <span className="font-bold text-amber-300">{euro(m.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-3">
              Aguardam confirmação por um membro do clube. Saldo só atualiza após validação.
            </p>
          </div>
        )}

        {/* History */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Receipt size={20} weight="duotone" className="text-amber-500" />
              <h3 className="font-outfit text-xl font-semibold">Histórico</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {barOpen === false ? (
                <span
                  data-testid="socio-bar-closed"
                  title="O bar está fechado"
                  className="text-xs px-3 py-1.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 font-bold"
                >
                  <Storefront size={13} weight="duotone" /> Estamos Fechados · Volta em breve, fica atento
                </span>
              ) : (
                <button
                  data-testid="socio-request-btn"
                  onClick={loadRequest}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1.5"
                >
                  <Plus size={13} weight="bold" /> Pedir consumo
                </button>
              )}
              <button
                data-testid="socio-messages-btn"
                onClick={loadMessages}
                className="text-xs px-3 py-1.5 rounded-md bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 flex items-center gap-1.5"
              >
                <ChatCircle size={13} weight="duotone" /> Mensagens
              </button>
              <button
                data-testid="socio-card-btn"
                onClick={() => setShowCard(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1.5"
              >
                <IdentificationCard size={13} weight="duotone" /> Cartão de Sócio
              </button>
              <button
                data-testid="socio-merch-btn"
                onClick={() => setShowMerch(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 flex items-center gap-1.5"
              >
                <Storefront size={13} weight="duotone" /> Loja
              </button>
              <button
                data-testid="socio-family-btn"
                onClick={() => setShowFamily(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 flex items-center gap-1.5"
              >
                <Users size={13} weight="duotone" /> Agregado familiar
              </button>
              <button
                data-testid="socio-community-btn"
                onClick={() => setShowCommunity(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 flex items-center gap-1.5"
              >
                <ChatCircleDots size={13} weight="duotone" /> Comunidade
              </button>
              <button
                data-testid="socio-profile-extra-btn"
                onClick={() => setShowProfileExtra(true)}
                disabled={!!(c.birthday && c.photo_data)}
                title={c.birthday && c.photo_data ? "Já tens foto e data definidas. Pede ao administrador para alterar." : ""}
                className="text-xs px-3 py-1.5 rounded-md bg-pink-500/15 text-pink-300 border border-pink-500/30 hover:bg-pink-500/25 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Camera size={13} weight="duotone" /> {c.birthday && c.photo_data ? "Perfil completo" : "Foto + Aniversário"}
              </button>
              <button
                data-testid="socio-quotas-btn"
                onClick={() => loadQuotas()}
                className="text-xs px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1.5"
              >
                <CalendarBlank size={13} weight="duotone" /> Pagar cotas
              </button>
              <button
                data-testid="socio-points-hist-btn"
                onClick={loadPointsHist}
                className="text-xs px-3 py-1.5 rounded-md bg-green-500/15 text-green-300 border border-green-500/30 hover:bg-green-500/25 flex items-center gap-1.5"
              >
                <Star size={13} weight="duotone" /> Extrato de pontos
              </button>
              <button
                data-testid="socio-tickets-btn"
                onClick={() => setShowTickets(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 flex items-center gap-1.5"
              >
                <Ticket size={13} weight="duotone" /> Comprar bilhete
              </button>
              <a
                href="/manual.html"
                target="_blank"
                rel="noreferrer"
                data-testid="socio-manual-link"
                className="text-xs px-3 py-1.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 flex items-center gap-1.5"
              >
                <BookOpen size={13} weight="duotone" /> Manual
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/60 p-1 flex-wrap" data-testid="socio-history-filter">
              {[
                { v: "today", l: "Hoje" },
                { v: "week", l: "Semana" },
                { v: "month", l: "Mês" },
                { v: "year", l: "Ano" },
                { v: "all", l: "Sempre" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  data-testid={`socio-filter-${opt.v}`}
                  onClick={() => setHistoryFilter(opt.v)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                    historyFilter === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                  }`}
                >{opt.l}</button>
              ))}
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-slate-500">Consumido: <strong className="text-rose-300">{euro(totalConsumed)}</strong></span>
              <span className="text-slate-500">Pago: <strong className="text-emerald-300">{euro(totalPaid)}</strong></span>
            </div>
          </div>
          {filteredEvents.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Sem atividade no período.</div>
          ) : (
            <ul className="space-y-2" data-testid="socio-history">
              {filteredEvents.map((ev, i) => (
                <li
                  key={i}
                  data-testid={ev.type === "payment" ? `socio-payment-${ev.id}` : ev.type === "sale" ? `socio-sale-${ev.id}` : `socio-mbway-${ev.id}`}
                  className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
                    ev.type === "sale"
                      ? "bg-rose-500/5 border-rose-500/10"
                      : ev.type === "payment"
                      ? "bg-emerald-500/5 border-emerald-500/10"
                      : ev.status === "pending"
                      ? "bg-amber-500/5 border-amber-500/15"
                      : ev.status === "confirmed"
                      ? "bg-emerald-500/5 border-emerald-500/10"
                      : "bg-slate-800/30 border-slate-700"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500">
                      {new Date(ev.date).toLocaleString("pt-PT")}
                    </div>
                    <div className="text-sm font-medium text-slate-200 mt-0.5">
                      {ev.type === "sale" && "Consumo"}
                      {ev.type === "payment" && "Pagamento"}
                      {ev.type === "mbway" && `MBWay · ${ev.status === "pending" ? "pendente" : ev.status === "confirmed" ? "confirmado" : "rejeitado"}`}
                    </div>
                    {ev.type === "sale" && (
                      <ul className="text-xs text-slate-400 mt-1.5 space-y-0.5">
                        {ev.items.map((it, j) => (
                          <li key={j}>{it.quantity}× {it.product_name} · {euro(it.subtotal)}</li>
                        ))}
                        {ev.points_earned > 0 && (
                          <li className="text-green-300">+{ev.points_earned} pts</li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div
                      className={`font-bold ${
                        ev.type === "sale"
                          ? "text-rose-400"
                          : ev.type === "payment"
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }`}
                    >
                      {ev.type === "sale" ? "+" : "-"}{euro(ev.type === "sale" ? ev.total : ev.amount)}
                    </div>
                    {ev.type === "payment" && (
                      <button
                        data-testid={`socio-print-receipt-${ev.id}`}
                        onClick={() => printReceipt(ev)}
                        title="Ver / imprimir recibo"
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      >
                        <Printer size={11} weight="duotone" /> Recibo
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {showPoints && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowPoints(false)}
          data-testid="points-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Coins size={22} weight="duotone" className="text-green-400" />
              <h3 className="font-outfit text-xl font-semibold">Pagar com pontos</h3>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              Cada <strong className="text-green-300">5 pontos = 1 €</strong>. Desconta diretamente no saldo a pagar.
            </p>
            <form onSubmit={submitPoints} className="space-y-4">
              <div className="bg-slate-950 border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span>Pontos disponíveis</span>
                  <span className="text-green-300 font-bold">{c.points || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Em dívida</span>
                  <span className="text-amber-300 font-bold">{euro(debt)}</span>
                </div>
              </div>
              <Field label="Pontos a usar (múltiplos de 5)">
                <input
                  data-testid="points-input"
                  type="number"
                  min="5"
                  step="5"
                  max={Math.min(c.points || 0, Math.floor(debt * 5))}
                  required
                  value={pointsToUse}
                  onChange={(e) => setPointsToUse(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </Field>
              <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-4 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80">Vais pagar</span>
                <span className="font-outfit text-3xl font-bold text-amber-300">
                  {euro((Number(pointsToUse) || 0) / 5)}
                </span>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPoints(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
                <button data-testid="points-submit-btn" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-slate-950 font-bold">
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPointsHist && pointsHist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowPointsHist(false)}
          data-testid="socio-points-hist-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Star size={22} weight="fill" className="text-green-400" />
              <h3 className="font-outfit text-xl font-semibold">Extrato de pontos</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Ganhos</div>
                <div className="font-outfit text-xl font-bold text-green-300">+{pointsHist.earned}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Gastos</div>
                <div className="font-outfit text-xl font-bold text-rose-300">−{pointsHist.spent}</div>
              </div>
              <div className="bg-slate-950 border border-amber-500/30 rounded-lg p-3 text-center">
                <div className="text-[10px] text-amber-400/80 uppercase tracking-wider">Saldo</div>
                <div className="font-outfit text-xl font-bold text-amber-300">{c.points || 0}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {pointsHist.items.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">Sem movimentos.</div>
              ) : pointsHist.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2 rounded bg-slate-950/50 border border-slate-800/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-slate-500">{new Date(it.created_at).toLocaleString("pt-PT")}</div>
                    <div className="text-xs text-slate-300 truncate">{it.note}</div>
                  </div>
                  <span className={`font-bold ${it.delta > 0 ? "text-green-300" : "text-rose-300"}`}>
                    {it.delta > 0 ? "+" : ""}{it.delta} pts
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowPointsHist(false)} className="mt-4 w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Fechar</button>
          </div>
        </div>
      )}

      {showProfileExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowProfileExtra(false)} data-testid="socio-profile-extra-modal">
          <form onSubmit={submitProfileExtra} onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Camera size={22} weight="duotone" className="text-pink-400" />
              <h3 className="font-outfit text-xl font-semibold">Perfil + Bónus 2 pts</h3>
            </div>
            <p className="text-xs text-slate-400">Adiciona a tua foto e data de nascimento. Quando ambos estiverem preenchidos pela primeira vez ganhas <strong>+2 pontos</strong>. <span className="text-amber-300">Após guardar, só o administrador pode alterar.</span></p>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Data de nascimento</label>
              <input
                data-testid="socio-bday-input"
                type="date"
                value={profileForm.birthday || c.birthday || ""}
                onChange={(e) => setProfileForm({ ...profileForm, birthday: e.target.value })}
                disabled={!!c.birthday}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {c.birthday && <p className="text-[10px] text-amber-400 mt-1">Já definida — pede ao admin para alterar.</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Foto (jpg/png, máx 1 MB)</label>
              <input
                data-testid="socio-photo-input"
                type="file"
                accept="image/*"
                onChange={(e) => onPhotoSelect(e.target.files?.[0])}
                disabled={!!c.photo_data}
                className="mt-1 w-full text-xs text-slate-300 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {(profileForm.photo_data || c.photo_data) && (
                <img src={profileForm.photo_data || c.photo_data} alt="foto" className="mt-2 w-24 h-24 rounded-full object-cover border-2 border-amber-400" />
              )}
              {c.photo_data && <p className="text-[10px] text-amber-400 mt-1">Já definida — pede ao admin para alterar.</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowProfileExtra(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button data-testid="socio-profile-extra-submit" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {showMessages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowMessages(false)} data-testid="socio-messages-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <ChatCircle size={22} weight="duotone" className="text-fuchsia-400" />
              <h3 className="font-outfit text-xl font-semibold">Mensagens</h3>
            </div>
            <form onSubmit={sendMessage} className="space-y-2 mb-4 bg-slate-950/60 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Enviar mensagem à associação</div>
              <input
                data-testid="socio-new-subject"
                value={newMsg.subject}
                onChange={(e) => setNewMsg({ ...newMsg, subject: e.target.value })}
                placeholder="Assunto"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
              />
              <textarea
                data-testid="socio-new-message"
                value={newMsg.message}
                onChange={(e) => setNewMsg({ ...newMsg, message: e.target.value })}
                rows={3}
                placeholder="Mensagem..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button data-testid="socio-send-message" type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg py-2 text-sm">Enviar</button>
            </form>
            <div className="flex-1 overflow-y-auto space-y-2">
              {myMessages.length === 0 ? (
                <div className="text-center text-slate-500 py-6 text-sm">Sem mensagens.</div>
              ) : myMessages.map((m) => (
                <div key={m.id} data-testid={`socio-msg-${m.id}`} className={`rounded-lg px-3 py-2 border ${m.from_staff ? "bg-fuchsia-500/5 border-fuchsia-500/20" : "bg-slate-950/50 border-slate-800"}`}>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{m.from_staff ? "Da associação" : "Tua mensagem"} · {new Date(m.created_at).toLocaleString("pt-PT")}</span>
                    {m.reply && <span className="text-emerald-400">✓ respondida</span>}
                  </div>
                  <div className="font-semibold text-slate-200 text-sm mt-0.5">{m.subject}</div>
                  <p className="text-xs text-slate-400 whitespace-pre-wrap">{m.message}</p>
                  {m.reply && (
                    <div className="mt-2 bg-emerald-500/5 border-l-2 border-emerald-500/40 pl-2 py-1">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold">Resposta</div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap">{m.reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowMessages(false)} className="mt-3 w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700">Fechar</button>
          </div>
        </div>
      )}

      {showCommunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowCommunity(false)} data-testid="socio-community-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <ChatCircleDots size={22} weight="duotone" className="text-teal-400" />
              <h3 className="font-outfit text-xl font-semibold">Chat da comunidade</h3>
            </div>
            <CommunityChat me={c} />
            <button onClick={() => setShowCommunity(false)} className="mt-3 w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700">Fechar</button>
          </div>
        </div>
      )}

      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowRequest(false)} data-testid="socio-request-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Plus size={22} weight="bold" className="text-emerald-400" />
              <h3 className="font-outfit text-xl font-semibold">Pedir consumo</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">O pedido vai para o staff validar. Quando aprovado, é lançado na tua conta.</p>

            {/* Carrinho actual (com +/- e remover) */}
            {Object.entries(reqCart).filter(([, q]) => q > 0).length > 0 && (
              <div className="mb-3 bg-slate-950 border border-amber-500/30 rounded-lg p-2 max-h-40 overflow-y-auto" data-testid="req-cart-list">
                <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1.5 px-1">No carrinho</div>
                {Object.entries(reqCart).filter(([, q]) => q > 0).map(([pid, q]) => {
                  const isQuota = pid.startsWith("quota-");
                  const p = products.find((x) => x.id === pid);
                  if (!p && !isQuota) return null;
                  return (
                    <div key={pid} className="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-slate-800 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">{isQuota ? nameOf(pid) : p.name}</div>
                        <div className="text-[10px] text-slate-500">{euro(priceOf(pid))} · subtotal {euro(priceOf(pid) * q)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid={`req-dec-${pid}`}
                          onClick={() => {
                            const next = { ...reqCart };
                            const nq = (next[pid] || 0) - 1;
                            if (nq <= 0) delete next[pid]; else next[pid] = nq;
                            setReqCart(next);
                          }}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-base font-bold"
                          title="Retirar 1"
                        >−</button>
                        <span className="min-w-[24px] text-center font-bold text-amber-300 text-sm">{q}</span>
                        <button
                          type="button"
                          data-testid={`req-inc-${pid}`}
                          onClick={() => setReqCart({ ...reqCart, [pid]: q + 1 })}
                          disabled={!isQuota && p && q >= availOf(p)}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-base font-bold disabled:opacity-30"
                          title={!isQuota && p && q >= availOf(p) ? "Quantidade disponível esgotada" : "Adicionar 1"}
                        >+</button>
                        <button
                          type="button"
                          data-testid={`req-rm-${pid}`}
                          onClick={() => {
                            const next = { ...reqCart };
                            delete next[pid];
                            setReqCart(next);
                          }}
                          className="w-7 h-7 rounded bg-rose-950 hover:bg-rose-900 text-rose-400 text-xs ml-1"
                          title="Remover"
                        >×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 px-1">Produtos disponíveis</div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {products.filter((p) => !p.is_quota && availOf(p) > 0).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`req-prod-${p.id}`}
                  disabled={!!reqCart[p.id] && reqCart[p.id] >= availOf(p)}
                  onClick={() => setReqCart({ ...reqCart, [p.id]: (reqCart[p.id] || 0) + 1 })}
                  className="text-left px-2 py-2 rounded bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-amber-400 font-bold text-[11px]">{euro(p.price)}</div>
                  <div className="text-[10px] text-slate-500">{availOf(p)} disp.</div>
                  {reqCart[p.id] && <div className="text-emerald-400 text-[10px] mt-0.5">× {reqCart[p.id]} no carrinho</div>}
                </button>
              ))}
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</span>
              <span data-testid="req-total" className="font-outfit text-xl font-bold text-amber-300">
                {euro(Object.entries(reqCart).reduce((s, [pid, q]) => s + priceOf(pid) * q, 0))}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowRequest(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button data-testid="req-submit" onClick={submitRequest} disabled={!Object.keys(reqCart).length} className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold">Enviar pedido</button>
            </div>
          </div>
        </div>
      )}

      {showQuotas && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowQuotas(false)}
          data-testid="socio-quotas-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarBlank size={22} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-xl font-semibold">Cotas</h3>
              <select
                data-testid="socio-quotas-year"
                value={quotas.year}
                onChange={(e) => changeQuotaYear(Number(e.target.value))}
                className="ml-auto bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm"
              >
                {[0, -1, -2].map((delta) => {
                  const y = new Date().getFullYear() + delta;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Seleciona os meses em aberto que pretendes pagar. O pedido é enviado por MBWay para o número da ARD.
            </p>
            <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 mb-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Envia MBWay para</div>
              <div data-testid="socio-quotas-mbway" className="font-outfit text-xl font-bold text-amber-300">{club.mbway_phone || "—"}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {quotas.quotas.map((q) => {
                const isPaid = q.status === "paid";
                const isSel = selectedMonths.includes(q.month);
                return (
                  <button
                    key={q.month}
                    type="button"
                    disabled={isPaid}
                    data-testid={`quota-${q.month}`}
                    onClick={() => setSelectedMonths(isSel ? selectedMonths.filter((m) => m !== q.month) : [...selectedMonths, q.month])}
                    className={`text-xs px-2 py-2 rounded border ${
                      isPaid
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                        : isSel
                        ? "bg-amber-500 text-slate-950 border-amber-500"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-amber-500/40"
                    }`}
                  >
                    <div className="font-bold">{q.label.split("/")[0]}</div>
                    <div className="text-[9px] mt-0.5">{isPaid ? "✓ Paga" : euro(q.amount)}</div>
                    {isPaid && q.paid_at && (
                      <div data-testid={`quota-paid-at-${q.month}`} className="text-[8px] text-slate-500 mt-0.5">
                        pago em {new Date(q.paid_at).toLocaleDateString("pt-PT")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 mb-4 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold">Total a pagar</span>
              <span data-testid="socio-quotas-total" className="font-outfit text-2xl font-bold text-amber-300">{euro(selectedMonths.length * (club.quota_monthly_value || 5))}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowQuotas(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Cancelar</button>
              <button
                data-testid="socio-quotas-submit"
                onClick={submitQuotas}
                disabled={selectedMonths.length === 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold"
              >
                Enviar pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {quotaPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setQuotaPrompt(null)}
          data-testid="socio-quota-prompt-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarBlank size={22} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-xl font-semibold">Cota em dívida</h3>
            </div>
            <p className="text-sm text-slate-300 mb-5" data-testid="socio-quota-prompt-text">
              Tens a cota de <strong className="text-amber-300">{quotaPrompt.label}</strong> ({euro(quotaPrompt.amount)}) em dívida. Queres pagar a cota em dívida junto a este pedido?
            </p>
            <div className="flex gap-2">
              <button
                data-testid="socio-quota-prompt-no"
                onClick={() => openRequestAfterQuota(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
              >
                Não
              </button>
              <button
                data-testid="socio-quota-prompt-yes"
                onClick={() => openRequestAfterQuota(true)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              >
                Sim, juntar cota
              </button>
            </div>
          </div>
        </div>
      )}

      {showDebtDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowDebtDetail(false)}
          data-testid="socio-debt-detail-modal"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Receipt size={22} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-xl font-semibold">O que está por pagar</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {debtSales.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">Sem consumos por pagar. 🎉</div>
              ) : debtSales.map((s) => (
                <div key={s.id} data-testid={`debt-sale-${s.id}`} className="rounded-lg px-3 py-2 border bg-rose-500/5 border-rose-500/15">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString("pt-PT")}{s.partial ? " · parcial" : ""}</div>
                    <div className="font-bold text-rose-300">{euro(s.total)}</div>
                  </div>
                  <ul className="text-xs text-slate-400 mt-1 space-y-0.5">
                    {(s.items || []).map((it, j) => (
                      <li key={j}>{it.quantity}× {it.product_name} · {euro(it.subtotal)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 my-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold">Total por pagar</span>
              <span className="font-outfit text-xl font-bold text-amber-300">{euro(debt)}</span>
            </div>
            <button onClick={() => setShowDebtDetail(false)} className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700">Fechar</button>
          </div>
        </div>
      )}

      {showTickets && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowTickets(false)}
          data-testid="socio-tickets-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Ticket size={22} weight="duotone" className="text-violet-400" />
              <h3 className="font-outfit text-xl font-semibold">Comprar bilhete</h3>
            </div>
            <div className="bg-slate-950 border border-violet-500/30 rounded-lg p-6 text-center mt-4">
              <p data-testid="socio-tickets-soon" className="text-sm text-violet-200 font-medium">
                A venda de bilhetes para o Estádio Dia Gonçalves estará disponível em breve.
              </p>
            </div>
            <button onClick={() => setShowTickets(false)} className="mt-4 w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">Fechar</button>
          </div>
        </div>
      )}

      {showMb && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowMb(false)}
          data-testid="mbway-modal"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <DeviceMobile size={22} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-xl font-semibold">Pagar por MBWay</h3>
            </div>
            <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-4 mb-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-1">
                Envia para
              </div>
              <div className="font-outfit text-2xl font-bold text-amber-300" data-testid="club-mbway-phone">
                {club.mbway_phone || "Pede o nº na receção"}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                {club.name || "ARD Nespereira"} · usa este número no teu MBWay e depois preenche o formulário em baixo.
              </div>
            </div>
            <form onSubmit={submitMb} className="space-y-4">
              <Field label="Valor enviado €" required>
                <input
                  data-testid="mbway-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={mbForm.amount}
                  onChange={(e) => setMbForm({ ...mbForm, amount: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </Field>
              <Field label="Nº MBWay usado para pagar" required>
                <input
                  data-testid="mbway-phone-input"
                  required
                  value={mbForm.mbway_phone}
                  onChange={(e) => setMbForm({ ...mbForm, mbway_phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </Field>

              {(c.points || 0) > 0 && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80">Descontar pontos</span>
                    <div className="flex gap-2" data-testid="mbway-points-toggle">
                      {[{ v: false, l: "Não" }, { v: true, l: "Sim" }].map((o) => (
                        <button
                          key={o.l}
                          type="button"
                          data-testid={`mbway-points-${o.v ? "sim" : "nao"}`}
                          onClick={() => setMbForm((f) => ({ ...f, use_points: o.v, points_to_use: o.v && !f.points_to_use ? Math.min(c.points, 5) : f.points_to_use }))}
                          className={`px-3 py-1 rounded-md text-xs font-bold ${mbForm.use_points === o.v ? "bg-green-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                        >{o.l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Disponíveis: <strong className="text-green-300">{c.points}</strong> · 5 pts = 1 €
                  </div>
                  {mbForm.use_points && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Descontar Pontos</label>
                      <input
                        data-testid="mbway-points-input"
                        type="number"
                        min="1"
                        max={c.points}
                        required
                        value={mbForm.points_to_use}
                        onChange={(e) => setMbForm({ ...mbForm, points_to_use: e.target.value })}
                        className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                      />
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Valor dos pontos:</span>
                        <span className="font-bold text-green-300">{euro((Number(mbForm.points_to_use) || 0) / 5)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold">Total a abater</span>
                <span data-testid="mbway-total-credit" className="font-outfit text-xl font-bold text-amber-300">
                  {euro((Number(mbForm.amount) || 0) + (mbForm.use_points ? (Number(mbForm.points_to_use) || 0) / 5 : 0))}
                </span>
              </div>

              <Field label="Nota (opcional)">
                <input
                  value={mbForm.note}
                  onChange={(e) => setMbForm({ ...mbForm, note: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </Field>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMb(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  data-testid="mbway-submit-btn"
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Enviar pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCard && <SocioDigitalCard client={c} onClose={() => setShowCard(false)} />}

      {showMerch && <SocioMerch onClose={() => setShowMerch(false)} />}

      {showFamily && <SocioFamily titular={c} onClose={() => setShowFamily(false)} />}
    </div>
  );
}

const Field = ({ label, required, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">
      {label} {required && <span className="text-rose-400">*</span>}
    </div>
    {children}
  </div>
);
