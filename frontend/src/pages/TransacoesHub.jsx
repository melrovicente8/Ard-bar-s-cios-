import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";
import { useAuth } from "../context/AuthContext";
import Transacoes from "./Transacoes";
import Historico from "./Historico";
import OfertasCasa from "./OfertasCasa";

const TAB_PATH = { transacoes: "/transacoes", historico: "/historico", ofertas: "/ofertas" };

/**
 * Aba única de contabilidade: Transações, Histórico e Ofertas da casa.
 * Funcionários não têm acesso ao Histórico (só direção/tesouraria).
 */
export default function TransacoesHub() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname.startsWith("/historico") ? "historico" : pathname.startsWith("/ofertas") ? "ofertas" : "transacoes";
  const options = [
    { v: "transacoes", label: "Transações" },
    ...(user?.role === "funcionario" ? [] : [{ v: "historico", label: "Histórico" }]),
    { v: "ofertas", label: "Ofertas da casa" },
  ];

  return (
    <div data-testid="transacoes-hub">
      <div className="px-6 md:px-10 pt-6 md:pt-8">
        <SectionTabs
          testid="transacoes-tabs"
          value={tab}
          onChange={(v) => navigate(TAB_PATH[v])}
          options={options}
        />
      </div>
      {tab === "historico" ? <Historico /> : tab === "ofertas" ? <OfertasCasa /> : <Transacoes />}
    </div>
  );
}
