import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Environment } from '../config/environment';
import { PrivateImageStore } from './private-image.store';

describe('Imágenes privadas: decodificación, metadatos y rutas', () => {
  let directory: string, store: PrivateImageStore;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cacaosmart-image-unit-'));
    store = new PrivateImageStore(
      new ConfigService<Environment, true>({
        IMAGE_STORAGE_PATH: directory,
        AI_MAX_IMAGE_MB: 1,
      }),
    );
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodifica %s real y produce JPEG sin EXIF',
    async (format) => {
      const source = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#387e3e' },
      })
        .withExif({ IFD0: { Artist: 'private-name' } })
        .toFormat(format)
        .toBuffer();
      const result = await store.sanitize(source);
      const metadata = await sharp(result).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
    },
  );
  it.each([
    Buffer.alloc(0),
    Buffer.from('not a jpeg'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
  ])('rechaza vacíos o contenido incompatible', async (bytes) => {
    await expect(store.sanitize(bytes)).rejects.toThrow();
  });
  it('limita bytes sin intentar decodificar', async () => {
    await expect(store.sanitize(Buffer.alloc(1048577))).rejects.toMatchObject({ status: 413 });
  });
  it('limita megapíxeles antes de expandir la imagen', async () => {
    const bytes = await sharp({
      create: { width: 6000, height: 6000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(store.sanitize(bytes)).rejects.toMatchObject({ status: 400 });
  });
  it('guarda con clave interna y rechaza traversal, nunca usa nombre del cliente', async () => {
    const key = `${randomUUID()}.jpg`,
      bytes = Buffer.from('private');
    await store.put(key, bytes);
    expect(await store.read(key)).toEqual(bytes);
    await expect(store.put(key, bytes)).rejects.toThrow();
    await expect(store.put('../outside.jpg', bytes)).rejects.toThrow();
    await store.remove(key);
    await store.remove(key);
    await expect(store.read(key)).rejects.toThrow();
  });
});
