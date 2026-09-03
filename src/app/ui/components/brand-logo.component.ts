import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BRAND } from '../../core/brand';

/**
 * The EASYCOINS lockup: mark plus wordmark.
 *
 * The name is read from the brand configuration rather than typed into the
 * template, so renaming the company does not mean editing the header.
 *
 * The wordmark is set in the display face, condensed and upright, the way a
 * club crest sets its name. "EASY" carries the promise in the heavier weight;
 * "COINS" is the category and steps back a shade. The mark keeps its lean.
 */
@Component({
  selector: 'tt-brand-logo',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lockup" [class.compact]="compact">
      <svg class="mark" [attr.width]="markSize" [attr.height]="markSize"
           viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stop-color="var(--tt-gold-300)"/>
            <stop offset="0.5" stop-color="var(--tt-gold-500)"/>
            <stop offset="1" stop-color="var(--tt-gold-600)"/>
          </linearGradient>
        </defs>
        <g transform="translate(5,0) skewX(-8)" [attr.fill]="'url(#' + gradientId + ')'">
          <rect x="14" y="12" width="10" height="40" rx="3"/>
          <rect x="14" y="12" width="34" height="10" rx="5"/>
          <rect x="14" y="27" width="26" height="10" rx="5"/>
          <rect x="14" y="42" width="34" height="10" rx="5"/>
          <rect x="3" y="12" width="7" height="10" rx="5" opacity="0.45"/>
        </g>
      </svg>

      <span class="word" *ngIf="!compact">
        <span class="word__lead">{{ leadPart }}</span><span class="word__tail">{{ tailPart }}</span>
      </span>
    </span>
  `,
  styles: [`
    .lockup {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      color: var(--tt-text);
    }
    .mark { flex: none; display: block; }
    .word {
      font-family: var(--tt-font-display);
      font-size: 1.3rem;
      line-height: 1;
      letter-spacing: -0.02em;
      white-space: nowrap;
      direction: ltr;
      unicode-bidi: isolate;
    }
    .word__lead { font-weight: var(--tt-weight-display); }
    .word__tail { font-weight: var(--tt-weight-display); color: var(--tt-gold-400); }
  `],
})
export class BrandLogoComponent {
  /** Mark only, for tight spaces such as a mobile header or a drawer. */
  @Input() compact = false;
  @Input() markSize = 30;

  readonly leadPart = BRAND.nameParts[0];
  readonly tailPart = BRAND.nameParts[1];

  /** Unique per instance so two lockups on one page cannot share a gradient id. */
  readonly gradientId = `ec-mark-${Math.random().toString(36).slice(2, 9)}`;
}
