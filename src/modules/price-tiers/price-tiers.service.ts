import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema';
import {
  DEFAULT_PRICE_TIERS,
  MAX_CUSTOM_PRICE_TIERS,
  RETAIL_TIER_CODE,
  SYSTEM_PRICE_TIER_CODES,
} from './constants/default-price-tiers';
import { CreatePriceTierDto, UpdatePriceTierDto } from './dto/price-tier.dto';
import { PriceTier, PriceTierDocument } from './schemas/price-tier.schema';

@Injectable()
export class PriceTiersService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(PriceTier.name)
    private priceTierModel: Model<PriceTierDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureAllTenants();
    await this.migrateProductPrices();
  }

  async seedForTenant(tenantId: string): Promise<void> {
    for (const tier of DEFAULT_PRICE_TIERS) {
      await this.priceTierModel.updateOne(
        {
          tenant_id: new Types.ObjectId(tenantId),
          code: tier.code,
        },
        {
          $setOnInsert: {
            tenant_id: new Types.ObjectId(tenantId),
            code: tier.code,
            label: tier.label,
            is_system: true,
            is_active: true,
            sort_order: tier.sort_order,
          },
        },
        { upsert: true },
      );
    }
  }

  async list(tenantId: string, activeOnly = true) {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
    };
    if (activeOnly) {
      filter.is_active = true;
    }

    const items = await this.priceTierModel
      .find(filter)
      .sort({ sort_order: 1, code: 1 })
      .lean();

    return items.map((item) => this.toResponse(item));
  }

  async createCustom(tenantId: string, dto: CreatePriceTierDto) {
    if (SYSTEM_PRICE_TIER_CODES.includes(dto.code as (typeof SYSTEM_PRICE_TIER_CODES)[number])) {
      throw new AppError(ERRORS.PRICE_TIER.SYSTEM_PROTECTED);
    }

    const customCount = await this.priceTierModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      is_system: false,
      is_active: true,
    });

    if (customCount >= MAX_CUSTOM_PRICE_TIERS) {
      throw new AppError(ERRORS.PRICE_TIER.LIMIT_REACHED);
    }

    const existing = await this.priceTierModel.findOne({
      tenant_id: new Types.ObjectId(tenantId),
      code: dto.code,
    });

    if (existing) {
      throw new AppError(ERRORS.PRICE_TIER.CODE_EXISTS);
    }

    const maxSort = await this.priceTierModel
      .findOne({ tenant_id: new Types.ObjectId(tenantId) })
      .sort({ sort_order: -1 })
      .select('sort_order')
      .lean();

    const created = await this.priceTierModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      code: dto.code.trim(),
      label: dto.label.trim(),
      is_system: false,
      is_active: true,
      sort_order: (maxSort?.sort_order ?? 0) + 1,
    });

    return this.toResponse(created);
  }

  async update(tenantId: string, code: string, dto: UpdatePriceTierDto) {
    const tier = await this.priceTierModel.findOne({
      tenant_id: new Types.ObjectId(tenantId),
      code,
    });

    if (!tier) {
      throw new AppError(ERRORS.PRICE_TIER.NOT_FOUND);
    }

    if (tier.is_system && dto.is_active === false) {
      throw new AppError(ERRORS.PRICE_TIER.SYSTEM_PROTECTED);
    }

    if (dto.label !== undefined) {
      tier.label = dto.label.trim();
    }
    if (dto.is_active !== undefined) {
      tier.is_active = dto.is_active;
    }

    await tier.save();
    return this.toResponse(tier);
  }

  async getTierMap(tenantId: string): Promise<Map<string, PriceTierDocument>> {
    const tiers = await this.priceTierModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      is_active: true,
    });

    return new Map(tiers.map((tier) => [tier.code, tier]));
  }

  normalizeProductPrices(
    prices: Record<string, number> | undefined,
    sellingPrice: number,
    allowedCodes: Set<string>,
  ): Record<string, number> {
    const retail = prices?.[RETAIL_TIER_CODE] ?? sellingPrice;
    const normalized: Record<string, number> = {
      WHOLESALE: prices?.WHOLESALE ?? retail,
      VIP: prices?.VIP ?? retail,
      RETAIL: retail,
    };

    for (const [code, amount] of Object.entries(prices ?? {})) {
      if (SYSTEM_PRICE_TIER_CODES.includes(code as (typeof SYSTEM_PRICE_TIER_CODES)[number])) {
        continue;
      }
      if (allowedCodes.has(code)) {
        normalized[code] = amount;
      }
    }

    for (const code of allowedCodes) {
      if (!SYSTEM_PRICE_TIER_CODES.includes(code as (typeof SYSTEM_PRICE_TIER_CODES)[number])) {
        if (normalized[code] === undefined) {
          normalized[code] = retail;
        }
      }
    }

    return normalized;
  }

  validateProductPricesInput(
    prices: Record<string, number>,
    allowedCodes: Set<string>,
  ): void {
    for (const [code, amount] of Object.entries(prices)) {
      if (!allowedCodes.has(code)) {
        throw new AppError(ERRORS.PRICE_TIER.INVALID_FOR_TENANT, {
          details: { code },
        });
      }
      if (amount < 0) {
        throw new AppError(ERRORS.PRICE_TIER.INVALID_AMOUNT, {
          details: { code, amount },
        });
      }
    }

    for (const code of SYSTEM_PRICE_TIER_CODES) {
      if (prices[code] === undefined) {
        throw new AppError(ERRORS.PRICE_TIER.MISSING_SYSTEM_PRICE, {
          details: { code },
        });
      }
    }
  }

  resolveProductPrices(product: {
    selling_price: number;
    prices?: Record<string, number>;
  }): Record<string, number> {
    const retail = product.prices?.[RETAIL_TIER_CODE] ?? product.selling_price;
    const resolved: Record<string, number> = {
      WHOLESALE: product.prices?.WHOLESALE ?? retail,
      VIP: product.prices?.VIP ?? retail,
      RETAIL: retail,
    };

    for (const [code, amount] of Object.entries(product.prices ?? {})) {
      if (!(code in resolved)) {
        resolved[code] = amount;
      }
    }

    return resolved;
  }

  getPriceForTier(
    product: { selling_price: number; prices?: Record<string, number> },
    tierCode: string,
  ): number | undefined {
    const prices = this.resolveProductPrices(product);
    return prices[tierCode];
  }

  private async ensureAllTenants(): Promise<void> {
    const tenants = await this.tenantModel.find().select('_id').lean();
    for (const tenant of tenants) {
      await this.seedForTenant(tenant._id.toString());
    }
  }

  private async migrateProductPrices(): Promise<void> {
    const products = await this.productModel
      .find({
        is_deleted: false,
        $or: [{ prices: { $exists: false } }, { prices: null }, { prices: {} }],
      })
      .select('_id selling_price')
      .lean();

    for (const product of products) {
      const retail = product.selling_price;
      await this.productModel.updateOne(
        { _id: product._id },
        {
          $set: {
            prices: {
              WHOLESALE: retail,
              VIP: retail,
              RETAIL: retail,
            },
          },
        },
      );
    }

    if (products.length > 0) {
      this.logger.step('PriceTiersService.migrateProductPrices', {
        count: products.length,
      });
    }
  }

  private toResponse(tier: {
    _id: Types.ObjectId;
    code: string;
    label: string;
    is_system: boolean;
    is_active: boolean;
    sort_order: number;
  }) {
    return {
      id: tier._id,
      code: tier.code,
      label: tier.label,
      is_system: tier.is_system,
      is_active: tier.is_active,
      sort_order: tier.sort_order,
    };
  }
}
