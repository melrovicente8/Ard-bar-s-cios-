import React, { useEffect, useRef, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { X, PaperPlaneTilt, Sparkle } from "@phosphor-icons/react";

/**
 * Lagarto Amarelo — assistente de IA da ARDN (Gemini no backend).
 * Responde só a temas do clube (prompt restritivo em backend/server.py).
 * scope="staff" usa /api/ai-assistant · scope="socio" usa /api/socio/ai-assistant
 */
const GREETING =
  "Olá! Sou o Lagarto Amarelo 🦎 o assistente da ARDN. Pergunta-me o que quiseres sobre o clube: quotas, pontos, bar, app, rodadas mistas ou histórico.";

const SUGGESTIONS = {
  staff: [
    "Como aprovo um pedido de cotas na app?",
    "Como funciona a divisão da Rodada Mista?",
    "Quais são os estatutos da ARDN?",
  ],
  socio: [
    "Como funcionam os pontos?",
    "Como pago as minhas cotas?",
    "O que é a Rodada Mista?",
  ],
};

export default function LagartoAmarelo({ scope = "staff" }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING, greeting: true }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, busy]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    const history = messages
      .filter((m) => !m.greeting)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setBusy(true);
    try {
      const { data } = await api.post(scope === "socio" ? "/socio/ai-assistant" : "/ai-assistant", {
        message: question,
        history,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: formatApiErrorDetail(e.response?.data?.detail), error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="lagarto-fab"
        onClick={() => setOpen((v) => !v)}
        title="Lagarto Amarelo · assistente da ARDN"
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 flex items-center justify-center text-2xl border border-amber-300/50"
      >
        {open ? <X size={22} weight="bold" /> : "🦎"}
      </button>

      {open && (
        <div
          data-testid="lagarto-panel"
          className="fixed bottom-24 right-4 z-40 w-[min(92vw,390px)] h-[min(72vh,560px)] bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950/60">
            <span className="text-xl">🦎</span>
            <div className="min-w-0">
              <div className="font-outfit font-bold text-amber-300 leading-tight">Lagarto Amarelo</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Assistente IA · só temas ARDN
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto p-1.5 rounded bg-slate-800 text-slate-400">
              <X size={14} weight="bold" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" data-testid="lagarto-messages">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-xl px-3 py-2 whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-amber-500 text-slate-950 ml-8"
                    : m.error
                      ? "bg-rose-500/10 border border-rose-500/30 text-rose-200 mr-8"
                      : "bg-slate-800/70 text-slate-200 mr-8"
                }`}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="text-xs text-slate-500 px-1 animate-pulse">O Lagarto Amarelo está a pensar…</div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {(SUGGESTIONS[scope] || SUGGESTIONS.staff).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={busy}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-amber-500/30 text-amber-200/90 hover:bg-amber-500/10 disabled:opacity-40"
                >
                  <Sparkle size={10} weight="fill" className="inline mr-1" />
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-2.5 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              data-testid="lagarto-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escreve a tua pergunta…"
              maxLength={1500}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button
              type="submit"
              data-testid="lagarto-send"
              disabled={busy || !input.trim()}
              className="h-9 w-9 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 flex items-center justify-center"
              title="Enviar"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
