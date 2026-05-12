import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import {
  MagnifyingGlass,
  Medal,
  WhatsappLogo,
  EnvelopeSimple,
  ChatCircleText,
  ArrowRight,
  Star,
  Funnel,
} from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Socios() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | member | nonmember | debt
  const [bulkMsg, setBulkMsg] = useState(null); // { client, defaultText }

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/clients");
      setClients(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter === "paid" && !c.is_member) return false;
      if (filter === "debt" && (c.balance || 0) <= 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.contact || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.member_number || "").toLowerCase().includes(q)
      );
    });
  }, [clients, search, filter]);

  const stats = useMemo(() => {
    const total = clients.length;
    const paid = clients.filter((c) => c.is_member).length;
    const unpaid = total - paid; // member_number assigned but cotas not paid; shouldn't happen since backend only returns is_member=true; kept for completeness
    const totalDebt = clients.reduce((s, c) => s + Math.max(c.balance || 0, 0), 0);
    const totalPoints = clients.reduce((s, c) => s + (c.points || 0), 0);
    return { total, paid, unpaid, totalDebt, totalPoints };
  }, [clients]);

  const openMsg = (client) => {
    const text = `Olá ${client.name}, mensagem da ARD Nespereira.`;
    setBulkMsg({ client, text });
  };

  const sendDeepLink = (channel) => {
    const { client, text } = bulkMsg;
    if (channel === "whatsapp") {
      const phone = (client.contact || "").replace(/\D/g, "");
      if (!phone) return toast.error("Sem contacto");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    } else if (channel === "sms") {
      if (!client.contact) return toast.error("Sem contacto");
      window.open(`sms:${client.contact}?body=${encodeURIComponent(text)}`, "_blank");
    } else if (channel === "email") {
      if (!client.email) return toast.error("Sem email");
      window.open(
        `mailto:${client.email}?subject=${encodeURIComponent("ARD Nespereira")}&body=${encodeURIComponent(text)}`,
        "_blank"
      );
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="socios-page">
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
          Administrador
        </div>
        <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">
          Diretório de Sócios
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Apenas sócios registados — clientes regulares estão em <code className="text-amber-400">Clientes</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatBox label="Sócios c/ cotas pagas" value={stats.paid} accent="bg-green-500/10 text-green-300" />
        <StatBox label="A receber" value={euro(stats.totalDebt)} accent="bg-rose-500/10 text-rose-300" />
        <StatBox label="Pontos atribuídos" value={stats.totalPoints} accent="bg-amber-500/10 text-amber-300" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            data-testid="socios-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar por nome, contacto, email ou nº sócio..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-11 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>
        <div className="flex gap-2">
          {[
            { v: "all", label: "Todos" },
            { v: "debt", label: "Com dívida" },
          ].map((f) => (
            <button
              key={f.v}
              data-testid={`filter-${f.v}`}
              onClick={() => setFilter(f.v)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                filter === f.v
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : "bg-slate-900/40 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {filter === f.v && <Funnel size={12} weight="fill" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">A carregar...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Sem resultados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Estatuto</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium text-right">A pagar</th>
                  <th className="px-4 py-3 font-medium text-right">Consumo</th>
                  <th className="px-4 py-3 font-medium text-right">Pontos</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-slate-800/60 hover:bg-slate-900/60" data-testid={`socio-row-${c.id}`}>
                    <td className="px-4 py-3 font-medium text-slate-100">
                      <Link to={`/clientes/${c.id}`} className="hover:text-amber-400 flex items-center gap-2">
                        {c.name} <ArrowRight size={12} className="opacity-60" />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {c.is_member ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/30 inline-flex items-center gap-1">
                          <Medal size={10} weight="fill" /> Sócio{c.member_number ? ` nº ${c.member_number}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Não-sócio</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.contact || "—"}</td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-[180px]">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={(c.balance || 0) > 0 ? "text-rose-400 font-semibold" : "text-slate-500"}>
                        {euro(Math.max(c.balance || 0, 0))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">{euro(c.total_spent || 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-amber-300 font-semibold flex items-center justify-end gap-1">
                        <Star size={11} weight="fill" /> {c.points || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          data-testid={`wa-${c.id}`}
                          disabled={!c.contact}
                          onClick={() => {
                            setBulkMsg({ client: c, text: `Olá ${c.name}, mensagem da ARD Nespereira.` });
                          }}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Mensagem
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bulkMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setBulkMsg(null)}
          data-testid="bulk-msg-modal"
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
              Enviar mensagem
            </div>
            <h3 className="font-outfit text-2xl font-semibold mt-1 mb-4">
              {bulkMsg.client.name}
            </h3>
            <textarea
              data-testid="bulk-msg-textarea"
              value={bulkMsg.text}
              onChange={(e) => setBulkMsg({ ...bulkMsg, text: e.target.value })}
              rows={5}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 mb-4"
            />
            <div className="space-y-2">
              <button
                onClick={() => sendDeepLink("whatsapp")}
                disabled={!bulkMsg.client.contact}
                data-testid="bulk-wa"
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-green-600/10 border border-green-500/30 text-green-300 hover:bg-green-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <WhatsappLogo size={20} weight="fill" /> WhatsApp
                </span>
                <span className="text-xs text-slate-400">{bulkMsg.client.contact || "sem contacto"}</span>
              </button>
              <button
                onClick={() => sendDeepLink("sms")}
                disabled={!bulkMsg.client.contact}
                data-testid="bulk-sms"
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-sky-600/10 border border-sky-500/30 text-sky-300 hover:bg-sky-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <ChatCircleText size={20} weight="duotone" /> SMS
                </span>
                <span className="text-xs text-slate-400">{bulkMsg.client.contact || "sem contacto"}</span>
              </button>
              <button
                onClick={() => sendDeepLink("email")}
                disabled={!bulkMsg.client.email}
                data-testid="bulk-email"
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-3 font-medium">
                  <EnvelopeSimple size={20} weight="duotone" /> Email
                </span>
                <span className="text-xs text-slate-400">{bulkMsg.client.email || "sem email"}</span>
              </button>
            </div>
            <button
              onClick={() => setBulkMsg(null)}
              className="w-full mt-4 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const StatBox = ({ label, value, accent }) => (
  <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
      {label}
    </div>
    <div className={`mt-2 font-outfit text-2xl font-bold ${accent.split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
      {value}
    </div>
  </div>
);
