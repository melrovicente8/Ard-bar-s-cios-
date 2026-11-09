import React, { useMemo, useState } from "react";
import { CaretLeft, CaretRight, DotsSixVertical, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { useLayout } from "../context/LayoutContext";
import { layoutPagesFor } from "../lib/navigation";
import { PORTABLE_BLOCKS } from "./blocks/portableBlocks";

const SPAN = {
  full: "col-span-12",
  half: "col-span-12 lg:col-span-6",
  third: "col-span-12 md:col-span-6 lg:col-span-4",
  "two-thirds": "col-span-12 lg:col-span-8",
  quarter: "col-span-6 md:col-span-4 lg:col-span-3",
};

/**
 * Grelha de blocos de uma aba.
 *
 * - `blocks`: `[{ id, label, span, node }]` (ou `Component` para blocos autónomos).
 * - A ordem e a aba de cada bloco vêm de `LayoutContext` (definidas pela direção).
 * - Blocos autónomos (`PORTABLE_BLOCKS`) enviados para esta aba são desenhados aqui
 *   mesmo que a página não os declare.
 */
const normalizeChildren = (children) => {
  const out = [];
  React.Children.forEach(children, (child) => {
    if (!child) return;
    if (child.type === React.Fragment) {
      out.push(...normalizeChildren(child.props.children));
      return;
    }
    if (child.props && child.props.id) {
      out.push({
        id: child.props.id,
        label: child.props.label,
        span: child.props.span,
        node: child.props.children,
      });
    }
  });
  return out;
};

/** Marca um bloco dentro de um `BlockBoard` (só descreve; quem desenha é o board). */
export const Block = () => null;

export default function BlockBoard({ page, blocks, children, layout = "grid", className = "", testidPrefix = "block" }) {
  const blocksList = blocks || normalizeChildren(children);
  const { user } = useAuth();
  const { placements, editing, canEdit, setPageOrder, placeBlock, resetPage } = useLayout();
  const [draggingId, setDraggingId] = useState(null);
  const editMode = editing && canEdit;
  const pages = useMemo(() => layoutPagesFor(user?.role), [user?.role]);

  const defs = useMemo(() => {
    const own = (blocksList || []).filter(Boolean).map((b) => ({ ...b }));
    const known = new Set(own.map((b) => b.id));
    const foreign = Object.values(PORTABLE_BLOCKS)
      .filter((b) => !known.has(b.id) && placements[b.id]?.page === page)
      .map((b) => ({ id: b.id, label: b.label, span: b.span, Component: b.Component }));
    return [...own, ...foreign];
  }, [blocksList, placements, page]);

  const ordered = useMemo(
    () =>
      defs
        .map((def, index) => ({ def, key: placements[def.id]?.order ?? 1000 + index }))
        .filter(({ def }) => (placements[def.id]?.page || page) === page)
        .sort((a, b) => a.key - b.key)
        .map(({ def }) => def),
    [defs, placements, page]
  );

  const move = (id, delta) => {
    const ids = ordered.map((d) => d.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPageOrder(page, ids);
  };

  const drop = (sourceId, targetId) => {
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = ordered.map((d) => d.id).filter((id) => id !== sourceId);
    const at = ids.indexOf(targetId);
    ids.splice(at < 0 ? ids.length : at, 0, sourceId);
    setPageOrder(page, ids);
  };

  return (
    <div
      className={layout === "stack" ? `flex flex-col gap-6 ${className}` : `grid grid-cols-12 gap-4 md:gap-6 ${className}`}
      data-testid={`board-${page}`}
    >
      {editMode && (
        <div className={`${layout === "grid" ? "col-span-12" : ""} flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200`} data-testid="board-edit-hint">
          <DotsSixVertical size={13} weight="bold" />
          <span className="flex-1 min-w-[12rem]">
            Modo organização: arrasta os blocos (ou usa as setas) e escolhe a aba em "aba" para enviar
            um bloco para outra página. A organização fica guardada para toda a equipa.
          </span>
          <button
            type="button"
            onClick={() => resetPage(ordered.map((d) => d.id))}
            data-testid="board-reset-page"
            className="flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-1 font-bold text-amber-300 hover:bg-amber-500/20"
          >
            <ArrowCounterClockwise size={12} weight="bold" /> Repor esta aba
          </button>
        </div>
      )}

      {ordered.map((def) => (
        <div
          key={def.id}
          style={{ order: 0 }}
          draggable={editMode}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", def.id);
            setDraggingId(def.id);
          }}
          onDragOver={(e) => {
            if (!editMode) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (!editMode) return;
            e.preventDefault();
            drop(e.dataTransfer.getData("text/plain") || draggingId, def.id);
          }}
          onDragEnd={() => setDraggingId(null)}
          data-testid={`${testidPrefix}-slot-${def.id}`}
          data-block-id={def.id}
          className={`relative min-w-0 ${layout === "grid" ? SPAN[def.span] || SPAN.full : ""} ${
            editMode ? "cursor-grab rounded-lg ring-1 ring-amber-500/40 active:cursor-grabbing" : ""
          } ${draggingId === def.id ? "opacity-40" : ""}`}
        >
          <div className={`h-full ${editMode ? "pointer-events-none select-none" : ""}`}>
            {def.Component ? <def.Component /> : def.node ?? null}
          </div>
          {editMode && (
            <div className="absolute -top-3 left-2 right-2 z-20 flex items-center gap-1 rounded-md border border-amber-500/50 bg-slate-900 px-1.5 py-1 shadow-lg">
              <DotsSixVertical size={12} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wider text-amber-300">
                {def.label}
              </span>
              <button
                type="button"
                onClick={() => move(def.id, -1)}
                title="Mover para trás"
                data-testid={`${testidPrefix}-move-prev-${def.id}`}
                className="p-0.5 text-slate-300 hover:text-amber-400"
              >
                <CaretLeft size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => move(def.id, 1)}
                title="Mover para a frente"
                data-testid={`${testidPrefix}-move-next-${def.id}`}
                className="p-0.5 text-slate-300 hover:text-amber-400"
              >
                <CaretRight size={12} weight="bold" />
              </button>
              <select
                value={page}
                onChange={(e) => placeBlock(def.id, e.target.value)}
                title="Enviar este bloco para outra aba do menu"
                data-testid={`${testidPrefix}-move-to-${def.id}`}
                className="max-w-[7.5rem] rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[10px] text-slate-200"
              >
                {pages.map((p) => (
                  <option key={p.to} value={p.to}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
