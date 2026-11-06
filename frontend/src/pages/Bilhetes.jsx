import React, { useEffect, useMemo, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Ticket, TShirt, MagnifyingGlass, ShoppingCart } from "@phosphor-icons/react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50";

export default function Bilhetes() {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [sell, setSell] = useState(null);
  const [form, setForm] = useState({ client_id: "", quantity: "1" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [prods, cls] = await Promise.all([api.get("/products"), api.get("/clients")]);
    setProducts(prods.data || []);
    setClients(cls.data || []);
  };

  useEffect(() => { load(); }, []);

  const merch = useMemo(
    () => products.filter((p) => (p.category || "").toLowerCase().includes("merch") && !p.is_quota),
    [products]
  );
  const filtered = merch.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredClients = clients.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.member_number || "").includes(search)
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) return toast.error("Seleciona o cliente");
    const qty = parseInt(form.quantity, 10);
    if (!qty || qty <= 0) return toast.error("Quantidade inválida");
    setSaving(true);
    try {
      const { data } = await api.post("/sales", {
        client_id: form.client_id,
        items: [{ product_id: sell.id, quantity: qty }],
      });
      toast.success(`Venda registada · ${euro(data.total)}` + (data.bar_warning ? " · bar fechado" : ""));
      if (data.bar_warning) toast.warning(data.bar_warning, { duration: 8000 });
      setSell(null);
      setForm({ client_id: "", quantity: "1" });
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="bilhetes-page">
      <div className="flex items-center gap-3 mb-2">
        <Ticket size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Bilheteira</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Bilhetes e Merchandising</h1>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Venda de bilhetes para o Estádio Dia Gonçalves (em breve) e merchandising oficial da ARDN.
      </p>

      <div className="bg-slate-900/40 border border-amber-500/20 rounded-xl p-5 mb-6 max-w-xl">
        <div className="inline-flex px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-widest mb-2">
          Bilhetes · em breve
        </div>
        <p className="text-slate-400 text-sm">A venda de bilhetes para o Estádio Dia Gonçalves estará disponível brevemente.</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <TShirt size={20} weight="duotone" className="text-amber-400" />
        <h2 className="font-outfit text-xl font-semibold">Merchandising</h2>
        <div className="relative ml-auto max-w-xs w-full">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar produto ou cliente..." className={`${inputCls} pl-9`} data-testid="merch-search" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-slate-500 py-8">Sem artigos de merchandising registados no stock.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="merch-grid">
          {filtered.map((p) => (
            <div key={p.id} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-100">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.category}</div>
                </div>
                <div className="font-outfit text-xl font-bold text-amber-300">{euro(p.price)}</div>
              </div>
              <div className="text-xs text-slate-500 mt-2">Stock: {p.quantity}</div>
              <button
                disabled={p.quantity <= 0}
                onClick={() => { setSell(p); setForm({ client_id: "", quantity: "1" }); }}
                data-testid={`merch-sell-${p.id}`}
                className="mt-3 w-full px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold hover:bg-amber-400 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <ShoppingCart size={15} weight="bold" /> Vender
              </button>
            </div>
          ))}
        </div>
      )}

      {sell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setSell(null)} data-testid="merch-sell-modal">
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-amber-500/30 rounded-xl w-full max-w-sm p-5 space-y-3">
            <h3 className="font-outfit text-lg font-semibold">Vender · {sell.name}</h3>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar cliente..."
              className={inputCls}
            />
            <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={inputCls} data-testid="merch-client">
              <option value="">Seleciona o cliente</option>
              {filteredClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.member_number ? ` (nº ${c.member_number})` : ""}</option>
              ))}
            </select>
            <input type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={inputCls} data-testid="merch-qty" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setSell(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button type="submit" disabled={saving} data-testid="merch-submit" className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold disabled:opacity-50">
                {saving ? "A registar..." : "Vender"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
