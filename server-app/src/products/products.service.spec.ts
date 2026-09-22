import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Workday } from '../workdays/schemas/workday.schema';
import { Product } from './schemas/product.schema';
import { FarmProduct } from './schemas/farm-product.schema';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let productsService: ProductsService;

  const productModel = {
    bulkWrite: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };

  const farmProductModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };

  const workdayModel = {
    distinct: jest.fn(),
    exists: jest.fn(),
  };

  const farmId = '507f1f77bcf86cd799439011';
  const otherFarmId = '507f1f77bcf86cd799439022';
  const productId = new Types.ObjectId();

  // Helpers: casi todo el servicio encadena `.exec()`, y `find()` a veces
  // pasa por `.select()` antes.
  const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });
  const execSelect = <T>(value: T) => ({
    select: jest.fn().mockReturnValue(exec(value)),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    productModel.bulkWrite.mockResolvedValue({ upsertedCount: 0 });
    workdayModel.distinct.mockReturnValue(exec([]));
    workdayModel.exists.mockReturnValue(exec(null));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getModelToken(Product.name), useValue: productModel },
        {
          provide: getModelToken(FarmProduct.name),
          useValue: farmProductModel,
        },
        { provide: getModelToken(Workday.name), useValue: workdayModel },
      ],
    }).compile();

    productsService = module.get(ProductsService);
  });

  describe('seedCatalog', () => {
    it('upserts every catalog entry by its key, so re-running changes nothing', async () => {
      await productsService.seedCatalog();

      const [operations] = productModel.bulkWrite.mock.calls[0] as [
        { updateOne: { filter: { catalogKey: string }; upsert: boolean } }[],
      ];
      expect(operations.length).toBeGreaterThan(0);
      expect(
        operations.every(
          (op) => op.updateOne.upsert && op.updateOne.filter.catalogKey,
        ),
      ).toBe(true);
    });
  });

  describe('findAll', () => {
    it("returns the farm's products, taking active from its own selection", async () => {
      farmProductModel.find.mockReturnValue(
        exec([{ productId, active: false }]),
      );
      productModel.find.mockReturnValue(
        exec([
          {
            _id: productId,
            name: 'Palta',
            icon: '🥑',
            source: 'APP',
            featured: true,
            active: true,
          },
        ]),
      );

      const result = await productsService.findAll(farmId, {});

      // `active: true` en el producto global, pero esta farm lo tiene
      // desactivado — manda su selección.
      expect(result[0].active).toBe(false);
      expect(result[0].name).toBe('Palta');
    });

    it('never marks an app product as editable', async () => {
      farmProductModel.find.mockReturnValue(
        exec([{ productId, active: true }]),
      );
      productModel.find.mockReturnValue(
        exec([{ _id: productId, name: 'Palta', source: 'APP' }]),
      );

      const result = await productsService.findAll(farmId, {});

      expect(result[0].editable).toBe(false);
    });

    it('marks its own unused community product as editable, and a used one as not', async () => {
      const usedId = new Types.ObjectId();
      farmProductModel.find.mockReturnValue(
        exec([
          { productId, active: true },
          { productId: usedId, active: true },
        ]),
      );
      productModel.find.mockReturnValue(
        exec([
          {
            _id: productId,
            name: 'Murta',
            source: 'COMMUNITY',
            createdByFarmId: new Types.ObjectId(farmId),
          },
          {
            _id: usedId,
            name: 'Maqui',
            source: 'COMMUNITY',
            createdByFarmId: new Types.ObjectId(farmId),
          },
        ]),
      );
      workdayModel.distinct.mockReturnValue(exec([usedId]));

      const result = await productsService.findAll(farmId, {});

      expect(result[0].editable).toBe(true);
      expect(result[1].editable).toBe(false);
    });
  });

  describe('findAvailable', () => {
    it('asks only for app products plus this farm own community ones', async () => {
      farmProductModel.find.mockReturnValue(execSelect([]));
      productModel.find.mockReturnValue(exec([]));

      await productsService.findAvailable(farmId);

      // El aislamiento de COMMUNITY vive en esta query: sin el filtro por
      // createdByFarmId, el cultivo que inventó otra farm aparecería acá.
      expect(productModel.find).toHaveBeenCalledWith({
        active: true,
        $or: [
          { source: 'APP' },
          {
            source: 'COMMUNITY',
            createdByFarmId: new Types.ObjectId(farmId),
          },
        ],
      });
    });

    it('leaves out what the farm already has in its catalog', async () => {
      const ownedId = new Types.ObjectId();
      farmProductModel.find.mockReturnValue(
        execSelect([{ productId: ownedId }]),
      );
      productModel.find.mockReturnValue(
        exec([
          { _id: ownedId, name: 'Palta', source: 'APP' },
          { _id: productId, name: 'Limón', source: 'APP' },
        ]),
      );

      const result = await productsService.findAvailable(farmId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Limón');
    });
  });

  describe('create', () => {
    it('adds an existing catalog product to the farm without creating a new one', async () => {
      productModel.findOne.mockReturnValue(
        exec({ _id: productId, name: 'Palta', icon: '🥑', source: 'APP' }),
      );
      farmProductModel.create.mockResolvedValue({});

      const result = await productsService.create(farmId, {
        productId: productId.toString(),
      });

      expect(productModel.create).not.toHaveBeenCalled();
      expect(farmProductModel.create).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        productId,
        active: true,
      });
      expect(result.name).toBe('Palta');
    });

    it('creates a community product owned by the farm when there is no productId', async () => {
      productModel.create.mockResolvedValue({
        _id: productId,
        name: 'Murta',
        icon: '🫐',
        source: 'COMMUNITY',
        createdByFarmId: new Types.ObjectId(farmId),
      });
      farmProductModel.create.mockResolvedValue({});

      const result = await productsService.create(farmId, {
        name: 'Murta',
        icon: '🫐',
      });

      expect(productModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Murta',
          source: 'COMMUNITY',
          createdByFarmId: new Types.ObjectId(farmId),
        }),
      );
      expect(result.source).toBe('COMMUNITY');
    });

    it('throws PRODUCT_NAME_REQUIRED with neither a productId nor a name', async () => {
      await expect(productsService.create(farmId, {})).rejects.toMatchObject({
        code: 'PRODUCT_NAME_REQUIRED',
      });
    });

    it('throws PRODUCT_ALREADY_IN_CATALOG when the product is already in the farm catalog', async () => {
      productModel.findOne.mockReturnValue(
        exec({ _id: productId, name: 'Palta', source: 'APP' }),
      );
      farmProductModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        productsService.create(farmId, { productId: productId.toString() }),
      ).rejects.toMatchObject({ code: 'PRODUCT_ALREADY_IN_CATALOG' });
    });
  });

  describe('update', () => {
    const linkId = new Types.ObjectId();

    function mockLinkedProduct(product: Record<string, unknown>) {
      farmProductModel.findOne.mockReturnValue(
        exec({ _id: linkId, productId, active: true }),
      );
      productModel.findById.mockReturnValue(exec(product));
      productModel.updateOne.mockReturnValue(exec({}));
      farmProductModel.updateOne.mockReturnValue(exec({}));
    }

    it("deactivates the farm's own selection without touching the global product", async () => {
      mockLinkedProduct({ _id: productId, name: 'Palta', source: 'APP' });

      const result = await productsService.update(
        farmId,
        productId.toString(),
        { active: false },
      );

      expect(farmProductModel.updateOne).toHaveBeenCalledWith(
        { _id: linkId },
        { $set: { active: false } },
      );
      expect(productModel.updateOne).not.toHaveBeenCalled();
      expect(result?.active).toBe(false);
    });

    it('refuses to rename an app product', async () => {
      mockLinkedProduct({ _id: productId, name: 'Palta', source: 'APP' });

      await expect(
        productsService.update(farmId, productId.toString(), {
          name: 'Aguacate',
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_FROM_APP_CATALOG' });
      expect(productModel.updateOne).not.toHaveBeenCalled();
    });

    it('refuses to rename a community product created by another farm', async () => {
      mockLinkedProduct({
        _id: productId,
        name: 'Murta',
        source: 'COMMUNITY',
        createdByFarmId: new Types.ObjectId(otherFarmId),
      });

      await expect(
        productsService.update(farmId, productId.toString(), {
          name: 'Murtilla',
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_FROM_ANOTHER_FARM' });
    });

    it('refuses to rename a product already used in a workday', async () => {
      mockLinkedProduct({
        _id: productId,
        name: 'Murta',
        source: 'COMMUNITY',
        createdByFarmId: new Types.ObjectId(farmId),
      });
      workdayModel.exists.mockReturnValue(exec({ _id: new Types.ObjectId() }));

      await expect(
        productsService.update(farmId, productId.toString(), {
          name: 'Murtilla',
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_USED_IN_WORKDAY' });
      expect(productModel.updateOne).not.toHaveBeenCalled();
    });

    it('renames its own unused community product', async () => {
      mockLinkedProduct({
        _id: productId,
        name: 'Murta',
        source: 'COMMUNITY',
        createdByFarmId: new Types.ObjectId(farmId),
      });

      await productsService.update(farmId, productId.toString(), {
        name: 'Murtilla',
      });

      expect(productModel.updateOne).toHaveBeenCalledWith(
        { _id: productId.toString() },
        { $set: { name: 'Murtilla' } },
      );
    });

    it('returns null when the farm does not have that product', async () => {
      farmProductModel.findOne.mockReturnValue(exec(null));

      const result = await productsService.update(
        farmId,
        productId.toString(),
        { active: false },
      );

      expect(result).toBeNull();
    });
  });

  describe('findActiveById', () => {
    it('returns null when the farm has the product deactivated', async () => {
      farmProductModel.findOne.mockReturnValue(exec(null));

      const result = await productsService.findActiveById(
        farmId,
        productId.toString(),
      );

      expect(farmProductModel.findOne).toHaveBeenCalledWith({
        farmId: new Types.ObjectId(farmId),
        productId,
        active: true,
      });
      expect(result).toBeNull();
    });

    it('returns null without querying when the id is not a valid ObjectId', async () => {
      const result = await productsService.findActiveById(farmId, 'not-an-id');

      expect(farmProductModel.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
