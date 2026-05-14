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
  Camera,
  Plus,
} from "@phosphor-icons/react";
import { toast } from "sonner";

export default function SocioPortal() {
  const { data, logout, refresh } = useSocio();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ contact: "", email: "", morada: "" });
  const [club, setClub] = useState({});
  const [showMb, setShowMb] = useState(false);
  const [mbForm, setMbForm] = useState({ amount: "", mbway_phone: "", note: "" });
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
  // Pedido de consumo
  const [showRequest, setShowRequest] = useState(false);
  const [products, setProducts] = useState([]);
  const [reqCart, setReqCart] = useState({});

  useEffect(() => {
    api.get("/club/info").then((r) => setClub(r.data)).catch(() => {});
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
  const debt = Math.max(c.balance || 0, 0);

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

  const loadQuotas = async () => {
    try {
      const { data } = await api.get("/socio/quotas");
      setQuotas(data);
      setSelectedMonths([]);
      setShowQuotas(true);
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
    // Encontrar vendas que este pagamento cobriu (heurística: vendas pendentes antes da data, FIFO)
    const earlierSales = sales.filter((s) => s.created_at <= p.created_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    let cover = p.total_credited || p.amount;
    const covered = [];
    for (const s of earlierSales) {
      if (cover <= 0) break;
      const applied = Math.min(cover, s.total);
      cover -= applied;
      covered.push({ sale: s, applied });
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
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-2xl">
              {c.name[0]?.toUpperCase()}
            </div>
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
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/60 border border-amber-500/30 rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
                A pagar
              </div>
              <div data-testid="socio-debt" className="mt-2 font-outfit text-4xl font-bold text-amber-300">
                {euro(debt)}
              </div>
              {debt > 0 && (
                <button
                  data-testid="socio-pay-mbway-btn"
                  onClick={() => setShowMb(true)}
                  className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
                >
                  <DeviceMobile size={18} weight="bold" /> Pagar por MBWay
                </button>
              )}
            </div>
            <div className="bg-slate-950/60 border border-green-500/30 rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80 flex items-center gap-1.5">
                <Star size={11} weight="fill" /> Pontos
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
          </div>
        </div>

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
              <button
                data-testid="socio-request-btn"
                onClick={loadRequest}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1.5"
              >
                <Plus size={13} weight="bold" /> Pedir consumo
              </button>
              <button
                data-testid="socio-messages-btn"
                onClick={loadMessages}
                className="text-xs px-3 py-1.5 rounded-md bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 flex items-center gap-1.5"
              >
                <ChatCircle size={13} weight="duotone" /> Mensagens
              </button>
              <button
                data-testid="socio-profile-extra-btn"
                onClick={() => setShowProfileExtra(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-pink-500/15 text-pink-300 border border-pink-500/30 hover:bg-pink-500/25 flex items-center gap-1.5"
              >
                <Camera size={13} weight="duotone" /> Foto + Aniversário
              </button>
              <button
                data-testid="socio-quotas-btn"
                onClick={loadQuotas}
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
            <p className="text-xs text-slate-400">Adiciona a tua foto e data de nascimento. Quando ambos estiverem preenchidos pela primeira vez ganhas <strong>+2 pontos</strong>.</p>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Data de nascimento</label>
              <input
                data-testid="socio-bday-input"
                type="date"
                value={profileForm.birthday || c.birthday || ""}
                onChange={(e) => setProfileForm({ ...profileForm, birthday: e.target.value })}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Foto (jpg/png, máx 1 MB)</label>
              <input
                data-testid="socio-photo-input"
                type="file"
                accept="image/*"
                onChange={(e) => onPhotoSelect(e.target.files?.[0])}
                className="mt-1 w-full text-xs text-slate-300"
              />
              {(profileForm.photo_data || c.photo_data) && (
                <img src={profileForm.photo_data || c.photo_data} alt="foto" className="mt-2 w-24 h-24 rounded-full object-cover border-2 border-amber-400" />
              )}
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

      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowRequest(false)} data-testid="socio-request-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Plus size={22} weight="bold" className="text-emerald-400" />
              <h3 className="font-outfit text-xl font-semibold">Pedir consumo</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">O pedido vai para o staff validar. Quando aprovado, é lançado na tua conta.</p>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {products.filter((p) => !p.is_quota && p.quantity > 0).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`req-prod-${p.id}`}
                  onClick={() => setReqCart({ ...reqCart, [p.id]: (reqCart[p.id] || 0) + 1 })}
                  className="text-left px-2 py-2 rounded bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-xs"
                >
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-amber-400 font-bold text-[11px]">{euro(p.price)}</div>
                  {reqCart[p.id] && <div className="text-emerald-400 text-[10px] mt-0.5">× {reqCart[p.id]} no carrinho</div>}
                </button>
              ))}
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</span>
              <span data-testid="req-total" className="font-outfit text-xl font-bold text-amber-300">
                {euro(Object.entries(reqCart).reduce((s, [pid, q]) => { const p = products.find((x) => x.id === pid); return s + (p ? p.price * q : 0); }, 0))}
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
              <h3 className="font-outfit text-xl font-semibold">Cotas {quotas.year}</h3>
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
