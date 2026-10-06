import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { IdentificationCard, Star, SoccerBall, Warning } from "@phosphor-icons/react";
import api from "../lib/api";

/**
 * Cartão de Sócio Digital — QR dinâmico (roda a cada minuto, HMAC do nº de sócio).
 * O staff valida no portal com POST /api/socio/card-verify.
 */
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
          <IdentificationCard size={22} weight="duotone" className="text-amber-400" />
          <h3 className="font-outfit text-xl font-semibold">Cartão de Sócio Digital</h3>
        </div>

        <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-green-700 to-green-800 p-5">
          <div className="flex items-center justify-center gap-2 mb-3 text-white">
            <SoccerBall size={26} weight="duotone" className="text-amber-300" />
            <div className="text-left">
              <div className="font-outfit font-bold leading-tight">ARD<span className="text-amber-300">.</span></div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-green-100/70 -mt-0.5">Nespereira</div>
            </div>
          </div>
          <div className="w-20 h-20 mx-auto rounded-full bg-white/10 border-2 border-amber-400 flex items-center justify-center font-bold text-2xl text-amber-300">
            {client.name?.[0]?.toUpperCase()}
          </div>
          <div className="mt-3 font-outfit text-lg font-bold text-white truncate">{client.name}</div>
          <div className="text-[11px] text-green-100/80">Sócio nº {client.member_number}</div>
          <div className="mt-3 flex justify-center" data-testid="socio-card-qr">
            {card ? (
              <div className="bg-white p-2.5 rounded-lg">
                <QRCodeSVG value={card.code} size={150} level="M" />
              </div>
            ) : (
              <div className="w-[166px] h-[166px] rounded-lg bg-white/20 animate-pulse" />
            )}
          </div>
          {card && (
            <div className="mt-2" data-testid="socio-card-code">
              <div className="text-[10px] uppercase tracking-[0.2em] text-green-100/70">Código (muda a cada minuto)</div>
              <div className="font-mono font-bold text-amber-300 text-sm">{card.code}</div>
              <div className="text-[10px] text-green-100/70">
                <Star size={9} weight="fill" className="inline -mt-0.5" /> válido por {card.valid_seconds}s
              </div>
            </div>
          )}
          {error && (
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-rose-200" data-testid="socio-card-error">
              <Warning size={12} /> {error}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500 mt-4">
          Mostra este cartão ao staff para validar. O código roda a cada minuto — o QR antigo deixa de valer.
        </p>
        <button onClick={onClose} className="mt-3 w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium">
          Fechar
        </button>
      </div>
    </div>
  );
}
