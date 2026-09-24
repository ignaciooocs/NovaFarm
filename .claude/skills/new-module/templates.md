# Boilerplate per file

Distilled from `server-app/src/fruits/`. Replace `<Entity>` (PascalCase singular), `<entity>` (kebab singular), `<entities>` (kebab plural). Read the real files for anything this leaves out.

## schemas/&lt;entity&gt;.schema.ts

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type <Entity>Document = HydratedDocument<<Entity>>;

@Schema({ collection: '<entities>' })
export class <Entity> {
  @Prop({ type: Types.ObjectId, ref: 'Farm', required: true, index: true })
  farmId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const <Entity>Schema = SchemaFactory.createForClass(<Entity>);
// Único por farm, no global — dos farms pueden tener el mismo nombre.
<Entity>Schema.index({ farmId: 1, name: 1 }, { unique: true });
```

A field added after the collection already has documents must **not** be `required` — give it a `default`, export a `DEFAULT_*` constant, and fall back in `toDto()`.

## dto/&lt;entity&gt;.dto.ts (canonical shape)

```ts
import { ApiProperty } from '@nestjs/swagger';

export class <Entity>Dto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id!: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  farmId!: string;

  @ApiProperty({ example: 'Lemon' })
  name!: string;

  @ApiProperty({ example: true })
  active!: boolean;
}
```

Request/response DTOs compose from this one — `PickType`/`OmitType`/`PartialType` from `@nestjs/swagger`, or extend it. Never re-declare the same fields per action.

- `Create<Entity>RequestDto`: only client-supplied fields (no `_id`, no `farmId`, no `active`), each with `class-validator` decorators. `forbidNonWhitelisted` is global, so an extra field is a 400 — that's the intended protection.
- `Update<Entity>RequestDto`: every field optional (`@IsOptional()`); including `active` makes PATCH double as activate/deactivate.
- `Find<Entity>RequestDto`: query filters only, with `@Type(() => Boolean)` / `@Transform` as needed for query-string coercion.
- Response DTOs: `export class Create<Entity>ResponseDto extends <Entity>Dto {}` unless the response genuinely differs.

## dto/index.ts

```ts
export * from './<entity>.dto';
export * from './request/create-<entity>-request.dto';
export * from './response/create-<entity>-response.dto';
// ...one line per file that exists
```

## &lt;entities&gt;.service.ts

```ts
@Injectable()
export class <Entities>Service {
  constructor(
    @InjectModel(<Entity>.name) private readonly <entity>Model: Model<<Entity>>,
  ) {}

  async create(farmId: string, dto: Create<Entity>RequestDto): Promise<<Entity>Dto> {
    const created = await this.<entity>Model.create({
      farmId: new Types.ObjectId(farmId),
      ...dto,
      active: true,
    });
    return this.toDto(created);
  }

  async findAll(farmId: string, filter: Find<Entity>RequestDto): Promise<<Entity>Dto[]> {
    const found = await this.<entity>Model
      .find({
        farmId: new Types.ObjectId(farmId),
        ...(filter.active !== undefined ? { active: filter.active } : {}),
      })
      .exec();
    return found.map((doc) => this.toDto(doc));
  }

  // Para otros módulos: valida la referencia sin exponerles el modelo.
  async findActiveById(farmId: string, id: string): Promise<<Entity>Dto | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const found = await this.<entity>Model
      .findOne({ _id: id, farmId: new Types.ObjectId(farmId), active: true })
      .exec();
    return found ? this.toDto(found) : null;
  }

  async update(farmId: string, id: string, dto: Update<Entity>RequestDto): Promise<<Entity>Dto | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    // $set puntual en vez de fetch-mutate-save: save() revalida el documento
    // entero y explota en documentos viejos sin los campos required nuevos.
    const updated = await this.<entity>Model
      .findOneAndUpdate(
        { _id: id, farmId: new Types.ObjectId(farmId) },
        { $set: changes },
        { new: true },
      )
      .exec();
    return updated ? this.toDto(updated) : null;
  }

  private toDto(doc: <Entity>Document): <Entity>Dto {
    return {
      _id: doc._id.toString(),
      farmId: doc.farmId.toString(),
      name: doc.name,
      active: doc.active,
    };
  }
}
```

`update()` builds `changes` field by field from the defined keys of the DTO — spreading the DTO straight into `$set` would write `undefined`s. When the entity has a per-farm unique index, wrap `create`/`update` in try/catch and translate Mongo error `11000` (checking `keyPattern`) into a `ConflictException`; copy `isDuplicateNameError` from `fruits.service.ts`.

## &lt;entities&gt;.controller.ts

```ts
@ApiTags('<entities>')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('<entities>')
export class <Entities>Controller {
  constructor(private readonly <entities>Service: <Entities>Service) {}

  @Post()
  @ApiOperation({ summary: 'Create a new <entity> in the caller farm' })
  @ApiResponse({ status: 201, description: '...', type: Create<Entity>ResponseDto })
  async create(
    @CurrentFarm() farmId: string,
    @Body() dto: Create<Entity>RequestDto,
  ): Promise<Create<Entity>ResponseDto> {
    return this.<entities>Service.create(farmId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentFarm() farmId: string,
    @Param('id') id: string,
    @Body() dto: Update<Entity>RequestDto,
  ): Promise<Update<Entity>ResponseDto> {
    const updated = await this.<entities>Service.update(farmId, id, dto);
    if (!updated) throw new NotFoundException('<Entity> not found in the caller farm');
    return updated;
  }
}
```

Guards and decorators come from `../auth/guards/farm-scope.guard` and `../auth/decorators/current-farm.decorator`. `@ApiResponse({ type: [Find<Entity>ResponseDto] })` — array brackets — for list endpoints.

## &lt;entities&gt;.module.ts

```ts
@Module({
  imports: [
    MongooseModule.forFeature([{ name: <Entity>.name, schema: <Entity>Schema }]),
    AuthModule,
  ],
  controllers: [<Entities>Controller],
  providers: [<Entities>Service],
  exports: [MongooseModule, <Entities>Service],
})
export class <Entities>Module {}
```

If `AuthModule` ends up needing this module back, use `forwardRef()` on both sides — that's an accepted pattern here, not a smell.

## &lt;entities&gt;.service.spec.ts

```ts
describe('<Entities>Service', () => {
  let service: <Entities>Service;
  const <entity>Model = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const farmId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        <Entities>Service,
        { provide: getModelToken(<Entity>.name), useValue: <entity>Model },
      ],
    }).compile();
    service = module.get(<Entities>Service);
  });
});
```

Chained calls are mocked as `model.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([...]) })`. Assert the `farmId` actually reaches the query — that assertion is the point of the test, not coverage.
