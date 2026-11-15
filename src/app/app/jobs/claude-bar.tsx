"use client";
// At the bottom of every sidebar (jobs, contacts, suppliers, New lead): ask Claude anything about what's open or
// the business, by typing or by talking (the mic starts a "call": it listens, answers out loud, then listens
// again until you hang up). Pass jobId / contactId / supplierId so Claude sees that record in full.
// While chatting, the chat takes the bottom 70% of the sidebar and the rest blurs, so it's clear what has focus.
// Click the blur or anywhere else in the app (or Esc, or Minimise) and it shrinks back to the single chat bar;
// the conversation stays and comes back when you click into the bar again.
// Every chat is saved (chat-actions.ts) like Claude does: History lists your past chats for where you are (this
// job / contact / supplier, or general), New chat starts afresh.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { cx } from "@/components/ui";
import { deleteChat, listChats, loadChat, saveChat, type ChatSummary } from "./chat-actions";

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

const Spark = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" fill="currentColor" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" opacity=".7" /></svg>
);
const iconBtn = "grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink";
const MIC = "M12 4a3 3 0 00-3 3v5a3 3 0 006 0V7a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v3";
const CLOCK = "M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5l3 2";
const NEW = "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z";

/** "just now", "5 min ago", "3:20 pm", "Mon", "12 Nov". */
function ago(iso: string): string {
  const t = new Date(iso), mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (t.toDateString() === new Date().toDateString()) return t.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, " ");
  if (Date.now() - t.getTime() < 6 * 864e5) return t.toLocaleDateString("en-AU", { weekday: "short" });
  return t.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

/** `docked`: the chat is the whole sidebar (Jobs and Contacts with nothing else open), always open, no blur or minimise. */
export function ClaudeBar({ jobId, contactId, supplierId, firstName, ready, docked = false }: { jobId?: string; contactId?: string; supplierId?: string; firstName?: string; ready: boolean; docked?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState<"off" | "listening" | "thinking" | "speaking">("off");
  const callOn = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const history = useRef<Turn[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false); // chat has the sidebar's attention
  const chatId = useRef<string | null>(null); // the saved chat this conversation belongs to
  const [activeChat, setActiveChat] = useState<string | null>(null); // the same, for highlighting it in History
  const [view, setView] = useState<"chat" | "history">("chat");
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [barH, setBarH] = useState(68);

  // The chat sits over the sidebar card it's in: make that card the frame.
  useLayoutEffect(() => {
    const parent = root.current?.parentElement;
    if (parent && getComputedStyle(parent).position === "static") parent.style.position = "relative";
  }, []);
  useEffect(() => {
    if (!focused || docked) return;
    panel.current?.animate([{ transform: "translateY(24px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.3,.7,.2,1)" });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false); };
    // Anywhere outside the chat (the panel and the blur are inside it; the blur minimises on its own).
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setFocused(false); };
    window.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", away, true);
    return () => { window.removeEventListener("keydown", esc); document.removeEventListener("pointerdown", away, true); };
  }, [focused, docked]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [turns, busy]);
  useEffect(() => () => { callOn.current = false; rec.current?.abort(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  async function ask(q: string): Promise<string | null> {
    setFocused(true);
    setView("chat");
    const next = [...history.current, { role: "user" as const, content: q }];
    history.current = next;
    setTurns(next);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, contactId, supplierId, messages: next.filter((t) => !t.error).slice(-20).map(({ role, content }) => ({ role, content })) }),
      });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      const turn: Turn = json.text ? { role: "assistant", content: json.text } : { role: "assistant", content: json.error ?? "Claude couldn't answer right now.", error: true };
      history.current = [...next, turn];
      setTurns(history.current);
      if (!turn.error) {
        // Keep it in History (quietly; a failed save doesn't get in the way of the chat).
        const keep = history.current.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
        void saveChat({ id: chatId.current, context: { jobId, contactId, supplierId }, turns: keep }).then((r) => { if (r.id) { chatId.current = r.id; setActiveChat(r.id); } }).catch(() => {});
      }
      return turn.error ? null : turn.content;
    } catch {
      history.current = [...next, { role: "assistant", content: "Couldn't reach Claude. Check your connection.", error: true }];
      setTurns(history.current);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    void ask(q);
  }

  function listen() {
    const r = getRecognition();
    if (!r) return;
    rec.current = r;
    r.lang = "en-AU"; r.interimResults = false; r.continuous = false;
    let heard = "";
    r.onresult = (e) => { heard = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim(); };
    r.onerror = (e) => { if (e.error === "not-allowed") hangUp("Microphone blocked. Allow it in your browser to talk to Claude."); };
    r.onend = async () => {
      if (!callOn.current) return;
      if (!heard) { listen(); return; }
      setCall("thinking");
      const reply = await ask(heard);
      if (!callOn.current) return;
      if (reply && "speechSynthesis" in window) {
        setCall("speaking");
        const u = new SpeechSynthesisUtterance(reply.replace(/^[-•]\s*/gm, ""));
        u.lang = "en-AU";
        const v = window.speechSynthesis.getVoices().find((x) => x.lang === "en-AU");
        if (v) u.voice = v;
        u.onend = () => { if (callOn.current) { setCall("listening"); listen(); } };
        window.speechSynthesis.speak(u);
      } else { setCall("listening"); listen(); }
    };
    setCall("listening");
    r.start();
  }

  function hangUp(msg?: string) {
    callOn.current = false;
    rec.current?.abort();
    window.speechSynthesis?.cancel();
    setCall("off");
    if (msg) { history.current = [...history.current, { role: "assistant", content: msg, error: true }]; setTurns(history.current); }
  }

  function toggleCall() {
    if (call !== "off") return hangUp();
    if (!getRecognition()) { history.current = [...history.current, { role: "assistant", content: "Talking to Claude needs Chrome, Edge or Safari. You can still type.", error: true }]; setTurns(history.current); return; }
    callOn.current = true;
    setFocused(true);
    listen();
  }

  const open = docked || focused; // a voice call carries on minimised; the bar shows its status
  // The chat panel runs from 30% down to the top of the input bar, so chat + bar = the bottom 70%.
  useLayoutEffect(() => { if (open && root.current) setBarH(root.current.offsetHeight); }, [open]);
  const status = call === "listening" ? "Listening… say what you need" : call === "thinking" ? "Thinking…" : call === "speaking" ? "Claude is talking. Tap to hang up" : null;
  // Somewhere to start: a few questions for what's open.
  const starters = firstName && jobId ? ["What should I do next?", `Draft a text to ${firstName}`, "What should I charge for this?"]
    : firstName ? [`What's happening with ${firstName}?`, `Draft a message to ${firstName}`, "Who should I follow up today?"]
    : ["What needs doing today?", "Which quotes need a follow-up?", "How's this month looking?"];
  const newChat = () => { hangUp(); history.current = []; chatId.current = null; setActiveChat(null); setTurns([]); setView("chat"); input.current?.focus(); };
  async function showHistory() {
    if (view === "history") { setView("chat"); return; }
    setView("history");
    setChats(null);
    setChats(await listChats({ jobId, contactId, supplierId }).catch(() => []));
  }
  async function openChat(id: string) {
    const t = await loadChat(id).catch(() => null);
    if (!t) return;
    hangUp();
    history.current = t;
    chatId.current = id;
    setActiveChat(id);
    setTurns(t);
    setView("chat");
  }
  async function removeChat(id: string) {
    setChats((c) => c?.filter((x) => x.id !== id) ?? null);
    if (chatId.current === id) newChat();
    await deleteChat(id).catch(() => {});
  }
  return (
    <div ref={root} className="border-t border-slate-200 bg-white" data-claude-bar data-focused={open ? "true" : "false"}>
      {open && (<>
        {/* Everything above the chat blurs; tap it to go back to the job. */}
        {!docked && <button type="button" aria-label="Back to the sidebar" onClick={() => setFocused(false)} data-claude-dim
          className="absolute inset-x-0 top-0 z-20 h-[30%] cursor-default bg-white/60 backdrop-blur-md" />}
        <div ref={panel} className={cx("absolute inset-x-0 z-30 flex flex-col bg-white", docked ? "top-0" : "top-[30%] rounded-t-[22px] border-t border-slate-200")} style={{ bottom: barH }} data-claude-panel>
          <div className={cx("flex items-center justify-between px-4 pb-1", docked ? "pt-6" : "pt-3")}>
            {docked
              ? <p className="flex items-center gap-2 font-display text-xl font-bold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#d97757] text-white"><Spark className="h-3.5 w-3.5" /></span>Ask Claude</p>
              : <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Claude · knows your jobs</p>}
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => void showHistory()} title="History" aria-label="History" aria-pressed={view === "history"} className={cx(iconBtn, view === "history" && "bg-slate-100 text-ink")} data-claude-history>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={CLOCK} /></svg>
              </button>
              {(turns.length > 0 || view === "history") && (
                <button type="button" onClick={newChat} title="New chat" aria-label="New chat" className={iconBtn} data-claude-new>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={NEW} /></svg>
                </button>
              )}
              {!docked && (
                <button type="button" onClick={() => setFocused(false)} title="Minimise" aria-label="Minimise" className={iconBtn} data-claude-minimise>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                </button>
              )}
            </span>
          </div>
          {view === "history" ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1 text-sm" data-claude-chats>
              <p className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Your chats{firstName ? ` about ${firstName}` : ""}</p>
              {chats === null ? <p className="px-2 py-2 text-slate-400">Loading…</p>
                : chats.length === 0 ? <p className="px-2 py-2 text-slate-500">No past chats yet. They&apos;ll show here once you ask Claude something.</p>
                : chats.map((c) => (
                  <div key={c.id} className={cx("group flex items-center gap-1 rounded-xl", activeChat === c.id ? "bg-slate-100" : "hover:bg-slate-50")} data-claude-chat>
                    <button type="button" onClick={() => void openChat(c.id)} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-3 py-2.5 text-left">
                      <span className="min-w-0 truncate font-medium text-ink">{c.title}</span>
                      <span className="shrink-0 text-xs text-slate-400">{ago(c.updatedAt)}</span>
                    </button>
                    <button type="button" onClick={() => void removeChat(c.id)} title="Delete chat" aria-label={`Delete chat: ${c.title}`} className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-300 opacity-0 hover:bg-white hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                ))}
            </div>
          ) : (
          <div ref={log} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-3 pt-2 text-sm" aria-live="polite">
            {turns.length === 0 && call === "off" && (
              <div className="space-y-2 pt-1" data-claude-starters>
                <p className="text-sm text-slate-500">{docked ? "Claude knows your jobs, quotes and customers. Try:" : <>Ask anything about {firstName ?? "your business"}. Try:</>}</p>
                {starters.map((q) => (
                  <button key={q} type="button" disabled={!ready} onMouseDown={(e) => e.preventDefault()} onClick={() => void ask(q)}
                    className="block w-full rounded-xl bg-cream px-3.5 py-2.5 text-left text-sm font-medium text-ink ring-1 ring-slate-200 hover:ring-brand-400 disabled:opacity-50">{q}</button>
                ))}
              </div>
            )}
            {turns.map((t, i) => t.role === "user" ? (
              <div key={i} className="ml-10 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-100 px-3.5 py-2.5 text-ink">{t.content}</div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d97757] text-white"><Spark className="h-3.5 w-3.5" /></span>
                <p className={cx("min-w-0 whitespace-pre-wrap pt-1", t.error ? "text-slate-500" : "text-ink")}>{t.content}</p>
              </div>
            ))}
            {busy && <div className="flex gap-2.5"><span className="grid h-7 w-7 shrink-0 animate-pulse place-items-center rounded-full bg-[#d97757] text-white"><Spark className="h-3.5 w-3.5" /></span><p className="pt-1 text-slate-400">Thinking…</p></div>}
          </div>
          )}
        </div>
      </>)}
      <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 py-3">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-cream px-3 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#d97757] text-white"><Spark className="h-3.5 w-3.5" /></span>
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { if (ready) setFocused(true); }} onClick={() => { if (ready) setFocused(true); }} disabled={call !== "off"} aria-label="Ask Claude"
            placeholder={status ?? (!ready ? "Claude isn't connected yet" : turns.length ? "Reply to Claude…" : firstName ? `Ask Claude about ${firstName} or your business…` : "Ask Claude about your business…")}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none" />
        </label>
        <button type="button" onClick={toggleCall} title={call === "off" ? "Talk to Claude" : "Hang up"} aria-label={call === "off" ? "Talk to Claude" : "Hang up"}
          className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white", call === "off" ? "bg-ink hover:bg-slate-800" : "bg-red-600 hover:bg-red-700")}>
          {call === "off"
            ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d={MIC} /></svg>
            : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>}
        </button>
      </form>
    </div>
  );
}
