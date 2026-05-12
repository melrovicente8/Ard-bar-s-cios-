import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Plus, User, ArrowRight, MagnifyingGlass, Trash, Medal } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function Clientes() {
  const { user } = useAuth();
  const canDelete = user?.role === "admin";
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", contact: "", email: "", note: "", member_number: "", is_member: false });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/clients");
      setClients(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/clients", {
        name: form.name,
        contact: form.contact || null,
        email: form.email || null,
        note: form.note || null,
        member_number: form.member_number || null,
        is_member: !!form.is_member,
      });
      toast.success("Cliente adicionado");
      setForm({ name: "", contact: "", email: "", note: "", member_number: "", is_member: false });
      setShowAdd(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Eliminar ${c.name}?`)) return;
    try {
      await api.delete(`/clients/${c.id}`);
      toast.success("Cliente eliminado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.contact || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
      )
    : clients;

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="clientes-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Diretório
          </div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
            Clientes
          </h1>
        </div>
        <button
          data-testid="add-client-btn"
          onClick={() => setShowAdd(true)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={18} weight="bold" /> Novo cliente
        </button>
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          data-testid="clientes-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar cliente..."
          className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-11 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
        />
      </div>

      {loading ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <User size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
          <p className="text-slate-400">Sem clientes ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const debt = (c.balance || 0) > 0;
            return (
              <div
                key={c.id}
                data-testid={`client-card-${c.id}`}
                className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-amber-500/40 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-outfit text-lg font-semibold truncate">{c.name}</span>
                      {c.is_member ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/30 flex items-center gap-1">
                          <Medal size={11} weight="fill" /> Sócio
                          {c.member_number ? ` nº ${c.member_number}` : ""}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/30">
                          Não-sócio
                        </span>
                      )}
                    </div>
                    {c.contact && <div className="text-xs text-slate-500 truncate">{c.contact}</div>}
                    {c.email && <div className="text-xs text-slate-500 truncate">{c.email}</div>}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      A pagar
                    </div>
                    <div
                      data-testid={`client-debt-${c.id}`}
                      className={`mt-1 font-outfit text-base font-bold ${
                        debt ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {euro(Math.max(c.balance || 0, 0))}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      Total
                    </div>
                    <div className="mt-1 font-outfit text-base font-bold text-slate-200">
                      {euro(c.total_spent || 0)}
                    </div>
                  </div>
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-500/80">
                      Pontos
                    </div>
                    <div className="mt-1 font-outfit text-base font-bold text-amber-300">
                      {c.points || 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    to={`/clientes/${c.id}`}
                    data-testid={`client-view-${c.id}`}
                    className="flex-1 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium flex items-center justify-center gap-2"
                  >
                    Ficha <ArrowRight size={14} weight="bold" />
                  </Link>
                  {canDelete && (
                    <button
                      data-testid={`client-delete-${c.id}`}
                      onClick={() => remove(c)}
                      className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-outfit text-xl font-semibold mb-5">Novo cliente</h3>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Nome *
                </label>
                <input
                  data-testid="new-client-name-input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Contacto
                </label>
                <input
                  data-testid="new-client-contact-input"
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Telefone..."
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Nota
                </label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Nº de Sócio
                  </label>
                  <input
                    data-testid="new-client-member-number-input"
                    value={form.member_number}
                    onChange={(e) => setForm({ ...form, member_number: e.target.value })}
                    className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="Ex: 1234"
                  />
                </div>
                <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-green-600/40">
                  <input
                    data-testid="new-client-is-member-toggle"
                    type="checkbox"
                    checked={form.is_member}
                    onChange={(e) => setForm({ ...form, is_member: e.target.checked })}
                    className="w-4 h-4 accent-green-500"
                  />
                  <span className="text-xs font-medium text-slate-200">
                    Sócio com cotas pagas
                  </span>
                </label>
              </div>
              <div className="text-[11px] text-slate-500 -mt-2">
                Sócio com cotas pagas ganha 1 ponto por cada 5€. Caso contrário, 1 ponto por cada 10€.
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  data-testid="new-client-submit-btn"
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
