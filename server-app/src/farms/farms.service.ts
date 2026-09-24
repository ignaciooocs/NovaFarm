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
// Cuánto sirve un código desde que se genera. Una hora (decisión del
// usuario, 2026-09-16): alcanza para mandarlo y que la persona se una ahí
// mismo, y si se necesita otro después, el admin lo genera desde Ajustes.
export const INVITATION_CODE_TTL_MS = 60 * 60 * 1000;

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

// Si un código ya no sirve para unirse. Sin fecha es una farm de antes de
// que los códigos vencieran: vencido, no eterno — un código que circuló sin
// límite es justo lo que esto viene a cerrar.
export function isInvitationCodeExpired(
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

/**
 * Maneja la farm (el tenant raíz): crearla generando su invitationCode,
 * generarle uno nuevo cuando el admin lo pide, y buscarla por ese código
 * cuando un recorder se une durante el onboarding.
 */
@Injectable()
export class FarmsService {
  constructor(
    @InjectModel(Farm.name) private readonly farmModel: Model<Farm>,
  ) {}

  // Crea una farm nueva con un invitationCode aleatorio que vence en
  // INVITATION_CODE_TTL_MS.
  async create(dto: CreateFarmRequestDto): Promise<FarmDto> {
    return this.withUniqueInvitationCode(async (invitationCode) => {
      const created = await this.farmModel.create({
        name: dto.name,
        type: dto.type,
        invitationCode,
        invitationCodeExpiresAt: this.newInvitationCodeExpiry(),
        active: true,
      });

      return this.toDto(created);
    });
  }

  // Reemplaza el invitationCode de la farm por uno nuevo que vence en
  // INVITATION_CODE_TTL_MS (POST /farms/me/invitation-code, admin only — el
  // chequeo de rol vive en el controller). El anterior deja de servir al
  // tiro, aunque no hubiera vencido: generar uno nuevo también es la forma
  // de cortar uno que se compartió de más. Devuelve null si la farm no existe.
  async regenerateInvitationCode(id: string): Promise<FarmDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.withUniqueInvitationCode(async (invitationCode) => {
      // $set puntual y no .save(), por lo mismo que en update().
      const updated = await this.farmModel
        .findOneAndUpdate(
          { _id: id },
          {
            $set: {
              invitationCode,
              invitationCodeExpiresAt: this.newInvitationCodeExpiry(),
            },
          },
          { new: true },
        )
        .exec();

      return updated ? this.toDto(updated) : null;
    });
  }

  // Busca una farm activa por su invitationCode — es el paso que valida el
  // código que un recorder ingresa para unirse a una farm ya existente. No
  // mira si venció: eso lo decide quien llama con isInvitationCodeExpired(),
  // para poder responder "caducó" distinto de "no existe".
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
  async update(id: string, dto: UpdateFarmRequestDto): Promise<FarmDto | null> {
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

  // Corre una escritura con un invitationCode recién generado. Si el código
  // choca con uno ya existente (índice único — los vencidos siguen ocupando
  // el suyo), reintenta con uno nuevo hasta MAX_INVITATION_CODE_ATTEMPTS
  // veces antes de fallar definitivamente.
  private async withUniqueInvitationCode<T>(
    write: (invitationCode: string) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_INVITATION_CODE_ATTEMPTS; attempt++) {
      try {
        return await write(this.generateInvitationCode());
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

  private newInvitationCodeExpiry(): Date {
    return new Date(Date.now() + INVITATION_CODE_TTL_MS);
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
      invitationCodeExpiresAt: doc.invitationCodeExpiresAt ?? null,
      active: doc.active,
      createdAt: doc.createdAt,
      recordersCanManageCatalog: doc.recordersCanManageCatalog ?? true,
    };
  }
}
