import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Flask, ArrowRight, Trash, X, CheckCircle } from "@phosphor-icons/react";

// Ferramenta de teste: cria consumos aleatórios reais (marcados como simulação)
// e mostra o impacto no total de vendas do dia. Pode ser removida a qualquer momento.
export default function SimulationModal({ onClose, onChanged }) {
  const [clients, setClients] = useState(5);
  const [amount, setAmount] = useState(50);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);

  const loadStatus = () =>
    api.get("/simulations/consumption")
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus(null));

  useEffect(() => {
    loadStatus();
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/simulations/consumption", {
        clients: Math.max(1, Math.min(50, Number(clients) || 1)),
        amount: Number(amount) || 0,
      });
      setResult(data);
      toast.success(`Simulação criada: ${data.created} consumo(s) · ${euro(data.total)}`);
      await loadStatus();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  // Remove apenas as vendas marcadas como simulação (os saldos dos clientes voltam ao valor anterior)
  const clear = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete("/simulations/consumption");
      toast.success(`Removidas ${data.removed} venda(s) de simulação · ${euro(data.total)}`);
      setResult(null);
      await loadStatus();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  // Torna as vendas de simulação efetivas: abate o stock, atribui pontos e marca presença
  const commit = async () => {
    const n = status?.count || 0;
    if (!window.confirm(`Tornar ${n} consumo(s) de simulação efetivos? O stock e os pontos passam a contar.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/simulations/consumption/commit");
      toast.success(`${data.committed} consumo(s) efetivados · ${euro(data.total)} · +${data.points} ponto(s)`);
      setResult(null);
      await loadStatus();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  // Renderizado no body para não ficar preso ao wrapper animado da página
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()} data-testid="simulation-modal">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-400/80">Teste · simulação</div>
            <h3 className="font-outfit text-2xl font-semibold mt-1">Simular consumos aleatórios</h3>
            <p className="text-xs text-slate-400 mt-1">
              Cria consumos aleatórios nos clientes escolhidos e mostra o impacto no total de vendas de hoje.
              Não mexe no stock, pontos ou presenças. As vendas ficam marcadas como <strong className="text-fuchsia-300">Simulação</strong> e podem ser removidas ou tornadas efetivas.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800" data-testid="simulation-close">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Nº de clientes</label>
            <input
              data-testid="simulation-clients"
              type="number"
              min={1}
              max={50}
              value={clients}
              onChange={(e) => setClients(e.target.value)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Valor a simular (€)</label>
            <input
              data-testid="simulation-amount"
              type="number"
              min={1}
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
          </div>
        </div>

        {(result || (status && status.count > 0)) && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-4 space-y-2 text-sm" data-testid="simulation-result">
            {result && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Vendas hoje</span>
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  {euro(result.today_before)} <ArrowRight size={12} className="text-slate-500" /> {euro(result.today_after)}
                  <span className="text-emerald-400">(+{euro(result.delta)})</span>
                </span>
              </div>
            )}
            {result && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Criado nesta simulação</span>
                <span className="font-bold text-fuchsia-300">{result.created} venda(s) · {euro(result.total)}</span>
              </div>
            )}
            {status && status.count > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Simulações ativas</span>
                <span className="font-bold text-slate-200">{status.count} venda(s) · {euro(status.total)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={busy || !(status && status.count > 0)}
            className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-medium flex items-center justify-center gap-2"
            data-testid="simulation-clear"
          >
            <Trash size={16} /> Remover
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={busy || !(status && status.count > 0)}
            title="Torna estes consumos reais: abate o stock, atribui pontos e marca presença"
            className="px-4 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 font-medium flex items-center justify-center gap-2"
            data-testid="simulation-commit"
          >
            <CheckCircle size={16} weight="fill" /> Tornar efetiva
          </button>
          <button
            data-testid="simulation-run"
            onClick={run}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-50 text-slate-950 font-bold flex items-center justify-center gap-2"
          >
            <Flask size={16} weight="fill" /> {busy ? "A simular..." : "Simular consumos"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
