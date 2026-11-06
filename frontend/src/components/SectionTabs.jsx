import React from "react";

/**
 * Barra de separadores partilhada entre páginas (ex.: MBWay · Pedidos · Mensagens).
 * Mesmo formato dos separadores de Clientes e sócios.
 */
export default function SectionTabs({ options, value, onChange, testid = "section-tabs" }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-1" data-testid={testid}>
      {options.map((opt) => (
        <button
          key={opt.v}
          type="button"
          data-testid={`${testid}-${opt.v}`}
          onClick={() => onChange(opt.v)}
          className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
            value === opt.v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
