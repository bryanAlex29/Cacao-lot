import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineJsonDownload } from './offline-json-download.service';

describe('Archivo JSON privado en el navegador', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });
  it.each([false, true])('libera enlace y URL incluso si el clic falla: %s', (fail) => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:offline-test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('private.json');
      expect(this.href).toBe('blob:offline-test');
      if (fail) throw new Error('blocked');
    });
    const save = () => TestBed.inject(OfflineJsonDownload).save(new Blob(['{}']), 'private.json');
    if (fail) expect(save).toThrow('blocked');
    else save();
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="private.json"]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:offline-test');
  });
});
