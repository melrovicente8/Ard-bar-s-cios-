import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { printReceipt } from "../lib/receipt";
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
  PencilSimple,
  Check,
  Lightning,
  Printer,
  UserMinus,
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
  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [topProducts, setTopProducts] = useState([]);
  const [lastReceipt, setLastReceipt] = useState(null);
  const prefilledMembers = useRef(false);

  const load = async () => {
    const [c, p, t, all, top] = await Promise.all([
      api.get("/clients").catch(() => ({ data: [] })),
      api.get("/products").catch(() => ({ data: [] })),
      api.get("/group-tables", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
      api.get("/group-tables").catch(() => ({ data: [] })),
      api.get("/products/top", { params: { limit: 6 } }).catch(() => ({ data: [] })),
    ]);
    setClients(c.data || []);
    setProducts(p.data || []);
    setTables(t.data || []);
    setTopProducts(top.data || []);
    // Nova rodada: a mesa começa com os sócios da rodada anterior (podem sair ou entrar outros)
    const lastIds = (((all.data || [])[0] || {}).members || []).map((m) => m.client_id);
    if (!prefilledMembers.current && lastIds.length) {
      prefilledMembers.current = true;
      setMemberIds(lastIds);
    }
  };

  const refreshTable = async (id) => {
    const { data } = await api.get(`/group-tables/${id}`);
    setTable(data);
    const payers = {};
    const methods = {};
    (data.rounds || []).forEach((r) => {
      if (r.status !== "paid") {
        // Por omissão ninguém assume a despesa — o staff escolhe quem paga a rodada
        payers[r.number] = payers[r.number] || "";
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

  // Os 6 produtos com mais saída — atalhos para lançar a rodada num toque
  const quickTop = useMemo(
    () => topProducts
      .map((t) => products.find((p) => p.id === t.id) || t)
      .filter((p) => p && !p.is_quota && !p.is_house_account),
    [topProducts, products]
  );

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
  // O que falta dividir — uma divisão por consumo pode já ter liquidado parte
  const openTotal = table?.remaining_total != null
    ? table.remaining_total
    : openRounds.reduce((s, r) => s + (r.total || 0), 0);
  // Quem pode receber consumos: quem está à mesa + quem saiu a meio das rodadas em aberto
  const splitMembers = table?.split_members || table?.members || [];
  // Partes iguais: quem já assumiu (pagou) uma rodada fica de fora do que falta
  const equalMembers = table?.equal_split_members || table?.members || [];
  const alreadyPaidRound = (table?.members || []).filter(
    (m) => !equalMembers.some((e) => e.client_id === m.client_id)
  );

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
      const { data } = await api.post(`/group-tables/${table.id}/rounds/${round.number}/settle`, {
        payer_client_id: payer,
        method: methodByRound[round.number] || "account",
      });
      await refreshTable(table.id);
      setLastReceipt({ sale: data.sale, payment: data.payment, label: `Rodada ${round.number}` });
      toast.success("Rodada liquidada");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  // Consumos ainda por dividir — UMA linha por unidade (3 colas = 3 linhas, cada uma para o seu sócio)
  const splitUnits = useMemo(() => {
    const units = [];
    (table?.split_remaining || []).forEach((it) => {
      const unitPrice = Number(it.unit_price || 0);
      for (let i = 0; i < Number(it.quantity || 0); i += 1) {
        units.push({
          key: `${it.round}-${it.product_id}-${i}`,
          round: it.round,
          product_id: it.product_id,
          product_name: it.product_name,
          unit_price: unitPrice,
        });
      }
    });
    return units;
  }, [table?.split_remaining]);

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

  const printTicket = (tx) => {
    if (!tx) return;
    const res = printReceipt(tx, {});
    if (!res.ok) toast.error("Não foi possível abrir o talão — permite janelas pop-up");
  };

  const removeMember = async (member) => {
    if (!table || busy) return;
    if (!window.confirm(`Retirar ${member.name} da mesa? Sai a partir da próxima rodada — as rodadas anteriores continuam associadas a ele(a).`)) return;
    setBusy(true);
    try {
      const { data } = await api.delete(`/group-tables/${table.id}/members/${member.client_id}`);
      setTable(data);
      await load();
      toast.success("Sócio retirado da mesa");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

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
      splitMembers.forEach((m) => { methods[m.client_id] = memberMethod[m.client_id] || "account"; });
      const payload = { mode: splitMode, methods };
      if (splitMode === "items") {
        const byMember = {};
        splitUnits.forEach((u) => {
          const owner = unitOwner[u.key];
          if (!owner) return;
          byMember[owner] = byMember[owner] || [];
          const line = byMember[owner].find((x) => x.product_id === u.product_id && x.round === u.round);
          if (line) line.quantity += 1;
          else byMember[owner].push({ round: u.round, product_id: u.product_id, quantity: 1 });
        });
        if (!Object.keys(byMember).length) {
          setBusy(false);
          return toast.error("Atribui pelo menos um consumo a quem está a pagar");
        }
        payload.items_by_member = byMember;
      }
      const { data } = await api.post(`/group-tables/${table.id}/split`, payload);
      setTable(data.table);
      await load();
      onChanged?.();
      if (data.fully_split === false) {
        // Divisão a meio: o resto fica por dividir e paga-se sócio a sócio
        setUnitOwner({});
        setMemberMethod({});
        toast.success(`Parte liquidada — faltam ${euro(data.remaining_total || 0)} por dividir`);
        return;
      }
      setReceipt({ table: data.table, sales: data.sales || [], payments: data.payments || [] });
      setSplitOpen(false);
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

  const saveLabel = async () => {
    const label = labelDraft.trim();
    if (!label) return toast.error("Indica um nome para a mesa");
    setBusy(true);
    try {
      await api.put(`/group-tables/${table.id}`, { label });
      setRenaming(false);
      await refreshTable(table.id);
      await load();
      toast.success("Mesa renomeada");
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
              {receipt.sales.map((s) => {
                const pay = (receipt.payments || []).find((p) => (p.sale_ids || []).includes(s.id));
                return (
                  <li key={s.id} className="bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-3 text-sm" data-testid={`rodada-receipt-${s.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold text-slate-100">
                        <Receipt size={14} className="text-amber-400" /> {s.client_name}
                        <span className="text-[10px] text-slate-500">Transação nº {pay?.tx_number || s.tx_number}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <strong className="text-amber-300">{euro(s.total)}</strong>
                        <button
                          type="button"
                          onClick={() => printTicket(pay || s)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                          title="Imprimir talão"
                        >
                          <Printer size={13} />
                        </button>
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1 text-[11px] text-slate-400">
                      {(s.group_rounds || []).map((r) => (
                        <div key={r.number}>
                          <span className="text-slate-300 font-semibold">Rodada {r.number}</span>
                          {" · "}
                          {(r.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}
                          {(r.members_present || []).length ? (
                            <span className="text-slate-500"> · À mesa: {r.members_present.join(" · ")}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
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
                  {renaming ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        data-testid="rodada-label-input"
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveLabel();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                        className="bg-slate-950 border border-sky-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none"
                      />
                      <button data-testid="rodada-label-save" onClick={saveLabel} disabled={busy} className="p-1.5 rounded bg-sky-500 text-slate-950 disabled:opacity-40" title="Guardar">
                        <Check size={12} weight="bold" />
                      </button>
                      <button onClick={() => setRenaming(false)} className="p-1.5 rounded bg-slate-800 text-slate-300" title="Cancelar">
                        <X size={12} weight="bold" />
                      </button>
                    </div>
                  ) : (
                    <h3 className="font-outfit text-lg font-semibold flex items-center gap-1.5">
                      {table.label}
                      <button
                        type="button"
                        data-testid="rodada-label-edit"
                        onClick={() => { setRenaming(true); setLabelDraft(table.label || ""); }}
                        className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-slate-800"
                        title="Editar o nome da mesa"
                      >
                        <PencilSimple size={13} />
                      </button>
                    </h3>
                  )}
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5" data-testid="rodada-table-members">
                    {(table.members || []).map((m) => (
                      <span key={m.client_id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-800/70 text-slate-300">
                        {m.name.split(" ")[0]}{m.member_number ? ` nº ${m.member_number}` : ""}
                        {table.status === "open" && (table.members || []).length > 1 && (
                          <button
                            type="button"
                            data-testid={`rodada-remove-member-${m.client_id}`}
                            onClick={() => removeMember(m)}
                            disabled={busy}
                            title="Retirar este sócio da mesa"
                            className="text-slate-500 hover:text-rose-400 disabled:opacity-40"
                          >
                            <UserMinus size={10} weight="bold" />
                          </button>
                        )}
                      </span>
                    ))}
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

              {lastReceipt && (
                <div className="flex items-center justify-between gap-2 bg-emerald-500/5 border border-emerald-500/25 rounded-lg px-3 py-2 text-xs" data-testid="rodada-last-receipt">
                  <span className="text-emerald-200">
                    {lastReceipt.label} liquidada · Transação nº {lastReceipt.payment?.tx_number || lastReceipt.sale?.tx_number}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => printTicket(lastReceipt.payment || lastReceipt.sale)}
                      className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-bold flex items-center gap-1"
                    >
                      <Printer size={12} /> Talão
                    </button>
                    <button type="button" onClick={() => setLastReceipt(null)} className="text-slate-500 hover:text-slate-300">
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                </div>
              )}

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
              {quickTop.length > 0 && (
                <div className="space-y-1.5" data-testid="rodada-top-items">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Os 6 mais pedidos</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {quickTop.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-testid={`rodada-top-${p.id}`}
                        disabled={p.quantity <= 0}
                        onClick={() => addProduct(p)}
                        className="text-left px-2 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-[11px]"
                      >
                        <div className="truncate text-slate-200">{p.name}</div>
                        <div className="text-amber-400 font-bold">{euro(p.price)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                className="w-full py-2.5 rounded-lg bg-amber-500 text-slate-950 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Lightning size={16} weight="fill" /> Lançar rodada rápida
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
              <h3 className="font-outfit text-lg font-semibold flex-1">Dividir conta · {euro(openTotal)} por dividir</h3>
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
                  Podes liquidar só uma parte agora: o resto fica por dividir para o próximo sócio.
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {splitUnits.length === 0 && (
                    <div className="text-[11px] text-emerald-300">Tudo dividido.</div>
                  )}
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
                        {splitMembers.map((m) => (
                          <option key={m.client_id} value={m.client_id}>
                            {m.name.split(" ")[0]}{m.departed ? " (saiu)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500">
                  Atribuído agora: {euro(splitAssignedTotal)} de {euro(openTotal)} por dividir
                </div>
              </div>
            )}

            <div className="space-y-2 mb-4">
              <div className="text-[11px] text-slate-500">Como cada sócio liquida a sua parte</div>
              {splitMode === "equal" && alreadyPaidRound.length > 0 && (
                <div className="text-[11px] text-emerald-300/90" data-testid="rodada-split-excluded">
                  Já pagaram a sua parte e ficam fora desta divisão:{" "}
                  {alreadyPaidRound.map((m) => m.name.split(" ")[0]).join(" · ")}
                </div>
              )}
              {(splitMode === "equal"
                ? equalMembers
                : splitMembers.filter((m) => (memberAssigned[m.client_id] || 0) > 0)
              ).map((m) => (
                <div key={m.client_id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">
                    {m.name.split(" ")[0]}{m.member_number ? ` nº ${m.member_number}` : ""}
                    {m.departed && <span className="text-slate-500"> (saiu)</span>}
                    {splitMode === "equal" ? (
                      <span className="text-slate-500"> · {euro(openTotal / Math.max(equalMembers.length, 1))}</span>
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
              {splitMode === "items" ? "Liquidar esta parte" : "Confirmar divisão"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
