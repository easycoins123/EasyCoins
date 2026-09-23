import { TestBed } from '@angular/core/testing';

import { PlatformFamily, PlatformKind } from '../domain';
import { PlatformPreferenceService } from './platform-preference.service';

const PLATFORMS = [
  { id: 'plat-ps5', kind: PlatformKind.PlayStation5, family: PlatformFamily.PlayStation, name: { he: 'פלייסטיישן 5' }, shortName: { he: 'PS5' }, sortOrder: 1 },
  { id: 'plat-xbox', kind: PlatformKind.Xbox, family: PlatformFamily.Xbox, name: { he: 'אקסבוקס' }, shortName: { he: 'Xbox' }, sortOrder: 3 },
];

describe('PlatformPreferenceService', () => {
  beforeEach(() => localStorage.removeItem('easycoins.platform.v1'));

  it('starts unchosen and resolves to the first offered platform', () => {
    const service = TestBed.inject(PlatformPreferenceService);
    expect(service.chosen()).toBeFalse();
    expect(service.resolve(PLATFORMS)?.id).toBe('plat-ps5');
  });

  it('remembers a choice and persists it', () => {
    const service = TestBed.inject(PlatformPreferenceService);
    service.set('plat-xbox');
    expect(service.chosen()).toBeTrue();
    expect(service.resolve(PLATFORMS)?.id).toBe('plat-xbox');
    expect(localStorage.getItem('easycoins.platform.v1')).toBe('plat-xbox');
  });

  it('falls back when the remembered platform is not offered', () => {
    const service = TestBed.inject(PlatformPreferenceService);
    service.set('plat-mobile');
    expect(service.resolve(PLATFORMS)?.id).toBe('plat-ps5');
  });

  it('ignores a hostile stored value', () => {
    localStorage.setItem('easycoins.platform.v1', '<script>alert(1)</script>');
    TestBed.resetTestingModule();
    const service = TestBed.inject(PlatformPreferenceService);
    expect(service.platformId()).toBeNull();
  });
});
