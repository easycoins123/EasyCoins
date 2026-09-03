import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SquadPose = 'walk' | 'strike' | 'keeper' | 'celebrate';

interface Figure {
  /** Rotation of the whole figure about a point, for a dive or a lean. */
  readonly rotate?: string;
  readonly arms: readonly [string, string];
  readonly legs: readonly [string, string];
  readonly ball?: { readonly cx: number; readonly cy: number };
}

/**
 * The cast: a faceless squad in the EasyCoins kit.
 *
 * Backlit silhouettes on a floodlit pitch, the way a player looks from the
 * stands at night: a dark figure with a rim of light down one side and the
 * brand's E on the chest. No face, no number, no crest, no name, no likeness
 * of anyone; the poses are the customer's own journey (walk out, strike,
 * keeper's save, celebration) and nothing else identifies them.
 *
 * Built from a head, a torso, shorts and four round-capped limbs, so a pose
 * is four paths. The rim light is the same figure drawn once more in the
 * light colour, shifted a hair up and to the start side, under the dark one.
 * Decorative by contract: always `aria-hidden`, meaning lives in the text
 * beside it.
 */
const FIGURES: Readonly<Record<SquadPose, Figure>> = {
  celebrate: {
    arms: ['M66 50 L50 30 L46 8', 'M94 50 L110 30 L114 8'],
    legs: ['M72 110 L66 150 L64 190', 'M88 110 L94 150 L96 190'],
  },
  walk: {
    arms: ['M66 50 L52 74 L60 96', 'M94 50 L108 68 L118 88'],
    legs: ['M72 110 L60 150 L54 190', 'M88 110 L98 148 L108 186'],
  },
  strike: {
    rotate: 'rotate(-10 80 90)',
    arms: ['M66 50 L42 58 L28 50', 'M94 50 L114 40 L128 44'],
    legs: ['M72 110 L64 150 L60 190', 'M88 110 L106 140 L126 126'],
    ball: { cx: 138, cy: 122 },
  },
  keeper: {
    rotate: 'rotate(-30 80 120)',
    arms: ['M66 50 L88 30 L110 14', 'M94 50 L112 34 L130 20'],
    legs: ['M72 110 L60 150 L48 186', 'M88 110 L82 152 L72 190'],
    ball: { cx: 142, cy: 40 },
  },
};

@Component({
  selector: 'tt-squad',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="figure" [class]="'figure figure--' + pose" viewBox="0 0 160 200" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient [attr.id]="id('rim')" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stop-color="var(--squad-rim, var(--tt-flood))" stop-opacity="0.95"/>
          <stop offset="0.55" stop-color="var(--squad-rim, var(--tt-flood))" stop-opacity="0.15"/>
          <stop offset="1" stop-color="var(--squad-rim, var(--tt-flood))" stop-opacity="0"/>
        </linearGradient>
        <linearGradient [attr.id]="id('kit')" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="var(--squad-body-light, #262B36)"/>
          <stop offset="1" stop-color="var(--squad-body, #0F1218)"/>
        </linearGradient>
      </defs>

      <g [attr.transform]="figure.rotate || null">
        <!-- rim light: the figure again, in light, a hair up and to the side -->
        <g transform="translate(-2.4 -1.8)">
          <ng-container *ngTemplateOutlet="parts; context: { $implicit: 'url(#' + id('rim') + ')' }"></ng-container>
        </g>
        <ng-container *ngTemplateOutlet="parts; context: { $implicit: 'url(#' + id('kit') + ')' }"></ng-container>

        <!-- the E on the chest -->
        <g transform="translate(72 56) scale(0.2)" [attr.fill]="'var(--squad-mark, var(--tt-gold-400))'">
          <g transform="translate(5,0) skewX(-8)">
            <rect x="14" y="12" width="10" height="40" rx="3"/><rect x="14" y="12" width="34" height="10" rx="5"/>
            <rect x="14" y="27" width="26" height="10" rx="5"/><rect x="14" y="42" width="34" height="10" rx="5"/>
          </g>
        </g>
      </g>

      <g *ngIf="figure.ball as ball">
        <circle [attr.cx]="ball.cx" [attr.cy]="ball.cy" r="8.5" fill="#E9E4D8"/>
        <path [attr.transform]="'translate(' + ball.cx + ' ' + ball.cy + ')'" fill="#1A1D24" opacity="0.8"
              d="M0 -4.2 L4 -1.3 L2.5 3.4 L-2.5 3.4 L-4 -1.3 Z"/>
        <circle [attr.cx]="ball.cx" [attr.cy]="ball.cy" r="8.5" fill="none" stroke="var(--squad-rim, var(--tt-flood))" stroke-opacity="0.5" stroke-width="1"/>
      </g>
    </svg>

    <ng-template #parts let-paint>
      <svg:circle cx="80" cy="24" r="11" [attr.fill]="paint"/>
      <svg:path d="M66 46 Q80 40 94 46 L98 80 Q80 86 62 80 Z" [attr.fill]="paint"/>
      <svg:path d="M63 79 Q80 86 97 79 L94 112 L83 112 L80 100 L77 112 L66 112 Z" [attr.fill]="paint"/>
      <svg:path [attr.d]="figure.arms[0]" fill="none" [attr.stroke]="paint" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
      <svg:path [attr.d]="figure.arms[1]" fill="none" [attr.stroke]="paint" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
      <svg:path [attr.d]="figure.legs[0]" fill="none" [attr.stroke]="paint" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
      <svg:path [attr.d]="figure.legs[1]" fill="none" [attr.stroke]="paint" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    </ng-template>
  `,
  styles: [`
    :host { display: block; line-height: 0; }
    .figure { display: block; inline-size: 100%; block-size: auto; overflow: visible; filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.45)); }
  `],
})
export class SquadComponent {
  @Input() pose: SquadPose = 'celebrate';

  private readonly uid = Math.random().toString(36).slice(2, 8);

  get figure(): Figure {
    return FIGURES[this.pose] ?? FIGURES.celebrate;
  }

  id(part: string): string {
    return `ec-squad-${this.uid}-${part}`;
  }
}
