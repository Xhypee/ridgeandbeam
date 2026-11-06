import type { Shape } from "@/lib/field-queue";

export type ServerFile = {
  id: string;
  client_id: string | null;
  kind: "photo" | "voice" | "document" | "signature";
  url: string | null;
  original_url: string | null;
  caption: string | null;
  category: string;
  slope: string | null;
  hits: number | null;
  shared: boolean;
  taken_at: string | null;
  created_at: string;
  shapes: Shape[] | null;
};

export type ServerEvent = {
  id: string;
  client_id: string | null;
  kind: string;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
  notified: boolean;
  visible: boolean;
  photo_url: string | null;
};
