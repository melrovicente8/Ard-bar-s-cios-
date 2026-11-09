import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "./AuthContext";

const LayoutCtx = createContext({
  placements: {},
  editing: false,
  canEdit: false,
  setEditing: () => {},
  setPageOrder: () => {},
  placeBlock: () => {},
  resetPage: () => {},
});

/**
 * Organização dos blocos do portal.
 * A ordem vive no servidor (`db.ui_layout`) e é definida pela direção (admin):
 * todos os utilizadores veem os blocos no mesmo sítio.
 */
export function LayoutProvider({ children }) {
  const { user } = useAuth();
  const [placements, setPlacements] = useState({});
  const [editing, setEditing] = useState(false);
  const canEdit = user?.role === "admin";

  useEffect(() => {
    if (!user) {
      setPlacements({});
      setEditing(false);
      return;
    }
    api
      .get("/ui-layout")
      .then(({ data }) => setPlacements(data.placements || {}))
      .catch(() => setPlacements({}));
  }, [user?.email]);

  const persist = useCallback(
    (next) => {
      if (!canEdit) return;
      setPlacements(next);
      api.put("/ui-layout", { placements: next }).catch(() => {
        /* sem rede fica só nesta sessão */
      });
    },
    [canEdit]
  );

  /** Ordem dos blocos de uma aba. */
  const setPageOrder = useCallback(
    (page, ids) => {
      const next = { ...placements };
      ids.forEach((id, index) => {
        next[id] = { page, order: index };
      });
      persist(next);
    },
    [placements, persist]
  );

  /** Envia um bloco para outra aba do menu (fica no fim dessa aba). */
  const placeBlock = useCallback(
    (blockId, page) => {
      if (!page) {
        const next = { ...placements };
        delete next[blockId];
        persist(next);
        return;
      }
      const last = Object.values(placements).filter((p) => p?.page === page).length;
      persist({ ...placements, [blockId]: { page, order: last } });
    },
    [placements, persist]
  );

  /** Repõe a ordem de origem dos blocos indicados (devolve-os à aba de origem). */
  const resetPage = useCallback(
    (ids) => {
      const next = { ...placements };
      ids.forEach((id) => delete next[id]);
      persist(next);
    },
    [placements, persist]
  );

  return (
    <LayoutCtx.Provider
      value={{ placements, editing, canEdit, setEditing, setPageOrder, placeBlock, resetPage }}
    >
      {children}
    </LayoutCtx.Provider>
  );
}

export const useLayout = () => useContext(LayoutCtx);
