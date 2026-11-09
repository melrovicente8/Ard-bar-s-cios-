import React from "react";
import BlockBoard from "../components/BlockBoard";
import { DASHBOARD_BLOCKS } from "../components/blocks/DashboardBlocks";

export default function Dashboard() {
  return (
    <div className="p-6 md:p-10 animate-in" data-testid="dashboard-page">
      <BlockBoard page="/" blocks={DASHBOARD_BLOCKS} testidPrefix="kpi" />
    </div>
  );
}
