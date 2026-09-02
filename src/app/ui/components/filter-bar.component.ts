import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { IconComponent } from './icon.component';

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

/**
 * Store filters.
 *
 * These were four native selects stacked in a disclosure. A select hides its
 * options until it is opened, gives no sense of how many there are, and looks
 * the same on a shop as it does on a tax form, which is why the store kept
 * reading as an admin screen.
 *
 * Chips instead. Every option is visible, choosing one is a single tap, and the
 * current state is legible without opening anything. On a phone the groups move
 * into a sheet that slides from the bottom, with the number of active filters
 * on the button that opens it, so filtering never costs the customer their
 * place in the results.
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
        <input type="search"
               [value]="search"
               (input)="searchChange.emit($any($event.target).value)"
               placeholder="חיפוש מוצר או כמות" />
      </label>

      <button type="button" class="sheet-open" (click)="open.set(true)">
        <tt-icon name="filter" [size]="17"></tt-icon>
        סינון
        <span class="count" *ngIf="activeCount > 0">{{ activeCount }}</span>
      </button>

      <!-- Closed on a phone, the sheet is off-screen and inert, so its chips are
           out of the focus order without being hidden from the page. -->
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
              <legend>{{ group.label }}</legend>
              <div class="chips">
                <button type="button"
                        class="chip"
                        [class.on]="group.selected === ''"
                        (click)="pick(group.key, '')">
                  {{ group.anyLabel }}
                </button>
                <button type="button"
                        class="chip"
                        *ngFor="let option of group.options"
                        [class.on]="group.selected === option.value"
                        (click)="pick(group.key, option.value)">
                  {{ option.label }}
                </button>
              </div>
            </fieldset>
          </div>

          <footer class="sheet__foot">
            <button type="button" class="tt-btn tt-btn--quiet" *ngIf="activeCount > 0" (click)="clear.emit()">
              איפוס
            </button>
            <button type="button" class="tt-btn tt-btn--primary tt-btn--block" (click)="open.set(false)">
              הצגת התוצאות
            </button>
          </footer>
        </div>
      </div>

      <div class="scrim" *ngIf="open()" (click)="open.set(false)"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      flex-wrap: wrap;
    }

    .find {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1;
      min-inline-size: 190px;
    }
    .find__icon {
      position: absolute;
      inset-inline-start: var(--tt-space-3);
      color: var(--tt-text-faint);
      pointer-events: none;
    }
    .find input {
      inline-size: 100%;
      min-block-size: 44px;
      padding-inline: 2.6rem var(--tt-space-3);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      font-size: var(--tt-text-sm);
    }
    .find input:focus { outline: none; border-color: var(--tt-border-brand); background: var(--tt-surface-2); }
    .find input::-webkit-search-cancel-button { display: none; }

    /* --- The chips ---------------------------------------------------------- */
    .group { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
    .group legend {
      padding: 0;
      margin-block-end: var(--tt-space-2);
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
      font-weight: 700;
      letter-spacing: var(--tt-tracking-eyebrow);
      text-transform: uppercase;
    }
    .chips { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); }
    .chip {
      min-block-size: 38px;
      padding-inline: var(--tt-space-3);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text-muted);
      font: inherit;
      font-size: var(--tt-text-sm);
      font-weight: 600;
      cursor: pointer;
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .chip:hover { border-color: var(--tt-border-strong); color: var(--tt-text); }
    /* Blue, not gold: choosing a filter is an interaction, not a purchase. */
    .chip.on {
      border-color: var(--tt-border-brand);
      background: var(--tt-brand-tint);
      color: var(--tt-brand-300);
    }

    .sheet-open { display: none; }
    .scrim { display: none; }

    /* --- Wide: the groups sit open on the page ----------------------------- */
    @media (min-width: 860px) {
      .groups {
        flex-basis: 100%;
        display: flex;
        flex-wrap: wrap;
        gap: var(--tt-space-5);
        padding-block-start: var(--tt-space-4);
      }
      .sheet { display: contents; }
      .sheet__head, .sheet__foot { display: none; }
      .sheet__body { display: contents; }
    }

    /* --- Phone: a sheet from the bottom ------------------------------------ */
    @media (max-width: 859px) {
      .sheet-open {
        display: inline-flex;
        align-items: center;
        gap: var(--tt-space-2);
        min-block-size: 44px;
        padding-inline: var(--tt-space-4);
        border: 1px solid var(--tt-border-strong);
        border-radius: var(--tt-radius-md);
        background: var(--tt-surface);
        color: var(--tt-text);
        font: inherit;
        font-size: var(--tt-text-sm);
        font-weight: 700;
        cursor: pointer;
      }
      .count {
        display: grid;
        place-items: center;
        min-inline-size: 20px;
        block-size: 20px;
        padding-inline: 5px;
        border-radius: var(--tt-radius-pill);
        background: var(--tt-brand-500);
        color: var(--tt-text-on-brand);
        font-size: 11px;
        font-weight: 800;
      }

      .scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: var(--tt-z-drawer);
        background: var(--tt-overlay);
      }

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
      @media (prefers-reduced-motion: reduce) {
        .groups { transition: none; }
      }

      .sheet {
        display: flex;
        flex-direction: column;
        max-block-size: 82vh;
        border-start-start-radius: var(--tt-radius-xl);
        border-start-end-radius: var(--tt-radius-xl);
        background: var(--tt-bg-elevated);
        border-block-start: 1px solid var(--tt-border-strong);
        box-shadow: var(--tt-shadow-3);
      }
      .sheet__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--tt-space-4);
        border-block-end: 1px solid var(--tt-border);
      }
      .sheet__close {
        display: grid;
        place-items: center;
        inline-size: 38px;
        block-size: 38px;
        border: 1px solid var(--tt-border);
        border-radius: var(--tt-radius-md);
        background: var(--tt-surface);
        color: var(--tt-text-muted);
        cursor: pointer;
      }
      .sheet__body {
        display: flex;
        flex-direction: column;
        gap: var(--tt-space-5);
        padding: var(--tt-space-4);
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .sheet__foot {
        display: flex;
        align-items: center;
        gap: var(--tt-space-3);
        padding: var(--tt-space-4);
        border-block-start: 1px solid var(--tt-border);
      }
    }
  `],
})
export class FilterBarComponent {
  @Input() groups: readonly FilterGroup[] = [];
  @Input() search = '';

  /** How many groups have a choice, for the badge on the sheet button. */
  @Input() activeCount = 0;

  @Output() readonly changed = new EventEmitter<FilterChange>();
  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly clear = new EventEmitter<void>();

  readonly open = signal(false);

  /** Whether the groups are a bottom sheet at this width, or open on the page. */
  readonly isSheet = signal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 859px)').matches,
  );

  @HostListener('window:resize')
  onResize(): void {
    this.isSheet.set(window.matchMedia('(max-width: 859px)').matches);
  }

  pick(key: string, value: string): void {
    this.changed.emit({ key, value });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
