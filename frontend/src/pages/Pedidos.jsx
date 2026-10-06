import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { ShoppingCart, Check, X as XIcon, PencilSimple, Package, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";
import GiftsStaff from "../components/GiftsStaff";

const STATUS_CLASS = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  delivered: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const STATUS_LABEL = {
  pending: "Pendente",
  approved: "Aprovado · pronto a levantar",
  delivered: "Entregue",
  rejected: "Rejeitado",
};

export default function Pedidos() {
  const [filter, setFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);      // pedido em edição
  const [editCart, setEditCart] = useState({});      // {product_id: qty}
  const [editNote, setEditNote] = useState("");
  const [addPid, setAddPid] = useState("");
  const [products, setProducts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = filter ? { status_filter: filter } : {};
      const { data } = await api.get("/consumption-requests", { params });
      setRequests(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const approve = async (r) => {
    if (!window.confirm(`Aprovar este pedido (${euro(r.total)}) de ${r.client_name}? Será criada uma venda e descontado o stock.`)) return;
    try {
      await api.post(`/consumption-requests/${r.id}/approve`);
      toast.success("Pedido aprovado · venda criada");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };
  const reject = async (r) => {
    if (!window.confirm(`Rejeitar este pedido de ${r.client_name}?`)) return;
    try {
      await api.post(`/consumption-requests/${r.id}/reject`);
      toast.success("Pedido rejeitado");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const notifyPickup = async (r) => {
    try {
      await api.post(`/consumption-requests/${r.id}/notify-pickup`);
      toast.success(`Notificação enviada a ${r.client_name} — pronto a levantar no balcão`);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };
  const deliver = async (r) => {
    if (!window.confirm(`Marcar o pedido de ${r.client_name} (${euro(r.total)}) como ENTREGUE no balcão? O valor fica na conta corrente, pronto para pagamento.`)) return;
    try {
      await api.post(`/consumption-requests/${r.id}/deliver`);
      toast.success("Pedido entregue · pronto para pagamento");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const startEdit = async (r) => {
    const cart = {};
    (r.items || []).forEach((it) => { cart[it.product_id] = (cart[it.product_id] || 0) + Number(it.quantity || 0); });
    setEditing(r);
    setEditCart(cart);
    setEditNote(r.note || "");
    setAddPid("");
    setProducts([]);
    try {
      const { data } = await api.get("/products");
      setProducts((data || []).filter((p) => !p.is_quota && (p.quantity || 0) > 0));
    } catch { /* sem lista para adicionar itens */ }
  };

  const editSubtotal = () => Object.entries(editCart).reduce((s, [pid, q]) => {
    const it = editing?.items?.find((x) => x.product_id === pid);
    const p = products.find((x) => x.id === pid);
    const price = p ? p.price : it?.unit_price || 0;
    return s + price * q;
  }, 0);

  const saveEdit = async () => {
    const items = Object.entries(editCart).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) return toast.error("O pedido não pode ficar vazio — anula-o se necessário");
    try {
      await api.put(`/consumption-requests/${editing.id}`, { items, note: editNote || null });
      toast.success("Pedido atualizado");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="pedidos-page">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Validação</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Pedidos de sócio</h1>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        Os sócios podem submeter pedidos de consumo pelo portal. Aqui validas — ao aprovar é criada uma venda na ficha do sócio e descontado o stock.
      </p>

      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1 mb-5" data-testid="pedidos-filter">
        {[
          { v: "pending", l: "Pendentes" },
          { v: "approved", l: "Prontos a levantar" },
          { v: "delivered", l: "Entregues" },
          { v: "rejected", l: "Rejeitados" },
          { v: "", l: "Todos" },
        ].map((opt) => (
          <button
            key={opt.v}
            data-testid={`pedidos-filter-${opt.v || "all"}`}
            onClick={() => setFilter(opt.v)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${filter === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >{opt.l}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 p-10 text-center">A carregar...</div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <ShoppingCart size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
          <p className="text-slate-400">Sem pedidos {filter || "(qualquer estado)"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} data-testid={`pedido-${r.id}`} className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div>
                  <Link to={`/clientes/${r.client_id}`} className="font-outfit text-lg font-semibold text-slate-100 hover:text-amber-400">
                    {r.client_name}
                  </Link>
                  <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString("pt-PT")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  <span className="font-outfit text-xl font-bold text-amber-300">{euro(r.total)}</span>
                </div>
              </div>
              <ul className="text-sm text-slate-300 space-y-1 mb-3">
                {r.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between bg-slate-950/40 rounded px-3 py-1.5">
                    <span><span className="text-slate-500">{it.quantity}×</span> {it.product_name}</span>
                    <span className="text-slate-500">{euro(it.subtotal)}</span>
                  </li>
                ))}
              </ul>
              {r.note && <p className="text-xs text-slate-400 mb-3 italic">"{r.note}"</p>}
              {r.status === "pending" && r.edited_at && (
                <p className="text-[10px] text-amber-400/80 mb-2">
                  ✏️ Editado em {new Date(r.edited_at).toLocaleString("pt-PT")}{r.edited_by_staff ? ` por ${r.edited_by}` : ""}
                </p>
              )}
              {r.status === "pending" ? (
                <div className="flex gap-2">
                  <button
                    data-testid={`edit-${r.id}`}
                    onClick={() => startEdit(r)}
                    className="bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 font-bold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2"
                  >
                    <PencilSimple size={16} weight="bold" /> Editar
                  </button>
                  <button
                    data-testid={`approve-${r.id}`}
                    onClick={() => approve(r)}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg py-2.5 flex items-center justify-center gap-2"
                  >
                    <Check size={16} weight="bold" /> Aprovar e criar venda
                  </button>
                  <button
                    data-testid={`reject-${r.id}`}
                    onClick={() => reject(r)}
                    className="bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 font-bold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2"
                  >
                    <XIcon size={16} weight="bold" /> Rejeitar
                  </button>
                </div>
              ) : r.status === "approved" ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500">
                    Aprovado por {r.decided_by} · venda <Link to={`/clientes/${r.client_id}`} className="text-amber-400 hover:underline">#{r.sale_id.slice(0,8)}</Link>
                    {r.notified_pickup_at && <> · notificado em {new Date(r.notified_pickup_at).toLocaleString("pt-PT")}</>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid={`notify-pickup-${r.id}`}
                      onClick={() => notifyPickup(r)}
                      className="bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 border border-sky-500/30 font-bold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2"
                    >
                      <PaperPlaneTilt size={16} weight="bold" /> Notificar levantamento
                    </button>
                    <button
                      data-testid={`deliver-${r.id}`}
                      onClick={() => deliver(r)}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg py-2.5 flex items-center justify-center gap-2"
                    >
                      <Package size={16} weight="bold" /> Marcar como entregue · pronto para pagamento
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  {r.status === "delivered" ? (
                    <>Entregue por {r.delivered_by} em {new Date(r.delivered_at).toLocaleString("pt-PT")} · valor na conta corrente, pronto para pagamento</>
                  ) : (
                    <>Decidido por {r.decided_by} em {new Date(r.decided_at).toLocaleString("pt-PT")}</>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Consumos entre sócios: deixar pago / delegar pagamento */}
      <GiftsStaff />

      {/* Modal: editar pedido pendente */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setEditing(null)} data-testid="pedido-edit-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <PencilSimple size={22} weight="bold" className="text-amber-400" />
              <h3 className="font-outfit text-xl font-semibold">Editar pedido · {editing.client_name}</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">Ajusta itens ou nota antes de aprovar. O sócio vê o pedido atualizado no portal.</p>

            <div className="overflow-y-auto mb-3 pr-1" data-testid="pedido-edit-cart">
              {Object.entries(editCart).filter(([, q]) => q > 0).map(([pid, q]) => {
                const it = editing.items.find((x) => x.product_id === pid);
                const p = products.find((x) => x.id === pid);
                const price = p ? p.price : it?.unit_price || 0;
                return (
                  <div key={pid} className="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-slate-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{p ? p.name : it?.product_name || pid}</div>
                      <div className="text-[10px] text-slate-500">{euro(price)} · subtotal {euro(price * q)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...editCart };
                          const nq = (next[pid] || 0) - 1;
                          if (nq <= 0) delete next[pid]; else next[pid] = nq;
                          setEditCart(next);
                        }}
                        className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-base font-bold"
                        title="Retirar 1"
                      >−</button>
                      <span className="min-w-[24px] text-center font-bold text-amber-300 text-sm">{q}</span>
                      <button
                        type="button"
                        onClick={() => setEditCart({ ...editCart, [pid]: q + 1 })}
                        className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-base font-bold"
                        title="Adicionar 1"
                      >+</button>
                      <button
                        type="button"
                        onClick={() => { const next = { ...editCart }; delete next[pid]; setEditCart(next); }}
                        className="w-7 h-7 rounded bg-rose-950 hover:bg-rose-900 text-rose-400 text-xs ml-1"
                        title="Remover"
                      >×</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 mb-3">
              <select
                data-testid="pedido-edit-add"
                value={addPid}
                onChange={(e) => {
                  const pid = e.target.value;
                  setAddPid("");
                  if (!pid) return;
                  setEditCart({ ...editCart, [pid]: (editCart[pid] || 0) + 1 });
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">+ Adicionar produto…</option>
                {products.filter((p) => !editCart[p.id]).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {euro(p.price)} · {p.quantity} disp.</option>
                ))}
              </select>
            </div>

            <textarea
              data-testid="pedido-edit-note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={2}
              placeholder="Nota (opcional)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm mb-3"
            />

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</span>
              <span data-testid="pedido-edit-total" className="font-outfit text-xl font-bold text-amber-300">{euro(editSubtotal())}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button data-testid="pedido-edit-save" onClick={saveEdit} className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Guardar alterações</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
