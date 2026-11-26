import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { publicationsFromRun } from './regression-artifact';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function registerRegressionPublication(
  db: PrismaClient,
  ownerId: string,
  publication: ReturnType<typeof publicationsFromRun>,
  reportHash: string,
) {
  const { identity, models } = publication;
  if (
    ![ownerId, identity.plotId, identity.deviceId, ...models.map((m) => m.artifact.sensorId)].every(
      (id) => uuid.test(id),
    ) ||
    !/^[a-f0-9]{64}$/.test(reportHash)
  )
    throw new Error('Identidades persistentes o hash no válidos');
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM devices WHERE id=${identity.deviceId}::uuid FOR UPDATE`;
      const device = await tx.device.findFirst({
        where: {
          id: identity.deviceId,
          plotId: identity.plotId,
          source: identity.source,
          plot: { ownerId, archivedAt: null, owner: { isActive: true } },
        },
        select: { id: true },
      });
      if (!device)
        throw new Error('El experimento no corresponde a un equipo de ese propietario y origen');
      const sensors = await tx.sensor.findMany({
        where: { deviceId: device.id, variable: 'SOIL_MOISTURE', unit: 'PERCENT' },
        select: { id: true, code: true },
      });
      for (const model of models) {
        if (
          !sensors.some(
            (sensor) => sensor.id === model.artifact.sensorId && sensor.code === model.code,
          )
        )
          throw new Error('La identidad de sonda no coincide con el experimento');
      }
      const ids = [];
      for (const model of models) {
        const row = await tx.predictionModelVersion.upsert({
          where: { sensorId_reportHash: { sensorId: model.artifact.sensorId, reportHash } },
          update: {}, // Reimport is idempotent; never overwrite or silently re-enable a version.
          create: {
            ownerId,
            plotId: identity.plotId,
            deviceId: device.id,
            sensorId: model.artifact.sensorId,
            source: identity.source,
            version: model.artifact.version,
            reportHash,
            inputHash: publication.inputHash,
            datasetHash: publication.datasetHash,
            artifactHash: model.artifactHash,
            artifact: model.artifact as unknown as Prisma.InputJsonValue,
            evaluation: model.evaluation as unknown as Prisma.InputJsonValue,
            trainedUntil: new Date(`${model.artifact.trainedUntilExclusive}T00:00:00.000Z`),
            evaluatedThrough: publication.evaluatedThrough,
          },
          select: { id: true },
        });
        ids.push(row.id);
      }
      return ids;
    },
    { timeout: 30000 },
  );
}
