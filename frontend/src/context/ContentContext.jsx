import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";

/**
 * Textos do portal editáveis pela direção.
 * O cadeado no cabeçalho desbloqueia o modo de edição: os textos marcados com
 * <EditableText k="..." /> passam a ser editáveis in-place. Os overrides ficam
 * guardados em db.site_content (chave → valor) e são lidos por todos.
 */
const ContentCtx = createContext(null);

export function ContentProvider({ children }) {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState({});
  const [editMode, setEditMode] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!user) {
      setOverrides({});
      setEditMode(false);
      return;
    }
    api
      .get("/site-content")
      .then(({ data }) => setOverrides(data || {}))
      .catch(() => setOverrides({}));
  }, [user?.email]);

  const get = useCallback(
    (key, fallback) => {
      const v = overrides[key];
      return v === undefined || v === null || v === "" ? fallback : v;
    },
    [overrides]
  );

  const save = async (key, value) => {
    try {
      const { data } = await api.put("/site-content", { key, value });
      setOverrides((prev) => {
        const next = { ...prev };
        if (data.value) next[key] = data.value;
        else delete next[key];
        return next;
      });
      toast.success(data.value ? "Texto atualizado" : "Texto original reposto");
    } catch (e) {
      toast.error("Não foi possível guardar o texto");
    }
  };

  const reset = (key) => save(key, "");

  const toggleEdit = () => {
    if (!isAdmin) return;
    setEditMode((v) => !v);
  };

  return (
    <ContentCtx.Provider value={{ get, save, reset, editMode: editMode && isAdmin, setEditMode, toggleEdit, isAdmin }}>
      {children}
    </ContentCtx.Provider>
  );
}

export function useContent() {
  const ctx = useContext(ContentCtx);
  // Fora do provider (ex.: portal do sócio) devolve os textos originais
  return ctx || { get: (k, fallback) => fallback, save: () => {}, reset: () => {}, editMode: false, setEditMode: () => {}, toggleEdit: () => {}, isAdmin: false };
}
