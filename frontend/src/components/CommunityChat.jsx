import React, { useEffect, useState, useRef, useCallback } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { ChatCircleDots, PaperPlaneTilt, Flag, Smiley, X, ArrowBendUpLeft, Checks } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Chat da comunidade (lado do sócio) — estilo Messenger/WhatsApp:
 * bolhas de conversa (as próprias à direita), respostas citadas dentro da bolha,
 * separadores de data, emojis rápidos e atualização automática.
 * Usado dentro de um modal no portal do sócio.
 */

const EMOJIS = ["😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😅", "👍", "👏", "🙏", "💪", "🔥", "⚽", "🏆", "🍺", "🎉", "❤️"];

const initialsOf = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoje";
  if (same(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-PT");
}

export default function CommunityChat({ me }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // mensagem a que se está a responder
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef(null);
  const byId = useRef({});

  const scrollToEnd = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await api.get("/community/messages");
      const items = data.messages || [];
      byId.current = {};
      items.forEach((m) => { byId.current[m.id] = m; });
      setMessages(items);
      api.post("/community/seen").catch(() => {});
    } catch (e) {
      if (!quiet) toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Atualização automática (estilo WhatsApp) + scroll para a última mensagem
  useEffect(() => {
    const t = setInterval(() => load(true), 12000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { scrollToEnd(); }, [messages, loading, scrollToEnd]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post("/community/messages", {
        message: text.trim(),
        reply_to: replyTo ? replyTo.id : undefined,
      });
      setText("");
      setReplyTo(null);
      await load(true);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  const onComposerKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const report = async (m) => {
    if (!window.confirm("Denunciar esta mensagem à direção?")) return;
    try {
      await api.post(`/community/messages/${m.id}/report`);
      toast.success("Mensagem denunciada · a direção vai rever");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  // Cronológico: da mais antiga (topo) para a mais recente (fim), como no Messenger
  const items = messages.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="flex flex-col h-[60vh] min-h-0" data-testid="community-chat">
      <div className="flex items-center gap-1.5 px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
        <ChatCircleDots size={12} weight="duotone" /> Chat da comunidade
      </div>

      {/* Lista de conversa — bolhas estilo Messenger/WhatsApp */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-1 py-2 space-y-1.5 min-h-0"
        data-testid="community-list"
      >
        {loading ? (
          <div className="text-center text-slate-500 py-6 text-sm">A carregar...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-slate-500 py-6 text-sm">Ainda sem mensagens. Sê o primeiro!</div>
        ) : (
          items.map((m, i) => {
            const own = me && m.client_id === me.id;
            const prev = items[i - 1];
            const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            const parent = m.reply_to ? byId.current[m.reply_to] : null;
            const bubbleBase = "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm";
            const bubble = own
              ? `${bubbleBase} bg-emerald-700/30 border border-emerald-500/25 rounded-br-md ml-auto`
              : `${bubbleBase} bg-slate-800/80 border border-slate-700/60 rounded-bl-md`;
            return (
              <React.Fragment key={m.id}>
                {showDay && (
                  <div className="flex justify-center py-1.5">
                    <span className="px-3 py-0.5 rounded-full bg-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div
                  data-testid={`community-msg-${m.id}`}
                  className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}
                >
                  {!own && (
                    <div
                      title={m.author_name}
                      className="w-7 h-7 shrink-0 rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 flex items-center justify-center border border-slate-600"
                    >
                      {initialsOf(m.author_name)}
                    </div>
                  )}
                  <div className={`group relative ${bubble}`}>
                    {m.reply_to && (
                      <div
                        data-testid={`community-quote-${m.id}`}
                        className="mb-1 border-l-2 border-amber-400/70 bg-black/20 rounded px-2 py-1 cursor-pointer"
                        onClick={() => { const p = parent; if (p) listRef.current?.querySelector(`[data-testid="community-msg-${p.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                      >
                        <div className="text-[10px] font-bold text-amber-300 truncate">{parent ? parent.author_name : "Mensagem"}</div>
                        <div className="text-[11px] text-slate-400 truncate">{parent ? parent.message : "mensagem original indisponível"}</div>
                      </div>
                    )}
                    {!own && (
                      <div className="text-[10px] font-bold text-slate-300 mb-0.5">
                        {m.author_name}{m.member_number ? ` · nº ${m.member_number}` : ""}
                      </div>
                    )}
                    <p className="text-slate-100 whitespace-pre-wrap break-words">{m.message}</p>
                    {m.original_masked && (
                      <div className="text-[10px] text-amber-500/70 mt-0.5 italic">※ linguagem filtrada automaticamente</div>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-slate-400/80">
                      {new Date(m.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      {own && <Checks size={12} weight="bold" className="text-emerald-400" aria-label="Enviada" />}
                    </div>
                    {/* Ações: responder / denunciar — visíveis ao passar o rato */}
                    <div className={`absolute top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${own ? "-left-14" : "-right-14"}`}>
                      <button
                        data-testid={`community-reply-${m.id}`}
                        onClick={() => { setReplyTo(replyTo?.id === m.id ? null : m); setShowEmoji(false); }}
                        title="Responder"
                        className="p-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-amber-400"
                      >
                        <ArrowBendUpLeft size={12} weight="duotone" />
                      </button>
                      {!own && (
                        <button
                          data-testid={`community-report-${m.id}`}
                          onClick={() => report(m)}
                          title="Denunciar"
                          className="p-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-400"
                        >
                          <Flag size={12} weight="duotone" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Compositor fixo no fundo — estilo WhatsApp */}
      <div className="pt-2">
        {replyTo && (
          <div className="mb-1.5 bg-slate-950/80 border-l-2 border-amber-400 rounded-r-lg px-3 py-1.5 flex items-center gap-2" data-testid="community-reply-preview">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-amber-300">A responder a {replyTo.author_name}</div>
              <div className="text-[11px] text-slate-400 truncate">{replyTo.message}</div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white"
              title="Cancelar resposta"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        )}
        {showEmoji && (
          <div className="mb-1.5 bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-wrap gap-1 max-h-28 overflow-y-auto" data-testid="community-emoji-picker">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setText((t) => (t + e))}
                className="w-8 h-8 rounded hover:bg-slate-800 text-lg leading-none"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5 bg-slate-950/80 border border-slate-800 rounded-full px-2 py-1.5">
          <button
            type="button"
            data-testid="community-emoji-btn"
            onClick={() => setShowEmoji((s) => !s)}
            className="p-2 rounded-full text-slate-400 hover:text-amber-400 shrink-0"
            title="Emojis"
          >
            <Smiley size={20} weight="duotone" />
          </button>
          <textarea
            data-testid="community-new-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onComposerKey}
            rows={1}
            maxLength={2000}
            placeholder="Escreve uma mensagem… (linguagem apropriada, por favor)"
            className="flex-1 bg-transparent border-0 focus:outline-none text-white text-sm resize-none max-h-24 py-1.5"
          />
          <button
            data-testid="community-send"
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="p-2 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold shrink-0"
            title="Enviar"
          >
            <PaperPlaneTilt size={16} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
