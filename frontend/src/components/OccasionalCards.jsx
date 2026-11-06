import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import {
  UserPlus,
  Trash,
  CashRegister,
  ShoppingCart,
  UsersThree,
  PencilSimple,
} from "@phosphor-icons/react";
import PaymentModal from "./PaymentModal";
import OccasionalCardEditor from "./OccasionalCardEditor";
import EditableText from "./EditableText";

/**
 * Cartão "Cliente Ocasional / Não Cliente" — fichas temporárias (máx. 3 ativas).
 * Sem cotas, pontos ou app de sócio. Ao liquidar a 0,00 € a ficha é arquivada
 * automaticamente e a vaga fica livre; a venda mantém-se no histórico como
 * "Venda Não Cliente".
 */
export default function OccasionalCards({ onSell = null, onChanged = null, refreshKey = 0 }) {
  const [data, setData] = useState({ cards: [], limit: 3, slots_free: 3 });
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(null); // { client, debt, unpaidSales }
  const [editing, setEditing] = useState(null); // ficha em edição (nome / produtos / transferência)

  const load = async () => {
    try {
      const { data: d } = await api.get("/occasional-clients");
      setData(d);
    } catch (e) {
      // painel auxiliar: não deve partir a página
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const cards = data.cards || [];
  const limit = data.limit || 3;
  const free = Math.max((data.slots_free ?? limit - cards.length), 0);
  const slots = Array.from({ length: limit }, (_, i) => cards.find((c) => c.temp_slot === i + 1) || null);

  const createCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data: card } = await api.post("/occasional-clients", { label: label.trim() || null });
      toast.success(`Ficha "${card.name}" aberta`);
      setLabel("");
      setShowNew(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const discard = async (card) => {
    if (!window.confirm(`Fechar a ficha "${card.name}"?`)) return;
    try {
      await api.delete(`/occasional-clients/${card.id}`);
      toast.success("Ficha temporária fechada");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const openPay = async (card) => {
    try {
      const { data: d } = await api.get(`/clients/${card.id}`);
      const debtIds = new Set((d.debts || []).map((x) => x.sale_id));
      setPaying({
        client: d.client,
        debt: Math.max(Number(d.client?.balance || 0), 0),
        unpaidSales: (d.sales || []).filter((s) => debtIds.has(s.id)),
      });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div
      className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5"
      data-testid="occasional-cards"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400">
            <UsersThree size={20} weight="duotone" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              <EditableText k="occasional.kicker">Consumo ocasional</EditableText>
            </div>
            <h3 className="font-outfit text-lg font-semibold leading-tight">
              <EditableText k="occasional.title">Cliente Ocasional · Não Cliente</EditableText>
            </h3>
            <div className="text-[11px] text-slate-500">
              {cards.length}/{limit} fichas ativas · {free} vaga{free === 1 ? "" : "s"} livre{free === 1 ? "" : "s"} · sem cotas nem pontos
            </div>
          </div>
        </div>
        <button
          data-testid="occasional-new-btn"
          onClick={() => setShowNew((v) => !v)}
          disabled={free === 0 && !showNew}
          className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold flex items-center gap-1.5"
          title={free === 0 ? "Limite de 3 fichas ativas" : "Abrir nova ficha temporária"}
        >
          <UserPlus size={13} weight="bold" /> <EditableText k="occasional.new_btn">Novo Consumo Ocasional</EditableText>
        </button>
      </div>

      {showNew && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2" data-testid="occasional-new-form">
          <input
            data-testid="occasional-new-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createCard()}
            placeholder={`Nome rápido (opcional) — ex.: Mesa 2 · em branco = "Não Cliente #${cards.length + 1}"`}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            maxLength={60}
            autoFocus
          />
          <button
            data-testid="occasional-new-confirm"
            onClick={createCard}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold disabled:opacity-50"
          >
            {busy ? "A abrir..." : "Abrir ficha"}
          </button>
          <button
            onClick={() => { setShowNew(false); setLabel(""); }}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
          >
            Cancelar
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-6 text-center">A carregar...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {slots.map((card, idx) =>
            card ? (
              <div
                key={card.id}
                data-testid={`occasional-card-${card.temp_slot}`}
                className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-sky-300/70">
                      Vaga {card.temp_slot}
                    </div>
                    <div className="font-medium text-slate-100 truncate" title={card.name}>
                      {card.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      data-testid={`occasional-edit-${card.temp_slot}`}
                      onClick={() => setEditing(card)}
                      className="p-1.5 rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      title="Editar nome, produtos ou transferir para um sócio"
                    >
                      <PencilSimple size={12} weight="bold" />
                    </button>
                    <button
                      data-testid={`occasional-discard-${card.temp_slot}`}
                      onClick={() => discard(card)}
                      className="p-1.5 rounded-md bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      title="Fechar esta ficha temporária"
                    >
                      <Trash size={12} weight="bold" />
                    </button>
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">A pagar</span>
                  <span
                    data-testid={`occasional-balance-${card.temp_slot}`}
                    className={`font-outfit text-xl font-bold ${(card.balance || 0) > 0.004 ? "text-rose-300" : "text-slate-400"}`}
                  >
                    {euro(card.balance || 0)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {card.items_count || 0} art. · {card.sales_count || 0} conta{(card.sales_count || 0) === 1 ? "" : "s"} · hoje {euro(card.today_total || 0)}
                </div>
                <div className="flex gap-2 mt-auto">
                  {onSell && (
                    <button
                      data-testid={`occasional-sell-${card.temp_slot}`}
                      onClick={() => onSell(card)}
                      className="flex-1 px-2 py-1.5 rounded-md bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 text-[11px] font-bold flex items-center justify-center gap-1"
                    >
                      <ShoppingCart size={11} weight="bold" /> Vender
                    </button>
                  )}
                  <button
                    data-testid={`occasional-pay-${card.temp_slot}`}
                    onClick={() => openPay(card)}
                    disabled={(card.balance || 0) <= 0.004}
                    className="flex-1 px-2 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center justify-center gap-1"
                  >
                    <CashRegister size={11} weight="bold" /> Cobrar
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={`free-${idx}`}
                data-testid={`occasional-slot-free-${idx + 1}`}
                className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-3 flex flex-col items-center justify-center text-center min-h-[132px]"
              >
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">
                  Vaga {idx + 1}
                </div>
                <div className="text-xs text-slate-500 mt-1">Livre</div>
              </div>
            )
          )}
        </div>
      )}

      {editing && (
        <OccasionalCardEditor
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            load();
            onChanged?.();
          }}
        />
      )}

      {paying && (
        <PaymentModal
          client={paying.client}
          debt={paying.debt}
          unpaidSales={paying.unpaidSales}
          canEditSale={false}
          canCancelSale={false}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            toast.success("Pagamento registado — a ficha temporária fecha sozinha quando fica a 0,00 €");
            load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
