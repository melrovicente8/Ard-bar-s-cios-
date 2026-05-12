import React, { useEffect, useMemo, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  Plus,
  Minus,
  Trash,
  ShoppingCart,
  MagnifyingGlass,
  Wine,
} from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Vender() {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [cart, setCart] = useState({}); // { product_id: qty }
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([api.get("/products"), api.get("/clients")]);
      setProducts(p.data);
      setClients(c.data);
      if (!clientId && c.data.length) setClientId(c.data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const inCart = (id) => cart[id] || 0;

  const add = (p) => {
    const cur = inCart(p.id);
    if (cur >= p.quantity) {
      toast.error(`Stock máximo: ${p.quantity}`);
      return;
    }
    setCart({ ...cart, [p.id]: cur + 1 });
  };
  const dec = (id) => {
    const cur = inCart(id);
    if (cur <= 1) {
      const c = { ...cart };
      delete c[id];
      setCart(c);
    } else setCart({ ...cart, [id]: cur - 1 });
  };
  const remove = (id) => {
    const c = { ...cart };
    delete c[id];
    setCart(c);
  };

  const total = useMemo(() => {
    return Object.entries(cart).reduce((sum, [pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      return sum + (p ? p.price * qty : 0);
    }, 0);
  }, [cart, products]);

  const submit = async () => {
    if (!clientId) {
      toast.error("Seleciona um cliente");
      return;
    }
    const items = Object.entries(cart).map(([pid, qty]) => ({
      product_id: pid,
      quantity: qty,
    }));
    if (!items.length) {
      toast.error("Carrinho vazio");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/sales", { client_id: clientId, items });
      toast.success(`Venda registada · ${euro(total)}`);
      setCart({});
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const cartItems = Object.entries(cart)
    .map(([pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      return p ? { ...p, qty } : null;
    })
    .filter(Boolean);

  return (
    <div className="p-6 md:p-8 animate-in" data-testid="vender-page">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
          Ponto de Venda
        </div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
          Vender
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Products grid */}
        <div className="lg:col-span-8">
          <div className="relative mb-5">
            <MagnifyingGlass
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              data-testid="vender-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar produto..."
              className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            />
          </div>

          {loading ? (
            <div className="text-slate-500 p-10 text-center">A carregar...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
              <Wine size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              <p className="text-slate-400">Nenhum produto. Adiciona na página Stock.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((p) => {
                const out = p.quantity <= 0;
                const low = p.quantity <= p.low_stock_threshold;
                return (
                  <button
                    key={p.id}
                    data-testid={`product-card-${p.id}`}
                    disabled={out}
                    onClick={() => add(p)}
                    className={`text-left bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden transition-all hover:border-amber-500/40 hover:-translate-y-0.5 ${
                      out ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
                          <Wine size={36} weight="duotone" className="text-amber-500/50" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        {out ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            ESGOTADO
                          </span>
                        ) : low ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            BAIXO
                          </span>
                        ) : null}
                      </div>
                      {inCart(p.id) > 0 && (
                        <div className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center">
                          {inCart(p.id)}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-medium text-slate-100 truncate">{p.name}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-amber-400 font-bold">{euro(p.price)}</span>
                        <span className="text-xs text-slate-500">{p.quantity} un.</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart panel */}
        <aside
          data-testid="cart-panel"
          className="lg:col-span-4 lg:sticky lg:top-6 lg:self-start bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5 flex flex-col"
          style={{ maxHeight: "calc(100vh - 3rem)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart size={20} weight="duotone" className="text-amber-500" />
            <h3 className="font-outfit text-lg font-semibold">Conta corrente</h3>
          </div>

          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Cliente
          </label>
          <select
            data-testid="cart-client-select"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1.5 mb-4 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="">— Seleciona cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex-1 overflow-y-auto -mx-2 px-2 min-h-[120px]">
            {cartItems.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-10">
                Carrinho vazio
              </div>
            ) : (
              <ul className="space-y-2">
                {cartItems.map((it) => (
                  <li
                    key={it.id}
                    data-testid={`cart-item-${it.id}`}
                    className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.name}</div>
                      <div className="text-xs text-slate-500">
                        {euro(it.price)} × {it.qty} = {euro(it.price * it.qty)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => dec(it.id)}
                        className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
                        data-testid={`cart-dec-${it.id}`}
                      >
                        <Minus size={12} weight="bold" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{it.qty}</span>
                      <button
                        onClick={() => add(it)}
                        className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
                        data-testid={`cart-inc-${it.id}`}
                      >
                        <Plus size={12} weight="bold" />
                      </button>
                      <button
                        onClick={() => remove(it.id)}
                        className="w-7 h-7 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center ml-1"
                        data-testid={`cart-remove-${it.id}`}
                      >
                        <Trash size={12} weight="bold" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Total
              </span>
              <span
                data-testid="cart-total"
                className="font-outfit text-3xl font-bold text-amber-400"
              >
                {euro(total)}
              </span>
            </div>
            <button
              data-testid="cart-submit-btn"
              onClick={submit}
              disabled={submitting || cartItems.length === 0 || !clientId}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold py-3.5 rounded-lg transition-colors uppercase tracking-wider text-sm"
            >
              {submitting ? "A registar..." : "Registar venda"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
