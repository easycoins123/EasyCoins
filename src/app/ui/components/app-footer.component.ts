import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { BRAND, STOREFRONT } from '../../core/brand';
import { BrandLogoComponent } from './brand-logo.component';
import { IconComponent } from './icon.component';

/**
 * Footer.
 *
 * The brand's closing statement, the four groups a customer comes looking for,
 * and a plain row of what the shop keeps: secure payment, order tracking,
 * Hebrew support. It also states that the site is in development and runs a
 * payment simulation; the storefront never implies a live integration it
 * lacks, so the notice stays until real payments exist.
 */
@Component({
  selector: 'tt-app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, BrandLogoComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="foot">
      <div class="tt-container">
        <div class="top">
          <div class="about">
            <tt-brand-logo [markSize]="34"></tt-brand-logo>
            <p class="statement">קוינס ל־<span dir="ltr">Ultimate Team</span>. <span class="statement__muted">בלי כאב ראש.</span></p>
            <p class="tt-faint">{{ description }}</p>
            <ul class="platforms" aria-label="פלטפורמות">
              <li><tt-icon name="platform" [size]="14"></tt-icon> PS5</li>
              <li>PS4</li>
              <li>Xbox</li>
              <li>PC</li>
            </ul>
          </div>

          <nav class="col">
            <h2>חנות</h2>
            <a routerLink="/store">כל החבילות</a>
            <a routerLink="/deals">מבצעים</a>
            <a routerLink="/delivery">איך זה עובד</a>
          </nav>
          <nav class="col">
            <h2>שירות</h2>
            <a routerLink="/support">תמיכה</a>
            <a routerLink="/faq">שאלות נפוצות</a>
            <a routerLink="/contact">צור קשר</a>
            <a routerLink="/account/orders">ההזמנות שלי</a>
          </nav>
          <nav class="col">
            <h2>העסק</h2>
            <a routerLink="/about">אודות</a>
            <a routerLink="/business-details">פרטי העסק</a>
            <a routerLink="/accessibility">נגישות</a>
          </nav>
          <nav class="col">
            <h2>משפטי</h2>
            <a routerLink="/terms">תנאי שימוש</a>
            <a routerLink="/privacy">פרטיות</a>
            <a routerLink="/refund-policy">ביטול והחזרים</a>
            <a routerLink="/ip">סימני מסחר</a>
          </nav>
        </div>

        <ul class="assure">
          <li><tt-icon name="lock" [size]="16"></tt-icon> תשלום מאובטח דרך ספק סליקה</li>
          <li><tt-icon name="delivery" [size]="16"></tt-icon> דף מעקב לכל הזמנה</li>
          <li><tt-icon name="support" [size]="16"></tt-icon> תמיכה בעברית</li>
          <li><tt-icon name="shield" [size]="16"></tt-icon> לעולם לא מבקשים סיסמה של חשבון המשחק</li>
        </ul>

        <p class="notice">
          <tt-icon name="info" [size]="14"></tt-icon>
          האתר נמצא בפיתוח ומריץ סימולציית תשלום בלבד. לא מתבצע חיוב אמיתי, לא נאספים פרטי אשראי, והקודים המוצגים הם קודי הדגמה.
        </p>

        <div class="bottom">
          <span>© {{ year }} {{ brandName }}. כל הזכויות שמורות.</span>
          <span class="tt-faint">{{ gameName }} הוא סימן מסחרי של בעליו. EASYCOINS אינה קשורה ל-EA.</span>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .foot {
      margin-block-start: var(--tt-space-8);
      padding-block: var(--tt-space-7) var(--tt-space-5);
      border-block-start: 1px solid var(--tt-border);
      background: var(--tt-bg-elevated);
    }

    .top { display: grid; gap: var(--tt-space-6) var(--tt-space-5); grid-template-columns: minmax(0, 1.6fr) repeat(4, minmax(0, 1fr)); }
    .about { display: flex; flex-direction: column; gap: var(--tt-space-3); max-inline-size: 36ch; }
    .statement { margin: 0; font-family: var(--tt-font-display); font-size: var(--tt-display-3); line-height: 1; }
    .statement__muted { opacity: 0.5; font-weight: 400; }
    .about .tt-faint { margin: 0; line-height: var(--tt-leading); }
    .platforms { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); margin: var(--tt-space-1) 0 0; padding: 0; list-style: none; }
    .platforms li { display: inline-flex; align-items: center; gap: 5px; padding: 0.2rem 0.6rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-pill); font-size: var(--tt-text-xs); font-weight: 700; color: var(--tt-text-muted); }

    .col { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .col h2 { margin: 0 0 var(--tt-space-2); font-family: var(--tt-font-display); font-size: var(--tt-text-lg); letter-spacing: 0.03em; }
    .col a { display: flex; align-items: center; min-block-size: 32px; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .col a:hover { color: var(--tt-text); text-decoration: none; }

    .assure {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tt-space-3) var(--tt-space-5);
      margin: var(--tt-space-6) 0 0;
      padding: var(--tt-space-4) 0;
      border-block: 1px solid var(--tt-border);
      list-style: none;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
    }
    .assure li { display: inline-flex; align-items: center; gap: var(--tt-space-2); }
    .assure tt-icon { color: var(--tt-gold-400); }

    .notice { display: flex; align-items: flex-start; gap: var(--tt-space-2); margin: var(--tt-space-4) 0 0; color: var(--tt-text-faint); font-size: var(--tt-text-xs); line-height: var(--tt-leading-snug); }
    .notice tt-icon { flex: none; margin-block-start: 2px; color: var(--tt-warning); }

    .bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--tt-space-2) var(--tt-space-4); margin-block-start: var(--tt-space-4); font-size: var(--tt-text-xs); color: var(--tt-text-muted); }

    @media (max-width: 900px) { .top { grid-template-columns: repeat(2, minmax(0, 1fr)); } .about { grid-column: 1 / -1; max-inline-size: none; } }
  `],
})
export class AppFooterComponent {
  readonly year = new Date().getFullYear();
  readonly brandName = BRAND.name;
  readonly description = BRAND.description.he;
  readonly gameName = STOREFRONT.focusGameName;
}
