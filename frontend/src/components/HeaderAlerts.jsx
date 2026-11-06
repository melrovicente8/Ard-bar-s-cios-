import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { euro } from "../lib/api";
import { Bell, ChatCircle, DeviceMobile, Package, Gift, WarningCircle, Lightning } from "@phosphor-icons/react";

/**
 * Relógio + notificações pendentes no topo — presente em todas as abas.
 * Pedidos "prontos a levantar" há mais de 5 minutos geram um pop-up central.
 */
const LATE_PICKUP_MS = 5 * 60 * 1000;

const waitBase = (r) => r.notified_pickup_at || r.decided_at || r.created_at;

const dismissedIds = () => {
  try {
    return JSON.parse(sessionStorage.getItem("pickup-late-dismissed") || "[]");
  } catch {
    return [];
  }
};

const dismissLate = (id) => {
  try {
    sessionStorage.setItem("pickup-late-dismissed", JSON.stringify([...new Set([...dismissedIds(), id])]));
  } catch {
    /* ignore */
  }
};

// Insistências do sócio (pedido pendente há mais de 5 min) — cada insistência nova
// volta a abrir o pop-up até o staff a dispensar.
const insistDismissedIds = () => {
  try {
    return JSON.parse(sessionStorage.getItem("insist-dismissed") || "[]");
  } catch {
    return [];
  }
};

const dismissInsist = (key) => {
  try {
    sessionStorage.setItem("insist-dismissed", JSON.stringify([...new Set([...insistDismissedIds(), key])]));
  } catch {
    /* ignore */
  }
};

export default function HeaderAlerts() {
  const navigate = useNavigate();
  const [pending, setPending] = useState({ requests: 0, messages: 0, mbway: 0, toDeliver: 0, gifts: 0 });
  const [lateRequest, setLateRequest] = useState(null);
  const [insistRequest, setInsistRequest] = useState(null);

  const loadPending = async () => {
    try {
      const [r, m, mb, td, gf] = await Promise.all([
        api.get("/consumption-requests", { params: { status_filter: "pending" } }).catch(() => ({ data: [] })),
        api.get("/socio-messages", { params: { status_filter: "open" } }).catch(() => ({ data: [] })),
        api.get("/mbway-payments").catch(() => ({ data: [] })),
        api.get("/consumption-requests", { params: { status_filter: "approved" } }).catch(() => ({ data: [] })),
        api.get("/socio-gifts", { params: { status_filter: "active" } }).catch(() => ({ data: [] })),
      ]);
      const approved = td.data || [];
      const pendingReqs = r.data || [];
      const pendingMb = (mb.data || []).filter((x) => x.status === "pending").length;
      setPending({
        requests: pendingReqs.length,
        messages: (m.data || []).filter((x) => !x.staff_read_at).length,
        mbway: pendingMb,
        toDeliver: approved.length,
        gifts: (gf.data || []).filter((x) => x.status === "claimed" || x.status === "pending").length,
      });
      // Notificação em destaque: pronto a levantar há mais de 5 minutos e ainda por entregar
      const ignored = dismissedIds();
      const late = approved
        .filter((x) => Date.now() - new Date(waitBase(x)).getTime() > LATE_PICKUP_MS && !ignored.includes(x.id))
        .sort((a, b) => new Date(waitBase(a)) - new Date(waitBase(b)));
      setLateRequest(late[0] || null);
      // Sócio insistiu (pedido em espera há mais de 5 min) → pop-up imediato no painel do staff
      const ignoredInsist = insistDismissedIds();
      const insisted = pendingReqs
        .filter((x) => x.insisted_at && !ignoredInsist.includes(`${x.id}:${x.insisted_at}`))
        .sort((a, b) => new Date(b.insisted_at) - new Date(a.insisted_at));
      setInsistRequest(insisted[0] || null);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadPending();
    const p = setInterval(loadPending, 15000);
    return () => { clearInterval(p); };
  }, []);

  const pill = "px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-[11px] md:text-xs font-bold flex items-center gap-1 md:gap-1.5 animate-pulse whitespace-nowrap ring-2 ring-offset-2 ring-offset-slate-950 shadow-lg";

  const openLate = () => {
    if (!lateRequest) return;
    dismissLate(lateRequest.id);
    const id = lateRequest.id;
    setLateRequest(null);
    navigate(`/pedidos?filter=approved&focus=${id}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2.5 max-w-full" data-testid="header-alerts">
      {pending.requests > 0 && (
        <Link to="/pedidos?filter=pending" data-testid="header-alert-requests" className={`${pill} bg-amber-400 text-slate-950 ring-amber-400/70`}>
          <Bell size={13} weight="fill" /> {pending.requests} pedido{pending.requests > 1 ? "s" : ""}
        </Link>
      )}
      {pending.toDeliver > 0 && (
        <Link
          to="/pedidos?filter=approved"
          data-testid="header-alert-todeliver"
          title="Pedidos prontos a levantar no balcão"
          className={`${pill} bg-emerald-400 text-slate-950 ring-emerald-400/70`}
        >
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

      {lateRequest && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          data-testid="late-pickup-popup"
          onClick={() => { dismissLate(lateRequest.id); setLateRequest(null); }}
        >
          <div
            className="bg-slate-900 border-2 border-amber-400 rounded-xl w-full max-w-sm p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <WarningCircle size={34} weight="duotone" className="mx-auto text-amber-400 mb-2" />
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Por entregar</div>
            <h3 className="font-outfit text-xl font-semibold mt-1 mb-2">
              {lateRequest.client_name}
            </h3>
            <p className="text-sm text-slate-400 mb-2">
              Pedido de <strong className="text-amber-300">{euro(lateRequest.total)}</strong> pronto a levantar há mais de 5 minutos.
            </p>
            <div className="text-[11px] text-slate-500 mb-4">
              Aprovado em {new Date(waitBase(lateRequest)).toLocaleString("pt-PT")}
            </div>
            <div className="flex gap-2">
              <button
                data-testid="late-pickup-later"
                onClick={() => { dismissLate(lateRequest.id); setLateRequest(null); }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-sm"
              >
                Mais tarde
              </button>
              <button
                data-testid="late-pickup-open"
                onClick={openLate}
                className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
              >
                Ver pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sócio insistiu num pedido em espera há mais de 5 minutos */}
      {insistRequest && (() => {
        const key = `${insistRequest.id}:${insistRequest.insisted_at}`;
        const waited = Math.max(1, Math.round((Date.now() - new Date(insistRequest.created_at).getTime()) / 60000));
        const dismiss = () => { dismissInsist(key); setInsistRequest(null); };
        return (
          <div
            className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
            data-testid="insist-popup"
            onClick={dismiss}
          >
            <div
              className="bg-slate-900 border-2 border-sky-400 rounded-xl w-full max-w-sm p-6 text-center shadow-2xl animate-pulse-once"
              onClick={(e) => e.stopPropagation()}
            >
              <Lightning size={34} weight="fill" className="mx-auto text-sky-400 mb-2" />
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400/80">O sócio insistiu</div>
              <h3 className="font-outfit text-xl font-semibold mt-1 mb-2">{insistRequest.client_name}</h3>
              <p className="text-sm text-slate-300 mb-2">
                Pedido de <strong className="text-sky-300">{euro(insistRequest.total)}</strong> em espera há {waited} min.
              </p>
              <div className="text-[11px] text-slate-500 mb-4">
                {insistRequest.insist_count > 1 ? `${insistRequest.insist_count} insistências · ` : ""}
                Pedido em {new Date(insistRequest.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="flex gap-2">
                <button
                  data-testid="insist-later"
                  onClick={dismiss}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-sm"
                >
                  Mais tarde
                </button>
                <button
                  data-testid="insist-open"
                  onClick={() => { dismiss(); navigate(`/pedidos?filter=pending&focus=${insistRequest.id}`); }}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm"
                >
                  Ver pedido
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
