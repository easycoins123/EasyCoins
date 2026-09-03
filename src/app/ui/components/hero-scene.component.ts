import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinPackComponent, PackMaterial } from './coin-pack.component';

/**
 * The hero scene.
 *
 * An object only looks physical when there is somewhere for it to be: light
 * from a direction, a surface underneath, atmosphere between it and the
 * camera. So this is a scene in planes rather than one image: a warm haze, two
 * light shafts cut on the brand's shear, the object, its reflection in the
 * floor, a horizon line, and a few motes in front of everything.
 *
 * All of it is CSS and inline SVG; nothing is downloaded and it recolours with
 * the theme. On a phone the shafts and motes are dropped: atmosphere at 360px
 * is noise over the headline.
 */
@Component({
  selector: 'tt-hero-scene',
  standalone: true,
  imports: [CommonModule, CoinPackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene" aria-hidden="true">
      <span class="haze"></span>
      <span class="shaft shaft--a"></span>
      <span class="shaft shaft--b"></span>

      <div class="stage">
        <tt-coin-pack class="object" [steps]="5" [material]="material"></tt-coin-pack>
        <tt-coin-pack class="mirror" [steps]="5" [material]="material"></tt-coin-pack>
      </div>

      <span class="horizon"></span>

      <span class="mote mote--1"></span>
      <span class="mote mote--2"></span>
      <span class="mote mote--3"></span>
      <span class="mote mote--4"></span>
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
      overflow: hidden;
      -webkit-mask-image: radial-gradient(ellipse 80% 76% at 50% 48%, #000 55%, rgba(0, 0, 0, 0.55) 76%, transparent 96%);
      mask-image: radial-gradient(ellipse 80% 76% at 50% 48%, #000 55%, rgba(0, 0, 0, 0.55) 76%, transparent 96%);
    }

    .haze {
      position: absolute;
      inset-block-start: 6%;
      inline-size: 96%;
      block-size: 80%;
      border-radius: 50%;
      background: radial-gradient(ellipse at 50% 55%, rgba(230, 203, 134, 0.20), rgba(212, 180, 106, 0.06) 45%, transparent 70%);
      filter: blur(20px);
      z-index: -3;
    }

    /* Still light. The shafts used to breathe; a light that moves for no
       reason reads as an effect, and the object is what should hold the eye. */
    .shaft {
      position: absolute;
      inset-block: -20%;
      inline-size: 22%;
      transform: skewX(-9deg);
      background: linear-gradient(180deg, rgba(247, 235, 203, 0.10), rgba(247, 235, 203, 0.025) 45%, transparent 78%);
      filter: blur(6px);
      z-index: -2;
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 45%, transparent);
      mask-image: linear-gradient(90deg, transparent, #000 45%, transparent);
    }
    .shaft--a { inset-inline-start: 14%; }
    .shaft--b { inset-inline-start: 52%; inline-size: 12%; opacity: 0.6; }

    .stage { position: relative; inline-size: 100%; display: flex; flex-direction: column; align-items: center; }
    .object { inline-size: 84%; filter: drop-shadow(0 30px 40px rgba(0, 0, 0, 0.55)); }

    .mirror {
      inline-size: 84%;
      margin-block-start: -17%;
      transform: scaleY(-1);
      opacity: 0.16;
      filter: blur(2.5px);
      -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent 34%);
      mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent 34%);
      pointer-events: none;
    }

    .horizon {
      position: absolute;
      inset-block-end: 22%;
      inline-size: 46%;
      block-size: 1px;
      background: linear-gradient(90deg, transparent, rgba(230, 203, 134, 0.30) 40%, rgba(230, 203, 134, 0.30) 60%, transparent);
      z-index: -1;
    }

    .mote { position: absolute; border-radius: 50%; background: var(--tt-gold-300); filter: blur(0.4px); }
    .mote--1 { inset-block-start: 22%; inset-inline-start: 24%; inline-size: 3px; block-size: 3px; opacity: 0.45; }
    .mote--2 { inset-block-start: 62%; inset-inline-start: 79%; inline-size: 2px; block-size: 2px; opacity: 0.34; }
    .mote--3 { inset-block-start: 39%; inset-inline-start: 88%; inline-size: 4px; block-size: 4px; opacity: 0.2; }
    .mote--4 { inset-block-start: 74%; inset-inline-start: 12%; inline-size: 2px; block-size: 2px; opacity: 0.28; }

    @media (max-width: 900px) {
      .scene { aspect-ratio: 16 / 11; }
      .object { inline-size: 46%; }
      .mirror { inline-size: 46%; margin-block-start: -14%; opacity: 0.14; }
      .haze { inline-size: 62%; block-size: 92%; inset-block-start: 2%; }
      .horizon { inline-size: 28%; inset-block-end: 15%; }
      .shaft, .mote { display: none; }
    }
  `],
})
export class HeroSceneComponent {
  /** Which tier of the product family the scene is staging. */
  @Input() tier: 'entry' | 'standard' | 'premium' | 'hero' = 'hero';
  @Input() material: PackMaterial = 'elite';
}
