import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Vault, Bank, ClipboardText, CalendarBlank, Money } from "@phosphor-icons/react";
import { toast } from "sonner";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Banco() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "tesoureiro";
  const [cashBank, setCashBank] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: "", deposit_note: "", deposit_date: todayIso() });

  const load = async () => {
    try {
      const [dash, deps] = await Promise.all([
        api.get("/dashboard"),
        api.get("/cash-withdrawals"),
      ]);
      setCashBank(dash.data.cash_bank || null);
      setDeposits(deps.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(String(form.amount).replace(",", "."));
    if (!amount || amount <= 0) return toast.error("Indica um valor válido");
    if (!form.deposit_note.trim()) return toast.error("A nota de depósito é obrigatória");
    if (!form.deposit_date) return toast.error("A data do depósito é obrigatória");
    setSaving(true);
    try {
      await api.post("/cash-withdrawals", {
        amount,
        deposit_note: form.deposit_note.trim(),
        deposit_date: form.deposit_date,
      });
      toast.success("Depósito registado — valor retirado da caixa e transferido para o banco");
      setForm({ amount: "", deposit_note: "", deposit_date: todayIso() });
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="p-12 text-slate-500" data-testid="banco-loading">
        A carregar...
      </div>
    );

  return (
    <div className="p-6 md:p-10 space-y-6 animate-in" data-testid="banco-page">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400/80">
          Tesouraria
        </div>
        <h1 className="font-outfit text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          Caixa e Banco
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Retira valor em caixa e transfere para o banco — nota de depósito e data obrigatórias.
        </p>
      </div>

      {/* Valores atuais */}
      {cashBank && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5" data-testid="banco-caixa-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Valor contabilístico em caixa
                </div>
                <div className={`mt-3 font-outfit text-3xl font-bold tracking-tight ${cashBank.cash_balance >= 0 ? "text-amber-300" : "text-rose-400"}`}>
                  {euro(cashBank.cash_balance)}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Vendas em numerário − depósitos bancários − devoluções de crédito
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
                <Vault size={22} weight="duotone" />
              </div>
            </div>
          </div>
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5" data-testid="banco-banco-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Valor em banco
                </div>
                <div className="mt-3 font-outfit text-3xl font-bold tracking-tight text-emerald-400">
                  {euro(cashBank.bank_balance)}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Total transferido da caixa por depósito bancário
                </div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Bank size={22} weight="duotone" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulário de depósito */}
      {canManage ? (
        <form
          onSubmit={submit}
          className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6 space-y-4"
          data-testid="banco-deposit-form"
        >
          <div className="flex items-center gap-2">
            <Money size={20} weight="duotone" className="text-amber-400" />
            <h3 className="font-outfit text-lg font-semibold">Transferir dinheiro da caixa para o banco</h3>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            1. Retiras o dinheiro da caixa (gaveta) e depositas no banco &nbsp;·&nbsp; 2. Registas aqui o valor, a nota de depósito e a data &nbsp;·&nbsp; 3. O <b className="text-amber-300">Valor em caixa</b> desce e o <b className="text-emerald-400">Valor em banco</b> sobe.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">
                Valor (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                data-testid="banco-amount"
                className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">
                Nota de depósito <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.deposit_note}
                onChange={(e) => setForm({ ...form, deposit_note: e.target.value })}
                placeholder="Ex.: depósito n.º 12345"
                data-testid="banco-deposit-note"
                className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">
                Data <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                value={form.deposit_date}
                onChange={(e) => setForm({ ...form, deposit_date: e.target.value })}
                data-testid="banco-deposit-date"
                className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            data-testid="banco-submit"
            className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {saving ? "A transferir..." : "Transferir caixa → banco"}
          </button>
        </form>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-sm text-slate-400">
          Apenas administrador ou tesoureiro pode registar depósitos bancários.
        </div>
      )}

      {/* Histórico de depósitos */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardText size={20} weight="duotone" className="text-slate-400" />
            <h3 className="font-outfit text-lg font-semibold">Depósitos registados</h3>
          </div>
          <span className="text-xs text-slate-500">{deposits.length} registo(s)</span>
        </div>
        {deposits.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">Sem depósitos registados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 font-medium">N.º</th>
                  <th className="pb-3 font-medium">Data depósito</th>
                  <th className="pb-3 font-medium">Nota de depósito</th>
                  <th className="pb-3 font-medium">Registado por</th>
                  <th className="pb-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} className="border-t border-slate-800/60 hover:bg-slate-900/40" data-testid={`banco-row-${d.id}`}>
                    <td className="py-3 text-slate-500 font-mono">#{d.tx_number}</td>
                    <td className="py-3 text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarBlank size={13} className="text-slate-500" />
                        {d.deposit_date || "—"}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300">{d.deposit_note || d.note || "—"}</td>
                    <td className="py-3 text-slate-500 text-xs">{d.user_email || "—"}</td>
                    <td className="py-3 text-right text-emerald-400 font-semibold">{euro(d.amount)}</td>
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
