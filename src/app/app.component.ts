import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { LocaleService } from './core/i18n';
import { SeoService } from './core/seo/seo.service';
// Imported by file rather than through the barrel. The shell is eager, and a
// barrel import pulls every component the barrel re-exports into the initial
// bundle with it, including the ones only a lazy route ever renders.
import { AppFooterComponent } from './ui/components/app-footer.component';
import { AppHeaderComponent } from './ui/components/app-header.component';
import { ToastHostComponent } from './ui/components/toast-host.component';
import { CartDockComponent } from './ui/components/cart-dock.component';

/**
 * Application shell. It owns nothing but layout: header, routed content, footer,
 * plus a skip link so keyboard users can bypass the navigation.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppHeaderComponent, AppFooterComponent, ToastHostComponent, CartDockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="tt-skip-link" href="#main">דילוג לתוכן הראשי</a>
    <tt-app-header></tt-app-header>
    <main id="main" tabindex="-1">
      <router-outlet></router-outlet>
    </main>
    <tt-app-footer></tt-app-footer>
    <tt-toast-host></tt-toast-host>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-block-size: 100%; }
    /*
      The routed view arrives one lazy chunk later than the shell. Without a
      reserved main area the footer paints just under the header and then drops
      down the page, which measured as the single largest layout shift on every
      route. Reserving a viewport-height main keeps the footer where it belongs
      from the first frame.
    */
    main {
      flex: 1;
      outline: none;
      min-block-size: calc(100vh - var(--tt-header-height));
    }
  `],
})
export class AppComponent {
  private readonly locale = inject(LocaleService);
  private readonly seo = inject(SeoService);

  constructor() {
    // Direction is derived from the active locale rather than assumed, so an
    // English build flips to LTR without touching a single stylesheet.
    this.locale.setLocale(this.locale.locale());
    // Titles, descriptions and structured data follow the edition on sale.
    this.seo.start();
  }
}
