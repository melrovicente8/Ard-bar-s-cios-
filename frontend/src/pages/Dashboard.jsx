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
  Vault,
  Bank,
  Coffee,
  Cake,
  Trophy,
  SquaresFour,
  CaretLeft,
  CaretRight,
  DotsSixVertical,
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

const isoDate = (d) => d.toISOString().slice(0, 10);

const StatCard = ({ icon: Icon, label, value, accent, testid, to, masked = false, unmaskedDefault = false, forceHidden = false, details = null }) => {
  const [revealed, setRevealed] = useState(unmaskedDefault);
  useEffect(() => {
    if (revealed && masked && !unmaskedDefault) {
      const t = setTimeout(() => setRevealed(false), 8000);
      return () => clearTimeout(t);
    }
  }, [revealed, masked, unmaskedDefault]);
  const isMasked = forceHidden || (masked && !revealed);
  const shownValue = isMasked ? MASK : value;
  const inner = (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
          {label}
          {masked && !forceHidden && (
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
        <div className={`mt-2 font-outfit text-2xl font-bold tracking-tight ${isMasked ? "text-slate-500" : "text-white"}`}>
          {shownValue}
        </div>
        {details && !isMasked && (
          <div className="mt-2 space-y-1">
            {details.map((d) => (
              <div key={d.label} className="flex items-baseline justify-between gap-3 text-[11px]" data-testid={d.testid}>
                <span className="text-slate-400">{d.label}</span>
                <span className="font-bold text-slate-200">{d.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`p-2 rounded-lg ${accent}`}>
        <Icon size={16} weight="duotone" />
      </div>
    </div>
  );
  const cls = "block h-full bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-lg px-4 py-3 hover:border-amber-500/40 transition-colors";
  if (to) return <Link to={to} data-testid={testid} className={cls}>{inner}</Link>;
  return <div data-testid={testid} className={cls}>{inner}</div>;
};

// ---- Cartões do dashboard: ordem editável (arrastar ou setas) ----
const KPI_ORDER_KEY = "ardn.dashboard.kpiOrder";
const KPI_DEFAULT_ORDER = [
  "today-sales", "week-sales", "month-sales", "outstanding", "suppliers-debt",
  "stock-value", "cash", "bank", "clients", "debtors",
];
const readKpiOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KPI_ORDER_KEY) || "null");
    if (Array.isArray(saved)) return saved.filter((v) => typeof v === "string");
  } catch {
    /* ordem inválida — usa a de origem */
  }
  return KPI_DEFAULT_ORDER;
};

const KpiSlot = ({ id, style, editing, dragging, onDragStart, onDragOver, onDrop, onDragEnd, onMove, children }) => (
  <div
    style={style}
    draggable={editing}
    onDragStart={(e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      onDragStart(id);
    }}
    onDragOver={(e) => {
      if (!editing) return;
      e.preventDefault();
      onDragOver(id);
    }}
    onDrop={(e) => {
      if (!editing) return;
      e.preventDefault();
      onDrop(e.dataTransfer.getData("text/plain") || dragging, id);
    }}
    onDragEnd={onDragEnd}
    data-testid={`kpi-slot-${id}`}
    data-kpi-id={id}
    className={`relative h-full rounded-lg ${editing ? "ring-1 ring-amber-500/40 cursor-grab active:cursor-grabbing" : ""} ${dragging === id ? "opacity-40" : ""}`}
  >
    <div className={`h-full ${editing ? "pointer-events-none select-none" : ""}`}>{children}</div>
    {editing && (
      <div className="absolute -top-2.5 right-2 z-10 flex items-center gap-0.5 bg-slate-900 border border-amber-500/50 rounded-md px-1 py-0.5 shadow-lg">
        <button
          type="button"
          onClick={() => onMove(id, -1)}
          title="Mover para a esquerda"
          data-testid={`kpi-move-prev-${id}`}
          className="p-0.5 text-slate-300 hover:text-amber-400"
        >
          <CaretLeft size={12} weight="bold" />
        </button>
        <DotsSixVertical size={12} className="text-slate-500" />
        <button
          type="button"
          onClick={() => onMove(id, 1)}
          title="Mover para a direita"
          data-testid={`kpi-move-next-${id}`}
          className="p-0.5 text-slate-300 hover:text-amber-400"
        >
          <CaretRight size={12} weight="bold" />
        </button>
      </div>
    )}
  </div>
);

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
  const isDirection = ["admin", "tesoureiro", "presidente"].includes(user?.role);
  // Funcionários veem o valor em caixa, exceto durante o fecho (02:00–08:00)
  const cashHour = new Date().getHours();
  const cashHiddenForStaff = !isDirection && cashHour >= 2 && cashHour < 8;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Valor de stock (venda/custo) fica oculto até ser revelado
  const [stockRevealed, setStockRevealed] = useState(false);
  // Ordem dos cartões (guardada neste dispositivo) + modo de edição
  const [kpiOrder, setKpiOrder] = useState(readKpiOrder);
  const [editCards, setEditCards] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const fullKpiOrder = () => {
    const saved = kpiOrder.filter((id) => KPI_DEFAULT_ORDER.includes(id));
    return [...saved, ...KPI_DEFAULT_ORDER.filter((id) => !saved.includes(id))];
  };
  const persistKpiOrder = (ids) => {
    setKpiOrder(ids);
    try {
      localStorage.setItem(KPI_ORDER_KEY, JSON.stringify(ids));
    } catch {
      /* sem armazenamento local — a ordem fica só nesta sessão */
    }
  };
  const moveKpi = (id, delta) => {
    const ids = fullKpiOrder();
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    persistKpiOrder(ids);
  };
  const dropKpi = (sourceId, targetId) => {
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = fullKpiOrder().filter((x) => x !== sourceId);
    const at = ids.indexOf(targetId);
    ids.splice(at < 0 ? ids.length : at, 0, sourceId);
    persistKpiOrder(ids);
  };
  const kpiStyle = (id) => {
    const i = kpiOrder.indexOf(id);
    const fallback = KPI_DEFAULT_ORDER.indexOf(id);
    return { order: i >= 0 ? i : kpiOrder.length + (fallback < 0 ? 0 : fallback) };
  };
  const kpiSlot = (id, node) => (
    <KpiSlot
      key={id}
      id={id}
      style={kpiStyle(id)}
      editing={editCards}
      dragging={draggingId}
      onDragStart={setDraggingId}
      onDragOver={() => {}}
      onDrop={dropKpi}
      onDragEnd={() => setDraggingId(null)}
      onMove={moveKpi}
    >
      {node}
    </KpiSlot>
  );
  const cashBank = data ? (data.cash_bank || null) : null;
  const greeting = useGreeting(user?.name || user?.email || "");

  const load = async () => {
    try {
      const [dash, top] = await Promise.all([
        api.get("/dashboard"),
        api.get("/products/top", { params: { limit: 10 } }).catch(() => ({ data: [] })),
      ]);
      setData({ ...dash.data, top_products: top.data });
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
            <button
              type="button"
              onClick={() => { setEditCards((v) => !v); setDraggingId(null); }}
              data-testid="dashboard-edit-cards"
              title="Editar cartões: arrasta ou usa as setas para mudar a ordem"
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                editCards
                  ? "bg-amber-500 text-slate-950 border-amber-500 hover:bg-amber-400"
                  : "bg-slate-900/60 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <SquaresFour size={15} weight="duotone" /> {editCards ? "Concluir" : "Editar cartões"}
            </button>
            {editCards && (
              <button
                type="button"
                onClick={() => persistKpiOrder(KPI_DEFAULT_ORDER)}
                data-testid="dashboard-reset-cards"
                className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-900/60 text-slate-400 border border-slate-700 hover:text-white"
              >
                Repor ordem
              </button>
            )}
          </div>
        </div>
        {greeting.closingWarning && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm font-bold flex items-center gap-2" data-testid="closing-warning">
            <Coffee size={16} weight="fill" /> Atenção: já passou das 2h. Por favor, prepare o fecho do bar.
          </div>
        )}
      </div>

      {editCards && (
        <p className="text-xs text-amber-300/80 -mb-2" data-testid="dashboard-edit-hint">
          Modo edição: arrasta os cartões ou usa as setas para mudar a ordem. A ordem fica guardada neste dispositivo.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpiSlot("today-sales", (
        <StatCard
          testid="kpi-today-sales"
          icon={CurrencyEur}
          label="Vendas hoje"
          value={euro(data.today_sales_total)}
          accent="bg-amber-500/10 text-amber-500"
          to={`/transacoes?kind=sale&from=${isoDate(new Date())}&to=${isoDate(new Date())}`}
          unmaskedDefault
        />
        ))}
        {kpiSlot("week-sales", (
        <StatCard
          testid="kpi-week-sales"
          icon={Calendar}
          label="Vendas semana"
          value={euro(data.week_sales_total || 0)}
          accent="bg-amber-500/10 text-amber-400"
          to={`/transacoes?kind=sale&from=${isoDate(new Date(Date.now() - 7 * 86400000))}&to=${isoDate(new Date())}`}
          masked
        />
        ))}
        {kpiSlot("month-sales", (
        <StatCard
          testid="kpi-month-sales"
          icon={CalendarBlank}
          label="Vendas mês"
          value={euro(data.month_sales_total || 0)}
          accent="bg-amber-500/10 text-amber-300"
          to={`/transacoes?kind=sale&from=${isoDate(new Date(Date.now() - 30 * 86400000))}&to=${isoDate(new Date())}`}
          masked
        />
        ))}
        {kpiSlot("outstanding", (
        <StatCard
          testid="kpi-outstanding"
          icon={ReceiptX}
          label="Valores em dívida"
          value={euro(data.outstanding_debt)}
          accent="bg-rose-500/10 text-rose-400"
          to="/dividas"
          unmaskedDefault
        />
        ))}
        {kpiSlot("suppliers-debt", (
        <StatCard
          testid="kpi-suppliers-debt"
          icon={Truck}
          label="A pagar fornecedores"
          value={euro(data.suppliers_debt || 0)}
          accent="bg-fuchsia-500/10 text-fuchsia-300"
          to="/fornecedores"
          masked
        />
        ))}
        {canSeeStockValue && kpiSlot("stock-value", (
          <Link
            to="/stock"
            data-testid="kpi-stock-value"
            className="block h-full bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-lg px-4 py-3 hover:border-amber-500/40 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
                Valor de stock
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStockRevealed((v) => !v); }}
                  className="text-slate-500 hover:text-amber-400"
                  data-testid="kpi-stock-value-toggle-mask"
                  title={stockRevealed ? "Ocultar" : "Mostrar"}
                >
                  {stockRevealed ? <EyeSlash size={11} weight="duotone" /> : <Eye size={11} weight="duotone" />}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Package size={16} weight="duotone" />
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-slate-400">Venda ao público</span>
                <span className={`font-outfit text-lg font-bold ${stockRevealed ? "text-white" : "text-slate-500"}`} data-testid="kpi-stock-value-sale">{stockRevealed ? euro(data.total_stock_value) : MASK}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-slate-400">Preço de custo</span>
                <span className={`font-outfit text-sm font-bold ${stockRevealed ? "text-slate-300" : "text-slate-500"}`} data-testid="kpi-stock-value-cost">{stockRevealed ? euro(data.total_stock_cost || 0) : MASK}</span>
              </div>
            </div>
          </Link>
        ))}
        {cashBank && kpiSlot("cash", (
          <StatCard
            testid="kpi-cash"
            icon={Vault}
            label="Valor em caixa"
            value={euro(cashBank.cash_balance)}
            accent="bg-amber-500/10 text-amber-300"
            to="/banco"
            masked={isDirection}
            unmaskedDefault={!isDirection && !cashHiddenForStaff}
            forceHidden={cashHiddenForStaff}
            details={[
              { label: "Recebido em numerário", value: euro(cashBank.cash_numerario || 0), testid: "kpi-cash-numerario" },
              { label: "MBWay (direto para o banco)", value: euro(cashBank.cash_mbway || 0), testid: "kpi-cash-mbway" },
            ]}
          />
        ))}
        {cashBank && cashBank.bank_balance != null && kpiSlot("bank", (
          <StatCard
            testid="kpi-bank"
            icon={Bank}
            label="Valor em banco"
            value={euro(cashBank.bank_balance)}
            accent="bg-emerald-500/10 text-emerald-400"
            to="/banco"
            masked
          />
        ))}
        {kpiSlot("clients", (
        <StatCard
          testid="kpi-clients"
          icon={Users}
          label="Clientes"
          value={data.clients_count}
          accent="bg-sky-500/10 text-sky-400"
          to="/clientes"
          masked
        />
        ))}
        {kpiSlot("debtors", (
        <StatCard
          testid="kpi-debtors"
          icon={Warning}
          label="Pessoas em dívida"
          value={data.today_debtors_count || 0}
          accent="bg-orange-500/10 text-orange-300"
          to="/dividas"
          unmaskedDefault
        />
        ))}
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

        {/* Alertas: stock baixo + aniversários */}
        <div className="flex flex-col gap-6">
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

        {/* Aniversários dos próximos 7 dias */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6" data-testid="birthdays-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Próximos 7 dias
              </div>
              <h3 className="font-outfit text-xl font-semibold mt-1">
                Aniversários
              </h3>
            </div>
            <Cake size={22} className="text-amber-400" weight="duotone" />
          </div>
          {(data.birthdays || []).length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">
              Sem aniversários próximos
            </div>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {(data.birthdays || []).map((b) => (
                <li
                  key={b.id}
                  data-testid={`birthday-item-${b.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10"
                >
                  <Link to={`/clientes/${b.id}`} className="text-sm font-medium text-slate-200 hover:text-amber-400">
                    {b.name}
                    {b.member_number ? <span className="text-slate-500"> · nº {b.member_number}</span> : null}
                  </Link>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${b.days_left === 0 ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-slate-800/60 text-slate-300 border-slate-700/50"}`}>
                    {b.birthday}{b.days_left === 0 ? " · hoje 🎂" : ` · em ${b.days_left}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      </div>

      {/* Top 10 itens mais vendidos */}
      {(data.top_products || []).length > 0 && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-6" data-testid="top-products-panel">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={22} weight="duotone" className="text-amber-500" />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Mais saída
              </div>
              <h3 className="font-outfit text-xl font-semibold mt-1">
                Os 10 itens mais vendidos
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.top_products.map((p, i) => (
              <div key={p.id} data-testid={`top-product-${p.id}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                <span className="w-6 h-6 shrink-0 rounded-full bg-amber-500/15 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm font-medium text-slate-200 truncate">{p.name}</span>
                <span className="text-xs text-slate-500 shrink-0">{p.sold_qty} vend.</span>
                <span className="text-sm font-bold text-amber-400 shrink-0">{euro(p.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
