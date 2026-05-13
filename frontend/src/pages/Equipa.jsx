import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { UsersThree, PencilSimple, Check, X as XIcon } from "@phosphor-icons/react";

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

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="equipa-page">
      <div className="flex items-center gap-3 mb-8">
        <UsersThree size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Administração</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Equipa</h1>
        </div>
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
                        <button
                          data-testid={`user-edit-${u.id}`}
                          onClick={() => startEdit(u)}
                          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
                        >
                          <PencilSimple size={14} />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
