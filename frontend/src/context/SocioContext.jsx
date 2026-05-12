import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const SocioCtx = createContext(null);

export function SocioProvider({ children }) {
  const [data, setData] = useState(null); // null=checking, false=not authed, object={client,...}

  const refresh = async () => {
    try {
      const { data } = await api.get("/socio/me");
      setData(data);
      return data;
    } catch {
      setData(false);
      return null;
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (member_number, pin) => {
    try {
      await api.post("/socio/login", { member_number, pin });
      const d = await refresh();
      return { ok: !!d };
    } catch (e) {
      return { ok: false, error: e.response?.data?.detail || "Erro" };
    }
  };

  const logout = async () => {
    try { await api.post("/socio/logout"); } catch {}
    setData(false);
  };

  return (
    <SocioCtx.Provider value={{ data, login, logout, refresh, setData }}>
      {children}
    </SocioCtx.Provider>
  );
}

export const useSocio = () => useContext(SocioCtx);
