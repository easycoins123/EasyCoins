import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Entrance on scroll.
 *
 * Adds `reveal` at once and `reveal--seen` when the element enters the
 * viewport, which the global stylesheet turns into a short rise-and-fade. The
 * optional index staggers a row of siblings.
 *
 * Two safety nets, because an entrance that never happens is a blank page:
 * without IntersectionObserver the element is shown immediately, and every
 * element is shown after a short timer regardless, so a screenshot, a crawler
 * or a very fast scroll never meets hidden content. Reduced motion is honoured
 * by the stylesheet, which collapses the transition to nothing.
 */
@Directive({
  selector: '[ttReveal]',
  standalone: true,
})
export class RevealDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Position in a staggered group; each step delays the entrance a little. */
  @Input('ttReveal') index: number | string | '' = 0;

  private observer?: IntersectionObserver;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    const element = this.host.nativeElement;
    element.classList.add('reveal');
    const step = Number(this.index) || 0;
    element.style.setProperty('--reveal-delay', `${Math.min(step, 8) * 70}ms`);

    if (typeof IntersectionObserver === 'undefined') {
      this.show();
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.show();
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    this.observer.observe(element);

    // The net: whatever the observer thinks, nothing stays hidden for long.
    this.timer = setTimeout(() => this.show(), 1200);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private show(): void {
    this.host.nativeElement.classList.add('reveal--seen');
    this.observer?.disconnect();
  }
}
