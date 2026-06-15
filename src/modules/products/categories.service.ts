import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Product, ProductDocument } from './schemas/product.schema';
import { Category, CategoryDocument } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<CategoryDocument | null> {
    return this.categoryModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
  }

  async assertCategoryInTenant(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryDocument> {
    const category = await this.findByIdInTenant(tenantId, categoryId);
    if (!category) {
      throw new AppError(ERRORS.CATEGORY.NOT_FOUND);
    }
    return category;
  }

  async list(
    tenantId: string,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    this.logger.step('CategoriesService.list', {
      tenantId,
      page,
      limit,
      search,
    });

    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.categoryModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ name: 1 }),
      this.categoryModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
    };
  }

  async create(
    tenantId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryDocument> {
    this.logger.step('CategoriesService.create', { tenantId, name: dto.name });

    await this.assertNameAvailable(tenantId, dto.name);

    return this.categoryModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    this.logger.step('CategoriesService.update', { tenantId, id, ...dto });

    const category = await this.findByIdInTenant(tenantId, id);
    if (!category) {
      throw new AppError(ERRORS.CATEGORY.NOT_FOUND);
    }

    if (dto.name && dto.name.trim() !== category.name) {
      await this.assertNameAvailable(tenantId, dto.name, id);
      category.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      category.description = dto.description.trim();
    }

    await category.save();
    return category;
  }

  async softDelete(tenantId: string, id: string): Promise<CategoryDocument> {
    this.logger.step('CategoriesService.softDelete', { tenantId, id });

    const category = await this.findByIdInTenant(tenantId, id);
    if (!category) {
      throw new AppError(ERRORS.CATEGORY.NOT_FOUND);
    }

    const productCount = await this.productModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      category_id: category._id,
      is_deleted: false,
    });

    if (productCount > 0) {
      throw new AppError(ERRORS.CATEGORY.CATEGORY_IN_USE);
    }

    category.is_deleted = true;
    category.deleted_at = new Date();
    await category.save();
    return category;
  }

  private async assertNameAvailable(
    tenantId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      name: name.trim(),
      is_deleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const existing = await this.categoryModel.findOne(filter);
    if (existing) {
      throw new AppError(ERRORS.CATEGORY.NAME_EXISTS);
    }
  }

  toResponse(category: CategoryDocument) {
    return {
      id: category._id,
      tenant_id: category.tenant_id,
      name: category.name,
      description: category.description,
      created_at: category.created_at,
      updated_at: category.updated_at,
    };
  }
}
