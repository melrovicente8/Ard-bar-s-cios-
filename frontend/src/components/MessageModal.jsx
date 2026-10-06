import React, { useState } from "react";
import { WhatsappLogo, EnvelopeSimple, ChatCircleText, X } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function MessageModal({ client, onClose }) {
  const [text, setText] = useState(`Olá ${client.name}, mensagem da ARD Nespereira.`);

  const send = (channel) => {
    if (channel === "whatsapp") {
      const phone = (client.contact || "").replace(/\D/g, "");
      if (!phone) return toast.error("Sem contacto");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    } else if (channel === "sms") {
      if (!client.contact) return toast.error("Sem contacto");
      window.open(`sms:${client.contact}?body=${encodeURIComponent(text)}`, "_blank");
    } else if (channel === "email") {
      if (!client.email) return toast.error("Sem email");
      window.open(
        `mailto:${client.email}?subject=${encodeURIComponent("ARD Nespereira")}&body=${encodeURIComponent(text)}`,
        "_blank"
      );
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={onClose} data-testid="message-modal">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Enviar mensagem</div>
            <h3 className="font-outfit text-2xl font-semibold mt-1">{client.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800" data-testid="message-modal-close">
            <X size={18} />
          </button>
        </div>
        <textarea
          data-testid="message-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            data-testid="send-whatsapp"
            disabled={!client.contact}
            onClick={() => send("whatsapp")}
            className="px-3 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40 font-medium text-sm flex items-center justify-center gap-1.5"
          >
            <WhatsappLogo size={16} weight="fill" /> WhatsApp
          </button>
          <button
            data-testid="send-sms"
            disabled={!client.contact}
            onClick={() => send("sms")}
            className="px-3 py-2.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-medium text-sm flex items-center justify-center gap-1.5"
          >
            <ChatCircleText size={16} /> SMS
          </button>
          <button
            data-testid="send-email"
            disabled={!client.email}
            onClick={() => send("email")}
            className="px-3 py-2.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-medium text-sm flex items-center justify-center gap-1.5"
          >
            <EnvelopeSimple size={16} /> Email
          </button>
        </div>
      </div>
    </div>
  );
}
