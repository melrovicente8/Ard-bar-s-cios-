import React, { useEffect, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Plus, Package, ArrowsClockwise, PencilSimple, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="modal-overlay"
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-outfit text-xl font-semibold mb-5">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function Stock() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "tesoureiro";
  const canDelete = user?.role === "admin";
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showReplenish, setShowReplenish] = useState(null);

  const [form, setForm] = useState({
    name: "",
    price: "",
    quantity: "0",
    low_stock_threshold: "5",
    category: "Bebida",
    image_url: "",
    is_quota: false,
  });
  const [replForm, setReplForm] = useState({ quantity: "", cost_price: "", note: "" });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/products");
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({
      name: "",
      price: "",
      quantity: "0",
      low_stock_threshold: "5",
      category: "Bebida",
      image_url: "",
      is_quota: false,
    });
    setShowAdd(true);
  };

  const openEdit = (p) => {
    setForm({
      name: p.name,
      price: String(p.price),
      quantity: String(p.quantity),
      low_stock_threshold: String(p.low_stock_threshold),
      category: p.category || "",
      image_url: p.image_url || "",
      is_quota: !!p.is_quota,
    });
    setShowEdit(p);
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post("/products", {
        name: form.name,
        price: parseFloat(form.price),
        quantity: parseInt(form.quantity, 10),
        low_stock_threshold: parseInt(form.low_stock_threshold, 10),
        category: form.category,
        image_url: form.image_url || null,
        is_quota: !!form.is_quota,
      });
      toast.success("Produto adicionado");
      setShowAdd(false);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/products/${showEdit.id}`, {
        name: form.name,
        price: parseFloat(form.price),
        quantity: parseInt(form.quantity, 10),
        low_stock_threshold: parseInt(form.low_stock_threshold, 10),
        category: form.category,
        image_url: form.image_url || null,
        is_quota: !!form.is_quota,
      });
      toast.success("Produto atualizado");
      setShowEdit(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Eliminar ${p.name}?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast.success("Produto eliminado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitReplenish = async (e) => {
    e.preventDefault();
    try {
      await api.post("/products/replenish", {
        product_id: showReplenish.id,
        quantity: parseInt(replForm.quantity, 10),
        cost_price: replForm.cost_price ? parseFloat(replForm.cost_price) : null,
        note: replForm.note || null,
      });
      toast.success("Stock carregado");
      setShowReplenish(null);
      setReplForm({ quantity: "", cost_price: "", note: "" });
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="stock-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Inventário
          </div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
            Stock
          </h1>
        </div>
        <button
          data-testid="add-product-btn"
          onClick={openAdd}
          disabled={!canManage}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={18} weight="bold" /> Novo produto
        </button>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">A carregar...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
            <p className="text-slate-400">Sem produtos. Adiciona o primeiro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-5 py-3 font-medium">Produto</th>
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 font-medium text-right">Preço</th>
                  <th className="px-5 py-3 font-medium text-right">Stock</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Agrupar por categoria, ordenar categorias alfabeticamente
                  const groups = {};
                  for (const p of products) {
                    const cat = p.category || "Sem categoria";
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(p);
                  }
                  const cats = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt"));
                  return cats.flatMap((cat) => [
                    <tr key={`hd-${cat}`} className="bg-slate-950/60 border-t border-slate-800">
                      <td colSpan={6} className="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
                        {cat} · {groups[cat].length} {groups[cat].length === 1 ? "produto" : "produtos"}
                      </td>
                    </tr>,
                    ...groups[cat].sort((a, b) => a.name.localeCompare(b.name, "pt")).map((p) => {
                      const out = p.quantity <= 0;
                      const low = p.quantity <= p.low_stock_threshold;
                      return (
                    <tr
                      key={p.id}
                      data-testid={`product-row-${p.id}`}
                      className="border-t border-slate-800/60 hover:bg-slate-900/60"
                    >
                      <td className="px-5 py-4 font-medium text-slate-100">
                        <div className="flex items-center gap-2">
                          {p.name}
                          {p.is_quota && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/30">
                              Cota
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{p.category || "—"}</td>
                      <td className="px-5 py-4 text-right text-amber-400 font-semibold">
                        {euro(p.price)}
                      </td>
                      <td className="px-5 py-4 text-right text-slate-200">{p.is_quota ? "—" : p.quantity}</td>
                      <td className="px-5 py-4">
                        {p.is_quota ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            Receita
                          </span>
                        ) : out ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Esgotado
                          </span>
                        ) : low ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Stock baixo
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {canManage && (
                            <button
                              data-testid={`replenish-btn-${p.id}`}
                              onClick={() => setShowReplenish(p)}
                              className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 flex items-center gap-1.5"
                            >
                              <ArrowsClockwise size={14} weight="bold" /> Carregar
                            </button>
                          )}
                          {canManage && (
                            <button
                              data-testid={`edit-btn-${p.id}`}
                              onClick={() => openEdit(p)}
                              className="p-2 rounded-md bg-slate-800 hover:bg-slate-700"
                            >
                              <PencilSimple size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              data-testid={`delete-btn-${p.id}`}
                              onClick={() => remove(p)}
                              className="p-2 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                          {!canManage && (
                            <span className="text-xs text-slate-500">Apenas visualização</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                    }),
                  ]);
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Novo produto">
        <ProductForm form={form} setForm={setForm} onSubmit={submitAdd} cta="Adicionar" testidPrefix="add" />
      </Modal>

      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="Editar produto">
        <ProductForm form={form} setForm={setForm} onSubmit={submitEdit} cta="Guardar" testidPrefix="edit" />
      </Modal>

      <Modal
        open={!!showReplenish}
        onClose={() => setShowReplenish(null)}
        title={`Carregar stock · ${showReplenish?.name || ""}`}
      >
        <form onSubmit={submitReplenish} className="space-y-4">
          <Field label="Quantidade recebida" required>
            <input
              data-testid="replenish-quantity-input"
              type="number"
              min="1"
              required
              value={replForm.quantity}
              onChange={(e) => setReplForm({ ...replForm, quantity: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </Field>
          <Field label="Preço de custo unitário (opcional)">
            <input
              data-testid="replenish-cost-input"
              type="number"
              step="0.01"
              value={replForm.cost_price}
              onChange={(e) => setReplForm({ ...replForm, cost_price: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </Field>
          <Field label="Nota (opcional)">
            <input
              value={replForm.note}
              onChange={(e) => setReplForm({ ...replForm, note: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Fornecedor, encomenda..."
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowReplenish(null)}
              className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
            >
              Cancelar
            </button>
            <button
              data-testid="replenish-submit-btn"
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              Carregar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const Field = ({ label, required, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
      {label} {required && <span className="text-rose-400">*</span>}
    </label>
    <div className="mt-1.5">{children}</div>
  </div>
);

function ProductForm({ form, setForm, onSubmit, cta, testidPrefix }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nome" required>
        <input
          data-testid={`${testidPrefix}-name-input`}
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Preço €" required>
          <input
            data-testid={`${testidPrefix}-price-input`}
            type="number"
            step="0.01"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </Field>
        <Field label="Stock inicial">
          <input
            data-testid={`${testidPrefix}-quantity-input`}
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Alerta stock baixo">
          <input
            type="number"
            value={form.low_stock_threshold}
            onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </Field>
        <Field label="Categoria">
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="Bebida, Snack..."
          />
        </Field>
      </div>
      <Field label="URL da imagem (opcional)">
        <input
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          placeholder="https://..."
        />
      </Field>
      <label className="flex items-start gap-3 px-3 py-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-amber-500/40">
        <input
          data-testid={`${testidPrefix}-is-quota-toggle`}
          type="checkbox"
          checked={!!form.is_quota}
          onChange={(e) => setForm({ ...form, is_quota: e.target.checked })}
          className="mt-0.5 w-4 h-4 accent-amber-500"
        />
        <span className="text-xs text-slate-200">
          <strong>Cota / Quota</strong> — receita do clube, <em>não conta</em> para o valor em stock nem alertas de stock baixo.
        </span>
      </label>
      <button
        data-testid={`${testidPrefix}-submit-btn`}
        type="submit"
        className="w-full mt-2 px-4 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
      >
        {cta}
      </button>
    </form>
  );
}
