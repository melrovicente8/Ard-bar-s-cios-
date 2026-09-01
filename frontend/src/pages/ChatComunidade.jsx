import React, { useEffect, useState, useRef, useCallback } from "react";
import api from "../lib/api";
import { ChatCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";

const ROLE_LABEL = {
  admin: "Admin",
  tesoureiro: "Tesoureiro",
  funcionario: "Funcionário",
  socio: "Sócio",
};

export default function ChatComunidade() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/messages?limit=100");
      setMessages(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const { data: msg } = await api.post("/chat/messages", { message: text });
      setMessages((prev) => [...prev, msg]);
      setText("");
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 md:p-8 animate-in flex flex-col" style={{ height: "calc(100vh - 4rem)" }} data-testid="chat-page">
      <div className="flex items-center gap-3 mb-4">
        <ChatCircle size={28} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Comunidade</div>
          <h1 className="font-outfit text-2xl sm:text-3xl font-bold tracking-tight">Chat Comunidade</h1>
        </div>
      </div>

      <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-slate-500 text-center py-10">A carregar...</div>
          ) : messages.length === 0 ? (
            <div className="text-slate-500 text-center py-10">
              <ChatCircle size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              Ainda não há mensagens. Sê o primeiro a escrever!
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.user_id === user?.id;
              const isSystem = m.user_type === "system" || m.is_system;
              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="max-w-[90%] rounded-lg px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-center">
                      <div className="text-sm font-bold text-amber-300 whitespace-pre-wrap break-words">{m.message}</div>
                      <div className="text-[9px] mt-0.5 text-amber-500/60">
                        {new Date(m.created_at).toLocaleString("pt-PT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    isMe
                      ? "bg-amber-500 text-slate-950"
                      : m.user_type === "socio"
                      ? "bg-fuchsia-500/15 text-slate-200 border border-fuchsia-500/20"
                      : "bg-slate-800 text-slate-200"
                  }`}>
                    {!isMe && (
                      <div className="text-[10px] font-bold mb-0.5 flex items-center gap-1.5">
                        {m.user_name}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                          m.user_type === "socio" ? "bg-fuchsia-500/20 text-fuchsia-300" : "bg-slate-700 text-slate-400"
                        }`}>
                          {ROLE_LABEL[m.user_role] || m.user_role}
                        </span>
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.message}</div>
                    <div className={`text-[9px] mt-0.5 ${isMe ? "text-slate-700" : "text-slate-500"}`}>
                      {new Date(m.created_at).toLocaleString("pt-PT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="p-3 border-t border-slate-800 flex gap-2">
          <input
            data-testid="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreve uma mensagem..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <button
            data-testid="chat-send"
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg px-4 py-2.5 flex items-center gap-1.5"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  );
}
