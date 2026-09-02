import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Harvester, HarvesterDocument } from './schemas/harvester.schema';
import {
  CreateHarvesterRequestDto,
  FindHarvesterRequestDto,
  HarvesterDto,
} from './dto';

/**
 * Catálogo de cosechadores (trabajadores) de una farm — registro rápido en
 * campo, sin validar nombres duplicados: dos personas distintas pueden
 * compartir nombre, así que no hay nada que "chocar" ahí.
 */
@Injectable()
export class HarvestersService {
  constructor(
    @InjectModel(Harvester.name)
    private readonly harvesterModel: Model<Harvester>,
  ) {}

  // Crea un cosechador nuevo en el roster de la farm.
  async create(
    farmId: string,
    dto: CreateHarvesterRequestDto,
  ): Promise<HarvesterDto> {
    // firstName+lastName no es una clave de unicidad — dos personas
    // distintas pueden compartir el mismo nombre. Por eso, a diferencia de
    // fruits, acá no se maneja colisión de duplicados.
    const created = await this.harvesterModel.create({
      farmId: new Types.ObjectId(farmId),
      firstName: dto.firstName,
      lastName: dto.lastName,
      nickname: dto.nickname,
      active: true,
    });

    return this.toDto(created);
  }

  // Lista los cosechadores de la farm, con filtro opcional por estado activo/inactivo.
  async findAll(
    farmId: string,
    filter: FindHarvesterRequestDto,
  ): Promise<HarvesterDto[]> {
    const found = await this.harvesterModel
      .find({
        farmId: new Types.ObjectId(farmId),
        ...(filter.active !== undefined ? { active: filter.active } : {}),
      })
      .exec();

    return found.map((doc) => this.toDto(doc));
  }

  // Busca un cosechador por id, pero solo si está activo y pertenece a la
  // farm indicada. Se usa desde otros módulos (harvester-workday,
  // harvest-entries) para validar referencias sin exponerles el modelo de
  // Mongoose directamente.
  async findActiveById(
    farmId: string,
    id: string,
  ): Promise<HarvesterDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const found = await this.harvesterModel
      .findOne({
        _id: id,
        farmId: new Types.ObjectId(farmId),
        active: true,
      })
      .exec();

    return found ? this.toDto(found) : null;
  }

  // Convierte el documento a DTO. nationalId queda fuera a propósito: es un
  // dato sensible que no se pide en el registro rápido y no se expone acá
  // (además el schema lo marca select: false).
  private toDto(doc: HarvesterDocument): HarvesterDto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      firstName: doc.firstName,
      lastName: doc.lastName,
      nickname: doc.nickname,
      active: doc.active,
    };
  }
}
