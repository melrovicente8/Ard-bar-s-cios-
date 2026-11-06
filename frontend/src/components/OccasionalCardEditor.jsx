import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import {
  PencilSimple,
  Trash,
  Plus,
  ArrowRight,
  FloppyDisk,
  UsersThree,
  X as XIcon,
} from "@phosphor-icons/react";

/**
 * Edição de uma ficha temporária (Cliente Ocasional / Não Cliente):
 * nome, produtos dos consumos em aberto e transferência para um sócio.
 */
export default function OccasionalCardEditor({ card, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(card.name || "");
  const [sales, setSales] = useState([]);        // consumos em aberto
  const [itemsBySale, setItemsBySale] = useState({}); // {saleId: [{product_id, product_name, unit_price, quantity, house_offer}]}
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [addPick, setAddPick] = useState({});     // {saleId: product_id}
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [detail, prodRes, cliRes] = await Promise.all([
          api.get(`/clients/${card.id}`),
          api.get("/products"),
          api.get("/clients"),
        ]);
        const debtIds = new Set((detail.data.debts || []).map((d) => d.sale_id));
        const open = (detail.data.sales || []).filter((s) => debtIds.has(s.id));
        setSales(open);
        const map = {};
        open.forEach((s) => {
          map[s.id] = (s.items || []).map((it) => ({
            product_id: it.product_id,
            product_name: it.product_name,
            unit_price: it.unit_price || 0,
            quantity: it.quantity,
            house_offer: !!it.house_offer,
          }));
        });
        setItemsBySale(map);
        setProducts((prodRes.data || []).filter((p) => !p.is_house_account));
        setClients((cliRes.data || []).filter((c) => !c.is_temp && c.id !== card.id));
      } catch (e) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail));
      } finally {
        setLoading(false);
      }
    })();
  }, [card.id]);

  const members = useMemo(
    () => clients.filter((c) => c.is_member).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [clients]
  );

  const total = useMemo(
    () =>
      Object.values(itemsBySale).reduce(
        (sum, list) => sum + list.reduce((s, it) => s + (it.unit_price || 0) * it.quantity, 0),
        0
      ),
    [itemsBySale]
  );

  const setQty = (saleId, idx, qty) => {
    setItemsBySale((prev) => {
      const list = [...(prev[saleId] || [])];
      if (!list[idx]) return prev;
      list[idx] = { ...list[idx], quantity: Math.max(0, qty) };
      return { ...prev, [saleId]: list };
    });
  };

  const removeItem = (saleId, idx) => {
    setItemsBySale((prev) => ({
      ...prev,
      [saleId]: (prev[saleId] || []).filter((_, i) => i !== idx),
    }));
  };

  const addItem = (saleId) => {
    const pid = addPick[saleId];
    const prod = products.find((p) => p.id === pid);
    if (!prod) return;
    setItemsBySale((prev) => {
      const list = [...(prev[saleId] || [])];
      const existing = list.findIndex((it) => it.product_id === pid);
      if (existing >= 0) list[existing] = { ...list[existing], quantity: list[existing].quantity + 1 };
      else
        list.push({
          product_id: prod.id,
          product_name: prod.name,
          unit_price: prod.price || 0,
          quantity: 1,
          house_offer: false,
        });
      return { ...prev, [saleId]: list };
    });
    setAddPick((prev) => ({ ...prev, [saleId]: "" }));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== card.name) {
        await api.put(`/clients/${card.id}`, { name: trimmed });
      }
      for (const sale of sales) {
        const list = itemsBySale[sale.id] || [];
        const before = (sale.items || []).map((it) => `${it.product_id}:${it.quantity}:${it.house_offer ? 1 : 0}`).join("|");
        const after = list
          .filter((it) => it.quantity > 0)
          .map((it) => `${it.product_id}:${it.quantity}:${it.house_offer ? 1 : 0}`)
          .join("|");
        if (before === after) continue;
        const items = list
          .filter((it) => it.quantity > 0)
          .map((it) => ({ product_id: it.product_id, quantity: it.quantity, house_offer: !!it.house_offer }));
        if (!items.length) {
          toast.error("Cada conta tem de ter pelo menos 1 produto — usa o caixote para fechar a ficha");
          setBusy(false);
          return;
        }
        await api.put(`/sales/${sale.id}`, { items });
      }
      toast.success("Ficha atualizada");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    if (!target) return toast.error("Escolhe o sócio que fica com os consumos");
    const t = members.find((c) => c.id === target);
    if (!window.confirm(`Transferir ${sales.length} conta(s) (${euro(total)}) para ${t?.name}? A ficha temporária fecha.`)) return;
    setBusy(true);
    try {
      await api.post(`/occasional-clients/${card.id}/transfer`, { target_client_id: target });
      toast.success(`Consumos transferidos para ${t?.name}`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start md:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 md:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-5 md:p-6 my-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="occasional-editor"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400/80">
              Ficha temporária · vaga {card.temp_slot}
            </div>
            <h3 className="font-outfit text-xl font-semibold mt-1">Editar consumo ocasional</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Fechar">
            <XIcon size={16} weight="bold" />
          </button>
        </div>

        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nome da ficha</label>
        <input
          data-testid="occasional-edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          placeholder="Ex.: Mesa 2 · casaco preto"
        />

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Produtos em aberto</span>
            <span className="font-outfit text-sm font-bold text-amber-300">{euro(total)}</span>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500 py-6 text-center">A carregar...</div>
          ) : sales.length === 0 ? (
            <div className="text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-lg px-3 py-4 text-center">
              Sem consumos em aberto — não há produtos para editar.
            </div>
          ) : (
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {sales.map((s) => (
                <div key={s.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3" data-testid={`occasional-edit-sale-${s.id}`}>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                    <span>
                      {new Date(s.created_at).toLocaleString("pt-PT")}
                      {s.tx_number ? ` · #${s.tx_number}` : ""}
                    </span>
                    <strong className="text-amber-400">{euro(s.total)}</strong>
                  </div>
                  <div className="space-y-1.5">
                    {(itemsBySale[s.id] || []).map((it, idx) => (
                      <div key={`${it.product_id}-${idx}`} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-0 truncate text-slate-200">
                          {it.product_name}
                          {it.house_offer ? <span className="ml-1 text-[10px] text-fuchsia-300">oferta casa</span> : null}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(s.id, idx, it.quantity - 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                          >−</button>
                          <span className="min-w-[20px] text-center font-bold text-xs">{it.quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQty(s.id, idx, it.quantity + 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                          >+</button>
                        </div>
                        <span className="w-16 text-right text-[11px] text-slate-500">{euro((it.unit_price || 0) * it.quantity)}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(s.id, idx)}
                          className="p-1 rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                          title="Remover produto"
                        >
                          <Trash size={11} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <select
                      value={addPick[s.id] || ""}
                      onChange={(e) => setAddPick({ ...addPick, [s.id]: e.target.value })}
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">— Adicionar produto —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {euro(p.price)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addItem(s.id)}
                      disabled={!addPick[s.id]}
                      className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-bold disabled:opacity-40 flex items-center gap-1"
                    >
                      <Plus size={11} weight="bold" /> Juntar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transferir para sócio */}
        <div className="mt-5 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
            <UsersThree size={12} weight="duotone" /> Transferir para um sócio
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              data-testid="occasional-transfer-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="">— Escolher sócio —</option>
              {members.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.member_number ? ` · nº ${c.member_number}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="occasional-transfer-btn"
              onClick={transfer}
              disabled={busy || !target || sales.length === 0}
              className="px-3 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <ArrowRight size={12} weight="bold" /> Transferir
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            Os consumos passam para a conta do sócio e a ficha temporária fecha (a vaga fica livre).
          </p>
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium">
            Cancelar
          </button>
          <button
            type="button"
            data-testid="occasional-edit-save"
            onClick={save}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <FloppyDisk size={14} weight="bold" /> Guardar alterações
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
