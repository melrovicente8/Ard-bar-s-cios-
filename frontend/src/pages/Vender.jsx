import React, { useEffect, useMemo, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { fetchQuotaStatus } from "../lib/quotaStatus";
import {
  Plus,
  Minus,
  Trash,
  ShoppingCart,
  MagnifyingGlass,
  Wine,
  Lightning,
  SquaresFour,
  List as ListIcon,
  Printer,
  House,
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
  const [viewMode, setViewMode] = useState("grid"); // grid | list
  const [fastMode, setFastMode] = useState(false);
  const [topProducts, setTopProducts] = useState([]);
  const [houseOffers, setHouseOffers] = useState({}); // { product_id: true }
  const [lastSale, setLastSale] = useState(null); // for print receipt

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

  const toggleFast = async () => {
    if (!fastMode) {
      try {
        const { data } = await api.get("/products/top?limit=8");
        setTopProducts(data);
      } catch {
        setTopProducts([]);
      }
    }
    setFastMode((v) => !v);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const topIds = useMemo(() => new Set(topProducts.map((p) => p.id)), [topProducts]);

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
      if (houseOffers[pid]) return sum; // oferta da casa — grátis para o cliente
      const p = products.find((x) => x.id === pid);
      return sum + (p ? p.price * qty : 0);
    }, 0);
  }, [cart, products, houseOffers]);

  const houseTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [pid, qty]) => {
      if (!houseOffers[pid]) return sum;
      const p = products.find((x) => x.id === pid);
      return sum + (p ? p.price * qty : 0);
    }, 0);
  }, [cart, products, houseOffers]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const printSaleReceipt = async (sale, client) => {
    if (!sale) return;
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) return toast.error("Permite popups para imprimir");
    const dateStr = new Date(sale.created_at).toLocaleString("pt-PT");
    const itemsHtml = sale.items.map((it) => {
      const houseTag = it.is_house_account ? ' <span style="color:#b45309;font-size:10px">(oferta da casa)</span>' : "";
      return `<div class="row"><span>${it.quantity}× ${it.product_name}${houseTag}</span><span>${euro(it.subtotal)}</span></div>`;
    }).join("");
    // Quota status for sócios
    let quotaLine = "";
    if (client?.is_member || client?.member_number) {
      const qs = await fetchQuotaStatus(client.id);
      if (qs) quotaLine = `<div class="row"><span>Estado de cotas</span><strong style="color:${qs.color}">${qs.label}</strong></div>`;
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Talão de venda</title>
<style>body{font-family:'Courier New',monospace;max-width:320px;margin:14px auto;padding:0 12px;font-size:13px;color:#000}
h1{font-size:16px;text-align:center;margin:4px 0 0;letter-spacing:.18em}
h2{font-size:11px;text-align:center;margin:0 0 14px;color:#444;letter-spacing:.25em}
hr{border:0;border-top:1px dashed #000;margin:10px 0}
.row{display:flex;justify-content:space-between;margin:4px 0}
.big{font-size:20px;font-weight:bold}
.muted{color:#555;font-size:11px}
.txn{font-size:14px;font-weight:bold;background:#000;color:#fff;text-align:center;padding:4px;border-radius:3px;margin:8px 0}
@media print{ body{margin:0} button{display:none} }
</style></head><body>
<h1>ARD · NESPEREIRA</h1>
<h2>TALÃO DE VENDA</h2>
${sale.tx_number ? `<div class="txn">TRANSAÇÃO Nº ${sale.tx_number}</div>` : ""}
<div class="muted">${dateStr}</div>
<div class="muted">Registado por: ${sale.user_email || "—"}</div>
<hr/>
<div class="row"><span>Cliente</span><strong>${client?.name || sale.client_name || "—"}</strong></div>
${client?.member_number ? `<div class="row"><span>Nº Sócio</span><strong>${client.member_number}</strong></div>` : ""}
${quotaLine ? `<hr/>${quotaLine}` : ""}
<hr/>
${itemsHtml}
<hr/>
<div class="row big"><span>TOTAL</span><span>${euro(sale.total)}</span></div>
${sale.points_earned ? `<div class="row"><span>Pontos ganhos</span><span>+${sale.points_earned}</span></div>` : ""}
<hr/>
<div style="text-align:center" class="muted">Obrigado pela preferência</div>
<div style="text-align:center;margin-top:14px"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(),300);</script>
</body></html>`);
    w.document.close();
  };

  const submit = async () => {
    if (!clientId) {
      toast.error("Seleciona um cliente");
      return;
    }
    const items = Object.entries(cart).map(([pid, qty]) => ({
      product_id: pid,
      quantity: qty,
      is_house_account: !!houseOffers[pid],
    }));
    if (!items.length) {
      toast.error("Carrinho vazio");
      return;
    }
    setSubmitting(true);
    try {
      const { data: sale } = await api.post("/sales", { client_id: clientId, items });
      toast.success(`Venda registada · ${euro(sale.total || total)}`);
      setLastSale({ sale, client: selectedClient });
      setCart({});
      setHouseOffers({});
      await load();
      // Auto-open print dialog
      printSaleReceipt(sale, selectedClient);
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

  const ProductCard = ({ p }) => {
    const out = p.quantity <= 0;
    const low = p.quantity <= p.low_stock_threshold;
    const isTop = fastMode && topIds.has(p.id);
    return (
      <button
        key={p.id}
        data-testid={`product-card-${p.id}`}
        disabled={out}
        onClick={() => add(p)}
        className={`text-left bg-slate-900/40 backdrop-blur-xl border rounded-xl overflow-hidden transition-all hover:border-amber-500/40 hover:-translate-y-0.5 ${
          isTop ? "border-amber-500/60 ring-1 ring-amber-500/30" : "border-slate-800"
        } ${out ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden">
          {p.image_url ? (
            <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
              <Wine size={36} weight="duotone" className="text-amber-500/50" />
            </div>
          )}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            {isTop && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 border border-amber-400 flex items-center gap-1">
                <Lightning size={10} weight="fill" /> TOP
              </span>
            )}
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
  };

  const ProductRow = ({ p }) => {
    const out = p.quantity <= 0;
    const isTop = fastMode && topIds.has(p.id);
    return (
      <button
        key={p.id}
        data-testid={`product-row-${p.id}`}
        disabled={out}
        onClick={() => add(p)}
        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 text-left transition-colors ${
          out ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-900/60"
        } ${isTop ? "bg-amber-500/5" : ""}`}
      >
        <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {p.image_url ? (
            <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <Wine size={18} weight="duotone" className="text-amber-500/50" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-100 truncate flex items-center gap-2">
            {p.name}
            {isTop && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1">
                <Lightning size={9} weight="fill" /> TOP
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">{p.quantity} un. em stock</div>
        </div>
        {inCart(p.id) > 0 && (
          <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
            {inCart(p.id)}
          </span>
        )}
        <span className="text-amber-400 font-bold w-16 text-right">{euro(p.price)}</span>
      </button>
    );
  };

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
          {/* Conta corrente — selected client balance */}
          {selectedClient && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-4 flex items-center gap-4 flex-wrap" data-testid="vender-client-cc">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Cliente</div>
                <div className="text-sm font-medium text-slate-200">{selectedClient.name}</div>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{(selectedClient.balance || 0) < 0 ? "Crédito" : "A pagar"}</div>
                <div className={`text-lg font-bold ${(selectedClient.balance || 0) < 0 ? "text-emerald-300" : "text-amber-300"}`}>{euro(Math.abs(selectedClient.balance || 0))}</div>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Pontos</div>
                <div className="text-lg font-bold text-green-300">{selectedClient.points || 0}</div>
              </div>
              {selectedClient.is_member && (
                <>
                  <div className="h-8 w-px bg-slate-800" />
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/15 text-green-300 border border-green-500/30">
                    Sócio {selectedClient.member_number ? `nº ${selectedClient.member_number}` : ""}
                  </span>
                </>
              )}
              {lastSale && (
                <button
                  data-testid="vender-print-last"
                  onClick={() => printSaleReceipt(lastSale.sale, lastSale.client)}
                  className="ml-auto px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer size={14} weight="duotone" /> Imprimir última venda
                </button>
              )}
            </div>
          )}

          <div className="relative mb-4">
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

          {/* Toolbar: modo rápido + vista */}
          <div className="flex items-center gap-2 mb-5 flex-wrap" data-testid="vender-toolbar">
            <button
              data-testid="vender-fast-toggle"
              onClick={toggleFast}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                fastMode
                  ? "bg-amber-500 text-slate-950 border-amber-500"
                  : "bg-slate-900/60 text-slate-300 border-slate-800 hover:border-amber-500/40"
              }`}
            >
              <Lightning size={13} weight="fill" /> Modo rápido
            </button>
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1" data-testid="vender-view-toggle">
              {[
                { v: "grid", icon: SquaresFour, label: "Grelha" },
                { v: "list", icon: ListIcon, label: "Lista" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  data-testid={`vender-view-${opt.v}`}
                  onClick={() => setViewMode(opt.v)}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                    viewMode === opt.v ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <opt.icon size={12} weight="fill" /> {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modo rápido: top produtos em destaque */}
          {fastMode && topProducts.length > 0 && (
            <div className="mb-5" data-testid="vender-fast-section">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-2 flex items-center gap-1.5">
                <Lightning size={11} weight="fill" /> Mais vendidos
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {topProducts.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`fast-product-${p.id}`}
                    disabled={p.quantity <= 0}
                    onClick={() => add(p)}
                    className={`flex-shrink-0 w-28 text-left bg-slate-900/60 border border-amber-500/40 rounded-xl p-2 hover:border-amber-500/70 transition-colors ${
                      p.quantity <= 0 ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="w-full h-16 bg-slate-950 rounded-lg flex items-center justify-center mb-1.5 overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Wine size={20} weight="duotone" className="text-amber-500/50" />
                      )}
                    </div>
                    <div className="text-xs font-medium text-slate-100 truncate">{p.name}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-amber-400 font-bold text-xs">{euro(p.price)}</span>
                      <span className="text-[9px] text-slate-500">{p.sold} vend.</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-slate-500 p-10 text-center">A carregar...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
              <Wine size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
              <p className="text-slate-400">Nenhum produto. Adiciona na página Stock.</p>
            </div>
          ) : viewMode === "list" ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden" data-testid="vender-list">
              {filtered.map((p) => (
                <ProductRow key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
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
                    className={`flex items-center gap-2 bg-slate-950/60 border rounded-lg p-2.5 ${houseOffers[it.id] ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${houseOffers[it.id] ? "line-through opacity-60" : ""}`}>{it.name}</div>
                      <div className="text-xs text-slate-500">
                        {euro(it.price)} × {it.qty} = <span className={houseOffers[it.id] ? "line-through" : ""}>{euro(it.price * it.qty)}</span>
                      </div>
                      <label className="flex items-center gap-1 mt-1 cursor-pointer" data-testid={`cart-house-${it.id}`}>
                        <input
                          type="checkbox"
                          checked={!!houseOffers[it.id]}
                          onChange={(e) => setHouseOffers({ ...houseOffers, [it.id]: e.target.checked })}
                          className="w-3 h-3 accent-amber-400"
                        />
                        <span className="text-[10px] text-amber-400/80 font-medium flex items-center gap-0.5">
                          <House size={10} weight="duotone" /> Oferta da casa
                        </span>
                      </label>
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
            {houseTotal > 0 && (
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="text-amber-400/80 font-medium flex items-center gap-1">
                  <House size={11} weight="duotone" /> Oferta da casa
                </span>
                <span className="text-amber-400/80">{euro(houseTotal)}</span>
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
