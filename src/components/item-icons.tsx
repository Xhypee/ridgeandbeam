// Black-and-white line icons for quote items, drawn from the real roofing products (24×24, 1.6 stroke, currentColor).
// Mapped by calculator key; custom lines get the generic parcel. Server- and client-safe.
import type { ReactNode } from "react";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Corrugated wave from x0 to x1 at baseline y (Custom Orb style, rounded humps). */
const wave = (x0: number, x1: number, y: number, pitch = 3, amp = 1.4) => {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1 - 0.01; x += pitch) d += ` q${pitch / 4} ${-amp} ${pitch / 2} 0 t${pitch / 2} 0`;
  return d;
};
/** A row of roof-tile courses (scalloped bottoms) at y. */
const course = (y: number, x0 = 3, x1 = 21, w = 6) => {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1 - 0.01; x += w) d += ` q${w / 2} 2.6 ${w} 0`;
  return d;
};

export const ICONS: Record<string, { label: string; svg: ReactNode }> = {
  // Corrugated roof sheet seen end-on at an angle: top and bottom corrugation edges, parallel sides.
  sheets: { label: "Roof sheets", svg: <><path {...P} d={wave(3, 15, 18.5)} /><path {...P} d={wave(9, 21, 6.5)} /><path {...P} d="M3 18.5l6-12M15 18.5l6-12" /><path {...P} d="M6 18.5l6-12M9 18.5l6-12M12 18.5l6-12" opacity=".45" /></> },
  // Roofer's hard hat (labour): dome, centre ridge and brim.
  labour: { label: "Installation labour", svg: <><path {...P} d="M4.5 16a7.5 7.5 0 0 1 15 0" /><path {...P} d="M10.5 8.7V6.5h3v2.2" /><path {...P} d="M10.5 16V9.2M13.5 16V9.2" opacity=".55" /><path {...P} d="M2.5 16.2h19c0 1.4-.9 2.3-2.3 2.3H4.8c-1.4 0-2.3-.9-2.3-2.3z" /></> },
  // Roll-top ridge capping: rolled crown with two flanges, sitting on the ridge of two roof slopes.
  ridge: { label: "Ridge & hip capping", svg: <><circle {...P} cx="12" cy="8" r="2.4" /><path {...P} d="M9.8 9.2L3.5 13M14.2 9.2l6.3 3.8" /><path {...P} d="M3 18l9-5.4 9 5.4" strokeDasharray="1.5 1.8" /></> },
  // Barge capping folded over the edge of the sheets and down the barge board (cross-section).
  barge: { label: "Barge capping", svg: <><path {...P} d="M3 8.5h13.2l1.8 1.6V19" /><path {...P} d="M18 19l-1.2 1.2" /><path {...P} d="M3 11h12" strokeDasharray="1.5 1.8" /><path {...P} d="M15 12.5h2v8.5" opacity=".5" /></> },
  // Valley iron profile: V trough with stiffening returns at each edge.
  valley: { label: "Valley iron", svg: <><path {...P} d="M3 7.5l1.8 1.2L12 16.5l7.2-7.8L21 7.5" /><path {...P} d="M3 7.5V6.3M21 7.5V6.3" /><path {...P} d="M9.5 13.7L12 16.5l2.5-2.8" opacity=".5" /></> },
  // Top-hat roof batten profile (cross-section).
  battens: { label: "Roof battens", svg: <><path {...P} d="M3 16.5h4.2l1.8-8h6l1.8 8H21" /><path {...P} d="M3 19h18" strokeDasharray="1.5 1.8" /></> },
  // Timber tile battens across a rafter (three battens in section).
  tile_battens: { label: "Tile battens", svg: <><path {...P} d="M2.5 19.5l19-6" /><path {...P} d="M4.4 15.7l3.4-1.1.9 2.9-3.4 1.1zM10.5 13.8l3.4-1.1.9 2.9-3.4 1.1zM16.6 11.9l3.4-1.1.9 2.9-3.4 1.1z" /><path {...P} d="M2.5 22l19-6" opacity=".45" /></> },
  // Hex-head tek screw with sealing washer, thread and drill point.
  screws: { label: "Screws & fixings", svg: <><path {...P} d="M9.5 3.5h5l1 2-1 2h-5l-1-2z" /><path {...P} d="M8 8.8h8" /><path {...P} d="M10.6 9v8.5L12 21l1.4-3.5V9" /><path {...P} d="M10.6 11.5l2.8-1M10.6 13.7l2.8-1M10.6 15.9l2.8-1" /></> },
  // Sarking: rolled blanket with the end of the roll and a length rolled out (foil hatching).
  sarking: { label: "Sarking", svg: <><circle {...P} cx="7.5" cy="9.5" r="4.5" /><circle {...P} cx="7.5" cy="9.5" r="1.4" /><path {...P} d="M7.5 14H21v-3.2H11.6" /><path {...P} d="M13.5 14l2.5-3.2M16.5 14l2.5-3.2" /></> },
  // Quad gutter profile (straight back, flat sole, curved quad front) with an outlet and downpipe.
  gutters: { label: "Gutters & downpipes", svg: <><path {...P} d="M3.5 3.5v7.2c0 .9.6 1.3 1.4 1.3h11c1.8 0 3.1-1.6 3.1-3.6V4.2l1.3-.7" /><path {...P} d="M9.5 12v9.5h3.5V12" /><path {...P} d="M9.5 17h3.5" opacity=".5" /></> },
  // Downpipe with a swan-neck offset and a wall clip.
  downpipe: { label: "Downpipe", svg: <><path {...P} d="M7 2.5v4l4 4v11M11 2.5v2.5l4 4v12.5" /><path {...P} d="M9.5 15h7.5M9.5 18.5h7.5" opacity=".55" /><path {...P} d="M18.5 13v8" opacity=".45" /></> },
  // Metal fascia profile clipped over a rafter tail (rafter hatched).
  fascia: { label: "Metal fascia", svg: <><path {...P} d="M3 6.5l11.5 4.6v4L3 10.5" /><path {...P} d="M13 7.5h3.5v12l-2 1.5" /><path {...P} d="M16.5 7.5h4" opacity=".5" strokeDasharray="1.5 1.8" /></> },
  // Welded safety mesh: wire grid.
  mesh: { label: "Safety mesh", svg: <><path {...P} d="M4 5h16v14H4z" /><path {...P} d="M8 5v14M12 5v14M16 5v14M4 9.7h16M4 14.3h16" /></> },
  // Edge protection: guard-rail posts on the roof edge with top rail, mid rail and toe board.
  edge: { label: "Edge protection", svg: <><path {...P} d="M3 20.5l18-3" /><path {...P} d="M6 20V6.5M18 18V4.5" /><path {...P} d="M6 7.5l12-2M6 12.5l12-2" /><path {...P} d="M6 18.2l12-2" opacity=".6" /></> },
  // Whirlybird roof ventilator: curved-vane turbine dome on a throat and flashing base.
  whirly: { label: "Whirlybirds", svg: <><path {...P} d="M5.5 13.5a6.5 6.5 0 0 1 13 0" /><path {...P} d="M5.5 13.5h13" /><path {...P} d="M9 13.5c-.6-2.6.3-5 3-6.5M12 13.5c0-2.6.8-4.8 3-6.2M15 13.5c.4-1.8 1.2-3.4 2.4-4.3" /><path {...P} d="M8.5 13.5v3h7v-3" /><path {...P} d="M5 20.5l3.5-4h7l3.5 4z" /></> },
  // Marrel skip bin: sloped ends, top rim and lifting lugs.
  skip: { label: "Skip bin", svg: <><path {...P} d="M2.5 9h19l-3 9.5h-13z" /><path {...P} d="M2.5 9V7.5h19V9" /><path {...P} d="M6.5 7.5L5 5.5M17.5 7.5L19 5.5" /><circle {...P} cx="7.5" cy="19.5" r="1" /><circle {...P} cx="16.5" cy="19.5" r="1" /></> },
  // Apron flashing: turned up the wall, dressed down over the sheets (wall hatched).
  flashing: { label: "Apron / wall flashing", svg: <><path {...P} d="M6 3v18" /><path {...P} d="M3 5l3-2M3 9l3-2M3 13l3-2M3 17l3-2M3 21l3-2" opacity=".45" /><path {...P} d="M7.5 4.5v8.5l13 4.5" /><path {...P} d="M20.5 17.5l.5 1.5" /><path {...P} d="M7.5 15.5l13 4.5" strokeDasharray="1.5 1.8" /></> },
  // Roof tiles: three overlapping courses with the joints staggered.
  tile: { label: "Roof tiles", svg: <><path {...P} d={course(7)} /><path {...P} d={course(12)} /><path {...P} d={course(17)} /><path {...P} d="M9 4.5v2.5M15 4.5v2.5M6 9.5v2.5M12 9.5v2.5M18 9.5v2.5M9 14.5v2.5M15 14.5v2.5" opacity=".55" /><path {...P} d="M3 4.5h18" /></> },
  // Half-round ridge tile bedded over the ridge, mortar bed underneath.
  ridge_tile: { label: "Ridge / hip tiles", svg: <><path {...P} d="M5.5 12.5a6.5 6.5 0 0 1 13 0" /><path {...P} d="M5.5 12.5h13" /><path {...P} d="M7.5 12.5c1 1.6 2.6 2.3 4.5 2.3s3.5-.7 4.5-2.3" opacity=".55" /><path {...P} d="M2.5 20l9.5-5.4 9.5 5.4" /></> },
  // Strip the old roof: a sheet lifted off the battens with an up arrow.
  strip: { label: "Strip & dispose", svg: <><path {...P} d="M3 20.5h18" strokeDasharray="1.5 1.8" /><path {...P} d="M3.5 17.5l12-5.5 2 1.5-12 5.5z" /><path {...P} d="M17.5 3.5v6.5M15 6l2.5-2.5L20 6" /></> },
  // Asbestos: warning triangle with an exclamation mark.
  asbestos: { label: "Asbestos removal", svg: <><path {...P} d="M12 3.5L21.5 20h-19z" /><path {...P} d="M12 9.5v5" /><circle cx="12" cy="17.2" r="1" fill="currentColor" /></> },
  // Paint roller (roof coating): roller sleeve, frame and handle.
  roller: { label: "Roof coating", svg: <><rect {...P} x="3" y="3.5" width="14" height="5" rx="1.5" /><path {...P} d="M17 6h3v5.5h-8V14" /><path {...P} d="M11 14h2v7h-2z" /><path {...P} d="M6 3.5v5M9 3.5v5" opacity=".45" /></> },
  // Pressure cleaner wand: grip, trigger, lance and a spray fan.
  cleaner: { label: "High-pressure clean", svg: <><path {...P} d="M3 19.5l3.5-3.5 2 2-3.5 3.5z" /><path {...P} d="M7.5 17l9.5-9.5" /><path {...P} d="M8.5 15.5l-1.2-2.5" /><path {...P} d="M17 7.5l1.2-1.2" /><path {...P} d="M19.5 2.5v2M21.5 4.5h-2M21 2.8l-1.4 1.4" opacity=".6" /></> },
  // Pointing trowel (rebed & repoint): pointed blade, shank and handle.
  trowel: { label: "Rebed & repoint", svg: <><path {...P} d="M3.5 20.5l3-9 8.5-1z" /><path {...P} d="M13.3 10.7l2.5-2.5" /><path {...P} d="M15.2 8.8l1.4 1.4 4.4-4.4-1.4-1.4z" /></> },
  // Pail of flexible pointing: bucket with handle and lid.
  mortar: { label: "Flexible pointing", svg: <><path {...P} d="M5 8.5h14l-1.5 12h-11z" /><path {...P} d="M4 8.5h16" /><path {...P} d="M6.5 8.5a5.5 5 0 0 1 11 0" opacity=".55" /><path {...P} d="M8 13h8" opacity=".45" /></> },
  // Replace broken tiles: one tile with a crack and a swap arrow.
  tile_crack: { label: "Replace broken tiles", svg: <><path {...P} d="M4 4.5h10v15H4z" /><path {...P} d="M9 4.5l-1.5 4 2 2.5-1.8 3.5 1.3 5" /><path {...P} d="M17 9h4M19 7l2 2-2 2" /><path {...P} d="M21 15h-4M19 13l-2 2 2 2" /></> },
  // Membrane roof: low-slope deck with parapets and a lapped membrane seam.
  membrane: { label: "Membrane roof", svg: <><path {...P} d="M3 8.5v10h18v-10" /><path {...P} d="M3 13.5h8.5l1.5-1.2h8" /><path {...P} d="M3 16h18" opacity=".45" /><path {...P} d="M12.5 12.3v1.2" /></> },
  // Steep roof allowance: a steep gable with the pitch angle marked.
  steep: { label: "Steep roof allowance", svg: <><path {...P} d="M3 20.5L12 3.5l9 17" /><path {...P} d="M3 20.5h18" /><path {...P} d="M7.3 20.5a4.3 4.3 0 0 0-2.1-4" /><path {...P} d="M12 8.5v12" opacity=".4" strokeDasharray="1.5 1.8" /></> },
  // Anything else on the quote: a parcel.
  item: { label: "Item", svg: <><path {...P} d="M12 2.8l8.5 4.4v9.6L12 21.2l-8.5-4.4V7.2z" /><path {...P} d="M3.5 7.2L12 11.6l8.5-4.4M12 11.6v9.6" /><path {...P} d="M7.8 5l8.5 4.4" opacity=".5" /></> },
};

/** Icon for a calculator key (and the docket's gutter group). */
export const ICON_FOR_KEY: Record<string, string> = {
  metal_sheet: "sheets", labour_install: "labour", ridge_capping: "ridge", barge_capping: "barge", valley_iron: "valley",
  roof_battens: "battens", tile_battens: "tile_battens", roof_screws: "screws", sarking: "sarking", gutter: "gutters", gutters: "gutters",
  downpipe: "downpipe", fascia: "fascia", safety_mesh: "mesh", edge_protection: "edge", whirlybird: "whirly", skip_bin: "skip",
  flashing: "flashing", roof_tile: "tile", ridge_tile: "ridge_tile", labour_strip: "strip", asbestos_removal: "asbestos",
  roof_coating: "roller", restore_clean: "cleaner", rebed_repoint: "trowel", tile_replace: "tile_crack", membrane_roof: "membrane",
  pointing: "mortar", labour_steep: "steep",
};

export const iconFor = (calcKey: string | null | undefined): string => (calcKey && ICON_FOR_KEY[calcKey]) || "item";

export function ItemIcon({ calcKey, size = 20, boxed = true, className, label }: { calcKey: string | null | undefined; size?: number; boxed?: boolean; className?: string; label?: string }) {
  const i = ICONS[iconFor(calcKey)];
  const svg = <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={label ?? i.label}>{i.svg}</svg>;
  return boxed
    ? <span className={`inline-grid shrink-0 place-items-center rounded-xl bg-white text-ink ring-1 ring-slate-300 ${className ?? ""}`} style={{ width: size + 14, height: size + 14 }} data-icon={iconFor(calcKey)}>{svg}</span>
    : <span className={`inline-grid shrink-0 text-ink ${className ?? ""}`} data-icon={iconFor(calcKey)}>{svg}</span>;
}

/** Every icon, large, for checking the drawings. */
export function IconSheet() {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
      {Object.entries(ICONS).map(([k, i]) => (
        <div key={k} className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200" data-testid="icon-tile">
          <svg viewBox="0 0 24 24" width={72} height={72} className="text-ink" role="img" aria-label={i.label}>{i.svg}</svg>
          <p className="text-center text-sm font-semibold text-ink">{i.label}</p>
        </div>
      ))}
    </div>
  );
}
