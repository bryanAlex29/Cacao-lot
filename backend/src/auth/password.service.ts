import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

export const PASSWORD_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, PASSWORD_OPTIONS);
  }

  async verify(hash: string | undefined, password: string): Promise<boolean> {
    return argon2.verify(hash ?? this.dummyHash, password);
  }
}
