import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Marks an element `is-live` while it is on screen.
 *
 * A looping animation keeps the browser awake for as long as it runs, whether
 * or not anyone can see it: the connector under "how it works" was repainting
 * sixty times a second while the visitor was still reading the hero. Styles
 * pause such animations by default and let them run only under `.is-live`, so
 * decoration costs nothing until it is in view.
 */
@Directive({
  selector: '[ttLive]',
  standalone: true,
})
export class LiveDirective implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const element = this.host.nativeElement;
    if (typeof IntersectionObserver === 'undefined') {
      element.classList.add('is-live');
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        element.classList.toggle('is-live', entry.isIntersecting);
      }
    }, { rootMargin: '10% 0px' });
    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
