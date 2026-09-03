import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { Game } from '../../domain';

/**
 * Entry point to a game's products. The accent colour comes from the game record,
 * so adding a game gives it its own visual identity without a stylesheet change.
 */
@Component({
  selector: 'tt-game-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card"
       [routerLink]="['/games', game.slug]"
       [style.--accent]="game.accentColor || 'var(--tt-brand-500)'">
      <span class="glow" aria-hidden="true"></span>
      <span class="tt-eyebrow">{{ game.publisher }}</span>
      <h2>{{ game.name | t }}</h2>
      <p class="tt-muted">{{ game.shortDescription | t }}</p>
      <span class="cta">לצפייה במוצרים →</span>
    </a>
  `,
  styles: [`
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-1);
      padding: var(--tt-space-5);
      min-block-size: 190px;
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      color: inherit;
      text-decoration: none;
      overflow: hidden;
      transition: transform var(--tt-duration) var(--tt-ease), border-color var(--tt-duration) var(--tt-ease);
    }
    .card:hover { transform: translateY(-3px); border-color: var(--accent); text-decoration: none; }
    .glow {
      position: absolute;
      inset-block-start: -60px;
      inset-inline-end: -60px;
      inline-size: 180px;
      block-size: 180px;
      border-radius: 50%;
      background: var(--accent);
      opacity: 0.1;
      filter: blur(14px);
    }
    .tt-eyebrow { color: var(--accent); }
    h2 { margin: 0; font-size: var(--tt-text-xl); }
    p { font-size: var(--tt-text-sm); flex: 1; }
    .cta { font-weight: 600; color: var(--accent); font-size: var(--tt-text-sm); }
  `],
})
export class GameCardComponent {
  @Input({ required: true }) game!: Game;
}
