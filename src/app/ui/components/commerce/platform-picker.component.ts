import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, QueryList, ViewChildren, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { LocalizePipe } from '../../../core/i18n';
import { Platform, PlatformFamily } from '../../../domain';
import { IconComponent, IconName } from '../icon.component';

/**
 * "Which platform do you play on?"
 *
 * One control for the one question every coin order depends on. It is a real
 * radio group: arrow keys move, Space and Enter choose, and the chosen option
 * is announced. The label is the platform's full name in text, always; the
 * glyph is secondary, because no neutral console drawing is as unmistakable
 * as the word "PlayStation".
 *
 * The component renders the platforms it is given and emits the id chosen.
 * It holds no memory of its own: the page reads and writes the preference.
 */
@Component({
  selector: 'tt-platform-picker',
  standalone: true,
  imports: [CommonModule, LocalizePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker" [class.picker--compact]="compact">
      <div class="head" *ngIf="label">
        <span class="label" [id]="labelId">{{ label }}</span>
        <button type="button" class="help" *ngIf="help"
                (click)="helpOpen.set(!helpOpen())"
                [attr.aria-expanded]="helpOpen()"
                [attr.aria-controls]="helpId">
          <tt-icon name="info" [size]="14"></tt-icon> איך יודעים?
        </button>
      </div>

      <div class="options" role="radiogroup"
           [attr.aria-labelledby]="label ? labelId : null"
           [attr.aria-label]="label ? null : 'בחירת פלטפורמה'"
           (keydown)="onKeydown($event)">
        <button type="button" #option
                class="option"
                role="radio"
                *ngFor="let platform of platforms; trackBy: trackById"
                [attr.aria-checked]="platform.id === selected"
                [class.on]="platform.id === selected"
                [attr.tabindex]="tabIndexFor(platform)"
                (click)="choose(platform)">
          <span class="option__glyph" aria-hidden="true"><tt-icon [name]="iconFor(platform)" [size]="compact ? 15 : 18"></tt-icon></span>
          <span class="option__text">
            <span class="option__name">{{ platform.name | t }}</span>
            <span class="option__short" *ngIf="!compact">{{ platform.shortName | t }}</span>
          </span>
          <span class="option__check" aria-hidden="true"><tt-icon name="check" [size]="12"></tt-icon></span>
        </button>
      </div>

      <p class="helptext" [id]="helpId" *ngIf="help && helpOpen()">
        זו הקונסולה או המחשב שבהם משחקים ב־EA SPORTS FC. אם קונים בשביל מישהו אחר, שואלים אותו:
        פלייסטיישן 5, פלייסטיישן 4, אקסבוקס או מחשב. הקוינס נכנסים לחשבון המשחק על אותה פלטפורמה, ולכן זה חשוב.
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .picker { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-3); flex-wrap: wrap; }
    .label { font-size: var(--tt-text-sm); font-weight: 700; }
    .help { display: inline-flex; align-items: center; gap: 4px; min-block-size: 40px; padding: 0 var(--tt-space-2); border: 0; background: none; color: var(--tt-gold-400); font: inherit; font-size: var(--tt-text-xs); font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(212, 180, 106, 0.4); }
    .help:hover { color: var(--tt-gold-300); }
    .help[aria-expanded='true'] { text-decoration: none; }
    .helptext { margin: 0; padding: var(--tt-space-3) var(--tt-space-4); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }

    .options { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: var(--tt-space-2); }
    .option {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      min-block-size: 52px;
      padding: var(--tt-space-2) var(--tt-space-3);
      padding-inline-end: 34px;
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface-2);
      color: var(--tt-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: border-color var(--tt-duration-fast) var(--tt-ease), background-color var(--tt-duration-fast) var(--tt-ease), box-shadow var(--tt-duration-fast) var(--tt-ease);
    }
    .option:hover { border-color: var(--tt-text-faint); background: var(--tt-surface-3); }
    .option:active { transform: translateY(1px); }
    .option:focus-visible { outline: 2px solid var(--tt-gold-400); outline-offset: 2px; }
    .option.on { border-color: var(--tt-gold-500); background: var(--tt-gold-tint); box-shadow: inset 0 0 0 1px var(--tt-gold-500); }
    .option__glyph { display: grid; place-items: center; flex: none; inline-size: 30px; block-size: 30px; border-radius: var(--tt-radius-sm); background: var(--tt-surface-3); color: var(--tt-text-muted); }
    .option.on .option__glyph { background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .option__text { display: flex; flex-direction: column; gap: 1px; min-inline-size: 0; }
    .option__name { font-size: var(--tt-text-sm); font-weight: 800; line-height: 1.15; }
    .option__short { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-faint); direction: ltr; text-align: start; }
    .option.on .option__short { color: var(--tt-gold-400); }
    .option__check {
      position: absolute; inset-inline-end: 10px; inset-block-start: 50%; transform: translateY(-50%) scale(0.6);
      display: grid; place-items: center; inline-size: 20px; block-size: 20px; border-radius: 50%;
      background: var(--tt-gold-500); color: var(--tt-text-on-gold); opacity: 0;
      transition: opacity var(--tt-duration-fast) var(--tt-ease), transform var(--tt-duration-fast) var(--tt-ease-out);
    }
    .option.on .option__check { opacity: 1; transform: translateY(-50%) scale(1); }

    .picker--compact .options { display: flex; flex-wrap: wrap; }
    .picker--compact .option { min-block-size: 44px; padding: 0 var(--tt-space-3); padding-inline-end: 30px; }
    .picker--compact .option__glyph { inline-size: 24px; block-size: 24px; }
    .picker--compact .option__check { inset-inline-end: 8px; inline-size: 16px; block-size: 16px; }

    @media (prefers-reduced-motion: reduce) { .option, .option__check { transition: none; } }
  `],
})
export class PlatformPickerComponent {
  private static sequence = 0;

  @Input() platforms: readonly Platform[] = [];
  @Input() selected = '';
  /** A visible question above the options. */
  @Input() label?: string;
  /** Adds the "how do I know?" explanation for a customer who does not play. */
  @Input() help = false;
  /** Tighter chips for a product page or a cart line. */
  @Input() compact = false;

  @Output() readonly selectedChange = new EventEmitter<Platform>();

  @ViewChildren('option') private readonly options?: QueryList<ElementRef<HTMLButtonElement>>;

  readonly helpOpen = signal(false);
  private readonly uid = ++PlatformPickerComponent.sequence;
  readonly labelId = `tt-platform-label-${this.uid}`;
  readonly helpId = `tt-platform-help-${this.uid}`;

  choose(platform: Platform): void {
    if (platform.id !== this.selected) {
      this.selectedChange.emit(platform);
    }
  }

  iconFor(platform: Platform): IconName {
    return platform.family === PlatformFamily.Pc ? 'platform' : 'gamepad';
  }

  trackById(_index: number, platform: Platform): string {
    return platform.id;
  }

  /** Roving tabindex: one stop for the group, arrows move inside it. */
  tabIndexFor(platform: Platform): number {
    const hasSelected = this.platforms.some((candidate) => candidate.id === this.selected);
    if (hasSelected) {
      return platform.id === this.selected ? 0 : -1;
    }
    return this.platforms[0]?.id === platform.id ? 0 : -1;
  }

  onKeydown(event: KeyboardEvent): void {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key) || this.platforms.length === 0) {
      return;
    }
    event.preventDefault();
    const current = Math.max(0, this.platforms.findIndex((platform) => platform.id === this.selected));
    let next = current;
    if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = this.platforms.length - 1;
    } else {
      // In RTL the "next" arrow points left; the direction of the document decides.
      const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
      const forward = event.key === 'ArrowDown' || (rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight');
      next = (current + (forward ? 1 : -1) + this.platforms.length) % this.platforms.length;
    }
    const platform = this.platforms[next];
    this.choose(platform);
    this.options?.get(next)?.nativeElement.focus();
  }
}
