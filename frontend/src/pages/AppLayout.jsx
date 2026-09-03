import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { euro, formatApiErrorDetail } from "../lib/api";
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
  Book,
  List,
  ListDashes,
  Ticket,
  X as XIcon,
  Storefront as BarIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const ROLE_LABEL = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  presidente: "Pres. da Assembleia",
  funcionario: "Funcionário",
};

const STAFF_ROLES = ["admin", "tesoureiro", "presidente"];

const navGroups = [
  {
    section: null,
    items: [
      { to: "/", label: "Dashboard", icon: ChartLineUp, testid: "nav-dashboard", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/dividas", label: "Dívidas hoje", icon: Wallet, testid: "nav-dividas", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/vender", label: "Vender", icon: Storefront, testid: "nav-sell", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/bilhetes", label: "Bilhetes", icon: Ticket, testid: "nav-bilhetes", roles: [...STAFF_ROLES, "funcionario"] },
    ],
  },
  {
    section: "Stock",
    items: [
      { to: "/stock", label: "Stock", icon: Package, testid: "nav-stock", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/fornecedores", label: "Fornecedores", icon: Truck, testid: "nav-fornecedores", roles: STAFF_ROLES },
    ],
  },
  {
    section: "Clientes",
    items: [
      { to: "/clientes", label: "Clientes", icon: Users, testid: "nav-clients", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/socios", label: "Sócios", icon: IdentificationCard, testid: "nav-socios", roles: ["admin"] },
      { to: "/mbway", label: "MBWay", icon: DeviceMobile, testid: "nav-mbway", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/pedidos", label: "Pedidos sócio", icon: ShoppingCart, testid: "nav-pedidos", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/mensagens", label: "Mensagens", icon: ChatCircle, testid: "nav-mensagens", roles: [...STAFF_ROLES, "funcionario"] },
    ],
  },
  {
    section: "Administração",
    items: [
      { to: "/equipa", label: "Equipa", icon: UsersThree, testid: "nav-equipa", roles: ["admin"] },
      { to: "/contas", label: "Contas", icon: Bank, testid: "nav-contas", roles: STAFF_ROLES },
      { to: "/historico", label: "Histórico", icon: ClockCounterClockwise, testid: "nav-historico", roles: STAFF_ROLES },
      { to: "/transacoes", label: "Transações", icon: ListDashes, testid: "nav-transacoes", roles: STAFF_ROLES },
      { to: "/documentacao", label: "Documentação", icon: Book, testid: "nav-documentacao", roles: ["admin"] },
    ],
  },
];

function BarStatusButton() {
  const [bar, setBar] = useState(null); // {open, cash_in_drawer}
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = () => {
    api.get("/bar-status").then(({ data }) => setBar(data)).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = async () => {
    const next = !bar?.open;
    try {
      const { data } = await api.post("/bar-status", { open: next });
      setBar(data);
      toast.success(
        `Bar ${data.open ? "ABERTO" : "FECHADO"} · valor em caixa: ${euro(data.cash_in_drawer)} (consta na ata)`
      );
      setConfirmOpen(false);
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
        onClick={() => setConfirmOpen(true)}
        title={`Bar ${isOpen ? "aberto" : "fechado"} — valor em caixa ${euro(bar.cash_in_drawer)}`}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border transition-colors ${
          isOpen
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
            : "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25"
        }`}
      >
        <BarIcon size={14} weight="duotone" /> Bar {isOpen ? "aberto" : "fechado"} · <span className="font-mono">{euro(bar.cash_in_drawer)}</span>
      </button>
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setConfirmOpen(false)} data-testid="bar-status-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Estado do bar</div>
            <h3 className="font-outfit text-xl font-semibold mt-1 mb-3">{isOpen ? "Fechar o bar?" : "Abrir o bar?"}</h3>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Valor atual em caixa (esperado hoje)</span>
                <span className="font-outfit text-xl font-bold text-amber-300">{euro(bar.cash_in_drawer)}</span>
              </div>
              <p className="text-[11px] text-slate-500">Este valor fica registado na ata diária e no audit log.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700">Cancelar</button>
              <button data-testid="bar-status-confirm" onClick={toggle} className={`flex-1 px-4 py-2.5 rounded-lg font-bold ${isOpen ? "bg-rose-500 hover:bg-rose-400 text-slate-950" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"}`}>
                {isOpen ? "Fechar bar" : "Abrir bar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/" || location.pathname === "";
  const [mobileOpen, setMobileOpen] = useState(false);

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
        <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900 px-3 md:px-6 py-3 flex items-center gap-2">
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
          <div className="ml-auto flex items-center gap-2">
            <BarStatusButton />
          </div>
        </div>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
