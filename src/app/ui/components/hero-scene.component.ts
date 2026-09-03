import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinTier } from '../../domain';
import { CoinArtComponent } from './cards/coin-art.component';
import { EmblemCardComponent } from './emblem-card.component';

/**
 * The hero's object: the trophy under the lights.
 *
 * The stadium behind it is drawn by `tt-stadium`; this is what stands on the
 * centre circle. The EasyCoins card rises behind, the coin faces the visitor
 * in front of two stacks, a pool of green energy sits under it all and the
 * wet pitch carries a faint reflection. The same coin the shelf sells, the
 * same card language the process uses; the hero is where they are largest.
 */
@Component({
  selector: 'tt-hero-scene',
  standalone: true,
  imports: [CommonModule, CoinArtComponent, EmblemCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene" aria-hidden="true">
      <span class="energy"></span>
      <tt-emblem-card class="card tt-float"></tt-emblem-card>
      <div class="stage">
        <tt-coin-art class="object" [tier]="tier" variant="hero"></tt-coin-art>
        <tt-coin-art class="mirror" [tier]="tier" variant="hero"></tt-coin-art>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .scene {
      position: relative;
      isolation: isolate;
      display: grid;
      place-items: center;
      inline-size: 100%;
      aspect-ratio: 5 / 5.4;
      overflow: visible;
    }

    /* The one green on the site: gaming energy behind the trophy. */
    .energy {
      position: absolute;
      inset-inline: 4%;
      inset-block: 8% 18%;
      border-radius: 50%;
      background:
        radial-gradient(ellipse at 62% 38%, var(--tt-energy-glow), transparent 60%),
        radial-gradient(ellipse at 42% 72%, rgba(212, 180, 106, 0.18), transparent 62%);
      filter: blur(18px);
      z-index: -1;
    }

    /* The float runs only while the hero is on screen (the parent sets is-live). */
    :host(:not(.is-live)) .card { animation-play-state: paused; }

    .card {
      position: absolute;
      inset-inline-end: 4%;
      inset-block-start: 0;
      inline-size: 42%;
      z-index: 0;
      filter: drop-shadow(0 26px 34px rgba(0, 0, 0, 0.6));
    }

    .stage { position: relative; z-index: 1; inline-size: 100%; display: flex; flex-direction: column; align-items: center; margin-block-start: 22%; }
    .object { inline-size: 100%; filter: drop-shadow(0 30px 40px rgba(0, 0, 0, 0.6)); }

    .mirror {
      inline-size: 100%;
      margin-block-start: -34%;
      transform: scaleY(-1);
      opacity: 0.14;
      filter: blur(2.5px);
      -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent 34%);
      mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent 34%);
      pointer-events: none;
    }

    @media (max-width: 900px) {
      .scene { aspect-ratio: 16 / 12; }
      .card { inline-size: 34%; inset-inline-end: 8%; inset-block-start: 0; }
      .stage { margin-block-start: 14%; }
      .object { inline-size: 84%; }
      .mirror { inline-size: 84%; margin-block-start: -30%; opacity: 0.12; }
    }
    /* On a phone the scene is exactly as tall as its objects: no reflection
       and no reserved aspect, so the headline follows the trophy directly. */
    @media (max-width: 760px) {
      .scene { aspect-ratio: auto; }
      .stage { margin-block-start: 16%; }
      .mirror { display: none; }
    }
  `],
})
export class HeroSceneComponent {
  /** The tier whose coins the scene stages. */
  @Input() tier: CoinTier = 'legend';
}
