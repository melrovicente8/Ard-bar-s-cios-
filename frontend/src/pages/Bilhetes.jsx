import React from "react";
import { Ticket } from "@phosphor-icons/react";

export default function Bilhetes() {
  return (
    <div className="p-6 md:p-10 animate-in" data-testid="bilhetes-page">
      <div className="flex items-center gap-3 mb-6">
        <Ticket size={32} weight="duotone" className="text-amber-400" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Bilhetes</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1">Venda de bilhetes · Estádio Dia Gonçalves</h1>
        </div>
      </div>
      <div className="bg-slate-900/40 border border-amber-500/20 rounded-xl p-12 text-center max-w-xl">
        <div className="inline-flex px-4 py-1.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-widest mb-4">
          Não disponível
        </div>
        <p className="text-slate-400 text-sm">
          A venda de bilhetes para o Estádio Dia Gonçalves estará disponível em breve.
        </p>
      </div>
    </div>
  );
}
