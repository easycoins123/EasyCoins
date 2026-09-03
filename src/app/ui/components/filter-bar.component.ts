import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { IconComponent, IconName } from './icon.component';

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

export interface FilterGroup {
  readonly key: string;
  readonly label: string;
  /** Shown when nothing in the group is chosen. */
  readonly anyLabel: string;
  readonly options: readonly FilterOption[];
  readonly selected: string;
}

export interface FilterChange {
  readonly key: string;
  readonly value: string;
}

/** A glyph per group, so the toolbar reads at a glance. */
const GROUP_ICONS: Readonly<Record<string, IconName>> = {
  platform: 'platform',
  type: 'tag',
  sort: 'filter',
};

/**
 * Store filters.
 *
 * Every option is a pill, visible and one tap away, with the chosen one lit in
 * the interactive colour. Each group carries a glyph so the toolbar can be
 * scanned without reading. On a phone the groups move into a glass sheet from
 * the bottom with the count of active filters on the button that opens it.
 *
 * The component holds no catalog knowledge. It renders the groups it is given
 * and emits the key and value that changed; the page owns the query.
 */
@Component({
  selector: 'tt-filter-bar',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <label class="find">
        <tt-icon name="search" [size]="18" class="find__icon"></tt-icon>
        <span class="tt-visually-hidden">חיפוש בחנות</span>
        <input type="search" [value]="search" (input)="searchChange.emit($any($event.target).value)" placeholder="חיפוש מוצר או כמות" />
      </label>

      <button type="button" class="sheet-open" (click)="open.set(true)">
        <tt-icon name="filter" [size]="17"></tt-icon>
        סינון
        <span class="count" *ngIf="activeCount > 0">{{ activeCount }}</span>
      </button>

      <div class="groups" [class.groups--open]="open()" [attr.inert]="isSheet() && !open() ? '' : null">
        <div class="sheet" role="dialog" aria-modal="true" aria-label="סינון">
          <header class="sheet__head">
            <strong>סינון</strong>
            <button type="button" class="sheet__close" (click)="open.set(false)" aria-label="סגירה">
              <tt-icon name="close" [size]="18"></tt-icon>
            </button>
          </header>

          <div class="sheet__body">
            <fieldset class="group" *ngFor="let group of groups">
              <legend><tt-icon [name]="iconFor(group.key)" [size]="14"></tt-icon>{{ group.label }}</legend>
              <div class="chips">
                <button type="button" class="chip tt-pill" [class.on]="group.selected === ''" (click)="pick(group.key, '')">
                  {{ group.anyLabel }}
                </button>
                <button type="button" class="chip tt-pill" *ngFor="let option of group.options"
                        [class.on]="group.selected === option.value" (click)="pick(group.key, option.value)">
                  {{ option.label }}
                </button>
              </div>
            </fieldset>
          </div>

          <footer class="sheet__foot">
            <button type="button" class="tt-btn tt-btn--quiet" *ngIf="activeCount > 0" (click)="clear.emit()">איפוס</button>
            <button type="button" class="tt-btn tt-btn--primary tt-btn--block" (click)="open.set(false)">הצגת התוצאות</button>
          </footer>
        </div>
      </div>

      <div class="scrim" *ngIf="open()" (click)="open.set(false)"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .bar { display: flex; align-items: center; gap: var(--tt-space-2); flex-wrap: wrap; }

    .find { position: relative; display: flex; align-items: center; flex: 1; min-inline-size: 190px; }
    .find__icon { position: absolute; inset-inline-start: var(--tt-space-3); color: var(--tt-text-faint); pointer-events: none; }
    .find input {
      inline-size: 100%;
      min-block-size: 46px;
      padding-inline: 2.6rem var(--tt-space-3);
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      font-size: var(--tt-text-sm);
      transition: border-color var(--tt-duration-fast) var(--tt-ease), box-shadow var(--tt-duration-fast) var(--tt-ease);
    }
    .find input:hover { border-color: var(--tt-text-faint); }
    .find input:focus { outline: none; border-color: var(--tt-brand-500); box-shadow: 0 0 0 3px var(--tt-brand-tint); }
    .find input::placeholder { color: var(--tt-text-faint); }
    .find input::-webkit-search-cancel-button { display: none; }

    .group { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
    .group legend {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0;
      margin-block-end: var(--tt-space-2);
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
      font-weight: 700;
      letter-spacing: var(--tt-tracking-eyebrow);
      text-transform: uppercase;
    }
    .chips { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); }

    .sheet-open { display: none; }
    .scrim { display: none; }

    @media (min-width: 860px) {
      .groups { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: var(--tt-space-5); padding-block-start: var(--tt-space-4); }
      .sheet { display: contents; }
      .sheet__head, .sheet__foot { display: none; }
      .sheet__body { display: contents; }
    }

    @media (max-width: 859px) {
      .sheet-open {
        display: inline-flex;
        align-items: center;
        gap: var(--tt-space-2);
        min-block-size: 46px;
        padding-inline: var(--tt-space-4);
        border: 1px solid var(--tt-border-strong);
        border-radius: var(--tt-radius-pill);
        background: var(--tt-surface);
        color: var(--tt-text);
        font: inherit;
        font-size: var(--tt-text-sm);
        font-weight: 700;
        cursor: pointer;
      }
      .count { display: grid; place-items: center; min-inline-size: 20px; block-size: 20px; padding-inline: 5px; border-radius: var(--tt-radius-pill); background: var(--tt-brand-500); color: var(--tt-text-on-brand); font-size: 11px; font-weight: 800; }
      .scrim { display: block; position: fixed; inset: 0; z-index: var(--tt-z-drawer); background: var(--tt-overlay); backdrop-filter: blur(3px); }
      .groups {
        position: fixed;
        inset-inline: 0;
        inset-block-end: 0;
        z-index: calc(var(--tt-z-drawer) + 1);
        transform: translateY(100%);
        transition: transform var(--tt-duration) var(--tt-ease-out);
        pointer-events: none;
      }
      .groups--open { transform: translateY(0); pointer-events: auto; }
      @media (prefers-reduced-motion: reduce) { .groups { transition: none; } }
      .sheet {
        display: flex;
        flex-direction: column;
        max-block-size: 82vh;
        border-start-start-radius: var(--tt-radius-xl);
        border-start-end-radius: var(--tt-radius-xl);
        background: rgba(18, 17, 16, 0.92);
        backdrop-filter: blur(18px);
        border-block-start: 1px solid var(--tt-glass-border);
        box-shadow: var(--tt-glass-highlight), var(--tt-shadow-3);
      }
      .sheet__head { display: flex; align-items: center; justify-content: space-between; padding: var(--tt-space-4); border-block-end: 1px solid var(--tt-border); font-family: var(--tt-font-display); font-size: var(--tt-text-xl); }
      .sheet__close { display: grid; place-items: center; inline-size: 38px; block-size: 38px; border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface); color: var(--tt-text-muted); cursor: pointer; }
      .sheet__body { display: flex; flex-direction: column; gap: var(--tt-space-5); padding: var(--tt-space-4); overflow-y: auto; overscroll-behavior: contain; }
      .sheet__foot { display: flex; align-items: center; gap: var(--tt-space-3); padding: var(--tt-space-4); border-block-start: 1px solid var(--tt-border); }
    }
  `],
})
export class FilterBarComponent {
  @Input() groups: readonly FilterGroup[] = [];
  @Input() search = '';
  @Input() activeCount = 0;

  @Output() readonly changed = new EventEmitter<FilterChange>();
  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly clear = new EventEmitter<void>();

  readonly open = signal(false);

  /** Whether the groups are a bottom sheet at this width, or open on the page. */
  readonly isSheet = signal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 859px)').matches,
  );

  iconFor(key: string): IconName {
    return GROUP_ICONS[key] ?? 'filter';
  }

  pick(key: string, value: string): void {
    this.changed.emit({ key, value });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isSheet.set(window.matchMedia('(max-width: 859px)').matches);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
