import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The EASYCOINS icon set.
 *
 * Rebuilt away from uniform thin outlines. Every icon used to be the same
 * 1.75px stroke on the same rounded geometry, which is the house style of every
 * icon package and read as a placeholder next to the product artwork.
 *
 * These are built the way the rest of the brand is: a solid body carrying the
 * silhouette, with stroked detail on top only where detail is needed. A filled
 * shape survives being drawn at sixteen pixels; a hairline outline turns to
 * mush. Corners are mitred rather than rounded, matching the angular cut of the
 * mark, and the octagon that the coins and the pack are built from shows up
 * here too, so a coin in a menu row is the same object as a coin in the hero.
 *
 * The set is drawn on a 24 grid and is used at 16, 20, 24 and 32. Stroked
 * detail thickens slightly at the smallest size so it does not thin out.
 *
 * Colour still comes from `currentColor`, so an icon always matches the text
 * beside it and the palette stays in one place.
 *
 * Icons are decorative by default and hidden from assistive technology; the
 * control around them carries the label.
 */
export type IconName =
  | 'cart'
  | 'user'
  | 'search'
  | 'menu'
  | 'close'
  | 'chevron'
  | 'check'
  | 'shield'
  | 'bolt'
  | 'clock'
  | 'globe'
  | 'tag'
  | 'gamepad'
  | 'arrow'
  | 'box'
  | 'alert'
  | 'info'
  | 'flask'
  | 'truck'
  | 'headset'
  | 'card'
  | 'lock'
  | 'copy'
  | 'logout'
  | 'edit'
  | 'refresh'
  | 'filter'
  | 'coins'
  | 'crown'
  // The names the storefront vocabulary uses. Some are their own drawing, some
  // resolve to an existing one, so a template can say what it means.
  | 'coin'
  | 'football'
  | 'platform'
  | 'controller'
  | 'delivery'
  | 'support'
  | 'lightning'
  | 'home'
  | 'market'
  | 'package'
  | 'star'
  | 'payment'
  | 'tracking'
  | 'mark';

interface IconArt {
  /** The silhouette. Drawn filled, and it is what reads at small sizes. */
  readonly fill?: string;
  /** Detail drawn over the body, stroked in the surrounding colour. */
  readonly stroke?: string;
  /** Detail knocked out of the body, for counters inside a solid shape. */
  readonly knockout?: string;
}

/**
 * An octagon in three-quarter view on the 24 grid.
 *
 * The same construction as the coin artwork, so currency reads as one object
 * across the whole product rather than as an icon that happens to be round.
 */
function coin(cx: number, cy: number, r: number, squash = 0.62): string {
  const points: string[] = [];

  for (let index = 0; index < 8; index += 1) {
    const angle = ((index * 45 + 22.5) * Math.PI) / 180;
    points.push(
      `${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r * squash).toFixed(2)}`,
    );
  }

  return `M${points.join('L')}Z`;
}

/**
 * The brand E, as one outline on the 24 grid.
 *
 * Leaning on the mark's eight degrees and centred, so it can be knocked out of
 * a coin face. One outline rather than four bars: overlapping subpaths under
 * the even-odd rule would punch holes back into the letter.
 */
const BRAND_E = 'M9.16 8L15.96 8L15.68 10L10.88 10L10.74 11L13.94 11L13.66 13L10.46 13'
  + 'L10.32 14L15.12 14L14.84 16L8.04 16Z';

const ART: Record<string, IconArt> = {
  // --- Commerce ------------------------------------------------------------
  cart: {
    fill: 'M2.4 3h2.6a1 1 0 0 1 .98.8L6.3 6H20.4a1 1 0 0 1 .97 1.25l-1.6 6.2A2 2 0 0 1 17.83 15H8.6a2 2 0 0 1-1.96-1.6L4.6 5H2.4Z',
    stroke: 'M9.6 19.4h.01M17 19.4h.01',
  },
  coins: { fill: `${coin(9, 13.5, 6.4)}${coin(15.5, 9.5, 5.6)}` },
  /* The currency, front on: a thick rim with a football struck into the face,
     the pentagon panel and its five seams. It says "football game coin" to
     the audience at a glance, and it is our own drawing: no publisher's coin
     is traced or borrowed. */
  coin: {
    fill: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z',
    knockout: 'M12 4.8a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4ZM12 9.2L14.66 11.13L13.65 14.27L10.35 14.27L9.34 11.13Z',
    stroke: 'M12 9.2V5.6M14.66 11.13 18.1 10M13.65 14.27 15.8 17.2M10.35 14.27 8.2 17.2M9.34 11.13 5.9 10',
  },
  /* The brand E struck into an octagon, kept for places that mean "EASYCOINS"
     rather than "coins": the account menu, the drawer. */
  mark: {
    fill: `${coin(12, 12, 10, 1)}`,
    knockout: BRAND_E,
  },
  tag: {
    fill: 'M3 3h7.6a2 2 0 0 1 1.42.6l8.4 8.4a2 2 0 0 1 0 2.82l-6.6 6.6a2 2 0 0 1-2.82 0L3.6 13A2 2 0 0 1 3 11.6Z',
    knockout: 'M7.4 8.6m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
  },
  card: {
    fill: 'M2 6.6A2.6 2.6 0 0 1 4.6 4h14.8A2.6 2.6 0 0 1 22 6.6v10.8a2.6 2.6 0 0 1-2.6 2.6H4.6A2.6 2.6 0 0 1 2 17.4Z',
    knockout: 'M2 9h20v2.6H2ZM5 14.6h4.4v1.8H5Z',
  },
  box: {
    fill: 'M12 1.9 21.4 7v10L12 22.1 2.6 17V7Z',
    knockout: 'M12 11.1 4.2 6.8 2.6 7.7 12 13.1l9.4-5.4-1.6-.9Z',
    stroke: 'M12 13.1V22',
  },
  crown: { fill: 'M2.6 7.4 7 11l5-7.4L17 11l4.4-3.6-1.7 11.2H4.3Z' },

  // --- Trust ---------------------------------------------------------------
  shield: {
    fill: 'M12 1.8 21 5.4v6.2c0 4.9-3.6 8.9-9 10.6-5.4-1.7-9-5.7-9-10.6V5.4Z',
    knockout: 'M8.1 11.7 6.8 13l3.6 3.6 6.8-6.8-1.3-1.3-5.5 5.5Z',
  },
  lock: {
    fill: 'M4 10.2h16V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z',
    stroke: 'M7.4 10.2V7a4.6 4.6 0 0 1 9.2 0v3.2',
    knockout: 'M11 14.2h2v4h-2Z',
  },
  check: { stroke: 'M4 12.6 9.4 18 20 6.6' },

  // --- Service -------------------------------------------------------------
  headset: {
    fill: 'M3 13.4h2.6a1.2 1.2 0 0 1 1.2 1.2v4.2a1.2 1.2 0 0 1-1.2 1.2H3Zm15.4 0H21v6.6h-2.6a1.2 1.2 0 0 1-1.2-1.2v-4.2a1.2 1.2 0 0 1 1.2-1.2Z',
    stroke: 'M3 13.4v-1.2a9 9 0 0 1 18 0v1.2M19 20v.6a2.4 2.4 0 0 1-2.4 2.4H13',
  },
  truck: {
    fill: 'M2 6.6a1 1 0 0 1 1-1h9.6a1 1 0 0 1 1 1v9.8H2Zm12.6 3.2h3.1a1 1 0 0 1 .82.43l2.3 3.3a1 1 0 0 1 .18.57v2.3h-6.4Z',
    stroke: 'M6.6 19.6h.01M17.4 19.6h.01',
  },
  bolt: { fill: 'M13.6 1.8 4.4 14.2h5.8l-1.8 8 9.2-12.4h-5.8Z' },
  clock: {
    fill: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z',
    knockout: 'M11 6.4h2v6.2l4 2.4-1 1.7-5-3Z',
  },

  // --- Game ----------------------------------------------------------------
  gamepad: {
    fill: 'M8.4 5.6h7.2a5.6 5.6 0 0 1 5.5 6.6l-.6 3.4a3 3 0 0 1-5.5 1.1l-.7-1h-4.6l-.7 1a3 3 0 0 1-5.5-1.1l-.6-3.4a5.6 5.6 0 0 1 5.5-6.6Z',
    knockout: 'M6.4 10.2h1.6V8.6h1.6v1.6h1.6v1.6H9.6v1.6H8V11.8H6.4Zm9 0h1.6v1.6h-1.6Zm2.2-1.6h1.6v1.6h-1.6Z',
  },
  /* A ball drawn as geometry: the panel at the centre is solid, the seams run
     from its corners to the rim. Nothing cartoonish, and it holds at 16px. */
  football: {
    fill: 'M12 8.2L15.23 10.55L14 14.35L10 14.35L8.77 10.55Z',
    stroke: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19ZM12 8.2V3.7M15.23 10.55 19.9 9M14 14.35 16.9 18.3M10 14.35 7.1 18.3M8.77 10.55 4.1 9',
  },
  /* A screen on a foot. The shape every platform shares. */
  platform: {
    fill: 'M3.4 3.6h17.2A1.8 1.8 0 0 1 22.4 5.4v9.8a1.8 1.8 0 0 1-1.8 1.8H3.4a1.8 1.8 0 0 1-1.8-1.8V5.4a1.8 1.8 0 0 1 1.8-1.8Z',
    knockout: 'M3.8 5.8h16.4v9H3.8Z',
    stroke: 'M12 17v3.2M7.8 20.6h8.4',
  },
  home: {
    fill: 'M12 2.6 21.6 10.4V21a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V10.4Z',
    knockout: 'M9.6 13.4h4.8V22H9.6Z',
  },

  // --- Navigation ----------------------------------------------------------
  menu: { stroke: 'M3.4 6.6h17.2M3.4 12h17.2M3.4 17.4h17.2' },
  close: { stroke: 'M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4' },
  chevron: { stroke: 'M9 5.4 15.6 12 9 18.6' },
  arrow: { stroke: 'M3.6 12h16M13.4 5.6 19.8 12l-6.4 6.4' },
  search: {
    stroke: 'M10.6 3.4a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4ZM16 16l4.6 4.6',
  },
  user: {
    fill: 'M12 3.4a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6ZM12 13.6c4.4 0 8 2.8 8 6.2v.8H4v-.8c0-3.4 3.6-6.2 8-6.2Z',
  },
  filter: { fill: 'M2.6 4.4h18.8l-7.4 8.6v6l-4 2.2V13Z' },
  logout: {
    fill: 'M13.6 3H19a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5.4v-2H19V5h-5.4Z',
    stroke: 'M9.6 8 5.6 12l4 4M6 12h7',
  },

  // --- Status and meta -----------------------------------------------------
  alert: {
    fill: 'M10.28 3.3 2.4 16.8A2 2 0 0 0 4.12 19.8h15.76a2 2 0 0 0 1.72-3L13.72 3.3a2 2 0 0 0-3.44 0Z',
    knockout: 'M11 8.4h2v5h-2Zm0 6.6h2v2h-2Z',
  },
  info: {
    fill: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z',
    knockout: 'M11 10.6h2v7h-2Zm0-4.4h2v2.2h-2Z',
  },
  globe: {
    fill: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z',
    knockout: 'M2.6 11h18.8v2H2.6Z',
    stroke: 'M12 2.4c2.6 2.6 3.9 6 3.9 9.6s-1.3 7-3.9 9.6c-2.6-2.6-3.9-6-3.9-9.6S9.4 5 12 2.4Z',
  },
  flask: { fill: 'M9 2.6h6v1.8h-1v5.2l5.4 8.6a2 2 0 0 1-1.7 3H6.3a2 2 0 0 1-1.7-3L10 9.6V4.4H9Z' },
  copy: {
    fill: 'M9 6.6h10.4a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8.6a2 2 0 0 1 2-2Z',
    stroke: 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  },
  edit: {
    fill: 'M3.4 20.6h4L19.1 8.9a2.2 2.2 0 0 0-3.1-3.1L4.4 17.5Z',
    stroke: 'M14.6 6.4l3.1 3.1',
  },
  refresh: { stroke: 'M20 12a8 8 0 1 1-2.4-5.7M20.4 4v4.4H16' },
  /* The market: two transfers crossing. */
  market: { stroke: 'M3.6 8.2h13.2M13.4 4.8l3.4 3.4-3.4 3.4M20.4 15.8H7.2M10.6 12.4l-3.4 3.4 3.4 3.4' },
  /* A package: a box with the band the coins ship in. */
  package: { stroke: 'M3.6 8.2 12 4l8.4 4.2v8.6L12 21l-8.4-4.2ZM3.6 8.2 12 12.4l8.4-4.2M12 12.4V21M7.8 6.1l8.4 4.2' },
  /* A rating star. */
  star: { fill: 'M12 2.4l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.2l-6 3.3 1.3-6.6L2.4 9.3l6.7-.8Z' },
};

/** Vocabulary names that share a drawing with an existing icon. */
const ALIASES: Readonly<Partial<Record<IconName, IconName>>> = {
  controller: 'gamepad',
  delivery: 'truck',
  support: 'headset',
  lightning: 'bolt',
  payment: 'card',
  tracking: 'truck',
};

@Component({
  selector: 'tt-icon',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label">
      <!-- Body and its counters as one path, so the knockout is a real hole
           rather than a shape painted in the background colour. That is what
           lets an icon sit on any surface without carrying a patch with it. -->
      <path *ngIf="art.fill"
            [attr.d]="body"
            fill="currentColor"
            fill-rule="evenodd"
            clip-rule="evenodd"></path>
      <path *ngIf="art.stroke"
            [attr.d]="art.stroke"
            fill="none"
            stroke="currentColor"
            [attr.stroke-width]="weight"
            stroke-linecap="round"
            stroke-linejoin="miter"></path>
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; flex: none; }
    /* The arrow leads the eye forward, which in an RTL page means leftward. */
    :host([dir='auto']) svg { transform: scaleX(-1); }
  `],
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size = 20;

  /** Only affects stroked detail; filled bodies carry their own weight. */
  @Input() strokeWidth?: number;

  /** Set only when the icon is the sole meaning; otherwise the control labels it. */
  @Input() label?: string;

  get art(): IconArt {
    return ART[ALIASES[this.name] ?? this.name] ?? {};
  }

  /** Body plus counters, relying on the even-odd rule to cut the holes. */
  get body(): string {
    const art = this.art;
    return art.knockout ? `${art.fill}${art.knockout}` : (art.fill ?? '');
  }

  /**
   * Stroke weight for the size.
   *
   * A two-unit stroke on the 24 grid is 1.3px at sixteen pixels, which is where
   * a menu glyph starts to look frail beside filled ones. Small sizes get a
   * touch more; large ones a touch less, so a 32px icon does not look bold.
   */
  get weight(): number {
    if (this.strokeWidth !== undefined) {
      return this.strokeWidth;
    }
    return this.size <= 16 ? 2.4 : this.size >= 32 ? 1.8 : 2;
  }
}
