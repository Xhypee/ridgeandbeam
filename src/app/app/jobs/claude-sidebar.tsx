// The right sidebar when nothing else is open on Jobs or Contacts (computer only): Claude's chat, always open.
import { ClaudeBar } from "./claude-bar";

export function ClaudeSidebar({ ready }: { ready: boolean }) {
  return (
    <aside aria-label="Ask Claude" className="hidden bg-white lg:flex lg:h-full lg:w-[440px] lg:shrink-0 lg:flex-col lg:border-l lg:border-slate-200 xl:w-[460px]" data-claude-sidebar>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1" />
        <ClaudeBar docked ready={ready} />
      </div>
    </aside>
  );
}
