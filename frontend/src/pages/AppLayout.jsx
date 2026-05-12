import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ChartLineUp,
  Storefront,
  Package,
  Users,
  SignOut,
  Wine,
} from "@phosphor-icons/react";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartLineUp, testid: "nav-dashboard" },
  { to: "/vender", label: "Vender", icon: Storefront, testid: "nav-sell" },
  { to: "/stock", label: "Stock", icon: Package, testid: "nav-stock" },
  { to: "/clientes", label: "Clientes", icon: Users, testid: "nav-clients" },
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
            <Wine size={28} weight="duotone" className="text-amber-500" />
            <span className="font-outfit text-xl font-bold tracking-tight">
              Cellar<span className="text-amber-500">.</span>
            </span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-slate-500 ml-10">
            Bar Manager
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => (
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
              <div className="text-xs text-slate-500 truncate">{user?.email}</div>
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
