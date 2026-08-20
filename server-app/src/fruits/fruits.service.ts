import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fruit, FruitDocument } from './schemas/fruit.schema';
import { CreateFruitRequestDto, FindFruitRequestDto, FruitDto } from './dto';

// Mongo duplicate-key error code.
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class FruitsService {
  constructor(
    @InjectModel(Fruit.name) private readonly fruitModel: Model<Fruit>,
  ) {}

  async create(farmId: string, dto: CreateFruitRequestDto): Promise<FruitDto> {
    try {
      const created = await this.fruitModel.create({
        farmId: new Types.ObjectId(farmId),
        name: dto.name,
        active: true,
      });

      return this.toDto(created);
    } catch (error) {
      if (this.isDuplicateNameError(error)) {
        throw new ConflictException(
          'A fruit with this name already exists for this farm',
        );
      }

      throw error;
    }
  }

  async findAll(
    farmId: string,
    filter: FindFruitRequestDto,
  ): Promise<FruitDto[]> {
    const found = await this.fruitModel
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

  private toDto(doc: FruitDocument): FruitDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      active: doc.active,
    };
  }
}
