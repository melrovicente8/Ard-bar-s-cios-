import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Bell, ChatCircle, DeviceMobile } from "@phosphor-icons/react";

/**
 * Relógio + notificações pendentes no topo — presente em todas as abas.
 */
export default function HeaderAlerts() {
  const [clock, setClock] = useState("");
  const [pending, setPending] = useState({ requests: 0, messages: 0, mbway: 0 });

  const loadPending = async () => {
    try {
      const [r, m, mb] = await Promise.all([
        api.get("/consumption-requests", { params: { status_filter: "pending" } }).catch(() => ({ data: [] })),
        api.get("/socio-messages", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
        api.get("/mbway-payments").catch(() => ({ data: [] })),
      ]);
      const pendingMb = (mb.data || []).filter((x) => x.status === "pending").length;
      setPending({ requests: (r.data || []).length, messages: (m.data || []).length, mbway: pendingMb });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"));
    };
    tick();
    const t = setInterval(tick, 10000);
    loadPending();
    const p = setInterval(loadPending, 15000);
    return () => { clearInterval(t); clearInterval(p); };
  }, []);

  const pill = "px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse whitespace-nowrap";

  return (
    <div className="flex items-center gap-2" data-testid="header-alerts">
      <span className="font-mono text-xs text-slate-400 tabular-nums" data-testid="header-clock">{clock}</span>
      {pending.requests > 0 && (
        <Link to="/pedidos" data-testid="header-alert-requests" className={`${pill} bg-amber-500/20 border border-amber-500/40 text-amber-200`}>
          <Bell size={11} weight="fill" /> {pending.requests}
        </Link>
      )}
      {pending.mbway > 0 && (
        <Link to="/mbway" data-testid="header-alert-mbway" className={`${pill} bg-sky-500/20 border border-sky-500/40 text-sky-200`}>
          <DeviceMobile size={11} weight="fill" /> {pending.mbway}
        </Link>
      )}
      {pending.messages > 0 && (
        <Link to="/mensagens" data-testid="header-alert-messages" className={`${pill} bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200`}>
          <ChatCircle size={11} weight="fill" /> {pending.messages}
        </Link>
      )}
    </div>
  );
}
