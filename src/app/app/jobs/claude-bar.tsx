"use client";
// Always at the bottom of every right sidebar: ask Claude about what's open (a job, a contact, a supplier) or the business, by typing or
// by talking (the mic starts a "call": it listens, answers out loud, then listens again until you hang up).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cx } from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

const Spark = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" fill="currentColor" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" opacity=".7" /></svg>
);
const MIC = "M12 4a3 3 0 00-3 3v5a3 3 0 006 0V7a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v3";

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export function ClaudeBar({ jobId, contactId, supplierId, firstName, ready }: { jobId?: string; contactId?: string; supplierId?: string; firstName?: string; ready: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState<"off" | "listening" | "thinking" | "speaking">("off");
  const callOn = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const history = useRef<Turn[]>([]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [turns, busy]);
  useEffect(() => () => { callOn.current = false; rec.current?.abort(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  async function ask(q: string): Promise<string | null> {
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
    listen();
  }

  const open = turns.length > 0 || call !== "off";
  const status = call === "listening" ? "Listening… say what you need" : call === "thinking" ? "Thinking…" : call === "speaking" ? "Claude is talking. Tap to hang up" : null;
  return (
    <div className="border-t border-slate-200 bg-white" data-claude-bar>
      {open && (
        <div ref={log} className="max-h-[360px] space-y-3 overflow-y-auto px-4 pb-2 pt-4 text-sm" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Claude · knows your jobs</p>
            <button type="button" onClick={() => { hangUp(); history.current = []; setTurns([]); }} className="text-xs font-semibold text-slate-500 hover:text-ink">Clear</button>
          </div>
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
      <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 py-3">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-cream px-3 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#d97757] text-white"><Spark className="h-3.5 w-3.5" /></span>
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={call !== "off"} aria-label="Ask Claude"
            placeholder={status ?? (!ready ? "Claude isn't connected yet" : turns.length ? "Reply to Claude…" : (firstName ? `Ask Claude about ${firstName} or your business…` : "Ask Claude about your business…"))}
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
