import type { Metadata } from "next";
import { aiEnabled } from "@/lib/ai";
import { ClaudeSidebar } from "../jobs/claude-sidebar";

export const metadata: Metadata = { title: "Settings" };

/** Settings with no area open: the cards (layout) and Claude on the right. */
export default function Page() {
  return <ClaudeSidebar ready={aiEnabled()} />;
}
