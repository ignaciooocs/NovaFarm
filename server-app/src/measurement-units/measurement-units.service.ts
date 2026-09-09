import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MeasurementUnit,
  MeasurementUnitDocument,
  MeasurementUnitMode,
} from './schemas/measurement-unit.schema';
import {
  CreateMeasurementUnitRequestDto,
  FindMeasurementUnitRequestDto,
  MeasurementUnitDto,
  UpdateMeasurementUnitRequestDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Catálogo de unidades de medida de una farm. Cada una declara cómo se
 * anota una entrega hecha con ella (`mode`, ver measurement-unit.schema.ts):
 * COUNT cuenta envases de peso fijo y convierte con `kgFactor`, WEIGHT pesa
 * el envase en cada vuelta y no usa factor.
 */
@Injectable()
export class MeasurementUnitsService {
  constructor(
    @InjectModel(MeasurementUnit.name)
    private readonly measurementUnitModel: Model<MeasurementUnit>,
  ) {}

  // Crea una unidad de medida nueva. kgFactor llega como number pero se
  // guarda como Decimal128 para no perder precisión en los totalKg que se
  // calculan a partir de esta unidad; en modo WEIGHT no hay factor que
  // guardar (los kilos salen de la romana en cada anotación) y queda null.
  // Si el nombre ya existe para la farm (índice único {farmId, name}),
  // devuelve 409.
  async create(
    farmId: string,
    dto: CreateMeasurementUnitRequestDto,
  ): Promise<MeasurementUnitDto> {
    // El @ValidateIf del DTO ya lo exige para COUNT; esto es el mismo
    // chequeo del lado del servicio, y de paso le da el narrowing a TS.
    if (dto.mode === 'COUNT' && dto.kgFactor === undefined) {
      throw new BadRequestException(
        'kgFactor is required for COUNT measurement units',
      );
    }

    try {
      const created = await this.measurementUnitModel.create({
        farmId: new Types.ObjectId(farmId),
        name: dto.name,
        mode: dto.mode,
        kgFactor:
          dto.mode === 'WEIGHT' || dto.kgFactor === undefined
            ? null
            : Types.Decimal128.fromString(dto.kgFactor.toString()),
        active: true,
      });

      return this.toDto(created);
    } catch (error) {
      if (this.isDuplicateNameError(error)) {
        throw new ConflictException(
          'A measurement unit with this name already exists for this farm',
        );
      }

      throw error;
    }
  }

  // Lista las unidades de medida de la farm, con filtro opcional por estado activo/inactivo.
  async findAll(
    farmId: string,
    filter: FindMeasurementUnitRequestDto,
  ): Promise<MeasurementUnitDto[]> {
    const found = await this.measurementUnitModel
      .find({
        farmId: new Types.ObjectId(farmId),
        ...(filter.active !== undefined ? { active: filter.active } : {}),
      })
      .exec();

    return found.map((doc) => this.toDto(doc));
  }

  // Busca una unidad de medida por id, pero solo si está activa y pertenece
  // a la farm indicada. Se usa desde otros módulos (workdays, harvest-entries)
  // para validar referencias sin exponerles el modelo de Mongoose directamente.
  async findActiveById(
    farmId: string,
    id: string,
  ): Promise<MeasurementUnitDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const found = await this.measurementUnitModel
      .findOne({
        _id: id,
        farmId: new Types.ObjectId(farmId),
        active: true,
      })
      .exec();

    return found ? this.toDto(found) : null;
  }

  // Edita nombre, modo, kgFactor y/o estado activo (RF-03.3: editar/desactivar
  // catálogo). A diferencia de findActiveById, no filtra por active — así
  // también sirve para reactivar una unidad que estaba desactivada.
  // kgFactor se vuelve a convertir a Decimal128 igual que en create(), por
  // la misma razón (evitar drift de precisión en los totalKg calculados).
  // Devuelve null si el id no es válido o no pertenece a la farm (el
  // controller decide si eso es un 404). Mismo manejo de choque de nombre
  // duplicado que create().
  async update(
    farmId: string,
    id: string,
    dto: UpdateMeasurementUnitRequestDto,
  ): Promise<MeasurementUnitDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const changes: Partial<
      Pick<MeasurementUnit, 'name' | 'mode' | 'kgFactor' | 'active'>
    > = {};
    if (dto.name !== undefined) {
      changes.name = dto.name;
    }
    if (dto.active !== undefined) {
      changes.active = dto.active;
    }

    // Tocar modo o factor obliga a mirar cómo está la unidad hoy: pasar a
    // COUNT sin un kgFactor (ni en este request ni ya guardado) dejaría una
    // unidad incapaz de calcular kilos. Esta lectura extra solo se paga
    // cuando el request realmente los toca — renombrar o desactivar, que es
    // el caso común, no la necesita.
    if (dto.mode !== undefined || dto.kgFactor !== undefined) {
      const current = await this.findAnyById(farmId, id);
      if (!current) {
        return null;
      }

      const mode = dto.mode ?? current.mode;
      const kgFactor = dto.kgFactor ?? current.kgFactor ?? null;

      if (mode === 'COUNT' && kgFactor === null) {
        throw new BadRequestException(
          'kgFactor is required for COUNT measurement units',
        );
      }

      changes.mode = mode;
      changes.kgFactor =
        mode === 'WEIGHT' || kgFactor === null
          ? null
          : Types.Decimal128.fromString(kgFactor.toString());
    }

    try {
      const updated = await this.measurementUnitModel
        .findOneAndUpdate(
          { _id: id, farmId: new Types.ObjectId(farmId) },
          { $set: changes },
          { new: true },
        )
        .exec();

      return updated ? this.toDto(updated) : null;
    } catch (error) {
      if (this.isDuplicateNameError(error)) {
        throw new ConflictException(
          'A measurement unit with this name already exists for this farm',
        );
      }

      throw error;
    }
  }

  // Como findActiveById pero sin filtrar por active — update() necesita ver
  // el estado actual de una unidad aunque esté desactivada.
  private async findAnyById(
    farmId: string,
    id: string,
  ): Promise<MeasurementUnitDto | null> {
    const found = await this.measurementUnitModel
      .findOne({ _id: id, farmId: new Types.ObjectId(farmId) })
      .exec();

    return found ? this.toDto(found) : null;
  }

  // Chequea si el error de Mongo es específicamente un choque en el índice
  // único {farmId, name} (código 11000 + keyPattern.name).
  private isDuplicateNameError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE &&
      'keyPattern' in error &&
      Boolean(
        (error as { keyPattern?: Record<string, unknown> }).keyPattern?.name,
      )
    );
  }

  // Convierte el documento a DTO, incluyendo kgFactor de Decimal128 a number.
  private toDto(doc: MeasurementUnitDocument): MeasurementUnitDto {
    const kgFactor =
      doc.kgFactor !== undefined && doc.kgFactor !== null
        ? Number(doc.kgFactor.toString())
        : null;
    // Unidad guardada antes de que `mode` existiera: se deduce del sentinel
    // que usaba la app en ese entonces (kgFactor === 1 significaba pesaje
    // directo).
    // Mismo patrón `??` que products.icon o recordersCanManageCatalog: un
    // documento viejo no se backfillea a mano para poder leerse.
    const mode: MeasurementUnitMode =
      doc.mode ?? (kgFactor === 1 ? 'WEIGHT' : 'COUNT');

    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      mode,
      kgFactor: mode === 'WEIGHT' ? null : kgFactor,
      active: doc.active,
    };
  }
}
