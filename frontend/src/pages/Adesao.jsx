import React from "react";
import { Link } from "react-router-dom";
import { UserPlus } from "@phosphor-icons/react";
import AdesaoApprovals from "../components/AdesaoApprovals";
import AdesaoForm from "../components/AdesaoForm";

/**
 * Página pública de adesão (/aderir). O formulário é o mesmo que está
 * integrado na aba "Adesão de sócios" de Clientes e sócios.
 */
export default function Adesao() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 mb-6" data-testid="adesao-voltar">
          ← Voltar
        </Link>
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-xl bg-amber-500/15 text-amber-400 mb-3">
            <UserPlus size={26} weight="duotone" />
          </div>
          <h1 className="font-outfit text-2xl font-bold">Adesão a sócio · ARD Nespereira</h1>
          <p className="text-sm text-slate-400 mt-1">Preenche o formulário — o pedido fica pendente de aprovação da direção.</p>
        </div>

        <AdesaoApprovals />
        <AdesaoForm />
      </div>
    </div>
  );
}
