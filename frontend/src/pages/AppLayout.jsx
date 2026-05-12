import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ChartLineUp,
  Storefront,
  Package,
  Users,
  SignOut,
  SoccerBall,
  IdentificationCard,
} from "@phosphor-icons/react";

const ROLE_LABEL = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  funcionario: "Funcionário",
};

const navItemsBase = [
  { to: "/", label: "Dashboard", icon: ChartLineUp, testid: "nav-dashboard", roles: ["admin", "tesoureiro", "funcionario"] },
  { to: "/vender", label: "Vender", icon: Storefront, testid: "nav-sell", roles: ["admin", "tesoureiro", "funcionario"] },
  { to: "/stock", label: "Stock", icon: Package, testid: "nav-stock", roles: ["admin", "tesoureiro", "funcionario"] },
  { to: "/clientes", label: "Clientes", icon: Users, testid: "nav-clients", roles: ["admin", "tesoureiro", "funcionario"] },
  { to: "/socios", label: "Sócios", icon: IdentificationCard, testid: "nav-socios", roles: ["admin"] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex grain-bg">
      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        className="w-64 shrink-0 border-r border-slate-900 flex flex-col bg-slate-950/80 backdrop-blur-xl"
      >
        <div className="px-6 py-7 border-b border-slate-900">
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
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItemsBase
            .filter((item) => !user?.role || item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
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
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
