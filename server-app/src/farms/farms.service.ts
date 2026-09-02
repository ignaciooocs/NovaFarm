import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';
import { Farm, FarmDocument } from './schemas/farm.schema';
import { CreateFarmRequestDto, FarmDto } from './dto';

const INVITATION_CODE_LENGTH = 8;
// Sin 0/O/1/I para evitar ambigüedad al leerlo en voz alta o escribirlo.
const INVITATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_INVITATION_CODE_ATTEMPTS = 5;

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Maneja la farm (el tenant raíz): crearla generando su invitationCode, y
 * buscarla por ese código cuando un recorder se une durante el onboarding.
 */
@Injectable()
export class FarmsService {
  constructor(
    @InjectModel(Farm.name) private readonly farmModel: Model<Farm>,
  ) {}

  // Crea una farm nueva generando un invitationCode aleatorio. Si el código
  // choca con uno ya existente (índice único), reintenta con uno nuevo hasta
  // MAX_INVITATION_CODE_ATTEMPTS veces antes de fallar definitivamente.
  async create(dto: CreateFarmRequestDto): Promise<FarmDto> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_INVITATION_CODE_ATTEMPTS; attempt++) {
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
        // Solo reintenta si el choque fue justo en invitationCode; cualquier
        // otro error (de validación, de conexión, etc.) se propaga tal cual.
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

  // Busca una farm activa por su invitationCode — es el paso que valida el
  // código que un recorder ingresa para unirse a una farm ya existente.
  async findActiveByInvitationCode(code: string): Promise<FarmDto | null> {
    const found = await this.farmModel
      .findOne({ invitationCode: code, active: true })
      .exec();

    return found ? this.toDto(found) : null;
  }

  // Genera un código aleatorio de INVITATION_CODE_LENGTH caracteres tomados
  // del alfabeto permitido.
  private generateInvitationCode(): string {
    let code = '';
    for (let i = 0; i < INVITATION_CODE_LENGTH; i++) {
      code +=
        INVITATION_CODE_ALPHABET[randomInt(INVITATION_CODE_ALPHABET.length)];
    }
    return code;
  }

  // Verifica si el error de Mongo es específicamente un choque en el índice
  // único de invitationCode (código 11000 + keyPattern.invitationCode), y no
  // otro tipo de error que solo comparte el mismo código.
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

  // Convierte el documento de Mongoose al DTO de respuesta.
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
