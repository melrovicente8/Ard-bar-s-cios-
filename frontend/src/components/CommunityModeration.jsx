import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { EyeSlash, Eye, Trash, Flag } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Moderação do chat da comunidade (staff): filtrar, ocultar, reexibir e eliminar mensagens.
 */
export default function CommunityModeration() {
  const [data, setData] = useState({ messages: [], pending_reports_count: 0 });
  const [filter, setFilter] = useState("all"); // all | visible | hidden | reported
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/community/messages/staff");
      setData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const hide = async (m) => {
    if (!window.confirm(`Ocultar mensagem de ${m.author_name}?`)) return;
    try {
      await api.post(`/community/messages/${m.id}/hide`);
      toast.success("Mensagem ocultada");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const unhide = async (m) => {
    try {
      await api.post(`/community/messages/${m.id}/unhide`);
      toast.success("Mensagem reexibida");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`ELIMINAR definitivamente a mensagem de ${m.author_name}?`)) return;
    try {
      await api.delete(`/community/messages/${m.id}`);
      toast.success("Mensagem eliminada");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const filtered = data.messages.filter((m) => {
    if (filter === "visible") return m.status === "visible";
    if (filter === "hidden") return m.status === "hidden";
    if (filter === "reported") return (m.reports || []).length > 0;
    return true;
  });

  return (
    <div data-testid="community-moderation">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1 flex-wrap" data-testid="community-mod-filter">
          {[
            { v: "all", l: "Todas" },
            { v: "reported", l: `Denunciadas${data.pending_reports_count ? ` (${data.pending_reports_count})` : ""}` },
            { v: "visible", l: "Visíveis" },
            { v: "hidden", l: "Ocultas" },
          ].map((opt) => (
            <button
              key={opt.v}
              data-testid={`community-mod-filter-${opt.v}`}
              onClick={() => setFilter(opt.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                filter === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">{filtered.length} mensagem(ns)</div>
      </div>

      {loading ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-slate-400">Sem mensagens neste filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              data-testid={`community-mod-${m.id}`}
              className={`bg-slate-900/40 border rounded-xl p-4 ${m.status === "hidden" ? "border-rose-500/30 opacity-70" : "border-slate-800"}`}
            >
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-slate-100">{m.author_name}</span>
                  {m.member_number ? <span className="text-slate-500"> · nº {m.member_number}</span> : null}
                  <span className="text-slate-500"> · {new Date(m.created_at).toLocaleString("pt-PT")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(m.reports || []).length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                      <Flag size={10} weight="fill" /> {m.reports.length} denúncia(s)
                    </span>
                  )}
                  {m.status === "hidden" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/30">
                      Oculta{m.hidden_by ? ` por ${m.hidden_by}` : ""}
                    </span>
                  )}
                  {m.original_masked && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Linguagem filtrada
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{m.message}</p>
              {(m.reports || []).length > 0 && (
                <div className="mt-2 text-[11px] text-rose-300/80 border-l-2 border-rose-500/40 pl-2">
                  Denunciada por: {m.reports.map((r) => r.client_name).join(", ")}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                {m.status === "visible" ? (
                  <button
                    data-testid={`community-mod-hide-${m.id}`}
                    onClick={() => hide(m)}
                    className="px-3 py-1.5 rounded-md text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1.5"
                  >
                    <EyeSlash size={12} /> Ocultar
                  </button>
                ) : (
                  <button
                    data-testid={`community-mod-unhide-${m.id}`}
                    onClick={() => unhide(m)}
                    className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1.5"
                  >
                    <Eye size={12} /> Reexibir
                  </button>
                )}
                <button
                  data-testid={`community-mod-delete-${m.id}`}
                  onClick={() => remove(m)}
                  className="px-3 py-1.5 rounded-md text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 flex items-center gap-1.5"
                >
                  <Trash size={12} /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
