import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { Toaster } from "sonner";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocioProvider } from "./context/SocioContext";
import Login from "./pages/Login";
import AppLayout from "./pages/AppLayout";
import Dashboard from "./pages/Dashboard";
import Vender from "./pages/Vender";
import Stock from "./pages/Stock";
import Clientes from "./pages/Clientes";
import ClienteFicha from "./pages/ClienteFicha";
import MBWay from "./pages/MBWay";
import Fornecedores from "./pages/Fornecedores";
import DividasHoje from "./pages/DividasHoje";
import Equipa from "./pages/Equipa";
import Historico from "./pages/Historico";
import Contas from "./pages/Contas";
import Banco from "./pages/Banco";
import Mensagens from "./pages/Mensagens";
import Pedidos from "./pages/Pedidos";
import Transacao from "./pages/Transacao";
import Transacoes from "./pages/Transacoes";
import Bilhetes from "./pages/Bilhetes";
import Documentacao from "./pages/Documentacao";
import OfertasCasa from "./pages/OfertasCasa";
import SocioLogin from "./pages/SocioLogin";
import SocioPortal from "./pages/SocioPortal";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-500">
        A carregar...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-500">
        A carregar...
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function StaffOnly({ children }) {
  // admin, tesoureiro or presidente
  const { user } = useAuth();
  if (!user || !["admin", "tesoureiro", "presidente"].includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AllStaffOnly({ children }) {
  // admin, tesoureiro, presidente e funcionário (funcionário tem acesso de consulta)
  const { user } = useAuth();
  if (!user || !["admin", "tesoureiro", "presidente", "funcionario"].includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <SocioProvider>
          <BrowserRouter>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicOnly>
                    <Login />
                  </PublicOnly>
                }
              />
              <Route path="/socio/login" element={<SocioLogin />} />
              <Route path="/socio" element={<SocioPortal />} />
              <Route
                path="/"
                element={
                  <Protected>
                    <AppLayout />
                  </Protected>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="vender" element={<Vender />} />
                <Route path="stock" element={<Stock />} />
                <Route path="clientes" element={<Clientes />} />
                <Route path="clientes/:id" element={<ClienteFicha />} />
                <Route path="mbway" element={<MBWay />} />
                <Route path="dividas" element={<DividasHoje />} />
                <Route path="fornecedores" element={<AllStaffOnly><Fornecedores /></AllStaffOnly>} />
                <Route path="socios" element={<Navigate to="/clientes" replace />} />
                <Route
                  path="equipa"
                  element={<AdminOnly><Equipa /></AdminOnly>}
                />
                <Route
                  path="historico"
                  element={<StaffOnly><Historico /></StaffOnly>}
                />
                <Route
                  path="contas"
                  element={<AllStaffOnly><Contas /></AllStaffOnly>}
                />
                <Route
                  path="banco"
                  element={<StaffOnly><Banco /></StaffOnly>}
                />
                <Route path="mensagens" element={<Mensagens />} />
                <Route path="pedidos" element={<Pedidos />} />
                <Route path="transacoes/:tx_number" element={<Transacao />} />
                <Route path="transacoes" element={<AllStaffOnly><Transacoes /></AllStaffOnly>} />
                <Route path="ofertas" element={<AllStaffOnly><OfertasCasa /></AllStaffOnly>} />
                <Route path="bilhetes" element={<Bilhetes />} />
                <Route path="documentacao" element={<AdminOnly><Documentacao /></AdminOnly>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#0f172a",
                border: "1px solid #1e293b",
                color: "#f1f5f9",
              },
            }}
          />
        </SocioProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
