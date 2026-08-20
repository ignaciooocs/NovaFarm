import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';
import { Farm, FarmDocument } from './schemas/farm.schema';
import { CreateFarmRequestDto, FarmDto } from './dto';

const INVITATION_CODE_LENGTH = 8;
const INVITATION_CODE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid ambiguity when read aloud/typed
const MAX_INVITATION_CODE_ATTEMPTS = 5;

// Mongo duplicate-key error code.
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

@Injectable()
export class FarmsService {
  constructor(
    @InjectModel(Farm.name) private readonly farmModel: Model<Farm>,
  ) {}

  async create(dto: CreateFarmRequestDto): Promise<FarmDto> {
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt < MAX_INVITATION_CODE_ATTEMPTS;
      attempt++
    ) {
      const invitationCode = this.generateInvitationCode();

      try {
        const created = await this.farmModel.create({
          name: dto.name,
          type: dto.type,
          invitationCode,
          active: true,
        });

        return this.toDto(created);
      } catch (error) {
        if (this.isDuplicateInvitationCodeError(error)) {
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      `Failed to generate a unique invitationCode after ${MAX_INVITATION_CODE_ATTEMPTS} attempts`,
      { cause: lastError },
    );
  }

  private generateInvitationCode(): string {
    let code = '';
    for (let i = 0; i < INVITATION_CODE_LENGTH; i++) {
      code += INVITATION_CODE_ALPHABET[
        randomInt(INVITATION_CODE_ALPHABET.length)
      ];
    }
    return code;
  }

  private isDuplicateInvitationCodeError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE &&
      'keyPattern' in error &&
      Boolean(
        (error as { keyPattern?: Record<string, unknown> }).keyPattern
          ?.invitationCode,
      )
    );
  }

  private toDto(doc: FarmDocument): FarmDto {
    return {
      _id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      invitationCode: doc.invitationCode,
      active: doc.active,
      createdAt: doc.createdAt,
    };
  }
}
