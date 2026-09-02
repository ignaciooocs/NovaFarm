import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MeasurementUnit,
  MeasurementUnitDocument,
} from './schemas/measurement-unit.schema';
import {
  CreateMeasurementUnitRequestDto,
  FindMeasurementUnitRequestDto,
  MeasurementUnitDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Catálogo de unidades de medida de una farm (envases o pesaje directo),
 * cada una con su factor de conversión a kilos (kgFactor).
 */
@Injectable()
export class MeasurementUnitsService {
  constructor(
    @InjectModel(MeasurementUnit.name)
    private readonly measurementUnitModel: Model<MeasurementUnit>,
  ) {}

  // Crea una unidad de medida nueva. kgFactor llega como number pero se
  // guarda como Decimal128 para no perder precisión en los totalKg que se
  // calculan a partir de esta unidad. Si el nombre ya existe para la farm
  // (índice único {farmId, name}), devuelve 409.
  async create(
    farmId: string,
    dto: CreateMeasurementUnitRequestDto,
  ): Promise<MeasurementUnitDto> {
    try {
      const created = await this.measurementUnitModel.create({
        farmId: new Types.ObjectId(farmId),
        name: dto.name,
        kgFactor: Types.Decimal128.fromString(dto.kgFactor.toString()),
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
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      kgFactor: Number(doc.kgFactor.toString()),
      active: doc.active,
    };
  }
}
