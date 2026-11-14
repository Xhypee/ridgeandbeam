"use client";

// When a job moves to another column (booked → Quoted, signed, building…), its card hops over on a roof-pitch path
// while the rest of the board dims, lands with a squash and a puff of dust, and a "+1" floats up from the new
// column's count. Works on whatever the server re-renders: it remembers where every card was and, after each
// update, animates any card whose column changed. The flying card is a copy in a fixed layer, so the columns'
// own scroll boxes can't clip it. When a job gets signed, a burst of roof tiles goes off over its card.
// Reduce Motion: the card just fades in, no burst.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

type Spot = { col: string; rect: DOMRect; signed: boolean };

// Kept outside the component: opening or closing a sidebar can rebuild the board, and the move should still play.
// Only trusted for a few seconds, so coming back to Jobs later doesn't replay old moves.
let last: { at: number; spots: Map<string, Spot> } | null = null;
const FRESH_MS = 6000;

const colOf = (el: Element) => el.closest<HTMLElement>("[data-pipeline-col]")?.dataset.pipelineCol ?? "";

export function StageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  const snapshot = () => {
    const el = root.current;
    if (!el) return;
    const next = new Map<string, Spot>();
    el.querySelectorAll<HTMLElement>("[data-job-card]").forEach((c) => next.set(c.dataset.jobCard!, { col: colOf(c), rect: c.getBoundingClientRect(), signed: c.dataset.signed === "1" }));
    last = { at: Date.now(), spots: next };
  };

  // Keep the remembered positions fresh while columns or the board scroll, and when the window resizes.
  useEffect(() => {
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(snapshot); };
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", later, true); window.removeEventListener("resize", later); };
  }, []);

  // After every update: animate cards that changed column, then remember where everything is now.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const prev = last && Date.now() - last.at < FRESH_MS ? last.spots : null;
    if (!prev) { snapshot(); return; }
    const moved: { card: HTMLElement; from: DOMRect; col: string; signed: boolean }[] = [];
    const signedHere: HTMLElement[] = [];
    el.querySelectorAll<HTMLElement>("[data-job-card]").forEach((card) => {
      const before = prev.get(card.dataset.jobCard!);
      if (!before) return;
      const col = colOf(card);
      const justSigned = !before.signed && card.dataset.signed === "1";
      if (before.col && col && before.col !== col) moved.push({ card, from: before.rect, col, signed: justSigned });
      else if (justSigned) signedHere.push(card);
    });
    // A filter switch or a big refresh can shuffle lots of cards; only a handful of moves gets the show.
    if (moved.length > 0 && moved.length <= 3) moved.forEach((m) => fly(el, m.card, m.from, m.col, m.signed));
    if (signedHere.length > 0 && signedHere.length <= 3) signedHere.forEach((c) => tileBurst(c, 0));
    snapshot();
  });

  return <div ref={root} className="contents">{children}</div>;
}

function fly(board: HTMLElement, card: HTMLElement, from: DOMRect, col: string, signed = false) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Bring the card into view inside its column first (new arrivals can sit at the bottom of a long column).
  const scroller = card.closest<HTMLElement>("[data-col-scroll]");
  if (scroller && scroller.scrollHeight > scroller.clientHeight) {
    const c = card.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    if (c.bottom > s.bottom) scroller.scrollTop += c.bottom - s.bottom + 8;
    else if (c.top < s.top) scroller.scrollTop -= s.top - c.top + 8;
  }
  if (reduce) { card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return; }

  const to = card.getBoundingClientRect();
  const dx = from.left - to.left, dy = from.top - to.top;
  if (Math.abs(dx) + Math.abs(dy) < 4) return;

  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-job-card");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", ""); // a picture of the card: not clickable, not focusable
  Object.assign(ghost.style, {
    position: "fixed", left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
    margin: "0", zIndex: "70", pointerEvents: "none", boxSizing: "border-box", transformOrigin: "50% 60%",
    outline: "2px solid #1f5f3f", outlineOffset: "-1px",
  });
  document.body.appendChild(ghost);
  card.style.visibility = "hidden";

  const D = 1050;
  // Spotlight: everything else on the board dims while the card is in the air.
  board.querySelectorAll<HTMLElement>("[data-job-card]").forEach((c) => {
    if (c !== card) c.animate([{ opacity: 1 }, { opacity: 0.4, offset: 0.22 }, { opacity: 0.4, offset: 0.78 }, { opacity: 1 }], { duration: D });
  });
  // Lift towards you (bigger, with a green outline: the UI stays flat), hop over the roof pitch (up one side, down the other), squash on landing.
  const hop = ghost.animate([
    { transform: `translate(${dx}px,${dy}px) scale(1) rotate(0)`, easing: "cubic-bezier(.3,.6,.4,1)" },
    { transform: `translate(${dx}px,${dy - 8}px) scale(1.12) rotate(0)`, offset: 0.18, easing: "cubic-bezier(.2,.6,.4,1)" },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 56}px) scale(1.12) rotate(-4deg)`, offset: 0.5, easing: "cubic-bezier(.6,0,.8,.4)" },
    { transform: "translate(0,0) scale(1.04) rotate(3deg)", offset: 0.8 },
    { transform: "translate(0,3px) scale(1.05,.93) rotate(0)", offset: 0.88 },
    { transform: "translate(0,0) scale(1) rotate(0)" },
  ], { duration: D });
  const done = () => { ghost.remove(); card.style.visibility = ""; };
  // Signed on the way over: the tiles go off as it lands.
  if (signed) tileBurst(card, D * 0.8);
  hop.finished.then(done, done);

  // Dust puff from both bottom corners as it lands.
  window.setTimeout(() => {
    for (let i = 0; i < 10; i++) {
      const left = i < 5;
      const d = document.createElement("i");
      Object.assign(d.style, {
        position: "fixed", width: "8px", height: "8px", borderRadius: "50%", background: "#94a3b8", pointerEvents: "none", zIndex: "71",
        left: `${left ? to.left + 8 : to.right - 16}px`, top: `${to.bottom - 8}px`,
      });
      document.body.appendChild(d);
      const spread = (left ? -1 : 1) * (12 + Math.random() * 26);
      d.animate([{ transform: "translate(0,0) scale(.6)", opacity: 0.5 }, { transform: `translate(${spread}px,${-6 - Math.random() * 12}px) scale(1.7)`, opacity: 0 }],
        { duration: 520 + Math.random() * 220, easing: "ease-out" }).finished.then(() => d.remove(), () => d.remove());
    }
  }, D * 0.84);

  // "+1" floats up beside the new column's count.
  const count = board.querySelector<HTMLElement>(`[data-pipeline-col="${col}"] [data-col-count]`);
  if (count) {
    const r = count.getBoundingClientRect();
    const plus = document.createElement("span");
    plus.textContent = "+1";
    Object.assign(plus.style, { position: "fixed", left: `${r.right + 5}px`, top: `${r.top - 2}px`, font: "700 13px/1 var(--font-display, system-ui)", color: "#1f5f3f", pointerEvents: "none", zIndex: "71" });
    document.body.appendChild(plus);
    plus.animate([{ transform: "translateY(4px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1, offset: 0.3 }, { transform: "translateY(-18px)", opacity: 0 }],
      { duration: 1000, delay: D * 0.55, fill: "backwards", easing: "ease-out" }).finished.then(() => plus.remove(), () => plus.remove());
  }
}

/** A burst of little roof tiles (evergreen, amber, terracotta) from the top of a card: a job just got signed. */
function tileBurst(card: HTMLElement, delay: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.setTimeout(() => {
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + 18;
    const colors = ["#1f5f3f", "#d97706", "#b9d8c3", "#c2410c", "#4f9c72"];
    for (let i = 0; i < 26; i++) {
      const t = document.createElement("i");
      Object.assign(t.style, {
        position: "fixed", left: `${cx}px`, top: `${cy}px`, width: "10px", height: "6px", borderRadius: "1.5px",
        background: colors[i % colors.length], pointerEvents: "none", zIndex: "72",
      });
      document.body.appendChild(t);
      const ang = (Math.PI * 2 * i) / 26 + Math.random() * 0.4;
      const dist = 60 + Math.random() * 70;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist * 0.7 - 34;
      const rot = Math.round(Math.random() * 540 - 270);
      t.animate([
        { transform: "translate(-50%,-50%) rotate(0) scale(.6)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 80}px)) rotate(${rot}deg) scale(.9)`, opacity: 0 },
      ], { duration: 1150 + Math.random() * 350, easing: "cubic-bezier(.2,.7,.3,1)" }).finished.then(() => t.remove(), () => t.remove());
    }
  }, delay);
}
