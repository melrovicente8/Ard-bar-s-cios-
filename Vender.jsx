import React, { useEffect, useMemo, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Plus,
  Minus,
  Trash,
  ShoppingCart,
  MagnifyingGlass,
  Wine,
  Gift,
} from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Vender() {
  const { user } = useAuth();
  const canHouseOffer = user?.role === "admin" || user?.role === "tesoureiro";
  const [products, setProducts] = useState([]);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("vender_view") || "grid");
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [cart, setCart] = useState({}); // { product_id: qty }
  const [houseItems, setHouseItems] = useState({}); // { product_id: true } — itens marcados como oferta individualmente
  const [search, setSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [houseOffer, setHouseOffer] = useState(false);

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
      if (!p) return sum;
      // Se a venda toda for oferta ou este item estiver marcado como oferta individual → não conta para total
      if (houseOffer || houseItems[pid]) return sum;
      return sum + p.price * qty;
    }, 0);
  }, [cart, products, houseOffer, houseItems]);

  const houseTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      if (!p) return sum;
      if (houseOffer || houseItems[pid]) return sum + p.price * qty;
      return sum;
    }, 0);
  }, [cart, products, houseOffer, houseItems]);

  const submit = async () => {
    if (!clientId) {
      toast.error("Seleciona um cliente");
      return;
    }
    const items = Object.entries(cart).map(([pid, qty]) => ({
      product_id: pid,
      quantity: qty,
      house_offer: !!houseItems[pid],
    }));
    if (!items.length) {
      toast.error("Carrinho vazio");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/sales", { client_id: clientId, items, house_offer: houseOffer });
      const anyHouse = houseOffer || Object.values(houseItems).some(Boolean);
      toast.success(anyHouse ? `Venda registada · ${euro(total)} (Oferta: ${euro(houseTotal)})` : `Venda registada · ${euro(total)}`);
      setCart({});
      setHouseItems({});
      setHouseOffer(false);
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

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.name || "").toLowerCase().includes(q) || String(c.member_number || "").includes(q));
  }, [clients, clientSearch]);

  const selectedClient = clients.find((c) => c.id === clientId);

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

      {/* Selector de Cliente/Sócio — sempre por CIMA dos produtos */}
      <div className="mb-6 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5" data-testid="client-picker">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">
            Cliente / Sócio
          </label>
          {selectedClient && (
            <span className="text-xs text-slate-400" data-testid="client-picker-badge">
              Selecionado: <strong className="text-amber-300">{selectedClient.name}</strong>
              {selectedClient.member_number ? <span className="text-slate-500"> · nº {selectedClient.member_number}</span> : null}
              {selectedClient.is_member ? <span className="ml-2 px-1.5 py-0.5 rounded bg-green-500/15 text-green-300 text-[10px] font-bold">SÓCIO</span> : null}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-1">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              data-testid="client-picker-search"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Procurar cliente / nº sócio..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <select
            data-testid="client-picker-select"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="">— Seleciona cliente —</option>
            {filteredClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.member_number ? ` · nº ${c.member_number}` : ""}{c.is_member ? " · Sócio" : ""}
              </option>
            ))}
          </select>
        </div>
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
          <div className="mb-4 flex justify-end">
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1" data-testid="vender-view-toggle">
              {[
                { v: "grid", label: "Grelha" },
                { v: "list", label: "Lista" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  data-testid={`view-${opt.v}`}
                  onClick={() => { setViewMode(opt.v); localStorage.setItem("vender_view", opt.v); }}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    viewMode === opt.v ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-slate-500 p-10 text-center">A carregar...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
              <Wine size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              <p className="text-slate-400">Nenhum produto. Adiciona na página Stock.</p>
            </div>
          ) : viewMode === "list" ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <div className="max-h-[65vh] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/50 sticky top-0 z-10">
                    <tr className="text-slate-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-2.5 font-medium">Produto</th>
                      <th className="px-4 py-2.5 font-medium">Categoria</th>
                      <th className="px-4 py-2.5 font-medium text-right">Preço</th>
                      <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                      <th className="px-4 py-2.5 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const out = p.quantity <= 0;
                      const low = p.quantity <= p.low_stock_threshold;
                      const q = inCart(p.id);
                      return (
                        <tr key={p.id} data-testid={`product-row-${p.id}`} className={`border-t border-slate-800/60 hover:bg-slate-900/50 ${out ? "opacity-50" : ""}`}>
                          <td className="px-4 py-2 font-medium text-slate-100">
                            <div className="flex items-center gap-2">
                              {p.name}
                              {q > 0 && <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">{q}</span>}
                              {out && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">ESGOTADO</span>}
                              {!out && low && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">BAIXO</span>}
                              {p.is_house_account && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">Conta da casa</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{p.category || "—"}</td>
                          <td className="px-4 py-2 text-right text-amber-400 font-bold">{euro(p.price)}</td>
                          <td className="px-4 py-2 text-right text-slate-400 text-xs">{p.quantity} un.</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              data-testid={`add-row-${p.id}`}
                              disabled={out}
                              onClick={() => add(p)}
                              className="px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-30 text-xs font-bold"
                            >+ Adicionar</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

          <div className="flex-1 overflow-y-auto -mx-2 px-2 min-h-[120px]">
            {cartItems.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-10">
                Carrinho vazio
              </div>
            ) : (
              <ul className="space-y-2">
                {cartItems.map((it) => {
                  const isItemHouse = houseOffer || !!houseItems[it.id];
                  const lineTotal = it.price * it.qty;
                  return (
                  <li
                    key={it.id}
                    data-testid={`cart-item-${it.id}`}
                    className={`flex flex-col gap-1.5 border rounded-lg p-2.5 ${isItemHouse ? "bg-fuchsia-500/5 border-fuchsia-500/30" : "bg-slate-950/60 border-slate-800"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {it.name}
                          {isItemHouse && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">OFERTA</span>}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          {euro(it.price)} × {it.qty} =
                          {isItemHouse ? (
                            <>
                              <span className="line-through opacity-70">{euro(lineTotal)}</span>
                              <span className="text-fuchsia-300 font-bold">0,00 €</span>
                            </>
                          ) : (
                            <span>{euro(lineTotal)}</span>
                          )}
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
                    </div>
                    {canHouseOffer && !houseOffer && (
                      <label className="flex items-center gap-1.5 text-[10px] text-fuchsia-300/90 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          data-testid={`cart-item-house-${it.id}`}
                          checked={!!houseItems[it.id]}
                          onChange={(e) => setHouseItems({ ...houseItems, [it.id]: e.target.checked })}
                          className="w-3.5 h-3.5 accent-fuchsia-500"
                        />
                        <Gift size={11} weight="duotone" /> Marcar este item como oferta da casa
                      </label>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            {canHouseOffer && (
              <label className="flex items-start gap-2.5 mb-3 px-3 py-2.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 cursor-pointer hover:bg-fuchsia-500/15">
                <input
                  type="checkbox"
                  data-testid="house-offer-toggle"
                  checked={houseOffer}
                  onChange={(e) => setHouseOffer(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-fuchsia-500"
                />
                <span className="text-xs text-slate-200 leading-tight">
                  <strong className="text-fuchsia-300 flex items-center gap-1.5"><Gift size={13} weight="duotone" /> Oferta da casa (todos os itens)</strong>
                  <span className="block text-[10px] text-slate-400 mt-0.5">Alternativa ao checkbox por item. Marca todo o carrinho como oferta.</span>
                </span>
              </label>
            )}
            {houseTotal > 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-between text-xs">
                <span className="text-fuchsia-300 font-bold uppercase tracking-wider text-[10px]">Custo Oferta da Casa</span>
                <span className="font-outfit text-lg font-bold text-fuchsia-300">{euro(houseTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Total a pagar
              </span>
              <span
                data-testid="cart-total"
                className="font-outfit text-3xl font-bold text-amber-400"
              >
                {euro(total)}
              </span>
            </div>
            {houseTotal > 0 && (
              <div className="text-[10px] text-fuchsia-300/80 text-right mb-2">Oferta lançada como despesa Bar/Oferta</div>
            )}
            <button
              data-testid="cart-submit-btn"
              onClick={submit}
              disabled={submitting || cartItems.length === 0 || !clientId}
              className={`w-full ${houseOffer ? "bg-fuchsia-500 hover:bg-fuchsia-400" : "bg-amber-500 hover:bg-amber-400"} disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold py-3.5 rounded-lg transition-colors uppercase tracking-wider text-sm`}
            >
              {submitting ? "A registar..." : houseOffer ? "Registar oferta da casa" : "Registar venda"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
