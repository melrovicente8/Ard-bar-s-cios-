import React, { useEffect, useRef } from "react";
import { useContent } from "../context/ContentContext";

/**
 * Texto editável pela direção (só com o cadeado do cabeçalho desbloqueado).
 * Uso: <EditableText k="page.vender.title" as="h1" className="...">Vender</EditableText>
 * Sem override guardado, mostra o texto original (children).
 */
export default function EditableText({ k, children, as: Tag = "span", className = "", title }) {
  const { get, save, editMode } = useContent();
  const fallback = typeof children === "string" ? children : String(children ?? "");
  const text = get(k, fallback);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== text && document.activeElement !== ref.current) {
      ref.current.textContent = text;
    }
  }, [text]);

  if (!editMode) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-content-key={k}
      title={title || "Clica para alterar este texto"}
      onBlur={(e) => {
        const v = (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim();
        if (!v) {
          e.currentTarget.textContent = text;
          return;
        }
        if (v !== text) save(k, v === fallback.trim() ? "" : v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = text;
          e.currentTarget.blur();
        }
      }}
      className={`${className} rounded outline-dashed outline-1 outline-amber-400/60 cursor-text focus:outline-2 focus:outline-amber-400 focus:bg-amber-400/10`}
    >
      {text}
    </Tag>
  );
}
