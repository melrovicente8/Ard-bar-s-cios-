import React, { useEffect, useMemo, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { X, MagnifyingGlass, Plus, Minus, PaperPlaneTilt, BeerStein } from "@phosphor-icons/react";

/**
 * Pedido de consumo dentro de uma Rodada Mista aberta (app do sócio).
 * POST /api/socio/group-tables/{id}/rounds
 */
export default function SocioRodadaConsumo({ table, onClose, onSent }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/socio/products")
      .then(({ data }) => setProducts(data || []))
      .catch(() => setProducts([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q)) : products;
    return list.slice(0, 60);
  }, [products, search]);

  const qtyOf = (p) => cart[p.id] || 0;

  const add = (p, delta) => {
    const max = p.available_quantity ?? p.quantity ?? 0;
    const next = Math.max(qtyOf(p) + delta, 0);
    if (next > max) return toast.error(`Stock máximo: ${max}`);
    setCart((c) => {
      const copy = { ...c };
      if (next === 0) delete copy[p.id];
      else copy[p.id] = next;
      return copy;
    });
  };

  const total = useMemo(
    () => Object.entries(cart).reduce((sum, [pid, q]) => {
      const p = products.find((x) => x.id === pid);
      return sum + (p ? Number(p.price || 0) * q : 0);
    }, 0),
    [cart, products]
  );

  const submit = async () => {
    const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) return toast.error("Escolhe pelo menos um produto");
    setBusy(true);
    try {
      await api.post(`/socio/group-tables/${table.id}/rounds`, { items });
      toast.success("Pedido lançado na mesa — o bar já sabe 🍻");
      setCart({});
      onSent?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/90 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
      data-testid="socio-rodada-consumo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-sky-500/40 rounded-xl w-full max-w-xl p-5 my-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <BeerStein size={20} weight="duotone" className="text-sky-400" />
          <h3 className="font-outfit text-lg font-semibold flex-1 min-w-0 truncate">
            Pedir consumo · {table.label}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded bg-slate-800"><X size={14} weight="bold" /></button>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          O pedido entra como nova rodada da mesa. A divisão e o pagamento são feitos no balcão.
        </p>

        <div className="relative mb-2">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            data-testid="socio-rodada-consumo-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar produto..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          />
        </div>

        <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/60">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-slate-500">Sem produtos disponíveis.</div>
          )}
          {filtered.map((p) => (
            <div key={p.id} className="px-3 py-2 flex items-center gap-2 text-sm" data-testid={`socio-rodada-product-${p.id}`}>
              <span className="flex-1 min-w-0 truncate text-slate-200">{p.name}</span>
              <span className="text-amber-300 font-bold whitespace-nowrap">{euro(p.price)}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => add(p, -1)}
                  disabled={qtyOf(p) === 0}
                  className="h-6 w-6 rounded bg-slate-800 disabled:opacity-30 flex items-center justify-center"
                >
                  <Minus size={10} weight="bold" />
                </button>
                <span className="w-5 text-center text-xs font-bold">{qtyOf(p)}</span>
                <button
                  onClick={() => add(p, 1)}
                  className="h-6 w-6 rounded bg-sky-500/20 text-sky-300 flex items-center justify-center"
                >
                  <Plus size={10} weight="bold" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="text-sm text-slate-400">
            Total <strong className="font-outfit text-lg text-amber-300">{euro(total)}</strong>
          </div>
          <button
            data-testid="socio-rodada-consumo-send"
            onClick={submit}
            disabled={busy || !Object.keys(cart).length}
            className="ml-auto px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold flex items-center gap-2"
          >
            <PaperPlaneTilt size={15} weight="fill" /> {busy ? "A enviar…" : "Pedir à mesa"}
          </button>
        </div>
      </div>
    </div>
  );
}
