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

  async create(
    farmId: string,
    authUser: AuthenticatedUser,
    dto: CreateWorkdayRequestDto,
  ): Promise<WorkdayDto> {
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
    });

    return this.toDto(created);
  }

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

  async findById(farmId: string, id: string): Promise<WorkdayDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const found = await this.workdayModel
      .findOne({ _id: id, farmId: new Types.ObjectId(farmId) })
      .exec();

    return found ? this.toDto(found) : null;
  }

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

    workday.finalTotalKg = aggregate?.total ?? Types.Decimal128.fromString('0');
    workday.status = 'CLOSED';
    await workday.save();

    return this.toDto(workday);
  }

  private async resolveRecorderId(
    authUser: AuthenticatedUser,
  ): Promise<Types.ObjectId | null> {
    if (authUser.role !== 'recorder') {
      return null;
    }

    const user = await this.usersService.findByFirebaseUid(authUser.uid);
    return user ? user._id : null;
  }

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
    };
  }
}
