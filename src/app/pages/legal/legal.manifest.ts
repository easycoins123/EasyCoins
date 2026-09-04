/**
 * The policy pages the router knows about: slug and title only.
 *
 * The routing table is part of the initial bundle, and it used to import the
 * full page texts just to read their slugs. The texts now stay in the lazy
 * legal chunk; `legal.content.ts` takes its slugs and titles from here, so
 * the two cannot drift apart.
 */
export interface LegalPageMeta {
  readonly slug: string;
  readonly title: string;
}

export const LEGAL_MANIFEST = {
  about: { slug: 'about', title: 'אודות' },
  terms: { slug: 'terms', title: 'תנאי שימוש' },
  privacy: { slug: 'privacy', title: 'מדיניות פרטיות' },
  refund: { slug: 'refund-policy', title: 'מדיניות החזרים' },
  accessibility: { slug: 'accessibility', title: 'הצהרת נגישות' },
  business: { slug: 'business-details', title: 'פרטי העסק' },
  delivery: { slug: 'delivery', title: 'אספקה דיגיטלית' },
  ip: { slug: 'ip', title: 'סימני מסחר וזכויות' },
} as const satisfies Record<string, LegalPageMeta>;

/** Every policy route, in the order the routing table registers them. */
export const LEGAL_ROUTES: readonly LegalPageMeta[] = Object.values(LEGAL_MANIFEST);
