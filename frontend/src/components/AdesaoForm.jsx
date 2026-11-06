import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { CheckCircle, BookOpen } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Formulário de adesão a sócio (página pública /aderir e aba "Adesão de sócios" em Clientes).
 * O pedido entra pendente e só a direção o aprova.
 */
const REGRAS = [
  "O pedido fica pendente até a direção aprovar — a administração recebe um aviso de cada nova adesão.",
  "Depois da aprovação recebes o nº de sócio e o PIN automático (nº de sócio com zeros à esquerda até 5 dígitos).",
  "As quotas são mensais (12 por ano): 🟢 em dia, 🟡 por regularizar, 🔴 em dívida.",
  "Só com quotas 🟢 acumulas pontos: 1 ponto por cada 5 € e 5 pontos valem 1 €.",
  "Quem te apadrinhar recebe 1 ponto quando a adesão é aprovada.",
  "Menores de 16 anos ficam registados como tutelados do titular do agregado.",
];

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

export default function AdesaoForm({ embedded = false }) {
  const emptyForm = {
    name: "", birthday: "", morada: "", localidade: "", contact: "", email: "",
    sponsor_member_number: "", accept_regulations: false,
  };
  const [form, setForm] = useState(emptyForm);
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
      setForm(emptyForm);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <details className="bg-slate-900/60 border border-slate-800 rounded-xl p-4" data-testid="adesao-regras">
        <summary className="cursor-pointer text-sm font-semibold text-amber-300 flex items-center gap-2">
          <BookOpen size={16} weight="duotone" /> Manual de regras · novos sócios e sócios atuais
        </summary>
        <ul className="mt-3 space-y-1.5 text-xs text-slate-400 list-disc pl-5">
          {REGRAS.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <a href="/manual.html" target="_blank" rel="noreferrer" className="inline-block mt-3 text-xs font-bold text-amber-400 hover:text-amber-300" data-testid="adesao-manual-link">
          Abrir o Manual do Sócio completo (imprimível) →
        </a>
      </details>

      {done ? (
        <div className="bg-slate-900/60 border border-emerald-500/30 rounded-xl p-8 text-center" data-testid="adesao-success">
          <CheckCircle size={42} weight="duotone" className="mx-auto text-emerald-400 mb-3" />
          <h2 className="font-outfit text-xl font-semibold">Pedido submetido</h2>
          <p className="text-sm text-slate-400 mt-2">
            O pedido de adesão ficou registado com data e hora e a direção já recebeu o aviso para aprovar.
            Só depois da decisão é atribuído o nº de sócio e o PIN.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
            <button
              type="button"
              onClick={() => setDone(false)}
              data-testid="adesao-new"
              className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-sm"
            >
              Inscrever outro sócio
            </button>
            {!embedded && (
              <Link to="/socio/login" className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-sm">
                Voltar ao portal do sócio
              </Link>
            )}
          </div>
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
  );
}
