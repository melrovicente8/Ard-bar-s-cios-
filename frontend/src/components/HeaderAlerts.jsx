import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Bell, ChatCircle, DeviceMobile, Package, Gift } from "@phosphor-icons/react";

/**
 * Relógio + notificações pendentes no topo — presente em todas as abas.
 */
export default function HeaderAlerts() {
  const [clock, setClock] = useState("");
  const [pending, setPending] = useState({ requests: 0, messages: 0, mbway: 0, toDeliver: 0, gifts: 0 });

  const loadPending = async () => {
    try {
      const [r, m, mb, td, gf] = await Promise.all([
        api.get("/consumption-requests", { params: { status_filter: "pending" } }).catch(() => ({ data: [] })),
        api.get("/socio-messages", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
        api.get("/mbway-payments").catch(() => ({ data: [] })),
        api.get("/consumption-requests", { params: { status_filter: "approved" } }).catch(() => ({ data: [] })),
        api.get("/socio-gifts", { params: { status_filter: "active" } }).catch(() => ({ data: [] })),
      ]);
      const pendingMb = (mb.data || []).filter((x) => x.status === "pending").length;
      setPending({
        requests: (r.data || []).length,
        messages: (m.data || []).length,
        mbway: pendingMb,
        toDeliver: (td.data || []).length,
        gifts: (gf.data || []).filter((x) => x.status === "claimed" || x.status === "pending").length,
      });
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

  const pill = "px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 animate-pulse whitespace-nowrap ring-2 ring-offset-2 ring-offset-slate-950 shadow-lg";

  return (
    <div className="flex items-center gap-2.5" data-testid="header-alerts">
      <span className="font-mono text-xs text-slate-400 tabular-nums" data-testid="header-clock">{clock}</span>
      {pending.requests > 0 && (
        <Link to="/pedidos" data-testid="header-alert-requests" className={`${pill} bg-amber-400 text-slate-950 ring-amber-400/70`}>
          <Bell size={13} weight="fill" /> {pending.requests} pedido{pending.requests > 1 ? "s" : ""}
        </Link>
      )}
      {pending.toDeliver > 0 && (
        <Link to="/pedidos" data-testid="header-alert-todeliver" className={`${pill} bg-emerald-400 text-slate-950 ring-emerald-400/70`}>
          <Package size={13} weight="fill" /> {pending.toDeliver} por entregar
        </Link>
      )}
      {pending.mbway > 0 && (
        <Link to="/mbway" data-testid="header-alert-mbway" className={`${pill} bg-sky-400 text-slate-950 ring-sky-400/70`}>
          <DeviceMobile size={13} weight="fill" /> {pending.mbway} MBWay
        </Link>
      )}
      {pending.gifts > 0 && (
        <Link to="/pedidos" data-testid="header-alert-gifts" className={`${pill} bg-pink-400 text-slate-950 ring-pink-400/70`}>
          <Gift size={13} weight="fill" /> {pending.gifts} entre sócios
        </Link>
      )}
      {pending.messages > 0 && (
        <Link to="/mensagens" data-testid="header-alert-messages" className={`${pill} bg-fuchsia-400 text-slate-950 ring-fuchsia-400/70`}>
          <ChatCircle size={13} weight="fill" /> {pending.messages} msg
        </Link>
      )}
    </div>
  );
}
