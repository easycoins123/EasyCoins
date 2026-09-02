import { Component, inject } from '@angular/core';
import { NgClass, NgIf } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { TokenStore } from './auth/token.store';

@Component({
  selector: 'admin-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgClass, NgIf],
  template: `
    <header *ngIf="tokens.isSignedIn()">
      <a routerLink="/" class="brand">EASYCOINS · תפעול</a>
      <button (click)="signOut()">יציאה</button>
    </header>

    <main [ngClass]="{ plain: !tokens.isSignedIn() }">
      <router-outlet />
    </main>
  `,
  styles: [
    `
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.7rem 1.2rem;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }
      .brand {
        color: var(--text);
        font-weight: 600;
      }
      .brand:hover {
        text-decoration: none;
        color: var(--accent);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.2rem;
      }
      main.plain {
        max-width: none;
        padding: 0;
      }
    `,
  ],
})
export class AppComponent {
  readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  signOut(): void {
    this.tokens.signOut();
    void this.router.navigate(['/sign-in']);
  }
}
