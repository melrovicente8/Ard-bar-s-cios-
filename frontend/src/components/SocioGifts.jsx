import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  Gift,
  Coins,
  PencilSimple,
  Check,
  X,
  Plus,
  Handshake,
  ChatDots,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const GIFT_STATUS = {
  requested: { label: "À espera de aceitação", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  accepted: { label: "Aceite · por confirmar", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  rejected: { label: "Recusado", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  paid: { label: "Pago · disponível", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  claimed: { label: "Solicitado · a servir", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  pending: { label: "Pendente a servir", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  served: { label: "Servido", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  consumed: { label: "Consumido", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

export default function SocioGifts({ me }) {
  const [gifts, setGifts] = useState([]);
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [giftKind, setGiftKind] = useState("prepaid"); // prepaid | delegated
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftCart, setGiftCart] = useState({});
  const [giftNote, setGiftNote] = useState("");
  const [editingGift, setEditingGift] = useState(null); // gift em edição (payer delegado)
  const [saving, setSaving] = useState(false);

  const loadGifts = async () => {
    try {
      const { data } = await api.get("/socio/gifts");
      setGifts(data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadGifts();
    api.get("/socio/members").then((r) => setMembers(r.data || [])).catch(() => {});
    api.get("/socio/products").then((r) => setProducts(r.data || [])).catch(() => {});
  }, []);

  const cartEntries = Object.entries(giftCart).filter(([, q]) => q > 0);
  const cartTotal = cartEntries.reduce((s, [pid, q]) => s + (products.find((p) => p.id === pid)?.price || 0) * q, 0);

  const openModal = (kind) => {
    setGiftKind(kind);
    setGiftRecipient("");
    setGiftCart({});
    setGiftNote("");
    setEditingGift(null);
    setShowModal(true);
  };

  const startEditGift = (g) => {
    const cart = {};
    (g.items || []).forEach((it) => { cart[it.product_id] = it.quantity; });
    setGiftCart(cart);
    setGiftNote(g.note || "");
    setEditingGift(g);
    setShowModal(true);
  };

  const submitGift = async () => {
    if (!cartEntries.length) return;
    setSaving(true);
    try {
      const items = cartEntries.map(([pid, q]) => ({ product_id: pid, quantity: q }));
      if (editingGift) {
        await api.put(`/socio/gifts/${editingGift.id}`, { items, note: giftNote || null });
        toast.success("Itens atualizados");
      } else {
        await api.post("/socio/gifts", { kind: giftKind, recipient_id: giftRecipient, items, note: giftNote || null });
        toast.success(giftKind === "prepaid" ? "Consumo pago · o sócio foi notificado" : "Pedido enviado · à espera de aceitação");
      }
      setShowModal(false);
      setEditingGift(null);
      await loadGifts();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const action = async (g, verb, msg) => {
    try {
      await api.post(`/socio/gifts/${g.id}/${verb}`);
      toast.success(msg);
      await loadGifts();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const recipientOf = (g) => (g.recipient_id === me.id ? g.payer_name : g.recipient_name);

  const renderActions = (g) => {
    const isPayer = g.payer_id === me.id;
    const isRecipient = g.recipient_id === me.id;
    if (isPayer && g.kind === "delegated" && g.status === "accepted") {
      return (
        <div className="flex gap-1.5">
          <button
            data-testid={`socio-gift-edit-${g.id}`}
            onClick={() => startEditGift(g)}
            className="text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1"
          >
            <PencilSimple size={11} weight="bold" /> Editar itens
          </button>
          <button
            data-testid={`socio-gift-confirm-${g.id}`}
            onClick={() => action(g, "confirm", "Confirmado · pedido pendente a servir")}
            className="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1 font-bold"
          >
            <Check size={11} weight="bold" /> Confirmar e pagar
          </button>
        </div>
      );
    }
    if (isPayer && g.kind === "delegated" && g.status === "requested") {
      return (
        <div className="flex gap-1.5">
          <button
            data-testid={`socio-gift-accept-${g.id}`}
            onClick={() => action(g, "accept", "Aceitaste · agora edita os itens e confirma quando quiseres pagar")}
            className="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1 font-bold"
          >
            <Handshake size={11} weight="bold" /> Aceitar
          </button>
          <button
            data-testid={`socio-gift-reject-${g.id}`}
            onClick={() => action(g, "reject", "Recusado · nada foi cobrado")}
            className="text-[10px] px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 flex items-center gap-1"
          >
            <X size={11} /> Recusar
          </button>
        </div>
      );
    }
    if (isRecipient && g.status === "paid") {
      return (
        <button
          data-testid={`socio-gift-claim-${g.id}`}
          onClick={() => action(g, "claim", "Bónus solicitado · o staff vai servir-te")}
          className="text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1 font-bold"
        >
          <Gift size={11} weight="bold" /> Solicitar bónus
        </button>
      );
    }
    if (isRecipient && g.status === "served") {
      return (
        <button
          data-testid={`socio-gift-consume-${g.id}`}
          onClick={() => action(g, "consume", "Confirmado · obrigado!")}
          className="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1 font-bold"
        >
          <Check size={11} weight="bold" /> Consumido
        </button>
      );
    }
    if (isRecipient && (g.status === "claimed" || g.status === "pending")) {
      return <span className="text-[10px] text-slate-500 flex items-center gap-1"><ChatDots size={11} /> A servir…</span>;
    }
    return null;
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6" data-testid="socio-gifts">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Gift size={20} weight="duotone" className="text-pink-400" />
        <h3 className="font-outfit text-xl font-semibold">Consumos entre sócios</h3>
        <span className="text-xs text-slate-500 ml-auto">Deixa pago um consumo a outro sócio ou pede-lhe para pagar a despesa</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          data-testid="socio-gift-new-prepaid"
          onClick={() => openModal("prepaid")}
          className="text-xs px-3 py-1.5 rounded-md bg-pink-500/15 text-pink-300 border border-pink-500/30 hover:bg-pink-500/25 flex items-center gap-1.5"
        >
          <Gift size={13} weight="bold" /> Deixar pago a outro sócio
        </button>
        <button
          data-testid="socio-gift-new-delegated"
          onClick={() => openModal("delegated")}
          className="text-xs px-3 py-1.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 flex items-center gap-1.5"
        >
          <Coins size={13} weight="duotone" /> Pedir a outro sócio para pagar
        </button>
      </div>

      {gifts.length === 0 ? (
        <div className="text-sm text-slate-500 py-6 text-center">Ainda não há consumos entre sócios.</div>
      ) : (
        <ul className="space-y-2 mt-4">
          {gifts.slice(0, 10).map((g) => {
            const st = GIFT_STATUS[g.status] || { label: g.status, cls: "" };
            const isPayer = g.payer_id === me.id;
            return (
              <li
                key={g.id}
                data-testid={`socio-gift-${g.id}`}
                className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-slate-950/40 border-slate-800"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500">
                    {new Date(g.created_at).toLocaleString("pt-PT")} ·{" "}
                    {isPayer ? (
                      <span className="text-amber-300">Pagas tu · consome <strong>{g.recipient_name}</strong> (nº {g.recipient_member_number})</span>
                    ) : (
                      <span className="text-sky-300"><strong>{g.payer_name}</strong> (nº {g.payer_member_number}) paga · consome tu</span>
                    )}
                    {" · "}{g.kind === "prepaid" ? "Deixado pago" : "Pagamento delegado"}
                  </div>
                  <ul className="text-xs text-slate-400 mt-1 space-y-0.5">
                    {(g.items || []).map((it, j) => (
                      <li key={j}>{it.quantity}× {it.product_name} · {euro(it.subtotal)}</li>
                    ))}
                  </ul>
                  {g.note && <div className="text-[10px] text-slate-500 mt-0.5 italic">"{g.note}"</div>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="font-bold text-pink-300">{euro(g.total)}</div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>{st.label}</span>
                  {renderActions(g)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => { setShowModal(false); setEditingGift(null); }} data-testid="socio-gift-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Gift size={22} weight="duotone" className="text-pink-400" />
              <h3 className="font-outfit text-xl font-semibold">{editingGift ? "Editar itens a pagar" : giftKind === "prepaid" ? "Deixar pago a outro sócio" : "Pedir a outro sócio para pagar"}</h3>
            </div>
            {!editingGift && (
              <>
                <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/60 p-1 mb-3" data-testid="socio-gift-kind">
                  <button
                    type="button"
                    onClick={() => setGiftKind("prepaid")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold ${giftKind === "prepaid" ? "bg-pink-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                  >
                    Deixar pago
                  </button>
                  <button
                    type="button"
                    onClick={() => setGiftKind("delegated")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold ${giftKind === "delegated" ? "bg-sky-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                  >
                    Delegar pagamento
                  </button>
                </div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{giftKind === "prepaid" ? "Sócio que vai consumir" : "Sócio que vai pagar"}</label>
                <select
                  data-testid="socio-gift-recipient"
                  value={giftRecipient}
                  onChange={(e) => setGiftRecipient(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm mb-3"
                >
                  <option value="">— Escolhe o sócio —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} (nº {m.member_number})</option>
                  ))}
                </select>
              </>
            )}
            {giftKind === "prepaid" && !editingGift && (
              <p className="text-xs text-amber-300/80 mb-3">O valor é lançado imediatamente na tua conta. O sócio fica notificado que o consumo está pago.</p>
            )}
            {giftKind === "delegated" && !editingGift && (
              <p className="text-xs text-sky-300/80 mb-3">O pedido só se transforma em serviço quando o outro sócio aceitar e confirmar o pagamento.</p>
            )}

            {cartEntries.length > 0 && (
              <div className="mb-3 bg-slate-950 border border-pink-500/30 rounded-lg p-2 max-h-52 overflow-y-auto" data-testid="socio-gift-cart">
                <div className="text-[10px] uppercase tracking-wider text-pink-400 font-bold mb-1.5 px-1">{editingGift ? "Itens a pagar" : "No carrinho"}</div>
                {cartEntries.map(([pid, q]) => {
                  const p = products.find((x) => x.id === pid);
                  return (
                    <div key={pid} className="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-slate-800 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">{p ? p.name : "Produto"}</div>
                        <div className="text-[10px] text-slate-500">{euro(p ? p.price : 0)} · subtotal {euro((p ? p.price : 0) * q)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setGiftCart({ ...giftCart, [pid]: q - 1 })} className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 font-bold">−</button>
                        <span className="min-w-[24px] text-center font-bold text-pink-300 text-sm">{q}</span>
                        <button type="button" onClick={() => setGiftCart({ ...giftCart, [pid]: q + 1 })} disabled={p ? q >= p.available_quantity : true} className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 font-bold disabled:opacity-30">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="overflow-y-auto flex-1 mb-3 border border-slate-800 rounded-lg">
              {products.length === 0 ? (
                <div className="text-sm text-slate-500 py-6 text-center">Sem produtos disponíveis.</div>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {products.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{euro(p.price)} · disponível: {p.available_quantity}</div>
                      </div>
                      <button
                        type="button"
                        data-testid={`socio-gift-add-${p.id}`}
                        onClick={() => setGiftCart({ ...giftCart, [p.id]: (giftCart[p.id] || 0) + 1 })}
                        disabled={giftCart[p.id] >= p.available_quantity}
                        className="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-base font-bold disabled:opacity-30 shrink-0"
                        title="Adicionar"
                      >
                        +
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <input
              data-testid="socio-gift-note"
              value={giftNote}
              onChange={(e) => setGiftNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm mb-3 placeholder-slate-500"
            />

            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</span>
              <span data-testid="socio-gift-total" className="font-outfit text-xl font-bold text-pink-300">{euro(cartTotal)}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowModal(false); setEditingGift(null); }} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button
                data-testid="socio-gift-submit"
                onClick={submitGift}
                disabled={saving || !cartEntries.length || (!editingGift && !giftRecipient)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-slate-950 font-bold"
              >
                {editingGift ? "Guardar itens" : giftKind === "prepaid" ? "Pagar e deixar ao sócio" : "Enviar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
