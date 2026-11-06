import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  Users,
  X,
  Plus,
  Minus,
  Trash,
  BeerStein,
  MagnifyingGlass,
  Scissors,
  Receipt,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const METHOD_LABEL = { account: "Conta corrente", cash: "Dinheiro", mbway: "MBWay" };

const statusPill = (open) =>
  open
    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";

/**
 * Rodada Mista — mesa de grupo no balcão.
 * Junta 2+ sócios, acumula as rodadas numa conta de grupo e permite
 * dividir a conta (partes iguais / por consumo) ou rodar quem paga cada rodada.
 */
export default function RodadaMista({ onClose, onChanged }) {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState(null);
  const [memberIds, setMemberIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState({});
  const [busy, setBusy] = useState(false);
  const [payerByRound, setPayerByRound] = useState({});
  const [methodByRound, setMethodByRound] = useState({});
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitMode, setSplitMode] = useState("equal");
  const [unitOwner, setUnitOwner] = useState({}); // chave da unidade -> client_id (uma linha por unidade)
  const [memberMethod, setMemberMethod] = useState({}); // client_id -> account|cash|mbway
  const [receipt, setReceipt] = useState(null);

  const load = async () => {
    const [c, p, t] = await Promise.all([
      api.get("/clients").catch(() => ({ data: [] })),
      api.get("/products").catch(() => ({ data: [] })),
      api.get("/group-tables", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
    ]);
    setClients(c.data || []);
    setProducts(p.data || []);
    setTables(t.data || []);
  };

  const refreshTable = async (id) => {
    const { data } = await api.get(`/group-tables/${id}`);
    setTable(data);
    const payers = {};
    const methods = {};
    (data.rounds || []).forEach((r) => {
      if (r.status !== "paid") {
        payers[r.number] = payers[r.number] || data.members?.[0]?.client_id || "";
        methods[r.number] = methods[r.number] || "account";
      }
    });
    setPayerByRound(payers);
    setMethodByRound(methods);
    return data;
  };

  useEffect(() => { load(); }, []);

  const socios = useMemo(
    () => clients.filter((c) => c.is_member && !c.is_temp),
    [clients]
  );
  const filteredSocios = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return socios;
    return socios.filter(
      (c) => (c.name || "").toLowerCase().includes(q) || String(c.member_number || "").includes(q)
    );
  }, [socios, memberSearch]);
  const selectedMembers = socios.filter((c) => memberIds.includes(c.id));

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = products.filter((p) => !p.is_quota && !p.is_house_account);
    if (!q) return list;
    return list.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [products, productSearch]);

  const cartItems = Object.entries(cart)
    .map(([pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      return p ? { ...p, qty } : null;
    })
    .filter(Boolean);
  const cartTotal = cartItems.reduce((s, it) => s + it.price * it.qty, 0);

  const openRounds = (table?.rounds || []).filter((r) => r.status !== "paid");
  const paidTotal = (table?.rounds || [])
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + (r.total || 0), 0);
  const openTotal = openRounds.reduce((s, r) => s + (r.total || 0), 0);

  const createTable = async () => {
    if (memberIds.length < 2) return toast.error("Escolhe pelo menos 2 sócios");
    setBusy(true);
    try {
      const { data } = await api.post("/group-tables", { member_ids: memberIds });
      setMemberIds([]);
      setMemberSearch("");
      await load();
      await refreshTable(data.id);
      toast.success("Rodada Mista aberta — os sócios foram notificados na App");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const addRound = async () => {
    const items = cartItems.map((it) => ({ product_id: it.id, quantity: it.qty }));
    if (!items.length) return toast.error("Carrinho vazio");
    setBusy(true);
    try {
      await api.post(`/group-tables/${table.id}/rounds`, { items });
      setCart({});
      await refreshTable(table.id);
      toast.success("Rodada lançada na conta do grupo");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const settleRound = async (round) => {
    const payer = payerByRound[round.number];
    if (!payer) return toast.error("Escolhe quem paga esta rodada");
    setBusy(true);
    try {
      await api.post(`/group-tables/${table.id}/rounds/${round.number}/settle`, {
        payer_client_id: payer,
        method: methodByRound[round.number] || "account",
      });
      await refreshTable(table.id);
      toast.success("Rodada liquidada");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  // Consumos das rodadas em aberto — UMA linha por unidade (3 colas = 3 linhas, cada uma para o seu sócio)
  const splitUnits = useMemo(() => {
    const units = [];
    openRounds.forEach((r) => (r.items || []).forEach((it) => {
      const qty = Number(it.quantity || 0);
      const unitPrice = Number(it.unit_price || 0);
      for (let i = 0; i < qty; i += 1) {
        units.push({
          key: `${r.number}-${it.product_id}-${i}`,
          round: r.number,
          product_id: it.product_id,
          product_name: it.product_name,
          unit_price: unitPrice,
        });
      }
    }));
    return units;
  }, [openRounds]);

  const splitAssignedTotal = splitUnits
    .filter((u) => unitOwner[u.key])
    .reduce((s, u) => s + u.unit_price, 0);

  const memberAssigned = useMemo(() => {
    const map = {};
    splitUnits.forEach((u) => {
      const owner = unitOwner[u.key];
      if (owner) map[owner] = (map[owner] || 0) + u.unit_price;
    });
    return map;
  }, [splitUnits, unitOwner]);

  const addMember = async (clientId) => {
    if (!table || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/group-tables/${table.id}/members`, { member_ids: [clientId] });
      setTable(data);
      setMemberSearch("");
      await load();
      toast.success("Sócio juntou-se à mesa");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const submitSplit = async () => {
    setBusy(true);
    try {
      const methods = {};
      (table.members || []).forEach((m) => { methods[m.client_id] = memberMethod[m.client_id] || "account"; });
      const payload = { mode: splitMode, methods };
      if (splitMode === "items") {
        if (splitAssignedTotal + 0.01 < openTotal) {
          setBusy(false);
          return toast.error(`Faltam ${euro(openTotal - splitAssignedTotal)} por atribuir`);
        }
        const byMember = {};
        splitUnits.forEach((u) => {
          const owner = unitOwner[u.key];
          if (!owner) return;
          byMember[owner] = byMember[owner] || [];
          const line = byMember[owner].find((x) => x.product_id === u.product_id);
          if (line) line.quantity += 1;
          else byMember[owner].push({ product_id: u.product_id, quantity: 1 });
        });
        payload.items_by_member = byMember;
      }
      const { data } = await api.post(`/group-tables/${table.id}/split`, payload);
      setReceipt({ table: data.table, sales: data.sales || [] });
      setSplitOpen(false);
      setTable(data.table);
      await load();
      onChanged?.();
      toast.success("Conta dividida — lançamentos criados");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const closeTable = async () => {
    if (openRounds.length) return toast.error("Ainda há rodadas por liquidar");
    setBusy(true);
    try {
      await api.post(`/group-tables/${table.id}/close`);
      setTable(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const addProduct = (p) => {
    const cur = cart[p.id] || 0;
    if (cur >= p.quantity) return toast.error(`Stock máximo: ${p.quantity}`);
    setCart({ ...cart, [p.id]: cur + 1 });
  };
  const decProduct = (id) => {
    const cur = cart[id] || 0;
    const next = { ...cart };
    if (cur <= 1) delete next[id];
    else next[id] = cur - 1;
    setCart(next);
  };

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-slate-950/90 backdrop-blur-sm p-3 md:p-6 overflow-y-auto" data-testid="rodada-mista">
      <div className="max-w-6xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <BeerStein size={24} weight="duotone" className="text-sky-400" />
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400/80">Balcão do bar</div>
            <h2 className="font-outfit text-xl font-semibold">Rodada Mista</h2>
          </div>
          <button onClick={() => load()} className="p-2 rounded-md bg-slate-800 hover:bg-slate-700" title="Atualizar">
            <ArrowClockwise size={16} />
          </button>
          <button data-testid="rodada-close" onClick={onClose} className="p-2 rounded-md bg-slate-800 hover:bg-slate-700">
            <X size={16} weight="bold" />
          </button>
        </div>

        {receipt ? (
          <div className="p-6 space-y-4" data-testid="rodada-receipt">
            <div className="text-sm text-slate-300">
              Conta dividida · {receipt.table?.label} · {receipt.sales.length} lançamento(s)
            </div>
            <ul className="space-y-2">
              {receipt.sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Receipt size={14} className="text-amber-400" /> {s.client_name}
                    <span className="text-[10px] text-slate-500">#{s.tx_number}</span>
                  </span>
                  <span className="text-slate-400 text-xs flex-1 px-3 truncate">{s.items?.[0]?.product_name}</span>
                  <strong className="text-amber-300">{euro(s.total)}</strong>
                </li>
              ))}
            </ul>
            <button onClick={() => { setReceipt(null); setTable(null); }} className="w-full py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold">
              Fechar
            </button>
          </div>
        ) : !table ? (
          <div className="p-5 grid lg:grid-cols-2 gap-6">
            {/* Mesas abertas */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Mesas abertas</h3>
              {tables.length === 0 ? (
                <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                  Sem rodadas mistas abertas
                </div>
              ) : (
                <ul className="space-y-2">
                  {tables.map((t) => (
                    <li key={t.id}>
                      <button
                        data-testid={`rodada-open-${t.id}`}
                        onClick={async () => { await refreshTable(t.id); }}
                        className="w-full text-left bg-slate-950/60 border border-slate-800 hover:border-sky-500/50 rounded-xl px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-slate-100">{t.label}</strong>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPill(true)}`}>
                            {(t.rounds || []).filter((r) => r.status !== "paid").length} rodada(s) em aberto
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {(t.members || []).map((m) => m.name.split(" ")[0] + (m.member_number ? ` (nº ${m.member_number})` : "")).join(" · ")}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Nova mesa */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Nova rodada mista</h3>
              <div className="relative mb-2">
                <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  data-testid="rodada-member-search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Procurar sócio / nº sócio..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2" data-testid="rodada-selected-members">
                  {selectedMembers.map((m) => (
                    <span key={m.id} className="px-2 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1">
                      {m.name.split(" ")[0]}{m.member_number ? ` nº ${m.member_number}` : ""}
                      <button onClick={() => setMemberIds(memberIds.filter((i) => i !== m.id))}><X size={10} weight="bold" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/60">
                {filteredSocios.slice(0, 60).map((m) => {
                  const on = memberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      data-testid={`rodada-member-${m.id}`}
                      onClick={() => setMemberIds(on ? memberIds.filter((i) => i !== m.id) : [...memberIds, m.id])}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${on ? "bg-sky-500/10 text-sky-200" : "text-slate-300 hover:bg-slate-800/50"}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] ${on ? "bg-sky-500 border-sky-500 text-slate-950" : "border-slate-600"}`}>
                        {on ? "✓" : ""}
                      </span>
                      {m.name}
                      {m.member_number ? <span className="text-slate-500 text-xs">· nº {m.member_number}</span> : null}
                    </button>
                  );
                })}
              </div>
              <button
                data-testid="rodada-create"
                onClick={createTable}
                disabled={busy || memberIds.length < 2}
                className="mt-3 w-full py-2.5 rounded-lg bg-sky-500 text-slate-950 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Users size={16} weight="duotone" /> Abrir Rodada Mista ({memberIds.length})
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 grid lg:grid-cols-3 gap-5">
            {/* Conta da mesa */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-outfit text-lg font-semibold">{table.label}</h3>
                  <div className="text-[11px] text-slate-500">
                    {(table.members || []).map((m) => m.name.split(" ")[0] + (m.member_number ? ` (nº ${m.member_number})` : "")).join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPill(table.status === "open")}`}>
                    {table.status === "open" ? "Aberta" : "Fechada"}
                  </span>
                  <button onClick={() => setTable(null)} className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700">← Mesas</button>
                </div>
              </div>

              {/* Rodadas */}
              <div className="space-y-2" data-testid="rodada-rounds">
                {(table.rounds || []).length === 0 && (
                  <div className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    Ainda sem rodadas — adiciona produtos e lança a primeira.
                  </div>
                )}
                {(table.rounds || []).map((r) => (
                  <div key={r.number} className="bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-3" data-testid={`rodada-round-${r.number}`}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-200">Rodada {r.number}</strong>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPill(r.status !== "paid")}`}>
                        {r.status === "paid" ? `Paga · ${r.payer_name || ""}` : "Em aberto"}
                      </span>
                      <strong className="text-amber-300 ml-auto">{euro(r.total)}</strong>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1" data-testid={`rodada-members-${r.number}`}>
                      À mesa: {(table.members || [])
                        .filter((m) => (m.joined_round || 1) <= r.number)
                        .map((m) => `${m.name.split(" ")[0]}${(m.joined_round || 1) === r.number && r.number > 1 ? " (juntou-se)" : ""}`)
                        .join(" · ")}
                    </div>
                    <ul className="text-[11px] text-slate-400 mt-1">
                      {(r.items || []).map((it, i) => (
                        <li key={i}>{it.quantity}× {it.product_name} · {euro(it.subtotal)}</li>
                      ))}
                    </ul>
                    {r.status !== "paid" && table.status === "open" && (
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-800/70">
                        <select
                          data-testid={`rodada-payer-${r.number}`}
                          value={payerByRound[r.number] || ""}
                          onChange={(e) => setPayerByRound({ ...payerByRound, [r.number]: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="">Quem paga?</option>
                          {(table.members || []).map((m) => (
                            <option key={m.client_id} value={m.client_id}>{m.name.split(" ")[0]}{m.member_number ? ` nº ${m.member_number}` : ""}</option>
                          ))}
                        </select>
                        <select
                          data-testid={`rodada-method-${r.number}`}
                          value={methodByRound[r.number] || "account"}
                          onChange={(e) => setMethodByRound({ ...methodByRound, [r.number]: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                        >
                          {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button
                          data-testid={`rodada-settle-${r.number}`}
                          disabled={busy}
                          onClick={() => settleRound(r)}
                          className="px-3 py-1 rounded bg-emerald-500 text-slate-950 text-xs font-bold disabled:opacity-40"
                        >
                          Assumir rodada
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {table.status === "open" && (
                <>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Conta do grupo</span>
                    <span className="font-outfit text-2xl font-bold text-amber-400" data-testid="rodada-open-total">{euro(openTotal)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid="rodada-split-btn"
                      onClick={() => { setSplitOpen(true); setSplitMode("equal"); }}
                      disabled={!openRounds.length}
                      className="flex-1 py-2.5 rounded-lg bg-sky-500 text-slate-950 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Scissors size={16} weight="duotone" /> Dividir conta
                    </button>
                    <button
                      data-testid="rodada-close-table"
                      onClick={closeTable}
                      disabled={!!openRounds.length}
                      className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-sm disabled:opacity-40"
                    >
                      Fechar mesa
                    </button>
                  </div>
                </>
              )}
              {table.status !== "open" && (
                <div className="text-sm text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3">
                  Mesa fechada · {euro(paidTotal)} liquidados.
                </div>
              )}
            </div>

            {/* Adicionar rodada */}
            <aside className="space-y-3">
              {table.status === "open" && (
                <div className="border border-slate-800 rounded-lg p-2.5 space-y-2" data-testid="rodada-add-member">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
                    <Users size={11} weight="duotone" /> Juntar sócio à mesa
                  </div>
                  <input
                    data-testid="rodada-add-member-search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Procurar sócio / nº sócio..."
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-800/60">
                    {filteredSocios
                      .filter((c) => !(table.members || []).some((m) => m.client_id === c.id))
                      .slice(0, 25)
                      .map((m) => (
                        <button
                          key={m.id}
                          data-testid={`rodada-add-member-${m.id}`}
                          onClick={() => addMember(m.id)}
                          disabled={busy}
                          className="w-full text-left px-1.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 flex items-center justify-between gap-2 disabled:opacity-40"
                        >
                          <span className="truncate">{m.name}{m.member_number ? ` · nº ${m.member_number}` : ""}</span>
                          <Plus size={11} weight="bold" className="text-sky-400 shrink-0" />
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Nova rodada</h3>
              <div className="relative">
                <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  data-testid="rodada-product-search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Procurar produto..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>
              <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/60">
                {filteredProducts.slice(0, 80).map((p) => (
                  <button
                    key={p.id}
                    data-testid={`rodada-product-${p.id}`}
                    disabled={p.quantity <= 0}
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-slate-800/50 disabled:opacity-40"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-amber-400 text-xs font-bold shrink-0">{euro(p.price)}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                {cartItems.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="flex-1 truncate">{it.name}</span>
                    <button onClick={() => decProduct(it.id)} className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center"><Minus size={10} weight="bold" /></button>
                    <span className="w-5 text-center font-bold">{it.qty}</span>
                    <button onClick={() => addProduct(it)} className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center"><Plus size={10} weight="bold" /></button>
                    <button onClick={() => { const c = { ...cart }; delete c[it.id]; setCart(c); }} className="w-6 h-6 rounded bg-rose-500/10 text-rose-400 flex items-center justify-center"><Trash size={10} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs uppercase tracking-wider">Rodada</span>
                <strong className="text-amber-400">{euro(cartTotal)}</strong>
              </div>
              <button
                data-testid="rodada-add-round"
                onClick={addRound}
                disabled={busy || !cartItems.length || table.status !== "open"}
                className="w-full py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold disabled:opacity-40"
              >
                Lançar rodada
              </button>
            </aside>
          </div>
        )}
      </div>

      {/* Dividir conta */}
      {splitOpen && table && (
        <div className="fixed inset-0 z-[90] bg-slate-950/85 flex items-center justify-center p-4" onClick={() => setSplitOpen(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="rodada-split-dialog">
            <div className="flex items-center gap-2 mb-4">
              <Scissors size={18} weight="duotone" className="text-sky-400" />
              <h3 className="font-outfit text-lg font-semibold flex-1">Dividir conta · {euro(openTotal)}</h3>
              <button onClick={() => setSplitOpen(false)} className="p-1.5 rounded bg-slate-800"><X size={14} weight="bold" /></button>
            </div>

            <div className="flex gap-2 mb-4">
              {[["equal", "Partes iguais"], ["items", "Por consumo"]].map(([v, l]) => (
                <button
                  key={v}
                  data-testid={`rodada-split-mode-${v}`}
                  onClick={() => setSplitMode(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border ${splitMode === v ? "bg-sky-500 text-slate-950 border-sky-500" : "bg-slate-950 border-slate-800 text-slate-300"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {splitMode === "items" && (
              <div className="space-y-2 mb-4">
                <div className="text-[11px] text-slate-500">
                  Cada unidade é atribuída à parte — 3 colas podem ficar para 3 sócios diferentes.
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {splitUnits.map((u) => (
                    <div key={u.key} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">
                        {u.product_name}
                        <span className="text-slate-500"> · rodada {u.round} · {euro(u.unit_price)}</span>
                      </span>
                      <select
                        data-testid={`rodada-split-unit-${u.key}`}
                        value={unitOwner[u.key] || ""}
                        onChange={(e) => setUnitOwner({ ...unitOwner, [u.key]: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white"
                      >
                        <option value="">— quem consumiu —</option>
                        {(table.members || []).map((m) => (
                          <option key={m.client_id} value={m.client_id}>{m.name.split(" ")[0]}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500">Atribuído: {euro(splitAssignedTotal)} de {euro(openTotal)}</div>
              </div>
            )}

            <div className="space-y-2 mb-4">
              <div className="text-[11px] text-slate-500">Como cada sócio liquida a sua parte</div>
              {(table.members || []).map((m) => (
                <div key={m.client_id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">
                    {m.name.split(" ")[0]}{m.member_number ? ` nº ${m.member_number}` : ""}
                    {splitMode === "equal" ? (
                      <span className="text-slate-500"> · {euro(openTotal / (table.members || []).length)}</span>
                    ) : (
                      <span className="text-slate-500"> · {euro(memberAssigned[m.client_id] || 0)}</span>
                    )}
                  </span>
                  <select
                    value={memberMethod[m.client_id] || "account"}
                    onChange={(e) => setMemberMethod({ ...memberMethod, [m.client_id]: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white"
                  >
                    {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <button
              data-testid="rodada-split-confirm"
              onClick={submitSplit}
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-sky-500 text-slate-950 font-bold disabled:opacity-40"
            >
              Confirmar divisão
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
