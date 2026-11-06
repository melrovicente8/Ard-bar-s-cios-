import React, { useState } from "react";
import { Printer, PaperPlaneTilt } from "@phosphor-icons/react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";

/**
 * 2ª via: pergunta se o ticket deve ser enviado para o sócio do próprio ticket
 * (nunca outro) ou apenas visualizado/imprimido.
 */
export default function SecondCopyDialog({ tx, client, onView, onClose }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!tx) return null;

  const isPayment = !tx.items;
  const total = isPayment ? (tx.total_credited ?? tx.amount ?? 0) : (tx.total ?? 0);
  const canSend = !!client?.is_member && !!client?.id;

  const send = async () => {
    setSending(true);
    try {
      const lines = [
        `${isPayment ? "Recibo de pagamento" : "Venda"} nº ${tx.tx_number ?? "—"}`,
        `Data: ${tx.created_at ? new Date(tx.created_at).toLocaleString("pt-PT") : "—"}`,
        `Valor: ${euro(total)}`,
      ];
      if (!isPayment && Array.isArray(tx.items) && tx.items.length) {
        lines.push("Itens: " + tx.items.map((it) => `${it.quantity}× ${it.product_name}`).join(", "));
      }
      lines.push("", "2ª via solicitada no balcão.");
      await api.post("/socio-messages/send-to-socio", {
        client_id: client.id,
        subject: `2ª via do ticket #${tx.tx_number ?? "—"}`,
        message: lines.join("\n"),
      });
      setSent(true);
      toast.success(`2ª via enviada para ${client.name}`);
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="second-copy-dialog"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
      >
        <div className="flex items-center gap-2 mb-2">
          <Printer size={22} weight="duotone" className="text-amber-400" />
          <h3 className="font-outfit text-xl font-semibold">2ª via · #{tx.tx_number ?? "—"}</h3>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Cliente</span>
            <span className="text-slate-200 font-medium">
              {client?.name || tx.client_name || "—"}
              {client?.member_number ? ` · nº ${client.member_number}` : ""}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Valor</span>
            <span className="text-amber-300 font-bold">{euro(total)}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {canSend
            ? "Podes enviar esta 2ª via para o sócio deste ticket (só para ele) ou apenas visualizar."
            : "Este ticket não é de um sócio — só é possível visualizar/imprimir."}
        </p>
        <div className="flex flex-col gap-2">
          <button
            data-testid="second-copy-send"
            onClick={send}
            disabled={!canSend || sending || sent}
            className="w-full px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold flex items-center justify-center gap-2"
          >
            <PaperPlaneTilt size={16} weight="bold" />
            {sending ? "A enviar..." : sent ? "Enviado" : "Enviar para o sócio"}
          </button>
          <button
            data-testid="second-copy-view"
            onClick={() => { onView(); onClose(); }}
            className="w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center justify-center gap-2"
          >
            <Printer size={16} weight="duotone" /> Apenas visualizar
          </button>
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg text-slate-400 hover:text-white text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
