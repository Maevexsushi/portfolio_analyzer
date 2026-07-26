import type { DisciplineKey } from "./types";

/**
 * Discipline labels, in one client-safe module.
 *
 * The profiles carry compiled RegExp objects, which cannot cross the server/client
 * boundary in a payload. The picker on the upload form only needs the names, so they
 * live here and the heavy data stays on the server.
 */
export const DISCIPLINE_LABELS: Record<DisciplineKey, string> = {
  software: "Software & engineering",
  design: "Design & UX",
  data: "Data & analytics",
  product: "Product & project management",
  marketing: "Marketing & growth",
  writing: "Writing & content",
  media: "Photography, film & visual media",
  business: "Business, finance & operations",
  education: "Education & research",
  care: "Healthcare & social care",
  trades: "Skilled trades & technical services",
  general: "Something else",
};
