import React from "react";

/**
 * Bola de estado das quotas do sócio, sempre visível junto ao nome:
 * 🟢 cotas em dia · 🟡 por regularizar · 🔴 em dívida.
 * Não-sócios não têm bola.
 */
const LABELS = {
  paid: "Cotas em dia",
  pending: "Quotas por regularizar",
  debt: "Quotas em dívida",
};

const COLORS = {
  paid: "bg-emerald-400",
  pending: "bg-amber-400",
  debt: "bg-rose-500",
};

export function quotaStatusOf(client) {
  if (!client) return null;
  if (client.quota_status?.status) return client.quota_status.status;
  return client.is_member ? "pending" : null;
}

export default function QuotaBall({ client, size = 9, className = "", title }) {
  const status = quotaStatusOf(client);
  if (!status) return null;
  return (
    <span
      data-testid={`quota-ball-${status}`}
      title={title || client?.quota_status?.detail || LABELS[status]}
      aria-label={LABELS[status]}
      className={`inline-block shrink-0 rounded-full ring-2 ring-slate-950/50 ${COLORS[status]} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
