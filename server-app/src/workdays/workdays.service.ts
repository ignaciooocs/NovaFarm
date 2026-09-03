import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      return this.toDto(existing);
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

    const recorderId = await this.resolveRecorderId(authUser);

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

      return this.toDto(created);
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
          return this.toDto(raced);
        }
      }

      throw error;
    }
  }

  // Lista las jornadas de la farm, con filtro opcional por status (OPEN/CLOSED).
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

    return found.map((doc) => this.toDto(doc));
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

  // Cierra una jornada (RF-01.2). Si ya estaba cerrada, rechaza con 409 (no
  // se puede volver a cerrar ni reabrir). Si sigue abierta, suma todos los
  // totalKg de harvestEntries de esa jornada y congela el resultado en
  // finalTotalKg junto con el nuevo status.
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

    if (workday.status === 'CLOSED') {
      throw new ConflictException('Workday is already closed');
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
    workday.finalTotalKg = aggregate?.total ?? Types.Decimal128.fromString('0');
    workday.status = 'CLOSED';
    await workday.save();

    return this.toDto(workday);
  }

  // Si quien abre la jornada es un recorder, resuelve su _id de Mongo a
  // partir del uid de Firebase (el token no trae el _id de Mongo, solo el
  // uid). Si es un admin, la jornada queda en modo invitado (recorderId
  // null) — abrirla no alcanza para atribuírsela a un recorder específico.
  private async resolveRecorderId(
    authUser: AuthenticatedUser,
  ): Promise<Types.ObjectId | null> {
    if (authUser.role !== 'recorder') {
      return null;
    }

    const user = await this.usersService.findByFirebaseUid(authUser.uid);
    return user ? user._id : null;
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
  private toDto(doc: WorkdayDocument): WorkdayDto {
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
      clientEntryId: doc.clientEntryId,
    };
  }
}
