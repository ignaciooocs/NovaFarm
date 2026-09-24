import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Workday } from '../workdays/schemas/workday.schema';
import {
  DEFAULT_PRODUCT_ICON,
  Product,
  ProductDocument,
} from './schemas/product.schema';
import { FarmProduct } from './schemas/farm-product.schema';
import { PRODUCT_CATALOG } from './product-catalog';
import {
  CreateProductRequestDto,
  FindProductRequestDto,
  ProductDto,
  UpdateProductRequestDto,
} from './dto';

// Código de error de Mongo para llave duplicada (choque de índice único).
const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Cultivos: el catálogo global (`products`) y lo que cada farm elige de él
 * (`farmProducts`).
 *
 * La razón de que el catálogo sea compartido y no una copia por farm es
 * poder medir: con una sola fila "Palta", un `GROUP BY productId` sobre las
 * jornadas de todas las farms significa algo. Con copias habría que agrupar
 * por texto y cualquier diferencia de tipeo partiría la métrica en dos.
 */
@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(FarmProduct.name)
    private readonly farmProductModel: Model<FarmProduct>,
    // Solo lectura, para saber si un cultivo ya se usó en una jornada.
    // Registrado directo en ProductsModule y no vía WorkdaysModule porque ese
    // ya importa a este — pasar por el módulo cerraría un ciclo (mismo motivo
    // y misma solución que HarvestEntry en workdays.module.ts).
    @InjectModel(Workday.name) private readonly workdayModel: Model<Workday>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedCatalog();
  }

  // Siembra el catálogo de la app (product-catalog.ts) en la colección
  // global. Idempotente: hace upsert por `catalogKey`, así que arrancar mil
  // veces deja las mismas filas, y agregar una entrada al archivo la publica
  // para todas las farms en el próximo deploy.
  async seedCatalog(): Promise<void> {
    const result = await this.productModel.bulkWrite(
      PRODUCT_CATALOG.map((entry) => ({
        updateOne: {
          filter: { catalogKey: entry.key },
          update: {
            $set: {
              name: entry.name,
              icon: entry.icon,
              featured: entry.featured ?? false,
              source: 'APP',
              createdByFarmId: null,
            },
            $setOnInsert: { active: true },
          },
          upsert: true,
        },
      })),
    );

    if (result.upsertedCount > 0) {
      this.logger.log(`Seeded ${result.upsertedCount} catalog product(s)`);
    }
  }

  // El catálogo de esta farm: lo que eligió cultivar. `active` y `editable`
  // salen de su propia selección, no del producto global.
  async findAll(
    farmId: string,
    filter: FindProductRequestDto,
  ): Promise<ProductDto[]> {
    const links = await this.farmProductModel
      .find({
        farmId: new Types.ObjectId(farmId),
        ...(filter.active !== undefined
          ? { active: filter.active === 'true' }
          : {}),
      })
      .exec();

    if (links.length === 0) {
      return [];
    }

    const productIds = links.map((link) => link.productId);
    const [products, usedProductIds] = await Promise.all([
      this.productModel.find({ _id: { $in: productIds } }).exec(),
      this.usedProductIds(farmId),
    ]);

    const activeByProductId = new Map(
      links.map((link) => [link.productId.toString(), link.active]),
    );

    return products.map((doc) =>
      this.toDto(doc, {
        farmId,
        active: activeByProductId.get(doc._id.toString()),
        used: usedProductIds.has(doc._id.toString()),
      }),
    );
  }

  // Lo que esta farm PODRÍA agregar: el catálogo de la app más lo que ella
  // misma creó, menos lo que ya tiene. Nunca los COMMUNITY de otra farm —
  // ese aislamiento es lo que evita que el typo de alguien más aparezca acá
  // (ver product.schema.ts).
  async findAvailable(farmId: string): Promise<ProductDto[]> {
    const [links, visible] = await Promise.all([
      this.farmProductModel
        .find({ farmId: new Types.ObjectId(farmId) })
        .select('productId')
        .exec(),
      this.productModel
        .find({
          active: true,
          $or: [
            { source: 'APP' },
            {
              source: 'COMMUNITY',
              createdByFarmId: new Types.ObjectId(farmId),
            },
          ],
        })
        .exec(),
    ]);

    const owned = new Set(links.map((link) => link.productId.toString()));

    return visible
      .filter((doc) => !owned.has(doc._id.toString()))
      .map((doc) => this.toDto(doc, { farmId }));
  }

  // Suma un cultivo al catálogo de la farm: uno que ya existe (productId), o
  // uno nuevo de la comunidad que se crea y se suma en el mismo paso.
  async create(
    farmId: string,
    dto: CreateProductRequestDto,
  ): Promise<ProductDto> {
    const product =
      dto.productId !== undefined
        ? await this.findVisibleById(farmId, dto.productId)
        : await this.createCommunityProduct(farmId, dto);

    if (!product) {
      throw AppException.badRequest(
        'PRODUCT_NOT_AVAILABLE',
        'Product not found or not visible to this farm',
      );
    }

    try {
      await this.farmProductModel.create({
        farmId: new Types.ObjectId(farmId),
        productId: product._id,
        active: true,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw AppException.conflict(
          'PRODUCT_ALREADY_IN_CATALOG',
          'This product is already in the farm catalog',
        );
      }
      throw error;
    }

    return this.toDto(product, { farmId, active: true, used: false });
  }

  // Edita la selección de la farm (`active`, siempre permitido) y/o el
  // producto global (`name`/`icon`, solo si es de la comunidad, de esta farm
  // y ninguna jornada lo usa — ver canEditLabels). Devuelve null si la farm
  // no tiene ese cultivo (el controller decide si es un 404).
  async update(
    farmId: string,
    productId: string,
    dto: UpdateProductRequestDto,
  ): Promise<ProductDto | null> {
    if (!Types.ObjectId.isValid(productId)) {
      return null;
    }

    const link = await this.farmProductModel
      .findOne({
        farmId: new Types.ObjectId(farmId),
        productId: new Types.ObjectId(productId),
      })
      .exec();
    if (!link) {
      return null;
    }

    const product = await this.productModel.findById(productId).exec();
    if (!product) {
      return null;
    }

    const used = await this.isUsedInWorkday(farmId, productId);

    if (dto.name !== undefined || dto.icon !== undefined) {
      if (product.source === 'APP') {
        throw AppException.conflict(
          'PRODUCT_FROM_APP_CATALOG',
          'This product comes from the app catalog, so its name and icon cannot be changed',
        );
      }
      if (product.createdByFarmId?.toString() !== farmId) {
        throw AppException.conflict(
          'PRODUCT_FROM_ANOTHER_FARM',
          'This product was created by another farm, so it cannot be changed here',
        );
      }
      if (used) {
        throw AppException.conflict(
          'PRODUCT_USED_IN_WORKDAY',
          'This product is already used in a workday, so its name and icon cannot be changed',
        );
      }

      try {
        await this.productModel
          .updateOne(
            { _id: productId },
            {
              $set: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
              },
            },
          )
          .exec();
      } catch (error) {
        if (this.isDuplicateKeyError(error)) {
          throw AppException.conflict(
            'PRODUCT_NAME_TAKEN',
            'A product with this name already exists for this farm',
          );
        }
        throw error;
      }
    }

    if (dto.active !== undefined) {
      await this.farmProductModel
        .updateOne({ _id: link._id }, { $set: { active: dto.active } })
        .exec();
    }

    const updated = await this.productModel.findById(productId).exec();
    if (!updated) {
      return null;
    }

    return this.toDto(updated, {
      farmId,
      active: dto.active ?? link.active,
      used,
    });
  }

  // Busca un cultivo por id, pero solo si esta farm lo tiene activo en su
  // catálogo. Se usa desde workdays para validar la referencia sin exponerle
  // el modelo de Mongoose.
  async findActiveById(
    farmId: string,
    productId: string,
  ): Promise<ProductDto | null> {
    if (!Types.ObjectId.isValid(productId)) {
      return null;
    }

    const link = await this.farmProductModel
      .findOne({
        farmId: new Types.ObjectId(farmId),
        productId: new Types.ObjectId(productId),
        active: true,
      })
      .exec();
    if (!link) {
      return null;
    }

    const product = await this.productModel
      .findOne({ _id: productId, active: true })
      .exec();

    // `used` no se calcula acá: este camino valida una referencia, no pinta
    // el catálogo, y se llama en caliente al abrir una jornada. Quien
    // necesite `editable` de verdad usa findAll().
    return product ? this.toDto(product, { farmId, active: true }) : null;
  }

  private async createCommunityProduct(
    farmId: string,
    dto: CreateProductRequestDto,
  ): Promise<ProductDocument> {
    if (dto.name === undefined) {
      throw AppException.badRequest(
        'PRODUCT_NAME_REQUIRED',
        'name is required when creating a product outside the app catalog',
      );
    }

    try {
      return await this.productModel.create({
        name: dto.name,
        icon: dto.icon ?? DEFAULT_PRODUCT_ICON,
        source: 'COMMUNITY',
        createdByFarmId: new Types.ObjectId(farmId),
        catalogKey: null,
        featured: false,
        active: true,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw AppException.conflict(
          'PRODUCT_NAME_TAKEN',
          'A product with this name already exists for this farm',
        );
      }
      throw error;
    }
  }

  private async findVisibleById(
    farmId: string,
    productId: string,
  ): Promise<ProductDocument | null> {
    if (!Types.ObjectId.isValid(productId)) {
      return null;
    }

    return this.productModel
      .findOne({
        _id: productId,
        active: true,
        $or: [
          { source: 'APP' },
          { source: 'COMMUNITY', createdByFarmId: new Types.ObjectId(farmId) },
        ],
      })
      .exec();
  }

  private async usedProductIds(farmId: string): Promise<Set<string>> {
    const ids = await this.workdayModel
      .distinct('productId', { farmId: new Types.ObjectId(farmId) })
      .exec();

    return new Set(ids.map((id) => String(id)));
  }

  private async isUsedInWorkday(
    farmId: string,
    productId: string,
  ): Promise<boolean> {
    const found = await this.workdayModel
      .exists({ farmId: new Types.ObjectId(farmId), productId })
      .exec();

    return found !== null;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE
    );
  }

  private toDto(
    doc: ProductDocument,
    context: { farmId: string; active?: boolean; used?: boolean },
  ): ProductDto {
    // Editable solo si es de la comunidad, de esta farm, y todavía no lo usa
    // ninguna jornada. Lo primero porque un producto de la app es de la app;
    // lo segundo porque las jornadas resuelven nombre e ícono en vivo contra
    // esta colección, así que renombrar uno usado reescribiría en silencio lo
    // que dicen las jornadas pasadas.
    const editable =
      doc.source === 'COMMUNITY' &&
      doc.createdByFarmId?.toString() === context.farmId &&
      context.used === false;

    return {
      _id: doc._id.toString(),
      name: doc.name,
      icon: doc.icon ?? DEFAULT_PRODUCT_ICON,
      source: doc.source,
      featured: doc.featured ?? false,
      ...(context.active !== undefined ? { active: context.active } : {}),
      ...(context.used !== undefined ? { editable } : {}),
    };
  }
}
