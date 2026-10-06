import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Warning, SealCheck } from "@phosphor-icons/react";
import api from "../lib/api";

/**
 * Cartão de Sócio Digital — réplica do cartão físico da ARD Nespereira
 * (fundo verde, brasão ARD, cabeçalho da associação, selo branco de quota).
 * QR dinâmico (roda a cada minuto, HMAC do nº de sócio).
 * O staff valida no portal com POST /api/socio/card-verify.
 */

const CREST = (
  <svg viewBox="0 0 100 110" className="w-16 h-[70px] drop-shadow-sm" aria-label="Brasão ARD">
    {/* escudo */}
    <path
      d="M50 4 L94 16 V62 C94 86 74 100 50 108 C26 100 6 86 6 62 V16 Z"
      fill="#f2a93b" stroke="#2b2b23" strokeWidth="4"
    />
    {/* faixa diagonal vermelha */}
    <path d="M6 30 L94 62 L94 78 L6 46 Z" fill="#c0392b" stroke="#2b2b23" strokeWidth="2" />
    {/* letras ARD */}
    <text x="50" y="42" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold" fontSize="30" fill="#2b2b23">ARD</text>
    {/* bola */}
    <circle cx="50" cy="80" r="13" fill="#fff" stroke="#2b2b23" strokeWidth="2.5" />
    <path d="M50 70 L58 76 L55 86 L45 86 L42 76 Z" fill="#2b2b23" />
  </svg>
);

export default function SocioDigitalCard({ client, onClose }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      try {
        const { data } = await api.get("/socio/card-code");
        if (alive) {
          setCard(data);
          setError("");
          timer = setTimeout(load, Math.max((data.valid_seconds || 60) * 1000, 1000));
        }
      } catch (e) {
        if (alive) setError("Não foi possível obter o código do cartão.");
      }
    };
    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const now = new Date();
  const mes = now.toLocaleDateString("pt-PT", { month: "long" }).toUpperCase();
  const ano = now.getFullYear();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="socio-card-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-4">
          <SealCheck size={22} weight="duotone" className="text-amber-400" />
          <h3 className="font-outfit text-xl font-semibold">Cartão de Sócio Digital</h3>
        </div>

        {/* ==== cartão (réplica do físico) ==== */}
        <div
          className="relative overflow-hidden rounded-lg border-2 border-[#4a5d3a] text-left shadow-lg"
          style={{
            background:
              "repeating-linear-gradient(115deg, #7ea34d 0 9px, #74994a 9px 14px, #86ab54 14px 26px)",
          }}
          data-testid="socio-card-visual"
        >
          {/* desgaste/mancha clara ao centro, como no original */}
          <div className="absolute left-1/3 top-1/2 w-24 h-16 rounded-full bg-white/20 blur-xl pointer-events-none" />

          {/* cabeçalho */}
          <div className="relative px-4 pt-3 pb-1 text-center">
            <div
              className="font-serif italic font-bold text-[#1f2a15] leading-tight text-[13px]"
              style={{ textShadow: "0 1px 0 rgba(255,255,255,0.25)" }}
            >
              Associação Recreativa e Desportiva de Nespereira
            </div>
          </div>

          {/* brasão + sócio nº */}
          <div className="relative flex items-start px-4 pt-1">
            <div className="shrink-0">{CREST}</div>
            <div className="ml-auto text-right pt-1 pr-1">
              <div className="font-serif font-bold text-[#1f2a15] text-sm">Sócio nº {client.member_number}</div>
            </div>
          </div>

          {/* corpo: selo branco de quota sobreposto à direita */}
          <div className="relative px-4 pb-3 pt-1">
            <div className="absolute right-3 -top-1 w-[38%] bg-[#f7f5ee] border border-[#d8d4c4] rounded-sm shadow-md px-2 py-1.5 text-center rotate-1">
              <div className="text-[9px] font-bold text-[#2b6cb0] tracking-wide leading-tight">ARD</div>
              <div className="text-[9px] font-bold text-[#2b6cb0] tracking-wide leading-tight">NESPEREIRA</div>
              <div className="text-[11px] font-bold text-[#1f7a34] leading-tight">{mes}</div>
              <div className="text-[10px] font-bold text-[#333] leading-tight">
                20<span className="underline">{String(ano).slice(2)}</span>
              </div>
              <div className="text-[9px] text-[#333] leading-tight mt-0.5">Sócio N.º <span className="underline font-bold">{client.member_number}</span></div>
              <div className="text-[11px] font-bold text-[#1a1a6b] underline leading-tight">12,00 €</div>
            </div>
            {/* lagarto decorativo */}
            <div
              className="absolute left-[46%] top-0 text-2xl opacity-40 select-none pointer-events-none"
              style={{ transform: "rotate(-12deg)" }}
              aria-hidden="true"
            >🦎</div>
          </div>

          {/* nome */}
          <div className="relative px-4 pb-3">
            <div className="font-serif italic font-bold text-[#1f2a15] text-sm inline">Nome:</div>
            <span className="ml-2 font-serif font-bold text-[#1f2a15] text-sm inline-block max-w-[55%] truncate align-bottom">{client.name}</span>
          </div>
        </div>

        {/* ==== QR de validação (branco, como um selo colado ao cartão) ==== */}
        <div className="relative -mt-6 flex justify-center" data-testid="socio-card-qr">
          {card ? (
            <div className="bg-white p-2.5 rounded-lg shadow-lg border-2 border-[#4a5d3a]">
              <QRCodeSVG value={card.code} size={120} level="M" />
            </div>
          ) : (
            <div className="w-[140px] h-[140px] rounded-lg bg-white/20 animate-pulse" />
          )}
        </div>
        {card && (
          <div className="mt-2" data-testid="socio-card-code">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Código (muda a cada minuto)</div>
            <div className="font-mono font-bold text-amber-300 text-sm">{card.code}</div>
            <div className="text-[10px] text-slate-400">válido por {card.valid_seconds}s</div>
          </div>
        )}
        {error && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-rose-300" data-testid="socio-card-error">
            <Warning size={12} /> {error}
          </div>
        )}

        <p className="text-[11px] text-slate-500 mt-3">
          Mostra este cartão ao staff para validar. O código roda a cada minuto — o QR antigo deixa de valer.
        </p>
        <button onClick={onClose} className="mt-3 w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">
          Fechar
        </button>
      </div>
    </div>
  );
}
