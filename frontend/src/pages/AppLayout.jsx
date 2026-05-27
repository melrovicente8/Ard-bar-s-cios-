import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { toast } from "sonner";
import {
  ChartLineUp,
  Storefront,
  Package,
  Users,
  SignOut,
  SoccerBall,
  IdentificationCard,
  DeviceMobile,
  ArrowLeft,
  House,
  Truck,
  Wallet,
  UsersThree,
  ClockCounterClockwise,
  ShoppingCart,
  Bank,
  ChatCircle,
  Bell,
  Beer,
  Lock,
  LockOpen,
  Book,
  List,
  X as XIcon,
} from "@phosphor-icons/react";

const ROLE_LABEL = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  funcionario: "Funcionário",
};

const navGroups = [
  {
    section: null,
    items: [
      { to: "/", label: "Dashboard", icon: ChartLineUp, testid: "nav-dashboard", roles: ["admin", "tesoureiro", "funcionario"] },
      { to: "/dividas", label: "Dívidas hoje", icon: Wallet, testid: "nav-dividas", roles: ["admin", "tesoureiro", "funcionario"] },
      { to: "/vender", label: "Vender", icon: Storefront, testid: "nav-sell", roles: ["admin", "tesoureiro", "funcionario"] },
    ],
  },
  {
    section: "Stock",
    items: [
      { to: "/stock", label: "Stock", icon: Package, testid: "nav-stock", roles: ["admin", "tesoureiro", "funcionario"] },
      { to: "/fornecedores", label: "Fornecedores", icon: Truck, testid: "nav-fornecedores", roles: ["admin", "tesoureiro"] },
    ],
  },
  {
    section: "Clientes",
    items: [
      { to: "/clientes", label: "Clientes", icon: Users, testid: "nav-clients", roles: ["admin", "tesoureiro", "funcionario"] },
      { to: "/socios", label: "Sócios", icon: IdentificationCard, testid: "nav-socios", roles: ["admin"] },
      { to: "/mbway", label: "MBWay", icon: DeviceMobile, testid: "nav-mbway", roles: ["admin", "tesoureiro", "funcionario"] },
      { to: "/pedidos", label: "Pedidos sócio", icon: ShoppingCart, testid: "nav-pedidos", roles: ["admin", "tesoureiro", "funcionario"] },
      { to: "/mensagens", label: "Mensagens", icon: ChatCircle, testid: "nav-mensagens", roles: ["admin", "tesoureiro", "funcionario"] },
    ],
  },
  {
    section: "Administração",
    items: [
      { to: "/equipa", label: "Equipa", icon: UsersThree, testid: "nav-equipa", roles: ["admin"] },
      { to: "/contas", label: "Contas", icon: Bank, testid: "nav-contas", roles: ["admin", "tesoureiro"] },
      { to: "/historico", label: "Histórico", icon: ClockCounterClockwise, testid: "nav-historico", roles: ["admin", "tesoureiro"] },
      { to: "/documentacao", label: "Documentação", icon: Book, testid: "nav-documentacao", roles: ["admin"] },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/" || location.pathname === "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState({ requests: 0, messages: 0, mbway: 0 });
  const [bar, setBar] = useState({ is_open: true });
  const canToggleBar = user?.role === "admin" || user?.role === "tesoureiro";

  React.useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const loadPending = async () => {
    if (!user) return;
    try {
      const [r, m, mb] = await Promise.all([
        api.get("/consumption-requests", { params: { status_filter: "pending" } }).catch(() => ({ data: [] })),
        api.get("/socio-messages", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
        api.get("/mbway-payments").catch(() => ({ data: [] })),
      ]);
      const pendingMb = (mb.data || []).filter((x) => x.status === "pending").length;
      setPending({ requests: (r.data || []).length, messages: (m.data || []).length, mbway: pendingMb });
    } catch { /* ignore */ }
  };

  const loadBar = async () => {
    try {
      const { data } = await api.get("/bar/state");
      setBar(data || { is_open: true });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    loadPending();
    loadBar();
    const t = setInterval(() => { loadPending(); loadBar(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [user?.email]);

  const toggleBar = async () => {
    try {
      const next = !bar.is_open;
      const { data } = await api.put("/bar/state", { is_open: next });
      setBar(data);
      toast.success(next ? "Bar aberto" : "Bar fechado · sócios não podem fazer pedidos");
    } catch (e) {
      toast.error("Erro a alterar estado do bar");
    }
  };

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
              <div className="font-outfit text-xl font-bold tracking-tight leading-tight">
                ARD<span className="text-amber-400">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">
                Nespereira · Bar
              </div>
            </div>
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
                    {group.section}
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
                        isActive
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`
                    }
                  >
                    <item.icon size={20} weight="duotone" />
                    {item.label}
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
      <main className="flex-1 overflow-x-hidden flex flex-col min-w-0">
        <div className="sticky top-0 z-20 bg-slate-950/85 backdrop-blur-xl border-b border-slate-900 px-3 md:px-6 py-3 flex items-center gap-2">
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

          {/* Direita: estado bar + notificações */}
          <div className="ml-auto flex items-center gap-1">
            <button
              data-testid="topbar-bar-state"
              onClick={canToggleBar ? toggleBar : undefined}
              disabled={!canToggleBar}
              title={canToggleBar ? "Clica para alternar estado" : `Bar ${bar.is_open ? "aberto" : "fechado"}`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider border transition-colors ${
                bar.is_open
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                  : "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25 animate-pulse"
              } ${!canToggleBar ? "cursor-default opacity-90" : ""}`}
            >
              {bar.is_open ? <LockOpen size={14} weight="duotone" /> : <Lock size={14} weight="duotone" />}
              <span className="hidden sm:inline">{bar.is_open ? "Bar aberto" : "Bar fechado"}</span>
            </button>

            <Link
              to="/pedidos"
              data-testid="topbar-notif-requests"
              title={`${pending.requests} pedido(s) por validar`}
              className="relative flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-amber-300 hover:bg-slate-900 transition-colors"
            >
              <Bell size={18} weight={pending.requests ? "fill" : "duotone"} />
              {pending.requests > 0 && (
                <span data-testid="badge-requests" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-amber-400 text-slate-950 text-[9px] font-bold flex items-center justify-center px-1 animate-pulse">{pending.requests}</span>
              )}
            </Link>
            <Link
              to="/mbway"
              data-testid="topbar-notif-mbway"
              title={`${pending.mbway} MBWay pendente(s)`}
              className="relative flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-sky-300 hover:bg-slate-900 transition-colors"
            >
              <DeviceMobile size={18} weight={pending.mbway ? "fill" : "duotone"} />
              {pending.mbway > 0 && (
                <span data-testid="badge-mbway" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-sky-400 text-slate-950 text-[9px] font-bold flex items-center justify-center px-1 animate-pulse">{pending.mbway}</span>
              )}
            </Link>
            <Link
              to="/mensagens"
              data-testid="topbar-notif-messages"
              title={`${pending.messages} mensagem(s)`}
              className="relative flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-fuchsia-300 hover:bg-slate-900 transition-colors"
            >
              <ChatCircle size={18} weight={pending.messages ? "fill" : "duotone"} />
              {pending.messages > 0 && (
                <span data-testid="badge-messages" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-fuchsia-400 text-slate-950 text-[9px] font-bold flex items-center justify-center px-1 animate-pulse">{pending.messages}</span>
              )}
            </Link>
          </div>
        </div>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
