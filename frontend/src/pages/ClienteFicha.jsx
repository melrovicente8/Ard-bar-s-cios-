import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ArrowLeft, CurrencyEur, ShoppingBag, Receipt } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ClienteFicha() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", note: "" });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/clients/${id}`);
      setData(data);
      setPayForm({ amount: String(Math.max(data.client.balance || 0, 0).toFixed(2)), note: "" });
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
      await api.post("/payments", {
        client_id: id,
        amount: parseFloat(payForm.amount),
        note: payForm.note || null,
      });
      toast.success("Pagamento registado");
      setShowPay(false);
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
            <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight" data-testid="ficha-client-name">
              {c.name}
            </h1>
            {(c.contact || c.email) && (
              <div className="text-sm text-slate-400 mt-1">
                {c.contact}
                {c.contact && c.email ? " · " : ""}
                {c.email}
              </div>
            )}
          </div>
        </div>
        <button
          data-testid="register-payment-btn"
          onClick={() => setShowPay(true)}
          disabled={debt <= 0}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold px-5 py-3 rounded-lg flex items-center gap-2"
        >
          <CurrencyEur size={18} weight="bold" /> Registar pagamento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-6">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500/80">
            A pagar
          </div>
          <div
            data-testid="ficha-debt"
            className="mt-3 font-outfit text-4xl font-bold text-amber-300"
          >
            {euro(debt)}
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Total consumido
          </div>
          <div className="mt-3 font-outfit text-4xl font-bold text-slate-200">
            {euro(c.total_spent || 0)}
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Vendas
          </div>
          <div className="mt-3 font-outfit text-4xl font-bold text-slate-200">
            {sales.length}
          </div>
        </div>
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
                  className="bg-slate-950/60 border border-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">
                      {new Date(s.created_at).toLocaleString("pt-PT")}
                    </span>
                    <span className="font-outfit text-lg font-bold text-amber-400">
                      {euro(s.total)}
                    </span>
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
            <h3 className="font-outfit text-xl font-semibold mb-5">Registar pagamento</h3>
            <form onSubmit={submitPay} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Valor recebido €
                </label>
                <input
                  data-testid="payment-amount-input"
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Nota
                </label>
                <input
                  value={payForm.note}
                  onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Numerário, MB Way..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPay(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  data-testid="payment-submit-btn"
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
