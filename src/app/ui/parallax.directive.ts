import {
  Directive, ElementRef, Injectable, Input, NgZone, OnDestroy, OnInit, inject,
} from '@angular/core';

/**
 * One scroll loop for every parallax layer on the page.
 *
 * Layers register with a depth; on each animation frame the engine reads the
 * scroll position once and moves each visible layer by its depth times its
 * distance from the viewport centre, so far layers drift slowly and near
 * layers drift faster, which is what makes a flat scene read as a space.
 * Transforms only, outside Angular's zone, and nothing at all when the
 * visitor asked for reduced motion.
 */
@Injectable({ providedIn: 'root' })
export class ParallaxEngine {
  private readonly zone = inject(NgZone);
  private readonly layers = new Map<HTMLElement, number>();
  private readonly visible = new Set<HTMLElement>();
  private observer?: IntersectionObserver;
  private frame = 0;
  private listening = false;

  private readonly reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** A phone gets a gentler drift; the thumb is already scrolling. */
  private readonly factor = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 0.55 : 1;

  register(element: HTMLElement, depth: number): void {
    if (this.reduced || typeof window === 'undefined') {
      return;
    }
    this.layers.set(element, depth);
    this.observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.visible.add(entry.target as HTMLElement);
        } else {
          this.visible.delete(entry.target as HTMLElement);
        }
      }
      this.schedule();
    }, { rootMargin: '20% 0px' });
    this.observer.observe(element);
    this.listen();
    this.schedule();
  }

  unregister(element: HTMLElement): void {
    this.layers.delete(element);
    this.visible.delete(element);
    this.observer?.unobserve(element);
    element.style.transform = '';
  }

  private listen(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', () => this.schedule(), { passive: true });
      window.addEventListener('resize', () => this.schedule(), { passive: true });
    });
  }

  private schedule(): void {
    if (this.frame) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const middle = window.innerHeight / 2;
    for (const element of this.visible) {
      const depth = this.layers.get(element);
      if (depth === undefined) {
        continue;
      }
      const box = element.getBoundingClientRect();
      const centre = box.top + box.height / 2;
      const shift = (middle - centre) * depth * this.factor;
      element.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    }
  }
}

/**
 * Marks a layer of a scene. `depth` is how much of the scroll distance the
 * layer follows: 0.06 is a far sky, 0.26 a near foreground.
 */
@Directive({
  selector: '[ttParallax]',
  standalone: true,
})
export class ParallaxDirective implements OnInit, OnDestroy {
  @Input('ttParallax') depth: number | string = 0.12;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly engine = inject(ParallaxEngine);

  ngOnInit(): void {
    const depth = Number(this.depth);
    this.engine.register(this.host.nativeElement, Number.isFinite(depth) && depth !== 0 ? depth : 0.12);
  }

  ngOnDestroy(): void {
    this.engine.unregister(this.host.nativeElement);
  }
}
