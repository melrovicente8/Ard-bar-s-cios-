import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { UsersThree, PencilSimple, Check, X as XIcon, Plus, Trash } from "@phosphor-icons/react";

const ROLE_LABEL = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  funcionario: "Funcionário",
};

const ROLE_CLASS = {
  admin: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  tesoureiro: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  funcionario: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export default function Equipa() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "funcionario" });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (u) => { setEditing(u.id); setName(u.name); };

  const save = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { name });
      toast.success("Nome atualizado");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users", form);
      toast.success("Utilizador criado");
      setShowAdd(false);
      setForm({ email: "", name: "", password: "", role: "funcionario" });
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Eliminar ${u.email}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("Utilizador eliminado");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="equipa-page">
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <UsersThree size={32} weight="duotone" className="text-amber-400" />
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Administração</div>
            <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Equipa</h1>
          </div>
        </div>
        <button
          data-testid="create-user-btn"
          onClick={() => setShowAdd(true)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-4 py-2.5 flex items-center gap-2"
        >
          <Plus size={16} weight="bold" /> Novo utilizador
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Renomeia os utilizadores funcionários e tesoureiros. O nome aparece no canto inferior esquerdo e em todas as transações que registam.
      </p>
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">A carregar...</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Papel</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-testid={`user-row-${u.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                  <td className="px-5 py-3 text-slate-300 font-mono text-xs">{u.email}</td>
                  <td className="px-5 py-3 text-slate-100 font-medium">
                    {editing === u.id ? (
                      <input
                        data-testid={`user-name-input-${u.id}`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        className="bg-slate-950 border border-amber-500/40 rounded px-2 py-1 text-white focus:outline-none"
                      />
                    ) : (
                      u.name
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_CLASS[u.role] || "bg-slate-700/40 text-slate-300 border-slate-600"}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {editing === u.id ? (
                      <div className="inline-flex gap-1">
                        <button
                          data-testid={`user-save-${u.id}`}
                          onClick={() => save(u)}
                          className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                        >
                          <Check size={14} weight="bold" />
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    ) : (
                      u.role !== "admin" && (
                        <div className="inline-flex gap-1">
                          <button
                            data-testid={`user-edit-${u.id}`}
                            onClick={() => startEdit(u)}
                            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
                          >
                            <PencilSimple size={14} />
                          </button>
                          <button
                            data-testid={`user-delete-${u.id}`}
                            onClick={() => removeUser(u)}
                            className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowAdd(false)} data-testid="create-user-modal">
          <form onSubmit={submitCreate} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-outfit text-xl font-semibold">Novo utilizador</h3>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Email</label>
              <input data-testid="new-user-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nome</label>
              <input data-testid="new-user-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Password</label>
              <input data-testid="new-user-password" type="password" required minLength={4} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Papel</label>
              <select data-testid="new-user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
                <option value="funcionario">Funcionário</option>
                <option value="tesoureiro">Tesoureiro</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white">Cancelar</button>
              <button data-testid="submit-new-user" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Criar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
