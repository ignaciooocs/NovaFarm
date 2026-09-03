import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model, Types } from 'mongoose';
import { Farm, FarmDocument } from './schemas/farm.schema';
import { CreateFarmRequestDto, FarmDto, UpdateFarmRequestDto } from './dto';

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

  // Busca la propia farm de quien llama (GET /farms/me — cualquier miembro
  // autenticado, no solo admin, ya que un recorder necesita leer
  // recordersCanManageCatalog para saber si puede ver el catálogo).
  async findById(id: string): Promise<FarmDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const found = await this.farmModel.findById(id).exec();
    return found ? this.toDto(found) : null;
  }

  // Edita recordersCanManageCatalog (PATCH /farms/me, admin only — el
  // chequeo de rol vive en el controller vía RolesGuard, no acá). Usa
  // findOneAndUpdate con $set puntual, no fetch+mutate+save(): igual que en
  // workdays.close(), .save() revalidaría el documento completo y
  // reventaría en farms creadas antes de que este campo existiera.
  async update(
    id: string,
    dto: UpdateFarmRequestDto,
  ): Promise<FarmDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const changes: Partial<Pick<Farm, 'recordersCanManageCatalog'>> = {};
    if (dto.recordersCanManageCatalog !== undefined) {
      changes.recordersCanManageCatalog = dto.recordersCanManageCatalog;
    }

    const updated = await this.farmModel
      .findOneAndUpdate({ _id: id }, { $set: changes }, { new: true })
      .exec();

    return updated ? this.toDto(updated) : null;
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
  //
  // recordersCanManageCatalog usa `?? true` a propósito: Mongoose solo
  // aplica el `default` del schema al CREAR un documento, nunca al leer uno
  // viejo que no lo tiene guardado — las farms creadas antes de que este
  // campo existiera literalmente no lo tienen en la base. Sin este
  // fallback, esas farms leerían `undefined` acá y el interruptor quedaría
  // "apagado" por accidente para farms viejas, justo lo opuesto al default
  // "true" que se decidió (mismo tipo de gap que causó el bug real de
  // clientEntryId en workdays — acá se previno a propósito).
  private toDto(doc: FarmDocument): FarmDto {
    return {
      _id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      invitationCode: doc.invitationCode,
      active: doc.active,
      createdAt: doc.createdAt,
      recordersCanManageCatalog: doc.recordersCanManageCatalog ?? true,
    };
  }
}
