import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ParallaxDirective } from '../../parallax.directive';
import { WORLD_ART } from './world-assets';

export type StadiumScene = 'hero' | 'band' | 'stage' | 'close';

/**
 * The world: a stadium after dark.
 *
 * Placed behind a section, it gives the page somewhere to be: a night sky
 * with two washes of light, the crowd out of focus far behind, floodlight
 * shafts cutting down from the corners, pitch geometry on the ground in
 * perspective, and a pool of light where the object stands. Each layer sits
 * at its own depth, so the scene opens up as the visitor scrolls.
 *
 * Nothing here is expensive at runtime: gradients, one small raster, one SVG
 * of lines, and transforms. The parent must be `position: relative` with
 * `isolation: isolate`; the scene fills it and stays behind the content.
 */
@Component({
  selector: 'tt-stadium',
  standalone: true,
  imports: [CommonModule, ParallaxDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stadium" [class]="'stadium stadium--' + scene" aria-hidden="true">
      <span class="sky"></span>

      <picture class="crowd" [ttParallax]="0.05">
        <source [srcset]="art.avif" type="image/avif" />
        <source [srcset]="art.webp" type="image/webp" />
        <img [src]="art.webp" [width]="art.width" [height]="art.height" alt=""
             [attr.loading]="scene === 'hero' ? 'eager' : 'lazy'" decoding="async" />
      </picture>

      <span class="shaft shaft--a" [class.seq]="animated" [class.seq--lights]="animated" [ttParallax]="0.1"></span>
      <span class="shaft shaft--b" [class.seq]="animated" [class.seq--lights]="animated" [ttParallax]="0.1" style="--seq-delay: 120ms"></span>
      <span class="shaft shaft--c" [class.seq]="animated" [class.seq--lights]="animated" [ttParallax]="0.08" style="--seq-delay: 60ms"></span>

      <svg class="pitch" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" [ttParallax]="0.16">
        <g fill="none" stroke="var(--tt-pitch)" stroke-width="1.6">
          <!-- touchline and halfway line, in perspective -->
          <path d="M-80 402 H1280"/>
          <path d="M600 402 V214"/>
          <!-- centre circle -->
          <ellipse cx="600" cy="402" rx="190" ry="54"/>
          <circle cx="600" cy="402" r="4" fill="var(--tt-pitch)" stroke="none"/>
          <!-- the far penalty area, converging -->
          <path d="M300 214 H900 M300 214 L240 402 M900 214 L960 402"/>
          <path d="M470 214 L600 262 L730 214" opacity="0.7"/>
        </g>
      </svg>

      <span class="floor"></span>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .stadium { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: var(--tt-night); }

    .sky {
      position: absolute; inset: 0;
      background:
        radial-gradient(70% 55% at 50% 0%, rgba(46, 95, 240, 0.16), transparent 70%),
        radial-gradient(40% 40% at 18% 30%, var(--tt-flood-warm), transparent 70%),
        radial-gradient(40% 40% at 84% 34%, var(--tt-flood-soft), transparent 70%),
        linear-gradient(180deg, var(--tt-night) 0%, var(--tt-night-2) 60%, var(--tt-bg) 100%);
    }

    .crowd { position: absolute; inset-inline: -6%; inset-block-start: -2%; block-size: 62%; opacity: 0.55; mix-blend-mode: screen; will-change: transform; }
    .crowd img { inline-size: 100%; block-size: 100%; object-fit: cover; display: block;
      -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 100%); mask-image: linear-gradient(180deg, #000 30%, transparent 100%); }

    .shaft {
      position: absolute; inset-block-start: -12%; block-size: 120%; inline-size: 22%;
      background: linear-gradient(180deg, var(--tt-flood-soft), rgba(214, 226, 255, 0.025) 50%, transparent 82%);
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 45%, transparent); mask-image: linear-gradient(90deg, transparent, #000 45%, transparent);
      transform-origin: top; will-change: transform;
    }
    .shaft--a { inset-inline-start: 6%; transform: skewX(-14deg); }
    .shaft--b { inset-inline-end: 4%; inline-size: 26%; transform: skewX(14deg); opacity: 0.8; }
    .shaft--c { inset-inline-start: 44%; inline-size: 12%; opacity: 0.5; transform: skewX(-4deg); }

    .pitch { position: absolute; inset-inline: 0; inset-block-end: -2%; inline-size: 100%; block-size: 46%; opacity: 0.9; will-change: transform; }
    .floor {
      position: absolute; inset-inline: 10%; inset-block-end: 4%; block-size: 34%;
      background: radial-gradient(60% 60% at 50% 100%, var(--tt-pitch-glow), transparent 70%);
    }

    /* Scenes: how much of the world each section shows. */
    .stadium--band .crowd { opacity: 0.32; block-size: 50%; }
    .stadium--band .shaft { opacity: 0.55; }
    .stadium--band .pitch { block-size: 40%; opacity: 0.7; }
    .stadium--stage .crowd { display: none; }
    .stadium--stage .sky { background:
        radial-gradient(70% 60% at 50% 20%, rgba(46, 95, 240, 0.12), transparent 70%),
        linear-gradient(180deg, var(--tt-night-2), var(--tt-bg-elevated)); }
    .stadium--stage .shaft--c { display: none; }
    .stadium--stage .pitch { block-size: 54%; opacity: 0.8; }
    .stadium--close .crowd { opacity: 0.4; }
    .stadium--close .pitch { opacity: 0.6; }

    @media (max-width: 760px) {
      .shaft--c { display: none; }
      .shaft { inline-size: 34%; }
      .crowd { block-size: 52%; }
    }
    @media (prefers-reduced-motion: reduce) { .crowd, .shaft, .pitch { transform: none !important; } }
  `],
})
export class StadiumComponent {
  @Input() scene: StadiumScene = 'hero';
  /** Plays the lights-up entrance. Only the first scene on a page should. */
  @Input() animated = false;

  readonly art = WORLD_ART.bokeh;
}
