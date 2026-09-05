import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/guards/farm-scope.guard';
import { HarvestEntry } from '../harvest-entries/schemas/harvest-entry.schema';
import { FruitsService } from '../fruits/fruits.service';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { UsersService } from '../users/users.service';
import { Workday, WorkdayDocument } from './schemas/workday.schema';
import {
  CreateWorkdayRequestDto,
  FindWorkdayRequestDto,
  WorkdayDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Maneja el ciclo de vida de una jornada de cosecha (workday): abrirla,
 * listarlas, buscar una por id, y cerrarla congelando el total en kilos
 * (RF-01.2).
 */
@Injectable()
export class WorkdaysService {
  constructor(
    @InjectModel(Workday.name) private readonly workdayModel: Model<Workday>,
    @InjectModel(HarvestEntry.name)
    private readonly harvestEntryModel: Model<HarvestEntry>,
    private readonly fruitsService: FruitsService,
    private readonly measurementUnitsService: MeasurementUnitsService,
    private readonly usersService: UsersService,
  ) {}

  // Abre una jornada nueva. Idempotente vía clientEntryId (mismo patrón que
  // harvester-workday/harvest-entries): si ya existe una jornada de esta
  // farm con ese clientEntryId, es un reintento — se devuelve la que ya
  // existe sin volver a validar ni crear nada. Si no, valida que la fruta y
  // la unidad de medida por defecto existan, estén activas, y pertenezcan a
  // la farm de quien llama (si no, 404). El recorder se resuelve del lado
  // del servidor (nunca viene del cliente) para que nadie pueda abrir una
  // jornada a nombre de otro usuario.
  async create(
    farmId: string,
    authUser: AuthenticatedUser,
    dto: CreateWorkdayRequestDto,
  ): Promise<WorkdayDto> {
    const existing = await this.workdayModel
      .findOne({
        farmId: new Types.ObjectId(farmId),
        clientEntryId: dto.clientEntryId,
      })
      .exec();
    if (existing) {
      return this.toDto(
        existing,
        await this.resolveRecorderName(existing.recorderId),
      );
    }

    const fruit = await this.fruitsService.findActiveById(farmId, dto.fruitId);
    if (!fruit) {
      throw new NotFoundException('Fruit not found in the caller farm catalog');
    }

    const measurementUnit = await this.measurementUnitsService.findActiveById(
      farmId,
      dto.defaultMeasurementUnitId,
    );
    if (!measurementUnit) {
      throw new NotFoundException(
        'Measurement unit not found in the caller farm catalog',
      );
    }

    const { recorderId, recorderName } = await this.resolveRecorder(authUser);

    try {
      const created = await this.workdayModel.create({
        farmId: new Types.ObjectId(farmId),
        date: new Date(dto.date),
        fruitId: new Types.ObjectId(dto.fruitId),
        defaultMeasurementUnitId: new Types.ObjectId(
          dto.defaultMeasurementUnitId,
        ),
        status: 'OPEN',
        createdAt: new Date(),
        recorderId,
        clientEntryId: dto.clientEntryId,
      });

      return this.toDto(created, recorderName);
    } catch (error) {
      // Carrera entre dos reintentos concurrentes del mismo clientEntryId
      // (el chequeo de arriba pasó para ambos antes de que ninguno
      // terminara de crear) — el índice único la resuelve, así que
      // re-consultamos y devolvemos la que ganó en vez de propagar el 500.
      if (this.isDuplicateKeyOn(error, 'clientEntryId')) {
        const raced = await this.workdayModel
          .findOne({
            farmId: new Types.ObjectId(farmId),
            clientEntryId: dto.clientEntryId,
          })
          .exec();
        if (raced) {
          return this.toDto(
            raced,
            await this.resolveRecorderName(raced.recorderId),
          );
        }
      }

      throw error;
    }
  }

  // Lista las jornadas de la farm, con filtro opcional por status (OPEN/CLOSED).
  // Los nombres de los recorders (RF: "quién anotó" en el historial de
  // ui-app) se resuelven en un solo lote por los _id distintos presentes en
  // la página de resultados, en vez de una consulta por jornada.
  async findAll(
    farmId: string,
    filter: FindWorkdayRequestDto,
  ): Promise<WorkdayDto[]> {
    const found = await this.workdayModel
      .find({
        farmId: new Types.ObjectId(farmId),
        ...(filter.status !== undefined ? { status: filter.status } : {}),
      })
      .exec();

    const recorderIds = [
      ...new Set(
        found
          .map((doc) => doc.recorderId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
    const namesById =
      recorderIds.length > 0
        ? await this.usersService.findNamesByIds(recorderIds)
        : new Map<string, string>();

    return found.map((doc) =>
      this.toDto(
        doc,
        doc.recorderId ? namesById.get(doc.recorderId.toString()) : undefined,
      ),
    );
  }

  // Busca una jornada por id dentro de la farm. A diferencia del
  // findActiveById de los catálogos, acá NO se filtra por status: quien
  // llama (por ejemplo el sync de harvester-workday/harvest-entries)
  // necesita distinguir "no existe" de "existe pero está cerrada", y eso
  // requiere ver la jornada aunque esté CLOSED.
  async findById(farmId: string, id: string): Promise<WorkdayDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const found = await this.workdayModel
      .findOne({ _id: id, farmId: new Types.ObjectId(farmId) })
      .exec();

    return found ? this.toDto(found) : null;
  }

  // Cierra una jornada (RF-01.2). Idempotente: si ya estaba cerrada, no
  // rechaza — devuelve el estado ya congelado tal cual. Esto es a propósito
  // (bug real encontrado en producción, 2026-09-03): si la respuesta del
  // primer cierre se pierde en el camino (señal inestable, mismo escenario
  // que POST /workdays), el cliente reintenta pensando que sigue abierta;
  // tratar el reintento como error dejaba a quien reintenta atascado viendo
  // "ya está cerrada" para siempre, sin forma de salir de ahí. No hay
  // riesgo de datos: el segundo llamado nunca recalcula, solo lee lo que ya
  // quedó congelado. Si sigue abierta, suma todos los totalKg de
  // harvestEntries de esa jornada y congela el resultado en finalTotalKg
  // junto con el nuevo status.
  async close(farmId: string, id: string): Promise<WorkdayDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Workday not found');
    }

    const workday = await this.workdayModel
      .findOne({ _id: id, farmId: new Types.ObjectId(farmId) })
      .exec();

    if (!workday) {
      throw new NotFoundException('Workday not found');
    }

    const recorderName = await this.resolveRecorderName(workday.recorderId);

    if (workday.status === 'CLOSED') {
      return this.toDto(workday, recorderName);
    }

    // $match acota la suma a los harvestEntries de esta jornada y farm;
    // $group con _id: null junta todos los que matchean en un solo
    // resultado. Se usa el $sum nativo de Mongo sobre Decimal128 en vez de
    // sumar en JavaScript para no perder precisión acumulando float error.
    const [aggregate] = await this.harvestEntryModel.aggregate<{
      total: Types.Decimal128;
    }>([
      {
        $match: {
          farmId: new Types.ObjectId(farmId),
          workdayId: workday._id,
        },
      },
      { $group: { _id: null, total: { $sum: '$totalKg' } } },
    ]);

    // Si la jornada no tuvo ninguna entrega, aggregate viene undefined —
    // en ese caso el total congelado queda en cero.
    const finalTotalKg = aggregate?.total ?? Types.Decimal128.fromString('0');

    // findOneAndUpdate con $set puntual, no fetch+mutate+save(): .save()
    // revalida el documento COMPLETO contra el schema actual, y cualquier
    // jornada abierta antes de que clientEntryId se volviera required
    // (2026-09-03) no lo tiene guardado — cerrarla con .save() la rechazaba
    // con un ValidationError por un campo que en ese momento ni existía
    // (bug real, encontrado en producción). findOneAndUpdate no corre
    // validadores por defecto (a diferencia de .save()), así que $set solo
    // toca finalTotalKg/status sin chocar con eso.
    const updated = await this.workdayModel
      .findOneAndUpdate(
        { _id: id, farmId: new Types.ObjectId(farmId) },
        { $set: { finalTotalKg, status: 'CLOSED' } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Workday not found');
    }

    return this.toDto(updated, recorderName);
  }

  // Si quien abre la jornada tiene el rol recorder asignado (sin importar
  // qué otros roles tenga, ni cuál sea su "modo activo" en la UI — el server
  // no conoce ese concepto, ver ui-arquitectura.md), resuelve su _id de
  // Mongo (y de paso su nombre, ya viene en el mismo documento — no hace
  // falta otra consulta) a partir del uid de Firebase (el token no trae el
  // _id de Mongo, solo el uid). Si no tiene ese rol (admin puro,
  // supervisor), la jornada queda en modo invitado (recorderId null) —
  // abrirla no alcanza para atribuírsela a un recorder específico.
  private async resolveRecorder(
    authUser: AuthenticatedUser,
  ): Promise<{ recorderId: Types.ObjectId | null; recorderName?: string }> {
    if (!authUser.roles.includes('recorder')) {
      return { recorderId: null };
    }

    const user = await this.usersService.findByFirebaseUid(authUser.uid);
    return user
      ? { recorderId: user._id, recorderName: user.name }
      : { recorderId: null };
  }

  // Resuelve el nombre de un recorder ya conocido (jornada existente/cerrada)
  // a partir de su _id — usado por create() en los caminos de retry/carrera
  // y por close(), donde solo se tiene el recorderId guardado, no el
  // documento del usuario. undefined para modo invitado (recorderId null),
  // sin consultar nada.
  private async resolveRecorderName(
    recorderId: Types.ObjectId | null | undefined,
  ): Promise<string | undefined> {
    if (!recorderId) {
      return undefined;
    }

    const names = await this.usersService.findNamesByIds([recorderId]);
    return names.get(recorderId.toString());
  }

  // Chequea si el error de Mongo es un choque de índice único sobre un
  // campo específico (código 11000 + keyPattern[field]).
  private isDuplicateKeyOn(error: unknown, field: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE &&
      'keyPattern' in error &&
      Boolean(
        (error as { keyPattern?: Record<string, unknown> }).keyPattern?.[field],
      )
    );
  }

  // Convierte el documento a DTO. finalTotalKg solo está presente si la
  // jornada ya se cerró; recorderId puede ser null (modo invitado).
  // recorderName se resuelve aparte (ver resolveRecorder/resolveRecorderName)
  // porque requiere el catálogo de usuarios, no vive en el documento de
  // Workday — undefined cuando no aplica (modo invitado).
  private toDto(doc: WorkdayDocument, recorderName?: string): WorkdayDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      date: doc.date.toISOString(),
      fruitId: doc.fruitId.toString(),
      defaultMeasurementUnitId: doc.defaultMeasurementUnitId.toString(),
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
      finalTotalKg: doc.finalTotalKg
        ? Number(doc.finalTotalKg.toString())
        : undefined,
      recorderId: doc.recorderId ? doc.recorderId.toString() : null,
      recorderName,
      clientEntryId: doc.clientEntryId,
    };
  }
}
