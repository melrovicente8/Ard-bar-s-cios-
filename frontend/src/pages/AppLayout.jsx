import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { openFinanceDoc } from "../lib/financeDoc";
import {
  Bell,
  ChartLineUp,
  Storefront,
  Package,
  Users,
  SignOut,
  SoccerBall,
  DeviceMobile,
  ArrowLeft,
  House,
  Wallet,
  UsersThree,
  Bank,
  Vault,
  Book,
  List,
  ListDashes,
  ArrowClockwise,
  X as XIcon,
  Storefront as BarIcon,
  LockSimple,
  LockSimpleOpen,
  SquaresFour,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import HeaderAlerts from "../components/HeaderAlerts";
import LagartoAmarelo from "../components/LagartoAmarelo";
import EditableText from "../components/EditableText";
import { useContent } from "../context/ContentContext";
import { useLayout } from "../context/LayoutContext";
import { navGroups } from "../lib/navigation";

const ROLE_LABEL = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  presidente: "Pres. da Assembleia",
  funcionario: "Funcionário",
};


function BarStatusButton() {
  const [bar, setBar] = useState(null); // {open, cash_in_drawer}
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const [closeWarn, setCloseWarn] = useState(false);

  const load = () => {
    api.get("/bar-status").then(({ data }) => {
      setBar(data);
      if (data.auto_closed) toast.error("O bar fechou automaticamente às 2h da manhã");
    }).catch(() => {});
  };
  const { pathname } = useLocation();
  // O valor em caixa muda a cada venda/pagamento: atualiza ao mudar de aba,
  // a cada 20s e quando a janela volta a estar em foco.
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
    /* eslint-disable-next-line */
  }, [pathname]);

  // Aviso pop-up 10 minutos antes do fecho automático (02:00)
  useEffect(() => {
    if (bar?.open && bar?.closing_soon) {
      const key = `bar-close-warn-${new Date().toISOString().slice(0, 10)}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        setCloseWarn(true);
      }
    }
  }, [bar]);

  const toggle = async (cashValue) => {
    const next = !bar?.open;
    try {
      const payload = { open: next };
      if (next) {
        payload.cash_declared = cashValue;
      } else if (cashValue !== undefined && cashValue !== "" && !isNaN(Number(cashValue))) {
        payload.cash_counted = Number(cashValue);
      }
      const { data } = await api.post("/bar-status", payload);
      setBar(data);
      if (data.open) {
        toast.success(`Bar ABERTO · dinheiro em caixa ao abrir: ${euro(data.opening_cash_declared ?? data.cash_in_drawer)} (consta na ata)`);
      } else {
        const diff = Number(data.closing_difference || 0);
        toast.success(`Bar FECHADO · contado ${euro(data.closing_cash_counted ?? data.cash_in_drawer)} · esperado ${euro(data.closing_cash_expected ?? 0)} (consta na ata)`);
        if (Math.abs(diff) >= 0.01) {
          toast.error(
            `Diferença de caixa: ${euro(Math.abs(diff))} ${diff > 0 ? "a mais" : "a menos"} — registado para verificação`,
            { duration: 10000 }
          );
        }
      }
      setConfirmOpen(false);
      setCashInput("");
      // Ao fechar o bar: gera o PDF de fecho de contas do dia (Deve / Haver)
      if (!data.open) {
        try {
          const t = new Date().toISOString().slice(0, 10);
          const { data: rep } = await api.get("/reports/finance", { params: { date_from: t, date_to: t } });
          if (!openFinanceDoc(rep, t.split("-").reverse().join("/"), t.split("-").reverse().join("/"), "FECHO DE CONTAS DO DIA")) {
            toast.error("Permite popups para o PDF de fecho de contas");
          }
        } catch {
          toast.error("Não foi possível gerar o PDF de fecho de contas");
        }
      }
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  if (!bar) return null;
  const isOpen = !!bar.open;
  return (
    <>
      <button
        data-testid="bar-status-btn"
        onClick={() => {
          // Ao abrir: prefere o valor contado no fecho anterior. Ao fechar: sugere o esperado.
          if (!bar?.open) {
            setCashInput(bar?.last_close?.cash_counted != null ? String(bar.last_close.cash_counted) : "");
          } else {
            setCashInput(bar?.cash_in_drawer != null ? String(bar.cash_in_drawer) : "");
          }
          setConfirmOpen(true);
        }}
        title={`Bar ${isOpen ? "aberto" : "fechado"} — clique no interruptor para ${isOpen ? "fechar" : "abrir"}`}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-bold border transition-colors ${
          isOpen
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
            : "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25"
        }`}
      >
        <BarIcon size={14} weight="duotone" />
        <span className="hidden md:inline">Bar {isOpen ? "aberto" : "fechado"}</span>
        <span
          data-testid="bar-status-switch"
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isOpen ? "bg-emerald-500" : "bg-slate-600"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isOpen ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </span>
      </button>
      {closeWarn && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" data-testid="bar-closing-warning">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl w-full max-w-sm p-6 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Fecho do bar</div>
            <h3 className="font-outfit text-xl font-semibold mt-1 mb-2">Faltam {bar?.minutes_to_close ?? 10} minutos</h3>
            <p className="text-sm text-slate-400 mb-4">
              O bar fecha automaticamente às 02:00. A partir dessa hora, os consumos registados mostram aviso de fecho.
            </p>
            <button
              data-testid="bar-closing-warning-ok"
              onClick={() => setCloseWarn(false)}
              className="w-full px-4 py-2.5 rounded-lg font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
            >
              Entendido
            </button>
          </div>
        </div>,
        document.body
      )}
      {confirmOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setConfirmOpen(false)} data-testid="bar-status-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Estado do bar</div>
            <h3 className="font-outfit text-xl font-semibold mt-1 mb-3">{isOpen ? "Fechar o bar?" : "Abrir o bar?"}</h3>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Valor atual em caixa (esperado hoje)</span>
                <span className="font-outfit text-xl font-bold text-amber-300">{euro(bar.cash_in_drawer)}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                {isOpen
                  ? "Conta o dinheiro na gaveta. O valor contado e a diferença ficam registados na ata e no audit log."
                  : "Este valor fica registado na ata diária e no audit log."}
              </p>
            </div>
            {isOpen && (
              <div className="mb-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Dinheiro contado em caixa ao fechar (€)</label>
                <input
                  data-testid="bar-close-cash-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="0,00"
                  className="mt-2 w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500"
                />
                {cashInput !== "" && !isNaN(parseFloat(cashInput)) && bar?.cash_in_drawer != null && (
                  <p className={`text-[11px] mt-1.5 ${Math.abs(parseFloat(cashInput) - bar.cash_in_drawer) >= 0.01 ? "text-rose-300" : "text-emerald-300"}`}>
                    Diferença face ao esperado: {euro(parseFloat(cashInput) - bar.cash_in_drawer)}
                  </p>
                )}
              </div>
            )}
            {!isOpen && bar?.last_close && (
              <div data-testid="bar-last-close-note" className="mb-4 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-200">
                <div className="font-bold uppercase tracking-[0.2em] text-[10px] text-amber-400/80 mb-1">Nota do fecho anterior</div>
                <div>
                  No fecho anterior contou-se <strong className="font-outfit">{euro(bar.last_close.cash_counted)}</strong> em caixa
                  (esperado {euro(bar.last_close.expected_cash)} · diferença {euro(bar.last_close.difference)}).
                </div>
                <div className="text-slate-400 mt-1">
                  {bar.last_close.user_email || "—"} · {new Date(bar.last_close.created_at).toLocaleString("pt-PT")}
                  {bar.last_close.note ? ` · nota: ${bar.last_close.note}` : ""}
                </div>
              </div>
            )}
            {!isOpen && (
              <div className="mb-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Dinheiro em caixa ao abrir (€)</label>
                <input
                  data-testid="bar-cash-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="0,00"
                  className="mt-2 w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button
                data-testid="bar-status-confirm"
                onClick={() => toggle(cashInput === "" ? undefined : parseFloat(cashInput))}
                disabled={(!isOpen && (cashInput === "" || isNaN(parseFloat(cashInput)) || parseFloat(cashInput) < 0)) || (isOpen && cashInput !== "" && isNaN(parseFloat(cashInput)))}
                className={`flex-1 px-4 py-2.5 rounded-lg font-bold disabled:opacity-40 ${isOpen ? "bg-rose-500 hover:bg-rose-400 text-slate-950" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"}`}
              >
                {isOpen ? "Fechar bar" : "Abrir bar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { editMode, toggleEdit } = useContent();
  const { editing: layoutEditing, setEditing: setLayoutEditing, canEdit: canEditLayout } = useLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/" || location.pathname === "";
  const [mobileOpen, setMobileOpen] = useState(false);
  // Refresh de todas as abas: remonta a página atual (recarrega os dados)
  const [refreshKey, setRefreshKey] = useState(0);
  // Hora junto ao símbolo ARD (liberta espaço no topbar)
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"));
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex grain-bg">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-30"
          aria-hidden="true"
        />
      )}
      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        className={`fixed md:sticky md:top-0 inset-y-0 left-0 w-64 shrink-0 border-r border-slate-900 flex flex-col bg-slate-950/95 md:bg-slate-950/80 backdrop-blur-xl z-40 transform transition-transform md:transform-none md:translate-x-0 md:h-screen ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-7 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-green-600 to-green-700 border-2 border-amber-400 flex items-center justify-center flex-shrink-0">
              <SoccerBall size={24} weight="duotone" className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-baseline gap-2 leading-tight">
                <span className="font-outfit text-xl font-bold tracking-tight">
                  ARD<span className="text-amber-400">.</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums" data-testid="header-clock" title="Hora local">
                  {clock}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">
                <EditableText k="brand.subtitle">Nespereira · Bar</EditableText>
              </div>
            </div>
            <Link
              to="/socio/login"
              data-testid="socio-app-link"
              title="App do sócio"
              className="ml-1 p-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 flex items-center"
            >
              <DeviceMobile size={14} weight="duotone" />
            </Link>
            {user?.role === "admin" && (
              <button
                type="button"
                data-testid="content-lock-btn"
                onClick={toggleEdit}
                title={editMode ? "Bloquear edição de textos" : "Desbloquear edição de títulos e frases"}
                aria-label={editMode ? "Bloquear edição de textos" : "Desbloquear edição de textos"}
                className={`p-1.5 rounded-md flex items-center transition-colors ${
                  editMode
                    ? "bg-amber-400 text-slate-950"
                    : "bg-slate-800/80 text-slate-400 hover:text-amber-300 hover:bg-slate-800"
                }`}
              >
                {editMode ? <LockSimpleOpen size={14} weight="fill" /> : <LockSimple size={14} weight="bold" />}
              </button>
            )}
            {canEditLayout && (
              <button
                type="button"
                data-testid="layout-edit-btn"
                onClick={() => setLayoutEditing(!layoutEditing)}
                title={layoutEditing ? "Concluir organização dos blocos" : "Organizar blocos das abas (arrastar / mover para outra aba)"}
                aria-label={layoutEditing ? "Concluir organização dos blocos" : "Organizar blocos das abas"}
                className={`p-1.5 rounded-md flex items-center transition-colors ${
                  layoutEditing
                    ? "bg-amber-400 text-slate-950"
                    : "bg-slate-800/80 text-slate-400 hover:text-amber-300 hover:bg-slate-800"
                }`}
              >
                <SquaresFour size={14} weight={layoutEditing ? "fill" : "bold"} />
              </button>
            )}
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-500 hover:text-white p-1"
            aria-label="Fechar"
          >
            <XIcon size={18} weight="bold" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-5 overflow-y-auto">
          {navGroups.map((group, gi) => {
            const visible = group.items.filter((item) => !user?.role || item.roles.includes(user.role));
            if (!visible.length) return null;
            return (
              <div key={gi} className="space-y-1">
                {group.section && (
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-600 px-4 mb-2">
                    <EditableText k={`nav.section.${group.section}`}>{group.section}</EditableText>
                  </div>
                )}
                {visible.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    data-testid={item.testid}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive || (item.also || []).some((p) => location.pathname === p || location.pathname.startsWith(p + "/"))
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`
                    }
                  >
                    <item.icon size={20} weight="duotone" />
                    <EditableText k={`nav.${item.testid}`}>{item.label}</EditableText>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-900">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/60 mb-2">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
              {(user?.name || "U")[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" data-testid="user-name">
                {user?.name || "Utilizador"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold truncate" data-testid="user-role">
                {ROLE_LABEL[user?.role] || user?.role}
              </div>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <SignOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-clip flex flex-col min-w-0">
        <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900 px-3 md:px-6 py-2 md:py-3 flex flex-wrap items-center gap-1.5 md:gap-2">
          <button
            data-testid="mobile-menu-btn"
            onClick={() => setMobileOpen(true)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
            aria-label="Abrir menu"
          >
            <List size={20} weight="bold" />
          </button>
          <button
            data-testid="topbar-back-btn"
            onClick={() => navigate(-1)}
            disabled={isHome}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Voltar"
          >
            <ArrowLeft size={16} weight="bold" /> <span className="hidden sm:inline">Voltar</span>
          </button>
          <button
            data-testid="topbar-home-btn"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
            title="Início"
          >
            <House size={16} weight="duotone" />
          </button>
          <button
            data-testid="topbar-refresh-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
            title="Atualizar esta aba (recarrega os dados)"
          >
            <ArrowClockwise size={16} weight="bold" /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 md:gap-2 min-w-0 max-w-full">
            <HeaderAlerts />
            <BarStatusButton />
          </div>
        </div>
        {editMode && (
          <div
            data-testid="content-edit-banner"
            className="bg-amber-400/10 border-b border-amber-400/30 px-3 md:px-6 py-2 flex flex-wrap items-center gap-2 text-[11px] text-amber-200"
          >
            <LockSimpleOpen size={13} weight="fill" className="text-amber-400 shrink-0" />
            <span className="flex-1 min-w-[180px]">
              Modo edição: clica em qualquer título ou frase sublinhado a tracejado para alterar. Enter guarda, Esc cancela.
            </span>
            <button
              type="button"
              onClick={toggleEdit}
              data-testid="content-edit-done"
              className="px-3 py-1 rounded-md bg-amber-400 text-slate-950 font-bold"
            >
              Bloquear edição
            </button>
          </div>
        )}
        <div className="flex-1" key={refreshKey}>
          <Outlet />
        </div>
      </main>
      <LagartoAmarelo scope="staff" />
    </div>
  );
}
