import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";
import MBWay from "./MBWay";
import Pedidos from "./Pedidos";
import Mensagens from "./Mensagens";

const TAB_PATH = { mbway: "/mbway", pedidos: "/pedidos", mensagens: "/mensagens" };

/**
 * Aba única com MBWay, Pedidos de sócio e Mensagens — cada um continua na sua
 * página, os três partilham o mesmo item de menu.
 */
export default function MbwayPedidos() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname.startsWith("/pedidos")
    ? "pedidos"
    : pathname.startsWith("/mensagens")
      ? "mensagens"
      : "mbway";

  return (
    <div data-testid="mbway-pedidos-hub">
      <div className="px-6 md:px-10 pt-6 md:pt-8">
        <SectionTabs
          testid="mbway-pedidos-tabs"
          value={tab}
          onChange={(v) => navigate(TAB_PATH[v])}
          options={[
            { v: "mbway", label: "MBWay" },
            { v: "pedidos", label: "Pedidos de sócio" },
            { v: "mensagens", label: "Mensagens" },
          ]}
        />
      </div>
      {tab === "pedidos" ? <Pedidos /> : tab === "mensagens" ? <Mensagens /> : <MBWay />}
    </div>
  );
}
