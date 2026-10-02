import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { ChatCircleDots, ChatCircleText, PaperPlaneTilt, Flag } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Chat da comunidade (lado do sócio): ver mensagens, publicar e denunciar.
 * Usado dentro de um modal no portal do sócio.
 */
export default function CommunityChat({ me }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // mensagem a que se está a responder
  const [replyText, setReplyText] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/community/messages");
      setMessages(data.messages || []);
      // marcar como visto
      api.post("/community/seen").catch(() => {});
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post("/community/messages", { message: text.trim() });
      setText("");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    setSending(true);
    try {
      await api.post("/community/messages", { message: replyText.trim(), reply_to: replyTo.id });
      setReplyTo(null);
      setReplyText("");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  const parents = messages.filter((m) => !m.reply_to);
  const repliesBy = {};
  messages.filter((m) => m.reply_to).forEach((m) => {
    (repliesBy[m.reply_to] = repliesBy[m.reply_to] || []).push(m);
  });

  const report = async (m) => {
    if (!window.confirm("Denunciar esta mensagem à direção?")) return;
    try {
      await api.post(`/community/messages/${m.id}/report`);
      toast.success("Mensagem denunciada · a direção vai rever");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="flex flex-col min-h-0" data-testid="community-chat">
      <form onSubmit={send} className="mb-3 bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
          <ChatCircleDots size={12} weight="duotone" /> Chat da comunidade
        </div>
        <textarea
          data-testid="community-new-message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Partilha com os outros sócios… (linguagem apropriada, por favor)"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
        <button
          data-testid="community-send"
          type="submit"
          disabled={sending || !text.trim()}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg py-2 text-sm flex items-center justify-center gap-2"
        >
          <PaperPlaneTilt size={14} weight="bold" /> Publicar
        </button>
      </form>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]" data-testid="community-list">
        {loading ? (
          <div className="text-center text-slate-500 py-6 text-sm">A carregar...</div>
        ) : parents.length === 0 ? (
          <div className="text-center text-slate-500 py-6 text-sm">Ainda sem mensagens. Sê o primeiro!</div>
        ) : (
          parents.map((m) => {
            const own = me && m.client_id === me.id;
            const replies = (repliesBy[m.id] || []).slice().reverse(); // mais antigas primeiro
            return (
              <div
                key={m.id}
                data-testid={`community-msg-${m.id}`}
                className={`rounded-lg px-3 py-2 border text-sm ${own ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/50 border-slate-800"}`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    <span className="font-bold text-slate-300">{m.author_name}</span>
                    {m.member_number ? ` · nº ${m.member_number}` : ""} · {new Date(m.created_at).toLocaleString("pt-PT")}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      data-testid={`community-reply-${m.id}`}
                      onClick={() => { setReplyTo(replyTo?.id === m.id ? null : m); setReplyText(""); }}
                      title="Responder"
                      className="p-1 rounded hover:bg-amber-500/10 text-slate-500 hover:text-amber-400"
                    >
                      <ChatCircleText size={12} weight="duotone" />
                    </button>
                    {!own && (
                      <button
                        data-testid={`community-report-${m.id}`}
                        onClick={() => report(m)}
                        title="Denunciar"
                        className="p-1 rounded hover:bg-rose-500/10 text-slate-500 hover:text-rose-400"
                      >
                        <Flag size={12} weight="duotone" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-slate-200 whitespace-pre-wrap mt-0.5">{m.message}</p>
                {m.original_masked && (
                  <div className="text-[10px] text-amber-500/70 mt-1 italic">※ linguagem filtrada automaticamente</div>
                )}
                {replyTo?.id === m.id && (
                  <div className="mt-2 flex gap-2" data-testid={`community-reply-box-${m.id}`}>
                    <input
                      data-testid={`community-reply-input-${m.id}`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      maxLength={2000}
                      autoFocus
                      placeholder={`Responder a ${m.author_name}…`}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <button
                      data-testid={`community-reply-send-${m.id}`}
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs"
                    >Enviar</button>
                  </div>
                )}
                {replies.length > 0 && (
                  <ul className="mt-2 ml-3 pl-3 border-l-2 border-slate-800 space-y-1.5" data-testid={`community-replies-${m.id}`}>
                    {replies.map((r) => (
                      <li key={r.id} data-testid={`community-reply-msg-${r.id}`} className="text-[13px]">
                        <div className="text-[10px] text-slate-500">
                          <span className="font-bold text-slate-400">↳ {r.author_name}</span>
                          {r.member_number ? ` · nº ${r.member_number}` : ""} · {new Date(r.created_at).toLocaleString("pt-PT")}
                        </div>
                        <p className="text-slate-200 whitespace-pre-wrap">{r.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
