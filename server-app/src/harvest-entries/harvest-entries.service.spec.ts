import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HarvesterWorkdayService } from '../harvester-workday/harvester-workday.service';
import { HarvestersService } from '../harvesters/harvesters.service';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { WorkdaysService } from '../workdays/workdays.service';
import { HarvestEntry } from './schemas/harvest-entry.schema';
import { HarvestEntriesService } from './harvest-entries.service';

// Forma de las operaciones que sync() le manda a bulkWrite. Tipada acá (en
// vez de leer `mock.calls` como any) para poder afirmar sobre los campos sin
// pelear con las reglas de no-unsafe-member-access.
interface BulkOperation {
  updateOne: {
    filter: Record<string, unknown>;
    update: Record<string, Record<string, unknown>>;
    upsert?: boolean;
  };
}

interface QueryChain {
  select: () => QueryChain;
  exec: () => Promise<unknown>;
}

describe('HarvestEntriesService', () => {
  let harvestEntriesService: HarvestEntriesService;
  let bulkOperations: BulkOperation[];

  const harvestEntryModel = {
    find: jest.fn(),
    bulkWrite: jest.fn(),
  };

  const harvestersService = {
    findActiveIdsIn: jest.fn(),
  };

  const measurementUnitsService = {
    findAll: jest.fn(),
  };

  const workdaysService = {
    findById: jest.fn(),
  };

  const harvesterWorkdayService = {
    findRosterHarvesterIds: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';
  const workdayId = new Types.ObjectId().toString();
  const harvesterId = new Types.ObjectId().toString();
  const measurementUnitId = new Types.ObjectId().toString();

  // Consulta encadenable: sync() usa .find().exec() para lo ya existente y
  // .find().select().exec() para resolver los _id de lo recién insertado.
  function query(result: unknown): QueryChain {
    const chain: QueryChain = {
      select: () => chain,
      exec: () => Promise.resolve(result),
    };

    return chain;
  }

  const countUnit = {
    _id: measurementUnitId,
    mode: 'COUNT',
    kgFactor: 10,
    active: true,
  };

  const weightUnit = {
    _id: measurementUnitId,
    mode: 'WEIGHT',
    kgFactor: null,
    active: true,
  };

  // Jornada abierta, cosechador activo y en el roster, catálogo con la
  // unidad indicada, y nada previamente sincronizado salvo lo que se pase.
  function mockOpenWorkday({
    unit = countUnit,
    existing = [] as unknown[],
    created = [] as unknown[],
    activeHarvesters = [harvesterId],
    roster = [harvesterId],
  } = {}) {
    workdaysService.findById.mockResolvedValue({ status: 'OPEN' });
    // mockReset y no clearAllMocks: este ultimo NO vacia la cola de
    // mockReturnValueOnce, asi que un test que deja un valor sin consumir se
    // lo pasa al siguiente.
    harvestEntryModel.find.mockReset();
    harvestEntryModel.find
      .mockReturnValueOnce(query(existing))
      .mockReturnValueOnce(query(created));
    harvestersService.findActiveIdsIn.mockResolvedValue(
      new Set(activeHarvesters),
    );
    harvesterWorkdayService.findRosterHarvesterIds.mockResolvedValue(
      new Set(roster),
    );
    measurementUnitsService.findAll.mockResolvedValue([unit]);
  }

  function insertedFields(index = 0): Record<string, unknown> {
    return bulkOperations[index].updateOne.update.$setOnInsert;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    bulkOperations = [];
    harvestEntryModel.bulkWrite.mockImplementation(
      (operations: BulkOperation[]) => {
        bulkOperations = operations;
        return Promise.resolve({});
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HarvestEntriesService,
        {
          provide: getModelToken(HarvestEntry.name),
          useValue: harvestEntryModel,
        },
        { provide: HarvestersService, useValue: harvestersService },
        {
          provide: MeasurementUnitsService,
          useValue: measurementUnitsService,
        },
        { provide: WorkdaysService, useValue: workdaysService },
        {
          provide: HarvesterWorkdayService,
          useValue: harvesterWorkdayService,
        },
      ],
    }).compile();

    harvestEntriesService = module.get(HarvestEntriesService);
  });

  describe('sync', () => {
    const entries = [
      {
        clientEntryId: 'local-1',
        harvesterId,
        measurementUnitId,
        unitCount: 3,
        recordedAt: '2026-09-02T09:15:00.000Z',
      },
    ];

    it('rejects every entry when the workday does not exist for the caller farm', async () => {
      workdaysService.findById.mockResolvedValue(null);

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'rejected',
          reasonCode: 'WORKDAY_NOT_FOUND',
          reason: 'Workday not found',
        },
      ]);
      expect(harvestEntryModel.find).not.toHaveBeenCalled();
      expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('rejects every entry when the workday is already closed', async () => {
      workdaysService.findById.mockResolvedValue({ status: 'CLOSED' });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result[0].status).toEqual('rejected');
      expect(result[0].reasonCode).toEqual('WORKDAY_CLOSED');
      expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('rejects when the harvester does not exist or is inactive in the caller farm', async () => {
      mockOpenWorkday({ activeHarvesters: [] });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result[0].status).toEqual('rejected');
      expect(result[0].reason).toEqual(
        'Harvester not found in the caller farm roster',
      );
      expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('rejects when the harvester is not on the workday roster', async () => {
      mockOpenWorkday({ roster: [] });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result[0].status).toEqual('rejected');
      expect(result[0].reason).toEqual(
        'Harvester is not on this workday roster',
      );
      expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('rejects when the measurement unit is not in the caller farm active catalog', async () => {
      mockOpenWorkday();
      measurementUnitsService.findAll.mockResolvedValue([]);

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(result[0].status).toEqual('rejected');
      expect(result[0].reason).toEqual(
        'Measurement unit not found in the caller farm catalog',
      );
      expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('creates an entry and computes totalKg from unitCount x kgFactor', async () => {
      const createdId = new Types.ObjectId();
      mockOpenWorkday({
        created: [{ _id: createdId, clientEntryId: 'local-1' }],
      });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(insertedFields()).toEqual(
        expect.objectContaining({
          unitCount: Types.Decimal128.fromString('3'),
          totalKg: Types.Decimal128.fromString('30'),
          syncedOffline: true,
        }),
      );
      // El clientEntryId va en el filtro del upsert, no en $setOnInsert:
      // Mongo lo escribe solo al insertar, desde el propio filtro.
      expect(bulkOperations[0].updateOne.filter).toEqual({
        workdayId: new Types.ObjectId(workdayId),
        clientEntryId: 'local-1',
      });
      expect(bulkOperations[0].updateOne.upsert).toBe(true);
      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'created',
          _id: createdId.toString(),
        },
      ]);
    });

    // Este es el test de regresión del bug del 2026-09-09: el costo del
    // lote no puede crecer con la cantidad de anotaciones. Antes eran ~5
    // consultas POR entrada (y con 98 anotaciones el cliente cortaba por
    // timeout antes de que el server terminara).
    it('resolves the whole batch with a fixed number of queries, however many entries it carries', async () => {
      const manyEntries = Array.from({ length: 50 }, (_, index) => ({
        ...entries[0],
        clientEntryId: `local-${index}`,
      }));
      mockOpenWorkday({
        created: manyEntries.map((entry) => ({
          _id: new Types.ObjectId(),
          clientEntryId: entry.clientEntryId,
        })),
      });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        manyEntries,
      );

      expect(result).toHaveLength(50);
      expect(result.every((item) => item.status === 'created')).toBe(true);
      // Una consulta para lo ya existente + una para los _id recién creados.
      expect(harvestEntryModel.find).toHaveBeenCalledTimes(2);
      // Una sola escritura para las 50.
      expect(harvestEntryModel.bulkWrite).toHaveBeenCalledTimes(1);
      expect(bulkOperations).toHaveLength(50);
      // Y una sola consulta a cada catálogo, no una por entrada.
      expect(harvestersService.findActiveIdsIn).toHaveBeenCalledTimes(1);
      expect(
        harvesterWorkdayService.findRosterHarvesterIds,
      ).toHaveBeenCalledTimes(1);
      expect(measurementUnitsService.findAll).toHaveBeenCalledTimes(1);
    });

    // Modo WEIGHT: un capacho pesado en la romana. La entrega es UN envase
    // (unitCount 1) y los kilos los pone el cliente, no un factor del
    // catálogo — es el caso que antes obligaba a inventar "capacho 1kg" y
    // guardaba 22,1 en unitCount, o sea "22,1 capachos".
    describe('WEIGHT units', () => {
      it('takes totalKg from the weight on the scale, as one container', async () => {
        mockOpenWorkday({ unit: weightUnit });

        await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], unitCount: 1, weightKg: 22.1 },
        ]);

        expect(insertedFields()).toEqual(
          expect.objectContaining({
            unitCount: Types.Decimal128.fromString('1'),
            totalKg: Types.Decimal128.fromString('22.1'),
          }),
        );
      });

      it('takes the sign from unitCount, not from the weight, so a discount subtracts kilos', async () => {
        mockOpenWorkday({ unit: weightUnit });

        await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], unitCount: -1, weightKg: 22.1 },
        ]);

        expect(insertedFields()).toEqual(
          expect.objectContaining({
            unitCount: Types.Decimal128.fromString('-1'),
            totalKg: Types.Decimal128.fromString('-22.1'),
          }),
        );
      });

      it('rejects the entry when weightKg is missing, instead of storing made-up kilos', async () => {
        mockOpenWorkday({ unit: weightUnit });

        const result = await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], unitCount: 1 },
        ]);

        expect(result[0].status).toBe('rejected');
        expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
      });
    });

    it('returns already-synced when retried with the same clientEntryId, without writing anything', async () => {
      const existingId = new Types.ObjectId();
      mockOpenWorkday({
        existing: [{ _id: existingId, clientEntryId: 'local-1' }],
      });

      const result = await harvestEntriesService.sync(
        farmId,
        workdayId,
        entries,
      );

      expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          clientEntryId: 'local-1',
          status: 'already-synced',
          _id: existingId.toString(),
        },
      ]);
    });

    // Peso de control (measuredKg): el envase de peso fijo vale 10,0 kg de
    // catálogo y alguien deja anotado que esa vuelta trajo otra cosa. Es un
    // dato aparte — no toca totalKg ni el pago.
    describe('control weight on COUNT units', () => {
      it('stores the weighed kilos without letting them touch totalKg', async () => {
        mockOpenWorkday({
          created: [{ _id: new Types.ObjectId(), clientEntryId: 'local-1' }],
        });

        await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], unitCount: 1, measuredKg: 10.4 },
        ]);

        expect(insertedFields()).toEqual(
          expect.objectContaining({
            // El total sigue saliendo del factor del catálogo (1 x 10), no
            // de lo que marcó la romana.
            totalKg: Types.Decimal128.fromString('10'),
            measuredKg: Types.Decimal128.fromString('10.4'),
          }),
        );
      });

      it('stores null when nobody weighed the delivery', async () => {
        mockOpenWorkday({
          created: [{ _id: new Types.ObjectId(), clientEntryId: 'local-1' }],
        });

        await harvestEntriesService.sync(farmId, workdayId, entries);

        expect(insertedFields()).toEqual(
          expect.objectContaining({ measuredKg: null }),
        );
      });

      it('rejects a control weight on a WEIGHT unit, where the scale reading is already the total', async () => {
        mockOpenWorkday({ unit: weightUnit });

        const result = await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], unitCount: 1, weightKg: 22.1, measuredKg: 22.1 },
        ]);

        expect(result[0].status).toEqual('rejected');
        expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
      });

      // El anotador le sacó el peso que le había puesto. Sin esto, la
      // pantalla lo dejaba de mostrar pero en la base seguía vivo (bug real,
      // visto en Atlas el 2026-09-09): el cliente mandaba `undefined` en vez
      // de `null` y el server solo escribía si venía un número.
      it('clears the stored weight when the device sends null', async () => {
        const existingId = new Types.ObjectId();
        mockOpenWorkday({
          existing: [
            {
              _id: existingId,
              clientEntryId: 'local-1',
              measuredKg: Types.Decimal128.fromString('10.4'),
            },
          ],
        });

        const result = await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], measuredKg: null },
        ]);

        expect(bulkOperations).toEqual([
          {
            updateOne: {
              filter: { _id: existingId },
              update: { $set: { measuredKg: null } },
            },
          },
        ]);
        expect(result[0].status).toEqual('already-synced');
      });

      it('does not rewrite the weight when it already matches what the device sends', async () => {
        mockOpenWorkday({
          existing: [
            {
              _id: new Types.ObjectId(),
              clientEntryId: 'local-1',
              measuredKg: Types.Decimal128.fromString('10.4'),
            },
          ],
        });

        await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], measuredKg: 10.4 },
        ]);

        expect(harvestEntryModel.bulkWrite).not.toHaveBeenCalled();
      });

      // El cliente manda el campo en TODAS sus anotaciones (null = sin
      // peso), así que rechazar por "trae el campo" en vez de por "trae un
      // peso" tumbaría toda entrega hecha con un envase que se pesa.
      it('accepts a null weight on a WEIGHT unit instead of rejecting the entry', async () => {
        mockOpenWorkday({
          unit: weightUnit,
          created: [{ _id: new Types.ObjectId(), clientEntryId: 'local-1' }],
        });

        const result = await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], unitCount: 1, weightKg: 22.1, measuredKg: null },
        ]);

        expect(result[0].status).toEqual('created');
        expect(insertedFields()).toEqual(
          expect.objectContaining({ measuredKg: null }),
        );
      });

      it('updates only the control weight when an already-synced entry is weighed afterwards', async () => {
        const existingId = new Types.ObjectId();
        mockOpenWorkday({
          existing: [{ _id: existingId, clientEntryId: 'local-1' }],
        });

        const result = await harvestEntriesService.sync(farmId, workdayId, [
          { ...entries[0], measuredKg: 10.4 },
        ]);

        expect(bulkOperations).toEqual([
          {
            updateOne: {
              filter: { _id: existingId },
              update: {
                $set: { measuredKg: Types.Decimal128.fromString('10.4') },
              },
            },
          },
        ]);
        expect(result[0].status).toEqual('already-synced');
      });
    });

    it('swallows a duplicate-key clash from a concurrent retry, but not any other write error', async () => {
      mockOpenWorkday({
        created: [{ _id: new Types.ObjectId(), clientEntryId: 'local-1' }],
      });
      harvestEntryModel.bulkWrite.mockRejectedValueOnce({
        writeErrors: [{ code: 11000 }],
      });

      await expect(
        harvestEntriesService.sync(farmId, workdayId, entries),
      ).resolves.toHaveLength(1);

      mockOpenWorkday();
      harvestEntryModel.bulkWrite.mockRejectedValueOnce(
        new Error('connection lost'),
      );

      await expect(
        harvestEntriesService.sync(farmId, workdayId, entries),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('findAll', () => {
    it('lists entries scoped to the caller farm and workday', async () => {
      harvestEntryModel.find.mockReturnValue(query([]));

      await harvestEntriesService.findAll(farmId, workdayId);

      expect(harvestEntryModel.find).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        workdayId: new Types.ObjectId(workdayId),
      });
    });
  });
});
