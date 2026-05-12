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
          <div className="flex items-center gap-2 mb-5">
            <Receipt size={20} weight="duotone" className="text-amber-500" />
            <h3 className="font-outfit text-xl font-semibold">Histórico</h3>
          </div>
          {events.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Sem atividade ainda.</div>
          ) : (
            <ul className="space-y-2" data-testid="socio-history">
              {events.map((ev, i) => (
                <li
                  key={i}
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
