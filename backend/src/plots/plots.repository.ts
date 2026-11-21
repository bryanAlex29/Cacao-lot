import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PageDto } from '../common/page.dto';
import { CreatePlotDto, UpdatePlotDto } from './plot.dto';

const publicSelect = {
  id: true,
  ownerId: true,
  name: true,
  locationLabel: true,
  areaM2: true,
  createdAt: true,
} as const;

@Injectable()
export class PlotsRepository {
  constructor(private readonly database: PrismaService) {}

  async list(ownerId: string, page: PageDto) {
    const where = { ownerId, archivedAt: null };
    const [items, total] = await this.database.$transaction([
      this.database.plot.findMany({
        where,
        select: publicSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: page.limit,
        skip: page.offset,
      }),
      this.database.plot.count({ where }),
    ]);
    return { items, total, limit: page.limit, offset: page.offset };
  }

  findOwned(id: string, ownerId: string) {
    return this.database.plot.findFirst({
      where: { id, ownerId, archivedAt: null },
      select: publicSelect,
    });
  }

  create(ownerId: string, input: CreatePlotDto) {
    return this.database.plot.create({
      data: {
        ownerId,
        name: input.name,
        locationLabel: input.locationLabel,
        areaM2: input.areaM2 ?? null,
      },
      select: publicSelect,
    });
  }

  update(id: string, ownerId: string, input: UpdatePlotDto) {
    return this.database.plot.updateMany({
      where: { id, ownerId, archivedAt: null },
      data: { name: input.name, locationLabel: input.locationLabel, areaM2: input.areaM2 },
    });
  }

  archive(id: string, ownerId: string) {
    return this.database.plot.updateMany({
      where: { id, ownerId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }
}
