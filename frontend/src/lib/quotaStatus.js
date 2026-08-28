import api from "./api";

/**
 * Compute sócio quota status from quotas data.
 * Returns { label, color } or null.
 *   - "Cotas regularizadas" = current month (or full year) paid
 *   - "Por regularizar"     = 1–3 months behind
 *   - "Em atraso"           = more than 3 months behind
 */
export function computeQuotaStatus(quotas) {
  if (!quotas || !quotas.quotas) return null;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const paidMonths = quotas.quotas
    .filter((q) => q.status === "paid")
    .map((q) => q.month);
  const monthsExpected = Array.from({ length: currentMonth }, (_, i) => i + 1);
  const unpaid = monthsExpected.filter((m) => !paidMonths.includes(m));

  if (unpaid.length === 0) return { label: "Cotas regularizadas", color: "#15803d" };
  if (unpaid.length > 3) return { label: "Cotas em atraso", color: "#b91c1c" };
  return { label: "Cotas por regularizar", color: "#b45309" };
}

/** Fetch quota status via API (for pages that don't already have quotas loaded). */
export async function fetchQuotaStatus(clientId, year) {
  try {
    const { data } = await api.get(`/clients/${clientId}/quotas`, {
      params: { year: year || new Date().getFullYear() },
    });
    return computeQuotaStatus(data);
  } catch {
    return null;
  }
}
