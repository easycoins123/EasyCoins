import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Platform, PlatformFamily, PlatformKind } from '../../../domain';
import { PlatformPickerComponent } from './platform-picker.component';

const PLATFORMS: Platform[] = [
  { id: 'plat-ps5', kind: PlatformKind.PlayStation5, family: PlatformFamily.PlayStation, name: { he: 'פלייסטיישן 5' }, shortName: { he: 'PS5' }, sortOrder: 1 },
  { id: 'plat-xbox', kind: PlatformKind.Xbox, family: PlatformFamily.Xbox, name: { he: 'אקסבוקס' }, shortName: { he: 'Xbox' }, sortOrder: 3 },
  { id: 'plat-pc', kind: PlatformKind.Pc, family: PlatformFamily.Pc, name: { he: 'מחשב' }, shortName: { he: 'PC' }, sortOrder: 4 },
];

describe('PlatformPickerComponent', () => {
  let fixture: ComponentFixture<PlatformPickerComponent>;
  let component: PlatformPickerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlatformPickerComponent] }).compileComponents();
    fixture = TestBed.createComponent(PlatformPickerComponent);
    component = fixture.componentInstance;
    component.platforms = PLATFORMS;
    component.selected = 'plat-ps5';
    component.label = 'על מה משחקים?';
    fixture.detectChanges();
  });

  function radios(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]'));
  }

  it('renders a radio group with the full platform names as text', () => {
    const group = fixture.nativeElement.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(radios().length).toBe(3);
    expect(radios()[1].textContent).toContain('אקסבוקס');
  });

  it('marks the selected platform and only it as checked', () => {
    const checked = radios().map((radio) => radio.getAttribute('aria-checked'));
    expect(checked).toEqual(['true', 'false', 'false']);
    expect(radios()[0].classList).toContain('on');
  });

  it('emits the platform chosen by pointer and not a re-choice of the same one', () => {
    const emitted: Platform[] = [];
    component.selectedChange.subscribe((platform) => emitted.push(platform));
    radios()[0].click();
    radios()[2].click();
    expect(emitted.map((platform) => platform.id)).toEqual(['plat-pc']);
  });

  it('moves the choice with the arrow keys', () => {
    const emitted: Platform[] = [];
    component.selectedChange.subscribe((platform) => emitted.push(platform));
    const group: HTMLElement = fixture.nativeElement.querySelector('[role="radiogroup"]');
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(emitted[0]?.id).toBe('plat-xbox');
  });

  it('keeps one tab stop for the whole group', () => {
    const stops = radios().filter((radio) => radio.tabIndex === 0);
    expect(stops.length).toBe(1);
  });

  it('shows the explanation only on request', () => {
    fixture.componentRef.setInput('help', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.helptext')).toBeNull();
    fixture.nativeElement.querySelector('.help').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.helptext')?.textContent).toContain('פלייסטיישן');
  });
});
