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
  const canCancelSale = canEditAll;
  const canDeleteClient = user?.role === "admin";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", points_used: 0, note: "" });
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

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/clients/${id}`);
      setData(data);
      setPayForm({ amount: String(Math.max(data.client.balance || 0, 0).toFixed(2)), points_used: 0, note: "" });
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
      const { data: payment } = await api.post("/payments", {
        client_id: id,
        amount: parseFloat(payForm.amount || 0),
        points_used: Number(payForm.points_used || 0),
        note: payForm.note || null,
      });
      toast.success("Pagamento registado");
      setShowPay(false);
      await load();
      // Open notify modal
      setNotifyPayment(payment);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
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
  const debt = Math.max(c.balance || 0, 0);

  // Build a timeline of sales + payments
  const events = [
    ...sales.map((s) => ({ type: "sale", date: s.created_at, ...s })),
    ...payments.map((p) => ({ type: "payment", date: p.created_at, ...p })),
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
          <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-2xl">
            {c.name[0]?.toUpperCase()}
          </div>
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
            {(c.contact || c.email || c.morada) && (
              <div className="text-sm text-slate-400 mt-1 space-y-0.5">
                <div>
                  {c.contact}
                  {c.contact && c.email ? " · " : ""}
                  {c.email}
                </div>
                {c.morada && <div className="text-slate-500">{c.morada}</div>}
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
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">
            A pagar
          </div>
          <div
            data-testid="ficha-debt"
            className="mt-2 font-outfit text-3xl font-bold text-amber-300"
          >
            {euro(debt)}
          </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Sales history */}
        <div className="lg:col-span-3 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <ShoppingBag size={20} weight="duotone" className="text-amber-500" />
            <h3 className="font-outfit text-xl font-semibold">Consumo</h3>
          </div>
          {sales.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Sem consumos.</div>
          ) : (
            <ul className="space-y-3" data-testid="sales-list">
              {sales.map((s) => (
                <li
                  key={s.id}
                  data-testid={`sale-${s.id}`}
                  className="bg-slate-950/60 border border-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">
                      {new Date(s.created_at).toLocaleString("pt-PT")}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.points_earned > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/30 flex items-center gap-1">
                          <Star size={10} weight="fill" /> +{s.points_earned} pts
                        </span>
                      )}
                      <span className="font-outfit text-lg font-bold text-amber-400">
                        {euro(s.total)}
                      </span>
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
                </li>
              ))}
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
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
                    ev.type === "sale"
                      ? "bg-rose-500/5 border-rose-500/10"
                      : "bg-emerald-500/5 border-emerald-500/10"
                  }`}
                >
                  <div>
                    <div className="text-xs text-slate-500">
                      {new Date(ev.date).toLocaleString("pt-PT")}
                    </div>
                    <div className="text-sm font-medium text-slate-200">
                      {ev.type === "sale" ? "Venda" : "Pagamento"}
                    </div>
                  </div>
                  <div
                    className={`font-bold ${
                      ev.type === "sale" ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {ev.type === "sale" ? "+" : "-"}
                    {euro(ev.type === "sale" ? ev.total : ev.amount)}
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

              {/* Resumo: total recebido, abatido, troco */}
              {(() => {
                const cash = Number(payForm.amount) || 0;
                const ptsValue = (Number(payForm.points_used) || 0) / 5;
                const totalApplied = Math.min(cash + ptsValue, debt);
                const change = Math.max(cash + ptsValue - debt, 0);
                return (
                  <div className="space-y-2">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total recebido</span>
                      <span className="font-outfit text-xl font-bold text-slate-100">{euro(cash + ptsValue)}</span>
                    </div>
                    <div className="bg-slate-950 border border-amber-500/20 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Abate na dívida</span>
                      <span data-testid="payment-total-credit" className="font-outfit text-xl font-bold text-amber-300">{euro(totalApplied)}</span>
                    </div>
                    {change > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">Troco a devolver</span>
                        <span data-testid="payment-change" className="font-outfit text-xl font-bold text-emerald-300">{euro(change)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

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
    </div>
  );
}

const BreakdownCard = ({ label, value, highlight }) => (
  <div className={`rounded-xl p-4 border ${highlight ? "bg-amber-500/5 border-amber-500/20" : "bg-slate-900/40 border-slate-800"}`}>
    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
    <div className={`mt-2 font-outfit text-xl font-bold ${highlight ? "text-amber-300" : "text-slate-100"}`}>{value}</div>
  </div>
);
