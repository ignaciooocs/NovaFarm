import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fruit, FruitDocument } from './schemas/fruit.schema';
import {
  CreateFruitRequestDto,
  FindFruitRequestDto,
  FruitDto,
  UpdateFruitRequestDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Catálogo de frutas de una farm (RF-03.3): crear, listar, y buscar por id
 * validando que esté activa y pertenezca a la farm de quien llama.
 */
@Injectable()
export class FruitsService {
  constructor(
    @InjectModel(Fruit.name) private readonly fruitModel: Model<Fruit>,
  ) {}

  // Crea una fruta nueva en el catálogo de la farm. Si el nombre ya existe
  // para esa farm (índice único {farmId, name}), devuelve 409 en vez de
  // dejar que el error crudo de Mongo se propague.
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

  // Lista las frutas de la farm, con filtro opcional por estado activo/inactivo.
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

  // Busca una fruta por id, pero solo si está activa y pertenece a la farm
  // indicada. Se usa desde otros módulos (por ejemplo workdays) para validar
  // referencias sin exponerles el modelo de Mongoose directamente.
  async findActiveById(farmId: string, id: string): Promise<FruitDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const found = await this.fruitModel
      .findOne({
        _id: id,
        farmId: new Types.ObjectId(farmId),
        active: true,
      })
      .exec();

    return found ? this.toDto(found) : null;
  }

  // Edita nombre y/o estado activo (RF-03.3: editar/desactivar catálogo).
  // A diferencia de findActiveById, no filtra por active — así también
  // sirve para reactivar una fruta que estaba desactivada. Devuelve null si
  // el id no es válido o no pertenece a la farm (el controller decide si
  // eso es un 404). Mismo manejo de choque de nombre duplicado que create().
  async update(
    farmId: string,
    id: string,
    dto: UpdateFruitRequestDto,
  ): Promise<FruitDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const changes: Partial<Pick<Fruit, 'name' | 'active'>> = {};
    if (dto.name !== undefined) {
      changes.name = dto.name;
    }
    if (dto.active !== undefined) {
      changes.active = dto.active;
    }

    try {
      const updated = await this.fruitModel
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
          'A fruit with this name already exists for this farm',
        );
      }

      throw error;
    }
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

  // Convierte el documento de Mongoose al DTO de respuesta.
  private toDto(doc: FruitDocument): FruitDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      active: doc.active,
    };
  }
}
