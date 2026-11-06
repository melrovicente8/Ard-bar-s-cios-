import React, { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import RankingsBoard from "../components/RankingsBoard";
import { toast } from "sonner";

/** Tabela de Feitos (consulta do staff) — rankings Top 5 do mês. */
export default function Rankings() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data: d } = await api.get("/rankings");
      setData(d);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (enabled) => {
    setSaving(true);
    try {
      await api.put("/rankings/settings", { enabled });
      setData((d) => (d ? { ...d, enabled } : d));
      toast.success(enabled ? "Rankings ativados na App Sócio" : "Rankings desativados na App Sócio");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 animate-in" data-testid="rankings-page">
      {data ? (
        <RankingsBoard data={data} canManage={canManage} onToggleEnabled={toggle} saving={saving} />
      ) : (
        <div className="text-sm text-slate-500">A carregar rankings...</div>
      )}
    </div>
  );
}
