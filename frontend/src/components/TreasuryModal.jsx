import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Printer, X, ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT") : "—");

/**
 * Detalhe de movimentos de Caixa ou Banco, com impressão do movimento isolado.
 * account: "cash" | "bank"
 */
export default function TreasuryModal({ account, onClose }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState({ from: "", to: "" });

  const load = async () => {
    try {
      const params = { account };
      if (range.from) params.date_from = range.from;
      if (range.to) params.date_to = range.to;
      const { data } = await api.get("/treasury/movements", { params });
      setData(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const print = () => {
    if (!data) return;
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) return toast.error("Permite popups para imprimir");
    const rows = data.movements.map((m) => `
      <tr><td>${m.tx_number ? "#" + m.tx_number : "—"}</td><td>${fmtDate(m.date)}</td>
      <td>${m.description}${m.detail ? " · " + m.detail : ""}</td>
      <td style="text-align:right;color:${m.direction === "in" ? "#047857" : "#b91c1c"}">${m.direction === "in" ? "+" : "−"}${euro(m.amount)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Movimento · ${data.label}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;font-size:12px}h1{font-size:16px;margin:0}h2{font-size:12px;color:#555;margin:4px 0 16px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}
.tot{display:flex;gap:24px;margin:12px 0;font-weight:bold}@media print{button{display:none}}</style></head><body>
<h1>ARD Nespereira · Movimento detalhado de ${data.label}</h1>
<h2>Saldo contabilístico: ${euro(data.balance)} · Entradas ${euro(data.total_in)} · Saídas ${euro(data.total_out)} · Emitido ${new Date().toLocaleString("pt-PT")}</h2>
<table><thead><tr><th>N.º</th><th>Data/Hora</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sem movimentos</td></tr>'}</tbody></table>
<div style="margin-top:20px"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(),300);</script></body></html>`);
    w.document.close();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose} data-testid="treasury-modal">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Tesouraria</div>
            <h3 className="font-outfit text-xl font-semibold">Movimento detalhado · {data?.label || "—"}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={print} disabled={!data} className="px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40">
              <Printer size={13} /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800" data-testid="treasury-close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">De</label>
              <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Até</label>
              <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <button onClick={load} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">Aplicar</button>
            {data && (
              <div className="ml-auto flex gap-4 text-sm">
                <span className="text-emerald-300 flex items-center gap-1"><ArrowUp size={13} /> {euro(data.total_in)}</span>
                <span className="text-rose-300 flex items-center gap-1"><ArrowDown size={13} /> {euro(data.total_out)}</span>
                <span className="font-bold text-amber-300">Saldo {euro(data.balance)}</span>
              </div>
            )}
          </div>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-950/90">
                <tr className="text-slate-500 text-[11px] uppercase">
                  <th className="px-3 py-2">N.º</th>
                  <th className="px-3 py-2">Data/Hora</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(data?.movements || []).map((m) => (
                  <tr key={`${m.id}-${m.tx_number}`} className="border-t border-slate-800/60">
                    <td className="px-3 py-2 font-mono text-xs">
                      {m.tx_number ? <Link to={`/transacoes/${m.tx_number}`} onClick={onClose} className="text-amber-400 hover:underline">#{m.tx_number}</Link> : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(m.date)}</td>
                    <td className="px-3 py-2 text-slate-300">{m.description}{m.detail ? <span className="text-slate-500"> · {m.detail}</span> : null}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${m.direction === "in" ? "text-emerald-300" : "text-rose-300"}`}>
                      {m.direction === "in" ? "+" : "−"}{euro(m.amount)}
                    </td>
                  </tr>
                ))}
                {data && data.movements.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-500 py-8">Sem movimentos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
