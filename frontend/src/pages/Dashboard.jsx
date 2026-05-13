import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  CurrencyEur,
  Package,
  Users,
  Warning,
  ReceiptX,
  TrendUp,
  Truck,
  Calendar,
  CalendarBlank,
} from "@phosphor-icons/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const StatCard = ({ icon: Icon, label, value, accent, testid, to }) => {
  const inner = (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        <div className="mt-3 font-outfit text-3xl font-bold tracking-tight text-white">
          {value}
        </div>
      </div>
      <div className={`p-3 rounded-lg ${accent}`}>
        <Icon size={22} weight="duotone" />
      </div>
    </div>
  );
  const cls = "block bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-amber-500/40 transition-colors";
  if (to) return <Link to={to} data-testid={testid} className={cls}>{inner}</Link>;
  return <div data-testid={testid} className={cls}>{inner}</div>;
};

export default function Dashboard() {
  const { user } = useAuth();
  const canSeeStockValue = user?.role === "admin" || user?.role === "tesoureiro";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading)
    return (
      <div className="p-12 text-slate-500" data-testid="dashboard-loading">
        A carregar...
      </div>
    );

  return (
    <div className="p-6 md:p-10 space-y-8 animate-in" data-testid="dashboard-page">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
          Resumo
        </div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
          Dashboard
        </h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        <StatCard
          testid="kpi-today-sales"
          icon={CurrencyEur}
          label="Vendas hoje"
          value={euro(data.today_sales_total)}
          accent="bg-amber-500/10 text-amber-500"
          to="/vender"
        />
        <StatCard
          testid="kpi-week-sales"
          icon={Calendar}
          label="Vendas semana"
          value={euro(data.week_sales_total || 0)}
          accent="bg-amber-500/10 text-amber-400"
          to="/vender"
        />
        <StatCard
          testid="kpi-month-sales"
          icon={CalendarBlank}
          label="Vendas mês"
          value={euro(data.month_sales_total || 0)}
          accent="bg-amber-500/10 text-amber-300"
          to="/vender"
        />
        <StatCard
          testid="kpi-outstanding"
          icon={ReceiptX}
          label="A receber clientes"
          value={euro(data.outstanding_debt)}
          accent="bg-rose-500/10 text-rose-400"
          to="/dividas"
        />
        <StatCard
          testid="kpi-suppliers-debt"
          icon={Truck}
          label="A pagar fornecedores"
          value={euro(data.suppliers_debt || 0)}
          accent="bg-fuchsia-500/10 text-fuchsia-300"
          to="/fornecedores"
        />
        {canSeeStockValue && (
          <StatCard
            testid="kpi-stock-value"
            icon={Package}
            label="Valor stock"
            value={euro(data.total_stock_value)}
            accent="bg-emerald-500/10 text-emerald-400"
            to="/stock"
          />
        )}
        <StatCard
          testid="kpi-clients"
          icon={Users}
          label="Clientes"
          value={data.clients_count}
          accent="bg-sky-500/10 text-sky-400"
          to="/clientes"
        />
        <StatCard
          testid="kpi-debtors"
          icon={Warning}
          label="Pessoas em dívida"
          value={data.today_debtors_count || 0}
          accent="bg-orange-500/10 text-orange-300"
          to="/dividas"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Últimos 7 dias
              </div>
              <h3 className="font-outfit text-xl font-semibold mt-1">
                Vendas por dia
              </h3>
            </div>
            <TrendUp size={22} className="text-amber-500" weight="duotone" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.sales_last_7_days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                  formatter={(v) => euro(v)}
                />
                <Bar dataKey="total" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low stock */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6" data-testid="low-stock-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Atenção
              </div>
              <h3 className="font-outfit text-xl font-semibold mt-1">
                Stock baixo
              </h3>
            </div>
            <Warning size={22} className="text-rose-400" weight="duotone" />
          </div>
          {data.low_stock.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">
              Tudo em ordem 
            </div>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {data.low_stock.map((p) => (
                <li
                  key={p.id}
                  data-testid={`low-stock-item-${p.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10"
                >
                  <span className="text-sm font-medium text-slate-200">
                    {p.name}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    {p.quantity} un.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent sales */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Atividade recente
        </div>
        <h3 className="font-outfit text-xl font-semibold mt-1 mb-4">
          Últimas vendas
        </h3>
        {data.recent_sales.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">
            Sem vendas ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 font-medium">Data</th>
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Itens</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_sales.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-slate-800/60 hover:bg-slate-900/40"
                  >
                    <td className="py-3 text-slate-400">
                      {new Date(s.created_at).toLocaleString("pt-PT")}
                    </td>
                    <td className="py-3 text-slate-200 font-medium">
                      <Link to={`/clientes/${s.client_id}`} className="hover:text-amber-400">
                        {s.client_name}
                      </Link>
                    </td>
                    <td className="py-3 text-slate-400">
                      {s.items.reduce((a, b) => a + b.quantity, 0)} produto(s)
                    </td>
                    <td className="py-3 text-right text-amber-400 font-semibold">
                      {euro(s.total)}
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
