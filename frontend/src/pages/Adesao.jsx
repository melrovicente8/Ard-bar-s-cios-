import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { UserPlus, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const Field = ({ label, required, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
      {label} {required && <span className="text-rose-400">*</span>}
    </label>
    <div className="mt-1.5">{children}</div>
  </div>
);

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50";

export default function Adesao() {
  const [form, setForm] = useState({
    name: "", birthday: "", morada: "", localidade: "", contact: "", email: "",
    sponsor_member_number: "", accept_regulations: false,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.accept_regulations) return toast.error("É obrigatório aceitar o regulamento interno");
    setSaving(true);
    try {
      await api.post("/public/membership-application", {
        ...form,
        sponsor_member_number: form.sponsor_member_number || null,
        email: form.email || null,
        localidade: form.localidade || null,
      });
      setDone(true);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 mb-6" data-testid="adesao-voltar">
          ← Voltar
        </Link>
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-xl bg-amber-500/15 text-amber-400 mb-3">
            <UserPlus size={26} weight="duotone" />
          </div>
          <h1 className="font-outfit text-2xl font-bold">Adesão a sócio · ARD Nespereira</h1>
          <p className="text-sm text-slate-400 mt-1">Preenche o formulário — o pedido fica pendente de aprovação da direção.</p>
        </div>

        {done ? (
          <div className="bg-slate-900/60 border border-emerald-500/30 rounded-xl p-8 text-center" data-testid="adesao-success">
            <CheckCircle size={42} weight="duotone" className="mx-auto text-emerald-400 mb-3" />
            <h2 className="font-outfit text-xl font-semibold">Pedido submetido</h2>
            <p className="text-sm text-slate-400 mt-2">
              O teu pedido de adesão foi registado com data e hora. Serás contactado após aprovação da direção.
            </p>
            <Link to="/socio/login" className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-sm">
              Voltar ao portal do sócio
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4" data-testid="adesao-form">
            <Field label="Nome e apelido" required>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} data-testid="adesao-name" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data de nascimento" required>
                <input required type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={inputCls} data-testid="adesao-birthday" />
              </Field>
              <Field label="Telemóvel" required>
                <input required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className={inputCls} data-testid="adesao-contact" />
              </Field>
            </div>
            <Field label="Morada" required>
              <input required value={form.morada} onChange={(e) => setForm({ ...form, morada: e.target.value })} className={inputCls} data-testid="adesao-morada" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} data-testid="adesao-email" />
            </Field>
            <Field label="Nº de sócio padrinho (facultativo)">
              <input value={form.sponsor_member_number} onChange={(e) => setForm({ ...form, sponsor_member_number: e.target.value })} className={inputCls} data-testid="adesao-sponsor" placeholder="Ex.: 88 — recebe 1 ponto ao ser aprovado" />
            </Field>
            <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.accept_regulations}
                onChange={(e) => setForm({ ...form, accept_regulations: e.target.checked })}
                className="w-4 h-4 accent-amber-500 mt-0.5"
                data-testid="adesao-accept"
              />
              <span>Declaro que concordo com as normas do regulamento interno da ARDN (aceitação registada com data e hora).</span>
            </label>
            <button type="submit" disabled={saving} data-testid="adesao-submit" className="w-full px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-50">
              {saving ? "A submeter..." : "Submeter pedido de adesão"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
