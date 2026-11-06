import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EditableText from "../components/EditableText";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Vault, Bank, ClipboardText, CalendarBlank, Money, ArrowsLeftRight, HandCoins } from "@phosphor-icons/react";
import { toast } from "sonner";
import TreasuryModal from "../components/TreasuryModal";
import AcertoPanel from "../components/AcertoPanel";

const todayIso = () => new Date().toISOString().slice(0, 10);

const DEPOSIT_CATEGORIES = [
  { v: "donativos", l: "Donativos" },
  { v: "subsidios", l: "Subsídios" },
  { v: "excedente", l: "Excedente" },
  { v: "outras_atividades", l: "Outras atividades" },
  { v: "outros", l: "Outros" },
];

const MOV_LABEL = {
  bank_deposit: "Caixa → Banco",
  transfer_bank_cash: "Banco → Caixa",
  deposit_in: "Depósito de valores",
};

export default function Banco() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "tesoureiro";
  const [cashBank, setCashBank] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [treasury, setTreasury] = useState(null);
  const [depForm, setDepForm] = useState({ category: "donativos", amount: "", target: "banco", reason: "" });
  const [trfForm, setTrfForm] = useState({ direction: "bank_to_cash", amount: "", reason: "" });
  const [searchParams] = useSearchParams();

  // Vindo do cartão do Dashboard «Transferir dinheiro da caixa para o banco»:
  // pré-seleciona caixa → banco e leva o utilizador ao formulário.
  useEffect(() => {
    if (searchParams.get("mov") === "caixa-banco") {
      setTrfForm((f) => ({ ...f, direction: "cash_to_bank" }));
      setTimeout(() => document.getElementById("banco-transfer-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [searchParams]);

  const load = async () => {
    try {
      const [dash, movs] = await Promise.all([
        api.get("/dashboard"),
        api.get("/bank/transfers"),
      ]);
      setCashBank(dash.data.cash_bank || null);
      setMovements(movs.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(String(depForm.amount).replace(",", "."));
    if (!amount || amount <= 0) return toast.error("Indica um valor válido");
    if (!depForm.reason.trim()) return toast.error("Descreve o motivo do depósito");
    setSaving(true);
    try {
      const { data } = await api.post("/bank/deposits", {
        category: depForm.category, amount, target: depForm.target, reason: depForm.reason.trim(),
      });
      toast.success(`Depósito #${data.tx_number} registado em ${depForm.target === "caixa" ? "caixa" : "banco"}`);
      setDepForm({ category: "donativos", amount: "", target: "banco", reason: "" });
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const submitTransfer = async (e) => {
    e.preventDefault();
    const amount = parseFloat(String(trfForm.amount).replace(",", "."));
    if (!amount || amount <= 0) return toast.error("Indica um valor válido");
    if (!trfForm.reason.trim()) return toast.error("Descreve o motivo da transferência");
    setSaving(true);
    try {
      const { data } = await api.post("/bank/transfers", {
        direction: trfForm.direction, amount, reason: trfForm.reason.trim(),
      });
      toast.success(`Transferência #${data.tx_number} registada — não é receita nem despesa`);
      setTrfForm({ direction: "bank_to_cash", amount: "", reason: "" });
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
          <EditableText k="page.banco.title">Caixa e Banco</EditableText>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Depósitos de valores, transferências entre caixa e banco e movimentos detalhados.
        </p>
      </div>

      {/* Valores atuais — clicar abre o movimento detalhado */}
      {cashBank && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button onClick={() => setTreasury("cash")} className="text-left bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-amber-500/40 transition-colors" data-testid="banco-caixa-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Valor contabilístico em caixa</div>
                <div className={`mt-3 font-outfit text-3xl font-bold tracking-tight ${cashBank.cash_balance >= 0 ? "text-amber-300" : "text-rose-400"}`}>
                  {euro(cashBank.cash_balance)}
                </div>
                <div className="text-xs text-slate-500 mt-2">Clique para ver todas as transações da caixa</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400"><Vault size={22} weight="duotone" /></div>
            </div>
          </button>
          <button onClick={() => setTreasury("bank")} className="text-left bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-emerald-500/40 transition-colors" data-testid="banco-banco-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Valor em banco</div>
                <div className={`mt-3 font-outfit text-3xl font-bold tracking-tight ${cashBank.bank_balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {euro(cashBank.bank_balance)}
                </div>
                <div className="text-xs text-slate-500 mt-2">Clique para ver todas as transações do banco</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400"><Bank size={22} weight="duotone" /></div>
            </div>
          </button>
        </div>
      )}

      {user?.role === "admin" && cashBank && (
        <AcertoPanel balances={cashBank} user={user} onDone={load} />
      )}

      {canManage ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Depósito de valores externos */}
          <form onSubmit={submitDeposit} className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-3" data-testid="banco-values-form">
            <div className="flex items-center gap-2">
              <HandCoins size={20} weight="duotone" className="text-amber-400" />
              <h3 className="font-outfit text-lg font-semibold">Depósito de valores</h3>
            </div>
            <p className="text-xs text-slate-500">Donativos, subsídios, excedente ou outras atividades — escolhe se creditas em caixa ou banco.</p>
            <div className="grid grid-cols-2 gap-3">
              <select value={depForm.category} onChange={(e) => setDepForm({ ...depForm, category: e.target.value })} data-testid="banco-values-category" className="bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white">
                {DEPOSIT_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
              <input type="number" step="0.01" min="0.01" required value={depForm.amount} onChange={(e) => setDepForm({ ...depForm, amount: e.target.value })} placeholder="Valor (€)" data-testid="banco-values-amount" className="bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white" />
            </div>
            <div className="flex gap-2">
              {["caixa", "banco"].map((t) => (
                <button key={t} type="button" onClick={() => setDepForm({ ...depForm, target: t })} data-testid={`banco-values-target-${t}`} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border ${depForm.target === t ? "bg-amber-500 text-slate-950 border-amber-500" : "bg-slate-950/60 text-slate-300 border-slate-700"}`}>
                  Creditar em {t === "caixa" ? "Caixa" : "Banco"}
                </button>
              ))}
            </div>
            <textarea required value={depForm.reason} onChange={(e) => setDepForm({ ...depForm, reason: e.target.value })} placeholder="Motivo detalhado (obrigatório)" data-testid="banco-values-reason" className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white" rows={2} />
            <button type="submit" disabled={saving} data-testid="banco-values-submit" className="w-full px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400 disabled:opacity-50">
              Registar depósito
            </button>
          </form>

          {/* Transferência entre contas */}
          <form id="banco-transfer-form" onSubmit={submitTransfer} className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-3" data-testid="banco-transfer-form">
            <div className="flex items-center gap-2">
              <ArrowsLeftRight size={20} weight="duotone" className="text-emerald-400" />
              <h3 className="font-outfit text-lg font-semibold">Transferir valores</h3>
            </div>
            <p className="text-xs text-slate-500">Movimentação de valores entre banco e caixa — não conta como receita nem despesa.</p>
            <div className="flex gap-2">
              {[
                { v: "bank_to_cash", l: "Banco → Caixa" },
                { v: "cash_to_bank", l: "Caixa → Banco" },
              ].map((d) => (
                <button key={d.v} type="button" onClick={() => setTrfForm({ ...trfForm, direction: d.v })} data-testid={`banco-transfer-${d.v}`} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border ${trfForm.direction === d.v ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-slate-950/60 text-slate-300 border-slate-700"}`}>
                  {d.l}
                </button>
              ))}
            </div>
            <input type="number" step="0.01" min="0.01" required value={trfForm.amount} onChange={(e) => setTrfForm({ ...trfForm, amount: e.target.value })} placeholder="Valor (€)" data-testid="banco-transfer-amount" className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white" />
            <textarea required value={trfForm.reason} onChange={(e) => setTrfForm({ ...trfForm, reason: e.target.value })} placeholder="Motivo detalhado do levantamento/depósito (obrigatório)" data-testid="banco-transfer-reason" className="w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white" rows={2} />
            <button type="submit" disabled={saving} data-testid="banco-transfer-submit" className="w-full px-5 py-2.5 rounded-lg bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 disabled:opacity-50">
              Registar transferência
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-sm text-slate-400">
          Apenas administrador ou tesoureiro pode registar depósitos e transferências.
        </div>
      )}

      {/* Histórico de movimentos */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardText size={20} weight="duotone" className="text-slate-400" />
            <h3 className="font-outfit text-lg font-semibold">Depósitos e transferências registados</h3>
          </div>
          <span className="text-xs text-slate-500">{movements.length} registo(s)</span>
        </div>
        {movements.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">Sem registos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 font-medium">N.º</th>
                  <th className="pb-3 font-medium">Data</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Descrição</th>
                  <th className="pb-3 font-medium">Registado por</th>
                  <th className="pb-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((d) => (
                  <tr key={d.id} className="border-t border-slate-800/60 hover:bg-slate-900/40" data-testid={`banco-row-${d.id}`}>
                    <td className="py-3 font-mono text-xs">
                      <Link to={`/transacoes/${d.tx_number}`} className="text-amber-400 hover:underline">#{d.tx_number}</Link>
                    </td>
                    <td className="py-3 text-slate-200">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <CalendarBlank size={13} className="text-slate-500" />
                        {new Date(d.created_at).toLocaleString("pt-PT")}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-slate-400">
                      {MOV_LABEL[d.kind] || d.kind}
                      {d.kind === "deposit_in" && <span className="text-slate-500"> · {d.category} → {d.target}</span>}
                    </td>
                    <td className="py-3 text-slate-300 text-xs">{d.deposit_note || d.note || "—"}</td>
                    <td className="py-3 text-slate-500 text-xs">{d.user_email || "—"}</td>
                    <td className="py-3 text-right text-emerald-400 font-semibold">{euro(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {treasury && <TreasuryModal account={treasury} onClose={() => setTreasury(null)} />}
    </div>
  );
}
