import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const publicSelect = { id: true, name: true, email: true, role: true } as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly database: PrismaService) {}

  findForLogin(email: string) {
    return this.database.user.findUnique({
      where: { email },
      select: { ...publicSelect, passwordHash: true, isActive: true },
    });
  }

  findActive(id: string) {
    return this.database.user.findFirst({ where: { id, isActive: true }, select: publicSelect });
  }

  async createFarmer(input: { name: string; email: string; passwordHash: string }) {
    try {
      return await this.database.user.create({
        data: { ...input, role: UserRole.FARMER },
        select: publicSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('No se pudo crear el usuario con esos datos');
      }
      throw error;
    }
  }
}
