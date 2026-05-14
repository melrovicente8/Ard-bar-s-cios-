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
  Eye,
  EyeSlash,
  Bell,
  ChatCircle,
  DeviceMobile,
  Coffee,
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

const MASK = "••••";

const StatCard = ({ icon: Icon, label, value, accent, testid, to, masked = false, unmaskedDefault = false }) => {
  const [revealed, setRevealed] = useState(unmaskedDefault);
  useEffect(() => {
    if (revealed && masked && !unmaskedDefault) {
      const t = setTimeout(() => setRevealed(false), 8000);
      return () => clearTimeout(t);
    }
  }, [revealed, masked, unmaskedDefault]);
  const shownValue = masked && !revealed ? MASK : value;
  const inner = (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
          {label}
          {masked && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealed((v) => !v); }}
              className="text-slate-500 hover:text-amber-400"
              data-testid={`${testid}-toggle-mask`}
              title={revealed ? "Mascarar" : "Mostrar"}
            >
              {revealed ? <EyeSlash size={11} weight="duotone" /> : <Eye size={11} weight="duotone" />}
            </button>
          )}
        </div>
        <div className={`mt-3 font-outfit text-3xl font-bold tracking-tight ${masked && !revealed ? "text-slate-500" : "text-white"}`}>
          {shownValue}
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

function useGreeting(userName) {
  const now = new Date();
  const h = now.getHours();
  let greet = "Bom dia";
  if (h >= 12 && h < 19) greet = "Boa tarde";
  else if (h >= 19 || h < 5) greet = "Boa noite";
  const closingWarning = h >= 2 && h < 5;
  const hh = String(h).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  return { greet, hh, name: userName, closingWarning };
}

const PRESIDENT_MESSAGES = [
  "“O bar é a casa de todos os sócios — cuidemos dela como se fosse nossa.”",
  "“Hoje é dia de servir bem e sorrir mais.”",
  "“Cada cliente que entra leva consigo uma memória do ARD.”",
  "“Disciplina e ambiente: a receita do nosso clube.”",
  "“Pequenas tarefas bem feitas constroem grandes resultados.”",
  "“Obrigado por estares aqui hoje — sem ti não há ARD.”",
  "“Pagar as cotas é apoiar quem vem a seguir.”",
];
function getPresidentMessage() {
  const day = new Date().getDay();
  return PRESIDENT_MESSAGES[day % PRESIDENT_MESSAGES.length];
}

export default function Dashboard() {
  const { user } = useAuth();
  const canSeeStockValue = user?.role === "admin" || user?.role === "tesoureiro";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState({ requests: 0, messages: 0, mbway: 0 });
  const greeting = useGreeting(user?.name || user?.email || "");

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    try {
      const [r, m, mb] = await Promise.all([
        api.get("/consumption-requests", { params: { status_filter: "pending" } }).catch(() => ({ data: [] })),
        api.get("/socio-messages", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
        api.get("/mbway-payments").catch(() => ({ data: [] })),
      ]);
      const pendingMb = (mb.data || []).filter((x) => x.status === "pending").length;
      setPending({ requests: (r.data || []).length, messages: (m.data || []).length, mbway: pendingMb });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadPending();
    const t = setInterval(loadPending, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading)
    return (
      <div className="p-12 text-slate-500" data-testid="dashboard-loading">
        A carregar...
      </div>
    );

  return (
    <div className="p-6 md:p-10 space-y-6 animate-in" data-testid="dashboard-page">
      {/* Saudação + hora + mensagem do presidente */}
      <div className="bg-gradient-to-r from-amber-500/10 via-slate-900/60 to-green-500/10 border border-amber-500/20 rounded-xl p-5 md:p-6">
        <div className="flex items-start md:items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400/80">
              {greeting.hh} · ARD Nespereira
            </div>
            <h1 className="font-outfit text-2xl sm:text-3xl font-bold tracking-tight mt-1" data-testid="dashboard-greeting">
              {greeting.greet}, <span className="text-amber-300">{greeting.name}</span>!
            </h1>
            <p className="text-sm text-slate-300 italic mt-2 max-w-2xl" data-testid="president-message">
              {getPresidentMessage()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {pending.requests > 0 && (
              <Link to="/pedidos" data-testid="alert-requests" className="px-3 py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <Bell size={13} weight="fill" /> {pending.requests} pedido(s) por validar
              </Link>
            )}
            {pending.mbway > 0 && (
              <Link to="/mbway" data-testid="alert-mbway" className="px-3 py-2 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <DeviceMobile size={13} weight="fill" /> {pending.mbway} MBWay
              </Link>
            )}
            {pending.messages > 0 && (
              <Link to="/mensagens" data-testid="alert-messages" className="px-3 py-2 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <ChatCircle size={13} weight="fill" /> {pending.messages} mensagem(s)
              </Link>
            )}
          </div>
        </div>
        {greeting.closingWarning && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm font-bold flex items-center gap-2" data-testid="closing-warning">
            <Coffee size={16} weight="fill" /> Atenção: já passou das 2h. Por favor, prepare o fecho do bar.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        <StatCard
          testid="kpi-today-sales"
          icon={CurrencyEur}
          label="Vendas hoje"
          value={euro(data.today_sales_total)}
          accent="bg-amber-500/10 text-amber-500"
          to="/vender"
          unmaskedDefault
        />
        <StatCard
          testid="kpi-week-sales"
          icon={Calendar}
          label="Vendas semana"
          value={euro(data.week_sales_total || 0)}
          accent="bg-amber-500/10 text-amber-400"
          to="/vender"
          masked
        />
        <StatCard
          testid="kpi-month-sales"
          icon={CalendarBlank}
          label="Vendas mês"
          value={euro(data.month_sales_total || 0)}
          accent="bg-amber-500/10 text-amber-300"
          to="/vender"
          masked
        />
        <StatCard
          testid="kpi-outstanding"
          icon={ReceiptX}
          label="A receber clientes"
          value={euro(data.outstanding_debt)}
          accent="bg-rose-500/10 text-rose-400"
          to="/dividas"
          unmaskedDefault
        />
        <StatCard
          testid="kpi-suppliers-debt"
          icon={Truck}
          label="A pagar fornecedores"
          value={euro(data.suppliers_debt || 0)}
          accent="bg-fuchsia-500/10 text-fuchsia-300"
          to="/fornecedores"
          masked
        />
        {canSeeStockValue && (
          <StatCard
            testid="kpi-stock-value"
            icon={Package}
            label="Valor stock"
            value={euro(data.total_stock_value)}
            accent="bg-emerald-500/10 text-emerald-400"
            to="/stock"
            masked
          />
        )}
        <StatCard
          testid="kpi-clients"
          icon={Users}
          label="Clientes"
          value={data.clients_count}
          accent="bg-sky-500/10 text-sky-400"
          to="/clientes"
          masked
        />
        <StatCard
          testid="kpi-debtors"
          icon={Warning}
          label="Pessoas em dívida"
          value={data.today_debtors_count || 0}
          accent="bg-orange-500/10 text-orange-300"
          to="/dividas"
          unmaskedDefault
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
