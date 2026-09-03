import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinTier } from '../../domain';
import { CoinArtComponent } from './cards/coin-art.component';
import { SquadComponent } from './world/squad.component';

/**
 * The hero's object: the trophy under the lights.
 *
 * The stadium behind it is drawn by `tt-stadium`; this is what stands on the
 * centre circle. The Legend stack on a pool of light, its reflection in the
 * wet pitch, and two of the squad far behind it, backlit, small enough to be
 * atmosphere rather than subject. Nothing here is a photograph; the object
 * is the same raster the shelf uses and the figures are the same silhouettes
 * the journey uses, so the whole site keeps one cast and one trophy.
 */
@Component({
  selector: 'tt-hero-scene',
  standalone: true,
  imports: [CommonModule, CoinArtComponent, SquadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene" aria-hidden="true">
      <span class="haze"></span>

      <tt-squad class="player player--a" pose="celebrate"></tt-squad>
      <tt-squad class="player player--b" pose="walk"></tt-squad>

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
      aspect-ratio: 5 / 6;
      overflow: visible;
    }

    .haze {
      position: absolute;
      inset-block-start: 8%;
      inline-size: 96%;
      block-size: 80%;
      border-radius: 50%;
      background: radial-gradient(ellipse at 50% 55%, rgba(230, 203, 134, 0.18), rgba(212, 180, 106, 0.05) 45%, transparent 70%);
      filter: blur(20px);
      z-index: -1;
    }

    /* Two of the squad, far behind the trophy: backlit, small, out of the
       spotlight. They are atmosphere here; the story gives them the stage. */
    .player { position: absolute; inline-size: 13%; opacity: 1; --squad-body: #0B0D12; --squad-body-light: #1B2029; }
    .player--a { inset-inline-start: 4%; inset-block-end: 33%; }
    .player--b { inset-inline-end: 5%; inset-block-end: 35%; inline-size: 11%; opacity: 0.85; }

    .stage { position: relative; inline-size: 100%; display: flex; flex-direction: column; align-items: center; }
    .object { inline-size: 92%; filter: drop-shadow(0 30px 40px rgba(0, 0, 0, 0.6)); }

    .mirror {
      inline-size: 92%;
      margin-block-start: -30%;
      transform: scaleY(-1);
      opacity: 0.16;
      filter: blur(2.5px);
      -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent 34%);
      mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent 34%);
      pointer-events: none;
    }

    @media (max-width: 900px) {
      .scene { aspect-ratio: 16 / 11; }
      .object { inline-size: 66%; }
      .mirror { inline-size: 66%; margin-block-start: -22%; opacity: 0.14; }
      .haze { inline-size: 62%; block-size: 92%; inset-block-start: 2%; }
      .player { inline-size: 11%; inset-block-end: 28%; }
      .player--a { inset-inline-start: 12%; }
      .player--b { inset-inline-end: 14%; inline-size: 8%; }
    }
  `],
})
export class HeroSceneComponent {
  /** The tier whose coins the scene stages. */
  @Input() tier: CoinTier = 'legend';
}
