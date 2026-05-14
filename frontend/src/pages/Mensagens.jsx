import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { ChatCircle, PaperPlaneTilt, EnvelopeSimpleOpen, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Mensagens() {
  const [filter, setFilter] = useState("open");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyOn, setReplyOn] = useState(null);
  const [reply, setReply] = useState("");
  // Enviar nova mensagem para sócio
  const [showSend, setShowSend] = useState(false);
  const [socios, setSocios] = useState([]);
  const [sendForm, setSendForm] = useState({ client_id: "", subject: "", message: "" });

  const loadSocios = async () => {
    try {
      const { data } = await api.get("/admin/clients");
      setSocios(data.filter((c) => c.is_member));
    } catch {
      /* funcionarios may not see */
    }
  };
  useEffect(() => { loadSocios(); }, []);

  const submitSend = async (e) => {
    e.preventDefault();
    try {
      await api.post("/socio-messages/send-to-socio", sendForm);
      toast.success("Mensagem enviada ao sócio");
      setShowSend(false);
      setSendForm({ client_id: "", subject: "", message: "" });
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = filter ? { status_filter: filter } : {};
      const { data } = await api.get("/socio-messages", { params });
      setItems(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const submitReply = async (m) => {
    if (!reply.trim()) return toast.error("Escreve uma resposta");
    try {
      await api.post(`/socio-messages/${m.id}/reply`, { reply });
      toast.success("Resposta enviada");
      setReplyOn(null);
      setReply("");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="mensagens-page">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <ChatCircle size={32} weight="duotone" className="text-amber-400" />
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Comunicação</div>
            <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Mensagens de sócios</h1>
          </div>
        </div>
        <button
          data-testid="msg-send-btn"
          onClick={() => setShowSend(true)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg px-4 py-2.5 flex items-center gap-2"
        >
          <Plus size={16} weight="bold" /> Nova mensagem
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1 mb-5" data-testid="mensagens-filter">
        {[
          { v: "open", l: "Por responder" },
          { v: "replied", l: "Respondidas" },
          { v: "", l: "Todas" },
        ].map((opt) => (
          <button
            key={opt.v}
            data-testid={`mensagens-filter-${opt.v || "all"}`}
            onClick={() => setFilter(opt.v)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${filter === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >{opt.l}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <EnvelopeSimpleOpen size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
          <p className="text-slate-400">Sem mensagens.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m.id} data-testid={`mensagem-${m.id}`} className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <Link to={`/clientes/${m.client_id}`} className="font-outfit text-lg font-semibold text-slate-100 hover:text-amber-400">
                    {m.client_name}{m.member_number ? ` · nº ${m.member_number}` : ""}
                  </Link>
                  <div className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString("pt-PT")}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.status === "open" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"}`}>
                  {m.status === "open" ? "Por responder" : "Respondida"}
                </span>
              </div>
              <div className="font-semibold text-slate-200 mb-1">{m.subject}</div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{m.message}</p>
              {m.reply && (
                <div className="mt-3 bg-emerald-500/5 border-l-2 border-emerald-500/40 pl-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold mb-1">Resposta · {m.replied_by} · {new Date(m.replied_at).toLocaleString("pt-PT")}</div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{m.reply}</p>
                </div>
              )}
              {m.status === "open" && (
                replyOn === m.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      data-testid={`reply-input-${m.id}`}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="A tua resposta…"
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setReplyOn(null); setReply(""); }} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">Cancelar</button>
                      <button data-testid={`send-reply-${m.id}`} onClick={() => submitReply(m)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded px-4 py-2 text-sm flex items-center gap-2">
                        <PaperPlaneTilt size={14} weight="bold" /> Enviar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button data-testid={`reply-btn-${m.id}`} onClick={() => setReplyOn(m.id)} className="mt-3 text-xs px-3 py-1.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-1.5">
                    <PaperPlaneTilt size={12} weight="duotone" /> Responder
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowSend(false)} data-testid="send-msg-modal">
          <form onSubmit={submitSend} onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-3">
            <h3 className="font-outfit text-xl font-semibold">Nova mensagem para sócio</h3>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Sócio</label>
              <select required data-testid="send-msg-socio" value={sendForm.client_id} onChange={(e) => setSendForm({ ...sendForm, client_id: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
                <option value="">— Escolher —</option>
                {socios.map((s) => <option key={s.id} value={s.id}>{s.name}{s.member_number ? ` · nº ${s.member_number}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Assunto</label>
              <input required data-testid="send-msg-subject" value={sendForm.subject} onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Mensagem</label>
              <textarea required rows={5} data-testid="send-msg-body" value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowSend(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button data-testid="send-msg-submit" type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Enviar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
