import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Harvester, HarvesterDocument } from './schemas/harvester.schema';
import {
  CreateHarvesterRequestDto,
  FindHarvesterRequestDto,
  HarvesterDto,
  UpdateHarvesterRequestDto,
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

  // Edita datos y/o estado activo (RF-03.3: editar/desactivar catálogo). A
  // diferencia de findActiveById, no filtra por active — así también sirve
  // para reactivar a alguien que estaba desactivado. Sin choque de nombre
  // duplicado que manejar acá (ver el comentario en create(): firstName +
  // lastName nunca fue una clave de unicidad). Devuelve null si el id no es
  // válido o no pertenece a la farm (el controller decide si eso es un 404).
  //
  // nickname es el único campo opcional-editable: omitido = no tocar,
  // string = reemplazar, null explícito = borrar el que tenía ($unset —
  // $set con undefined no alcanza, Mongo lo descarta silenciosamente).
  async update(
    farmId: string,
    id: string,
    dto: UpdateHarvesterRequestDto,
  ): Promise<HarvesterDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const changes: Partial<Pick<Harvester, 'firstName' | 'lastName' | 'active'>> &
      { nickname?: string } = {};
    const unset: Record<string, 1> = {};

    if (dto.firstName !== undefined) {
      changes.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      changes.lastName = dto.lastName;
    }
    if (dto.nickname === null) {
      unset.nickname = 1;
    } else if (dto.nickname !== undefined) {
      changes.nickname = dto.nickname;
    }
    if (dto.active !== undefined) {
      changes.active = dto.active;
    }

    const updated = await this.harvesterModel
      .findOneAndUpdate(
        { _id: id, farmId: new Types.ObjectId(farmId) },
        { $set: changes, $unset: unset },
        { new: true },
      )
      .exec();

    return updated ? this.toDto(updated) : null;
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
