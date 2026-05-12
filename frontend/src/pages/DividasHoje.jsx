import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro } from "../lib/api";
import { Wallet, ArrowRight, Medal, MagnifyingGlass } from "@phosphor-icons/react";

export default function DividasHoje() {
  const [debtors, setDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/clients-with-debt");
        setDebtors(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? debtors.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.member_number || "").toLowerCase().includes(q) ||
          (c.contact || "").toLowerCase().includes(q)
      )
    : debtors;

  const totalDebt = debtors.reduce((s, c) => s + Math.max(c.balance || 0, 0), 0);
  const totalSocios = debtors.filter((c) => c.is_member).length;

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="dividas-page">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
          A receber
        </div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1 flex items-center gap-3">
          <Wallet size={32} weight="duotone" className="text-amber-400" /> Dívidas em aberto
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Lista de sócios e clientes com saldo por pagar — clica para abrir a ficha e registar pagamento.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Stat label="Total em dívida" value={euro(totalDebt)} accent="text-rose-300" />
        <Stat label="Pessoas em dívida" value={debtors.length} />
        <Stat label="Dos quais sócios" value={totalSocios} accent="text-green-300" />
      </div>

      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          data-testid="dividas-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar..."
          className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-11 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">A carregar...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet size={40} className="mx-auto text-slate-700 mb-3" weight="duotone" />
            <p className="text-slate-400">Sem dívidas em aberto. 🎉</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Estatuto</th>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 font-medium text-right">Pontos</th>
                  <th className="px-5 py-3 font-medium text-right">Dívida</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} data-testid={`debtor-row-${c.id}`} className="border-t border-slate-800/60 hover:bg-slate-900/60">
                    <td className="px-5 py-3">
                      <Link to={`/clientes/${c.id}`} className="font-medium text-slate-100 hover:text-amber-400 flex items-center gap-2">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {c.is_member ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/30 inline-flex items-center gap-1">
                          <Medal size={10} weight="fill" /> Sócio {c.member_number ? `nº ${c.member_number}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{c.contact || "—"}</td>
                    <td className="px-5 py-3 text-right text-amber-300">{c.points || 0}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-outfit text-lg font-bold text-rose-400">{euro(c.balance)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <Link
                          data-testid={`debtor-ficha-${c.id}`}
                          to={`/clientes/${c.id}`}
                          className="px-3 py-1.5 rounded-md text-xs font-bold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 flex items-center gap-1.5"
                        >
                          Abrir ficha <ArrowRight size={12} weight="bold" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const Stat = ({ label, value, accent = "text-slate-200" }) => (
  <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
    <div className={`mt-2 font-outfit text-2xl font-bold ${accent}`}>{value}</div>
  </div>
);
