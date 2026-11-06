import React, { useEffect, useMemo, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { BeerStein, Users, X, Plus, MagnifyingGlass, ArrowCounterClockwise, ShoppingCart } from "@phosphor-icons/react";
import SocioRodadaConsumo from "./SocioRodadaConsumo";
import { toast } from "sonner";

/**
 * Rodada Mista na app do sócio: consulta as mesas em que está inserido
 * e permite iniciar uma nova mesa com outros sócios.
 */
const statusLabel = (status) => (status === "paid" ? "Paga" : "Em aberto");

export default function SocioRodadaMista() {
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderTable, setOrderTable] = useState(null); // mesa onde está a pedir consumo

  const load = () => {
    api.get("/socio/group-tables")
      .then(({ data: d }) => setData(d))
      .catch(() => setData({ open: [], closed: [] }));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!open) return;
    api.get("/socio/members").then(({ data: d }) => setMembers(d || [])).catch(() => setMembers([]));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = members.filter((m) => !picked.includes(m.id));
    if (!q) return list.slice(0, 40);
    return list
      .filter((m) => (m.name || "").toLowerCase().includes(q) || String(m.member_number || "").includes(q))
      .slice(0, 40);
  }, [members, search, picked]);

  const openTables = data?.open || [];

  const createTable = async () => {
    if (!picked.length) return toast.error("Escolhe pelo menos um sócio para a mesa");
    setBusy(true);
    try {
      await api.post("/socio/group-tables", { member_ids: picked, label: label.trim() || null });
      setPicked([]);
      setLabel("");
      setSearch("");
      setCreating(false);
      load();
      toast.success("Rodada Mista aberta — os sócios foram notificados");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={() => { setOpen(true); load(); }}
        data-testid="socio-rodada-card"
        title="Ver as rodadas mistas em que estás inserido e iniciar uma nova"
        className="bg-slate-950/60 border border-sky-500/30 hover:border-sky-500/60 rounded-xl p-5 transition-colors cursor-pointer"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400/80 flex items-center gap-1.5">
          <BeerStein size={11} weight="duotone" /> Rodada Mista
          <span className="text-sky-300/70 normal-case ml-auto">Ver ›</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span data-testid="socio-rodada-count" className="font-outfit text-4xl font-bold text-sky-300">
            {openTables.length}
          </span>
          <span className="text-slate-500 text-sm">
            mesa{openTables.length === 1 ? "" : "s"} em aberto
          </span>
        </div>
        <div className="text-[10px] text-slate-500 mt-2">
          {openTables.length
            ? `Em aberto: ${euro(openTables.reduce((s, t) => s + (t.open_total || 0), 0))}`
            : "Consulta as tuas mesas ou inicia uma nova"}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
          data-testid="socio-rodada-modal"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-5 my-6">
            <div className="flex items-center gap-2 mb-3">
              <BeerStein size={20} weight="duotone" className="text-sky-400" />
              <h3 className="font-outfit text-xl font-semibold flex-1">Rodada Mista</h3>
              <button onClick={load} className="p-1.5 rounded bg-slate-800" title="Atualizar">
                <ArrowCounterClockwise size={14} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded bg-slate-800"><X size={14} weight="bold" /></button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Cada rodada lançada pelo bar fica na conta da mesa. A divisão (partes iguais ou por consumo)
              e a rotação de pagadores são feitas no balcão.
            </p>

            {!creating ? (
              <>
                <div className="space-y-2" data-testid="socio-rodada-list">
                  {openTables.length === 0 && (
                    <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                      Não estás em nenhuma rodada mista aberta.
                    </div>
                  )}
                  {openTables.map((t) => (
                    <div key={t.id} className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4" data-testid={`socio-rodada-${t.id}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <strong className="text-slate-100">{t.label}</strong>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-500/15 text-sky-300 border-sky-500/30">
                          {t.open_rounds} rodada{t.open_rounds === 1 ? "" : "s"} em aberto
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        À mesa: {(t.members || []).map((m) => `${m.name.split(" ")[0]}${m.member_number ? ` (nº ${m.member_number})` : ""}`).join(" · ")}
                      </div>
                      {(t.rounds || []).length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {t.rounds.map((r) => (
                            <li key={r.number} className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span className="text-slate-500">Rodada {r.number}</span>
                              <span className="flex-1 truncate">
                                {(r.items || []).map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}
                              </span>
                              <span className="text-amber-300 font-bold">{euro(r.total)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                r.status === "paid" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                              }`}>
                                {statusLabel(r.status)}{r.payer_name ? ` · ${r.payer_name.split(" ")[0]}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {t.status === "open" && (
                        <button
                          data-testid={`socio-rodada-order-${t.id}`}
                          onClick={() => setOrderTable(t)}
                          className="mt-2 w-full py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center justify-center gap-2"
                        >
                          <ShoppingCart size={13} weight="fill" /> Pedir consumo nesta mesa
                        </button>
                      )}
                      <div className="mt-2 pt-2 border-t border-sky-500/20 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          A tua parte se dividirem: <strong className="text-slate-300">{euro(t.share_if_split)}</strong>
                        </span>
                        <span className="font-outfit text-lg font-bold text-amber-300">{euro(t.open_total)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {openTables.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 text-[11px] text-sky-200">
                    Já tens uma Rodada Mista aberta — pede o consumo dentro dessa mesa.
                    Só depois de ela ser fechada no balcão é que podes abrir outra.
                  </div>
                ) : (
                  <button
                    data-testid="socio-rodada-new"
                    onClick={() => setCreating(true)}
                    className="mt-4 w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold flex items-center justify-center gap-2"
                  >
                    <Plus size={15} weight="bold" /> Iniciar nova rodada mista
                  </button>
                )}
              </>
            ) : (
              <div data-testid="socio-rodada-create">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
                  Nova mesa · escolhe os sócios que se juntam a ti
                </div>
                <input
                  data-testid="socio-rodada-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Nome da mesa (opcional) — ex.: Mesa do Fontes"
                  className="w-full mb-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
                {picked.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {picked.map((id) => {
                      const m = members.find((x) => x.id === id);
                      return (
                        <span key={id} className="px-2 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1">
                          {(m?.name || "").split(" ")[0]}
                          <button onClick={() => setPicked(picked.filter((i) => i !== id))}><X size={10} weight="bold" /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="relative mb-2">
                  <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    data-testid="socio-rodada-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Procurar sócio / nº sócio..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/60">
                  {filtered.map((m) => (
                    <button
                      key={m.id}
                      data-testid={`socio-rodada-member-${m.id}`}
                      onClick={() => setPicked([...picked, m.id])}
                      className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/50 flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {m.name}
                        {m.member_number ? <span className="text-slate-500 text-xs"> · nº {m.member_number}</span> : null}
                      </span>
                      <Plus size={11} weight="bold" className="text-sky-400 shrink-0" />
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="px-3 py-3 text-xs text-slate-500">Sem sócios para mostrar</div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    data-testid="socio-rodada-create-confirm"
                    onClick={createTable}
                    disabled={busy || !picked.length}
                    className="flex-1 py-2.5 rounded-lg bg-sky-500 text-slate-950 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Users size={15} weight="duotone" /> Abrir mesa ({picked.length + 1})
                  </button>
                  <button onClick={() => { setCreating(false); setPicked([]); }} className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {(data?.closed || []).length > 0 && !creating && (
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">Rodadas anteriores</div>
                <ul className="text-[11px] text-slate-500 space-y-1">
                  {data.closed.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{t.label}</span>
                      <span className="whitespace-nowrap">{euro(t.total)} · fechada</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {orderTable && (
        <SocioRodadaConsumo
          table={orderTable}
          onClose={() => setOrderTable(null)}
          onSent={() => { setOrderTable(null); load(); }}
        />
      )}
    </>
  );
}
