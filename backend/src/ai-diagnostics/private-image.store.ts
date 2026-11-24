import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import type { Environment } from '../config/environment';

@Injectable()
export class PrivateImageStore {
  private readonly root: string;
  constructor(private readonly config: ConfigService<Environment, true>) {
    this.root = resolve(
      config.get('IMAGE_STORAGE_PATH', { infer: true }) ??
        resolve(__dirname, '../../../.local/ai-images'),
    );
  }
  async sanitize(image: Buffer): Promise<Buffer> {
    if (!image.length) throw new BadRequestException('Imagen vacía');
    if (image.length > this.config.get('AI_MAX_IMAGE_MB', { infer: true }) * 1024 * 1024)
      throw new PayloadTooLargeException('Imagen demasiado grande');
    try {
      const options = { limitInputPixels: 25000000, failOn: 'warning' as const };
      const metadata = await sharp(image, options).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
        throw new Error('Formato no permitido');
      // Decode/re-encode instead of trusting MIME/extension. Default output strips EXIF/GPS.
      return await sharp(image, options)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Imagen inválida. Usa JPEG, PNG o WebP estático de hasta 25 megapíxeles.',
      );
    }
  }
  async put(key: string, bytes: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(this.path(key), bytes, { flag: 'wx', mode: 0o600 });
  }
  read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }
  async remove(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
  }
  private path(key: string): string {
    if (!/^[a-f0-9-]{36}\.jpg$/.test(key)) throw new Error('Identificador de imagen inválido');
    return join(this.root, key);
  }
}
