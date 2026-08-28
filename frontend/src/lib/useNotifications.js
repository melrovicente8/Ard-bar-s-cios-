import { useEffect, useState, useCallback } from "react";
import api from "./api";

/**
 * Polls pending notification counts for the topbar.
 * Returns { pedidos, mensagens, mbway, total, reload }.
 */
export function useNotifications() {
  const [counts, setCounts] = useState({ pedidos: 0, mensagens: 0, mbway: 0 });

  const reload = useCallback(async () => {
    try {
      const [pedidos, msgs, mbway] = await Promise.all([
        api.get("/consumption-requests?status_filter=pending"),
        api.get("/socio-messages?status_filter=open"),
        api.get("/mbway-payments"),
      ]);
      const pedidosCount = pedidos.data?.length || 0;
      const msgsCount = msgs.data?.length || 0;
      const mbwayCount = (mbway.data || []).filter((m) => m.status === "pending").length;
      setCounts({ pedidos: pedidosCount, mensagens: msgsCount, mbway: mbwayCount });
    } catch {
      /* ignore — might be loading */
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload]);

  return { ...counts, total: counts.pedidos + counts.mensagens + counts.mbway, reload };
}
