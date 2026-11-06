// Crew work-order strings (English / Spanish). Spanish uses common US roofing-crew terms
// (teja/shingle, techo, tablero/decking, contenedor/dumpster) and the informal imperative.
export type Lang = "en" | "es";

const en = {
  upcoming: "Upcoming jobs",
  noJobs: "No jobs scheduled for this crew right now.",
  tentative: "Tentative",
  locked: "Confirmed",
  start: "Start",
  end: "End",
  address: "Address",
  openMap: "Open in Maps",
  homeowner: "Homeowner",
  call: "Call",
  roof: "Roof",
  squares: "squares",
  pitch: "pitch",
  layers: "layers to tear off",
  materials: "Materials",
  qty: "Qty",
  item: "Item",
  noMaterials: "No material list yet — ask the office.",
  color: "Shingle color",
  delivery: "Delivery",
  roof_load: "Roof load",
  ground_drop: "Ground drop",
  deliveryNotes: "Delivery notes",
  gateCode: "Gate code",
  hazards: "Site hazards",
  permit: "Permit #",
  dumpster: "Dumpster",
  photos: "Photos",
  noPhotos: "No photos shared yet.",
  problem: "Problem / missing material",
  problemHelp: "Tell the office what's wrong. They get it right away.",
  kind: "What happened?",
  missing_material: "Missing material",
  wrong_material: "Wrong material or color",
  damage_found: "Damage found (decking, etc.)",
  safety: "Safety issue",
  homeowner_issue: "Homeowner issue",
  other: "Other",
  message: "Details",
  yourName: "Your name",
  photo: "Photo (optional)",
  send: "Send to office",
  sent: "Sent. The office has been notified.",
  back: "← All jobs",
  safetyReminder: "Fall protection required. Check for power lines before loading the roof.",
  workOrder: "Work order",
  officePhone: "Office",
  status_delivered: "Delivered",
  status_ordered: "Ordered",
  status_not_ordered: "Not ordered",
  orderedFrom: "From",
  deliveryDate: "Delivery date",
};
export type CrewStrings = typeof en;

const es: CrewStrings = {
  upcoming: "Próximos trabajos",
  noJobs: "No hay trabajos programados para esta cuadrilla por ahora.",
  tentative: "Tentativo",
  locked: "Confirmado",
  start: "Inicio",
  end: "Fin",
  address: "Dirección",
  openMap: "Abrir en Mapas",
  homeowner: "Dueño de la casa",
  call: "Llamar",
  roof: "Techo",
  squares: "cuadros",
  pitch: "inclinación",
  layers: "capas para quitar",
  materials: "Materiales",
  qty: "Cant.",
  item: "Material",
  noMaterials: "Todavía no hay lista de materiales — pregunta a la oficina.",
  color: "Color de teja",
  delivery: "Entrega",
  roof_load: "Carga en el techo",
  ground_drop: "Descarga en el suelo",
  deliveryNotes: "Notas de entrega",
  gateCode: "Código del portón",
  hazards: "Peligros en el sitio",
  permit: "Permiso #",
  dumpster: "Contenedor de basura",
  photos: "Fotos",
  noPhotos: "Todavía no hay fotos compartidas.",
  problem: "Problema / falta material",
  problemHelp: "Dile a la oficina qué pasa. Les llega de inmediato.",
  kind: "¿Qué pasó?",
  missing_material: "Falta material",
  wrong_material: "Material o color equivocado",
  damage_found: "Daño encontrado (tablero/madera, etc.)",
  safety: "Problema de seguridad",
  homeowner_issue: "Problema con el dueño",
  other: "Otro",
  message: "Detalles",
  yourName: "Tu nombre",
  photo: "Foto (opcional)",
  send: "Enviar a la oficina",
  sent: "Enviado. La oficina ya fue avisada.",
  back: "← Todos los trabajos",
  safetyReminder: "Protección contra caídas obligatoria. Revisa los cables eléctricos antes de subir material al techo.",
  workOrder: "Orden de trabajo",
  officePhone: "Oficina",
  status_delivered: "Entregado",
  status_ordered: "Pedido",
  status_not_ordered: "No pedido",
  orderedFrom: "De",
  deliveryDate: "Fecha de entrega",
};

export const CREW_STRINGS: Record<Lang, CrewStrings> = { en, es };
export const crewStrings = (lang: string | null | undefined): CrewStrings => CREW_STRINGS[lang === "es" ? "es" : "en"];

/** Common material descriptions → Spanish, for the work order (falls back to the original text). */
const MATERIAL_ES: [RegExp, string][] = [
  [/tear-?off/i, "Quitar techo viejo (por capa)"],
  [/installation labor/i, "Mano de obra de instalación"],
  [/very steep|10\/12/i, "Cargo por techo muy inclinado (10/12+)"],
  [/steep/i, "Cargo por techo inclinado (8/12–9/12)"],
  [/class 4|impact/i, "Tejas resistentes a impacto (Clase 4)"],
  [/designer shingles/i, "Tejas de diseño"],
  [/shingles/i, "Tejas arquitectónicas"],
  [/underlayment/i, "Membrana sintética (rollo de 10 cuadros)"],
  [/ice (&|and) water/i, "Membrana de hielo y agua (rollo de 2 cuadros)"],
  [/starter/i, "Teja de arranque"],
  [/hip (&|and) ridge|ridge cap/i, "Caballete (hip & ridge)"],
  [/drip edge/i, "Gotero / drip edge (10 pies)"],
  [/ridge vent/i, "Ventilación de cumbrera (4 pies)"],
  [/nails/i, "Clavos de rollo para techo"],
  [/pipe boot/i, "Bota para tubo (pipe boot)"],
  [/decking|plywood|osb/i, "Tablero / madera (hoja 4x8)"],
  [/low-?slope|membrane/i, "Membrana para techo de baja pendiente"],
  [/dumpster/i, "Contenedor de basura"],
  [/permit/i, "Permiso"],
];
export function materialLabel(desc: string, lang: Lang) {
  if (lang !== "es") return desc;
  for (const [re, es] of MATERIAL_ES) if (re.test(desc)) return es;
  return desc;
}

const UNIT_ES: Record<string, string> = { bundle: "paquete", roll: "rollo", piece: "pieza", box: "caja", sq: "cuadro", ea: "c/u", sheet: "hoja", lf: "pie lineal" };
export const unitLabel = (u: string, lang: Lang) => (lang === "es" ? UNIT_ES[u.toLowerCase()] ?? u : u);

export type WorkOrderMaterial = { description: string; quantity: number; unit: string };

/** Materials for the crew: the (non-cancelled) material orders if any, else the estimate's material lines. No prices. */
export function workOrderMaterials(
  orders: { status: string; items: WorkOrderMaterial[] }[],
  estimateItems: (WorkOrderMaterial & { category: string })[],
): { source: "order" | "estimate" | "none"; items: WorkOrderMaterial[] } {
  const fromOrders = orders.filter((o) => o.status !== "cancelled").flatMap((o) => o.items);
  if (fromOrders.length) return { source: "order", items: fromOrders.map(({ description, quantity, unit }) => ({ description, quantity: Number(quantity), unit })) };
  const est = estimateItems.filter((i) => i.category === "material" && Number(i.quantity) > 0);
  if (est.length) return { source: "estimate", items: est.map(({ description, quantity, unit }) => ({ description, quantity: Number(quantity), unit })) };
  return { source: "none", items: [] };
}
