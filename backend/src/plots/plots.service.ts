import { Injectable, NotFoundException } from '@nestjs/common';
import { PageDto } from '../common/page.dto';
import { PlotsRepository } from './plots.repository';
import { CreatePlotDto, UpdatePlotDto } from './plot.dto';

@Injectable()
export class PlotsService {
  constructor(private readonly plots: PlotsRepository) {}

  list(ownerId: string, page: PageDto) {
    return this.plots.list(ownerId, page);
  }
  create(ownerId: string, input: CreatePlotDto) {
    return this.plots.create(ownerId, input);
  }

  async requireOwned(id: string, ownerId: string) {
    const plot = await this.plots.findOwned(id, ownerId);
    if (!plot) throw new NotFoundException('Parcela no encontrada');
    return plot;
  }

  async update(id: string, ownerId: string, input: UpdatePlotDto) {
    if ((await this.plots.update(id, ownerId, input)).count !== 1)
      throw new NotFoundException('Parcela no encontrada');
    return this.requireOwned(id, ownerId);
  }

  async archive(id: string, ownerId: string): Promise<void> {
    if ((await this.plots.archive(id, ownerId)).count !== 1)
      throw new NotFoundException('Parcela no encontrada');
  }
}
