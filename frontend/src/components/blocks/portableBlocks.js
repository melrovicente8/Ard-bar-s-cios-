import { DASHBOARD_BLOCKS } from "./DashboardBlocks";

/**
 * Blocos autónomos: sabem buscar os próprios dados, por isso podem ser
 * desenhados em qualquer aba do menu para onde a direção os envie.
 */
export const PORTABLE_BLOCKS = Object.fromEntries(
  DASHBOARD_BLOCKS.map(({ id, label, span, Component, interactiveWhileEditing }) => [
    id,
    { id, label, span, Component, interactiveWhileEditing },
  ])
);
