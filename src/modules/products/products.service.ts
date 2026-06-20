import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { ProductStatus } from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import {
  applySearchTextFilter,
  productSearchText,
} from '../../shared/utils/search.util';
import { APP } from '../../shared/constants/app.constants';
import { buildExcelBuffer } from '../../shared/utils/excel.util';
import { getProductImportColumnFormats } from '../../shared/constants/import-template-formats';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { CategoriesService } from './categories.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import {
  InventoryBalance,
  InventoryBalanceDocument,
} from '../inventory/schemas/inventory-balance.schema';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductImagesService } from './product-images.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(InventoryBalance.name)
    private inventoryBalanceModel: Model<InventoryBalanceDocument>,
    private readonly categoriesService: CategoriesService,
    private readonly priceTiersService: PriceTiersService,
    private readonly productImagesService: ProductImagesService,
    private readonly logger: AppLoggerService,
  ) {}

  async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({
        _id: id,
        tenant_id: new Types.ObjectId(tenantId),
        is_deleted: false,
      })
      .populate('category_id', 'name description');
  }

  async findManyByIdsInTenant(
    tenantId: string,
    ids: string[],
  ): Promise<Map<string, ProductDocument>> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    const map = new Map<string, ProductDocument>();

    if (uniqueIds.length === 0) {
      return map;
    }

    const products = await this.productModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
      is_deleted: false,
    });

    for (const product of products) {
      map.set(product._id.toString(), product);
    }

    return map;
  }

  async list(
    tenantId: string,
    page = 1,
    limit = 10,
    search?: string,
    categoryId?: string,
    status?: ProductStatus,
  ) {
    this.logger.step('ProductsService.list', {
      tenantId,
      page,
      limit,
      search,
      categoryId,
      status,
    });

    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (categoryId) {
      filter.category_id = new Types.ObjectId(categoryId);
    }
    if (status) {
      filter.status = status;
    }
    applySearchTextFilter(filter, search);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .populate('category_id', 'name description')
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }),
      this.productModel.countDocuments(filter),
    ]);

    const stockMap = await this.getStockMap(
      tenantId,
      items.map((item) => item._id.toString()),
    );

    return {
      items: items.map((item) =>
        this.toResponse(item, stockMap.get(item._id.toString()) ?? 0),
      ),
      total,
      page,
      limit,
    };
  }

  async create(
    tenantId: string,
    dto: CreateProductDto,
  ): Promise<ProductDocument> {
    this.logger.step('ProductsService.create', { tenantId, sku: dto.sku });

    if (dto.category_id) {
      await this.categoriesService.assertCategoryInTenant(
        tenantId,
        dto.category_id,
      );
    }

    await this.assertSkuAvailable(tenantId, dto.sku);
    if (dto.barcode) {
      await this.assertBarcodeAvailable(tenantId, dto.barcode);
    }

    const prices = await this.resolvePricesForWrite(
      tenantId,
      dto.selling_price,
      dto.prices,
    );

    const product = await this.productModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      sku: dto.sku.trim(),
      name: dto.name.trim(),
      search_text: productSearchText(
        dto.name.trim(),
        dto.sku.trim(),
        dto.barcode?.trim(),
      ),
      cost_price: dto.cost_price,
      selling_price: prices.RETAIL,
      prices,
      minimum_stock: dto.minimum_stock ?? 0,
      image_url: dto.image_url?.trim() ?? '',
      status: ProductStatus.ACTIVE,
      ...(dto.barcode?.trim() ? { barcode: dto.barcode.trim() } : {}),
      ...(dto.category_id
        ? { category_id: new Types.ObjectId(dto.category_id) }
        : {}),
    });

    const created = await this.findByIdInTenant(tenantId, product._id.toString());
    if (!created) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }
    return created;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductDocument> {
    this.logger.step('ProductsService.update', { tenantId, id, ...dto });

    const product = await this.productModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });

    if (!product) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }

    if (dto.category_id) {
      await this.categoriesService.assertCategoryInTenant(
        tenantId,
        dto.category_id,
      );
      product.category_id = new Types.ObjectId(dto.category_id);
    }

    if (dto.sku && dto.sku.trim() !== product.sku) {
      await this.assertSkuAvailable(tenantId, dto.sku, id);
      product.sku = dto.sku.trim();
    }

    if (dto.barcode !== undefined) {
      const nextBarcode = dto.barcode?.trim() || null;
      const currentBarcode = product.barcode ?? null;
      if (nextBarcode !== currentBarcode) {
        if (nextBarcode) {
          await this.assertBarcodeAvailable(tenantId, nextBarcode, id);
        }
        product.barcode = nextBarcode ?? undefined;
      }
    }

    if (dto.name) product.name = dto.name.trim();
    if (dto.cost_price !== undefined) product.cost_price = dto.cost_price;

    if (dto.prices !== undefined) {
      const prices = await this.resolvePricesForWrite(
        tenantId,
        dto.selling_price ?? product.selling_price,
        dto.prices,
      );
      product.prices = prices;
      product.selling_price = prices.RETAIL;
    } else if (dto.selling_price !== undefined) {
      const prices = this.priceTiersService.resolveProductPrices(product);
      prices.RETAIL = dto.selling_price;
      product.selling_price = dto.selling_price;
      product.prices = prices;
    }

    if (dto.minimum_stock !== undefined) {
      product.minimum_stock = dto.minimum_stock;
    }
    if (dto.image_url !== undefined) {
      product.image_url = dto.image_url.trim();
    }

    product.search_text = productSearchText(
      product.name,
      product.sku,
      product.barcode,
    );

    await product.save();

    const updated = await this.findByIdInTenant(tenantId, id);
    if (!updated) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }
    return updated;
  }

  async activate(tenantId: string, id: string): Promise<ProductDocument> {
    this.logger.step('ProductsService.activate', { tenantId, id });

    const product = await this.findByIdInTenant(tenantId, id);
    if (!product) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }

    product.status = ProductStatus.ACTIVE;
    await product.save();
    return product;
  }

  async deactivate(tenantId: string, id: string): Promise<ProductDocument> {
    this.logger.step('ProductsService.deactivate', { tenantId, id });

    const product = await this.findByIdInTenant(tenantId, id);
    if (!product) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }

    product.status = ProductStatus.DISABLED;
    await product.save();
    return product;
  }

  async softDelete(tenantId: string, id: string): Promise<ProductDocument> {
    this.logger.step('ProductsService.softDelete', { tenantId, id });

    const product = await this.productModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });

    if (!product) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }

    this.productImagesService.cascadeSoftDeleteImages(product);
    product.is_deleted = true;
    product.deleted_at = new Date();
    await product.save();
    return product;
  }

  async getDetail(tenantId: string, id: string) {
    const product = await this.findByIdInTenant(tenantId, id);
    if (!product) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }

    const stockMap = await this.getStockMap(tenantId, [id]);
    return this.toResponse(product, stockMap.get(id) ?? 0);
  }

  private async getStockMap(
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, number>> {
    const stockMap = new Map<string, number>();
    if (productIds.length === 0) {
      return stockMap;
    }

    const balances = await this.inventoryBalanceModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        product_id: {
          $in: productIds.map((productId) => new Types.ObjectId(productId)),
        },
      })
      .select('product_id available_quantity')
      .lean();

    for (const balance of balances) {
      stockMap.set(balance.product_id.toString(), balance.available_quantity);
    }

    return stockMap;
  }

  private async assertSkuAvailable(
    tenantId: string,
    sku: string,
    excludeId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      sku: sku.trim(),
      is_deleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const existing = await this.productModel.findOne(filter);
    if (existing) {
      throw new AppError(ERRORS.PRODUCT.SKU_EXISTS);
    }
  }

  private async assertBarcodeAvailable(
    tenantId: string,
    barcode: string,
    excludeId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      barcode: barcode.trim(),
      is_deleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const existing = await this.productModel.findOne(filter);
    if (existing) {
      throw new AppError(ERRORS.PRODUCT.BARCODE_EXISTS);
    }
  }

  toResponse(product: ProductDocument, stock = 0) {
    const populatedCategory = product.populated('category_id')
      ? (product.category_id as unknown as {
          _id: Types.ObjectId;
          name: string;
          description: string;
        })
      : null;

    return {
      id: product._id,
      tenant_id: product.tenant_id,
      sku: product.sku,
      barcode: product.barcode ?? null,
      name: product.name,
      category_id: populatedCategory?._id ?? product.category_id ?? null,
      category: populatedCategory
        ? {
            id: populatedCategory._id,
            name: populatedCategory.name,
            description: populatedCategory.description,
          }
        : undefined,
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      prices: this.priceTiersService.resolveProductPrices(product),
      minimum_stock: product.minimum_stock,
      image_url: product.image_url,
      images: this.productImagesService.buildImagesForProductResponse(product),
      status: product.status,
      stock,
      created_at: product.created_at,
      updated_at: product.updated_at,
    }
  }

  private async resolvePricesForWrite(
    tenantId: string,
    sellingPrice: number,
    pricesInput?: Record<string, number>,
  ): Promise<Record<string, number>> {
    const tierMap = await this.priceTiersService.getTierMap(tenantId);
    const allowedCodes = new Set(tierMap.keys());

    if (pricesInput) {
      this.priceTiersService.validateProductPricesInput(pricesInput, allowedCodes);
      return this.priceTiersService.normalizeProductPrices(
        pricesInput,
        sellingPrice,
        allowedCodes,
      );
    }

    return this.priceTiersService.normalizeProductPrices(
      {},
      sellingPrice,
      allowedCodes,
    );
  }

  async exportExcel(
    tenantId: string,
    options?: {
      search?: string;
      categoryId?: string;
      status?: ProductStatus;
      all?: boolean;
    },
  ): Promise<Buffer> {
    const tiers = await this.priceTiersService.list(tenantId, true);
    const headers = this.getProductCsvHeaders(tiers);
    const products = await this.findProductsForExport(tenantId, options);

    const rows = products.map((product) => {
      const prices = this.priceTiersService.resolveProductPrices(product);
      const category = product.populated('category_id')
        ? (product.category_id as unknown as { name?: string })
        : null;

      return [
        product.sku,
        product.name,
        product.barcode ?? '',
        category?.name ?? '',
        product.cost_price,
        ...tiers.map((tier) => prices[tier.code] ?? ''),
        product.minimum_stock,
        product.status,
        product.image_url ?? '',
      ];
    });

    return buildExcelBuffer(headers, rows, {
      sheetName: 'Products',
      columnFormats: getProductImportColumnFormats(headers),
    });
  }

  async getImportTemplateExcel(tenantId: string): Promise<Buffer> {
    const { headers, rows } = await this.getImportTemplateData(tenantId);
    return buildExcelBuffer(headers, rows, {
      columnFormats: getProductImportColumnFormats(headers),
    });
  }

  private async getImportTemplateData(tenantId: string): Promise<{
    headers: string[];
    rows: unknown[][];
  }> {
    const tiers = await this.priceTiersService.list(tenantId, true);
    const headers = this.getProductCsvHeaders(tiers);
    const sampleRow = [
      'SKU001',
      'Pepsi 330ml',
      '8934567890123',
      'Nước ngọt',
      8000,
      ...tiers.map((tier, index) => {
        if (tier.code === 'RETAIL') return 15000;
        if (tier.code === 'WHOLESALE') return 12000;
        if (tier.code === 'VIP') return 13500;
        return 14000 + index * 100;
      }),
      10,
      'ACTIVE',
      '',
    ];

    return { headers, rows: [sampleRow] };
  }

  private getProductCsvHeaders(
    tiers: Array<{ code: string }>,
  ): string[] {
    return [
      'sku',
      'name',
      'barcode',
      'category_name',
      'cost_price',
      ...tiers.map((tier) => `price_${tier.code.toLowerCase()}`),
      'minimum_stock',
      'status',
      'image_url',
    ];
  }

  private async findProductsForExport(
    tenantId: string,
    options?: {
      search?: string;
      categoryId?: string;
      status?: ProductStatus;
      all?: boolean;
    },
  ): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (!options?.all) {
      if (options?.categoryId) {
        filter.category_id = new Types.ObjectId(options.categoryId);
      }
      if (options?.status) {
        filter.status = options.status;
      }
      applySearchTextFilter(filter, options?.search);
    }

    return this.productModel
      .find(filter)
      .populate('category_id', 'name')
      .sort({ sku: 1 })
      .limit(APP.csv.exportMaxRows);
  }
}
