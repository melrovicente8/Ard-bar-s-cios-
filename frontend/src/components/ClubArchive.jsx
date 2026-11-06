import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Trophy, BookOpen, FileText, PencilSimple, FloppyDisk, Plus, Trash, X } from "@phosphor-icons/react";

/**
 * 🏆 ARD NESPEREIRA — Historial, Palmarés e Arquivo Documental.
 * Leitura para sócios (scope="socio") e para o staff (scope="staff").
 * A direção (canEdit) mantém o conteúdo — PUT /api/club-archive.
 */
const EMPTY_PALMARES = { season: "", competition: "", result: "" };
const EMPTY_DOCUMENT = { title: "", year: "", url: "", note: "" };

const TABS = [
  { id: "historia", label: "História", icon: BookOpen },
  { id: "palmares", label: "Palmarés", icon: Trophy },
  { id: "arquivo", label: "Arquivo documental", icon: FileText },
];

export default function ClubArchive({ scope = "staff", canEdit = false }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("historia");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const endpoint = scope === "socio" ? "/socio/club-archive" : "/club-archive";

  const load = () => {
    api.get(endpoint)
      .then(({ data: d }) => setData(d))
      .catch(() => setData({ history: "", palmares: [], documents: [] }));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);

  const editing = draft !== null;

  const startEdit = () => {
    setDraft({
      history: data?.history || "",
      palmares: (data?.palmares || []).map((p) => ({ ...p })),
      documents: (data?.documents || []).map((d) => ({ ...d })),
    });
  };

  const setRow = (kind, idx, field, value) => {
    setDraft((d) => {
      const rows = [...d[kind]];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...d, [kind]: rows };
    });
  };

  const addRow = (kind, empty) => {
    setDraft((d) => ({ ...d, [kind]: [...d[kind], { ...empty }] }));
  };

  const removeRow = (kind, idx) => {
    setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, i) => i !== idx) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: saved } = await api.put("/club-archive", draft);
      setData(saved);
      setDraft(null);
      toast.success("Arquivo atualizado");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const palmares = editing ? draft.palmares : (data?.palmares || []);
  const documents = editing ? draft.documents : (data?.documents || []);

  return (
    <div data-testid="club-archive" className="bg-slate-900/50 border border-amber-500/25 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 bg-gradient-to-r from-amber-500/10 via-slate-900/20 to-emerald-500/10 border-b border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl">🏆</span>
          <h2 className="font-outfit text-lg md:text-xl font-bold text-amber-200 flex-1 min-w-0">
            ARD NESPEREIRA — Historial, Palmarés e Arquivo Documental
          </h2>
          {canEdit && !editing && (
            <button
              data-testid="club-archive-edit"
              onClick={startEdit}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
            >
              <PencilSimple size={13} weight="bold" /> Editar
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDraft(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5"
              >
                <X size={13} weight="bold" /> Cancelar
              </button>
              <button
                data-testid="club-archive-save"
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <FloppyDisk size={13} weight="bold" /> {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          {data?.updated_at
            ? `Atualizado em ${new Date(data.updated_at).toLocaleString("pt-PT")}${data.updated_by ? ` · ${data.updated_by}` : ""}`
            : "Memória do clube mantida pela direção"}
        </div>
      </div>

      <div className="flex gap-1 px-3 pt-3 flex-wrap" data-testid="club-archive-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            data-testid={`club-archive-tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
              tab === id
                ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon size={13} weight="duotone" /> {label}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-5">
        {tab === "historia" && (
          <div data-testid="club-archive-history">
            {editing ? (
              <textarea
                value={draft.history}
                onChange={(e) => setDraft({ ...draft, history: e.target.value })}
                rows={9}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            ) : (
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {data?.history || "Ainda sem história registada."}
              </div>
            )}
          </div>
        )}

        {tab === "palmares" && (
          <div data-testid="club-archive-palmares" className="space-y-2">
            {palmares.length === 0 && !editing && (
              <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                Ainda não há títulos registados.
              </div>
            )}
            {palmares.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
                      <th className="py-2 pr-3 font-medium">Época</th>
                      <th className="py-2 pr-3 font-medium">Competição</th>
                      <th className="py-2 pr-3 font-medium">Resultado</th>
                      {editing && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {palmares.map((row, i) => (
                      <tr key={row.id || i}>
                        {["season", "competition", "result"].map((field) => (
                          <td key={field} className="py-1.5 pr-3 align-top">
                            {editing ? (
                              <input
                                value={row[field] || ""}
                                onChange={(e) => setRow("palmares", i, field, e.target.value)}
                                className="w-full min-w-[90px] bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                              />
                            ) : (
                              <span className={field === "result" ? "text-amber-300 font-bold" : "text-slate-300"}>
                                {row[field] || "—"}
                              </span>
                            )}
                          </td>
                        ))}
                        {editing && (
                          <td className="py-1.5">
                            <button onClick={() => removeRow("palmares", i)} className="text-rose-400 hover:text-rose-300">
                              <Trash size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {editing && (
              <button
                onClick={() => addRow("palmares", EMPTY_PALMARES)}
                className="text-xs font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1.5"
              >
                <Plus size={12} weight="bold" /> Adicionar título
              </button>
            )}
          </div>
        )}

        {tab === "arquivo" && (
          <div data-testid="club-archive-documents" className="space-y-2">
            {documents.length === 0 && !editing && (
              <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                Ainda não há documentos no arquivo.
              </div>
            )}
            {documents.map((doc, i) => (
              <div key={doc.id || i} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                {editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={doc.title || ""}
                      onChange={(e) => setRow("documents", i, "title", e.target.value)}
                      placeholder="Título do documento"
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                    />
                    <input
                      value={doc.year || ""}
                      onChange={(e) => setRow("documents", i, "year", e.target.value)}
                      placeholder="Ano / época"
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                    />
                    <input
                      value={doc.url || ""}
                      onChange={(e) => setRow("documents", i, "url", e.target.value)}
                      placeholder="Ligação (opcional)"
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                    />
                    <input
                      value={doc.note || ""}
                      onChange={(e) => setRow("documents", i, "note", e.target.value)}
                      placeholder="Nota"
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                    />
                    <button
                      onClick={() => removeRow("documents", i)}
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash size={13} /> Remover
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <FileText size={16} weight="duotone" className="text-amber-300 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-200">
                        {doc.title}
                        {doc.year ? <span className="text-slate-500 font-normal"> · {doc.year}</span> : null}
                      </div>
                      {doc.note && <div className="text-[11px] text-slate-400">{doc.note}</div>}
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-amber-300 hover:text-amber-200 underline break-all"
                        >
                          {doc.url}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {editing && (
              <button
                onClick={() => addRow("documents", EMPTY_DOCUMENT)}
                className="text-xs font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1.5"
              >
                <Plus size={12} weight="bold" /> Adicionar documento
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
