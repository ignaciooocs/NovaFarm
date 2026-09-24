import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentFarm } from '../auth/decorators/current-farm.decorator';
import { FarmScopeGuard } from '../auth/guards/farm-scope.guard';
import { ProductsService } from './products.service';
import {
  CreateProductRequestDto,
  CreateProductResponseDto,
  FindProductRequestDto,
  FindProductResponseDto,
  UpdateProductRequestDto,
  UpdateProductResponseDto,
} from './dto';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(FarmScopeGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Add a product to the caller farm catalog — either one that already exists (productId) or a new community one (name)',
  })
  @ApiResponse({
    status: 201,
    description: 'The product is now in the farm catalog.',
    type: CreateProductResponseDto,
  })
  async create(
    @CurrentFarm() farmId: string,
    @Body() dto: CreateProductRequestDto,
  ): Promise<CreateProductResponseDto> {
    return this.productsService.create(farmId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the products in the caller farm catalog' })
  @ApiResponse({
    status: 200,
    description: 'The products this farm grows.',
    type: [FindProductResponseDto],
  })
  async findAll(
    @CurrentFarm() farmId: string,
    @Query() filter: FindProductRequestDto,
  ): Promise<FindProductResponseDto[]> {
    return this.productsService.findAll(farmId, filter);
  }

  @Get('available')
  @ApiOperation({
    summary:
      'List the products the caller farm could add — the app catalog plus its own community products, minus the ones already in its catalog',
  })
  @ApiResponse({
    status: 200,
    description: 'Products available to add.',
    type: [FindProductResponseDto],
  })
  async findAvailable(
    @CurrentFarm() farmId: string,
  ): Promise<FindProductResponseDto[]> {
    return this.productsService.findAvailable(farmId);
  }

  @Patch(':productId')
  @ApiOperation({
    summary:
      "Update a product in the caller farm catalog. `active` toggles this farm's own selection and is always allowed; renaming only works for a community product this farm created that no workday uses yet.",
  })
  @ApiResponse({
    status: 200,
    description: 'The product was updated successfully.',
    type: UpdateProductResponseDto,
  })
  async update(
    @CurrentFarm() farmId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductRequestDto,
  ): Promise<UpdateProductResponseDto> {
    const updated = await this.productsService.update(farmId, productId, dto);
    if (!updated) {
      throw AppException.notFound(
        'PRODUCT_NOT_FOUND',
        'Product not found in the caller farm catalog',
      );
    }
    return updated;
  }
}
