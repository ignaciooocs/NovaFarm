import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Harvester, HarvesterDocument } from './schemas/harvester.schema';
import {
  CreateHarvesterRequestDto,
  FindHarvesterRequestDto,
  HarvesterDto,
} from './dto';

@Injectable()
export class HarvestersService {
  constructor(
    @InjectModel(Harvester.name)
    private readonly harvesterModel: Model<Harvester>,
  ) {}

  async create(
    farmId: string,
    dto: CreateHarvesterRequestDto,
  ): Promise<HarvesterDto> {
    // firstName+lastName is not a uniqueness key — two different people can
    // share a name. No duplicate-collision handling here (unlike fruits).
    const created = await this.harvesterModel.create({
      farmId: new Types.ObjectId(farmId),
      firstName: dto.firstName,
      lastName: dto.lastName,
      nickname: dto.nickname,
      active: true,
    });

    return this.toDto(created);
  }

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
