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

// Mongo duplicate-key error code.
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class MeasurementUnitsService {
  constructor(
    @InjectModel(MeasurementUnit.name)
    private readonly measurementUnitModel: Model<MeasurementUnit>,
  ) {}

  async create(
    farmId: string,
    dto: CreateMeasurementUnitRequestDto,
  ): Promise<MeasurementUnitDto> {
    try {
      const created = await this.measurementUnitModel.create({
        farmId: new Types.ObjectId(farmId),
        name: dto.name,
        kgFactor: Types.Decimal128.fromString(String(dto.kgFactor)),
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

  private toDto(doc: MeasurementUnitDocument): MeasurementUnitDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      kgFactor: doc.kgFactor.toString(),
      active: doc.active,
    };
  }
}
