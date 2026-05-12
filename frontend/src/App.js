import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { Toaster } from "sonner";

import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AppLayout from "./pages/AppLayout";
import Dashboard from "./pages/Dashboard";
import Vender from "./pages/Vender";
import Stock from "./pages/Stock";
import Clientes from "./pages/Clientes";
import ClienteFicha from "./pages/ClienteFicha";
import Socios from "./pages/Socios";

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

function App() {
  return (
    <div className="App">
      <AuthProvider>
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
              <Route
                path="socios"
                element={<AdminOnly><Socios /></AdminOnly>}
              />
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
      </AuthProvider>
    </div>
  );
}

export default App;
