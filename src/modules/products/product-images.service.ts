import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';
import type { ProductImageUrlVariant } from '../../infrastructure/cloudinary/cloudinary.types';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { TenantsService } from '../tenants/tenants.service';
import { APP } from '../../shared/constants/app.constants';
import { AppError, ERRORS } from '../../shared/errors';
import { ConfirmProductImageDto } from './dto/product-image.dto';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductImage } from './schemas/product-image.schema';

export interface ProductImageView {
  id: string;
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  is_primary: boolean;
  sort_order: number;
  uploaded_at?: Date;
  urls: Record<ProductImageUrlVariant, string>;
}

@Injectable()
export class ProductImagesService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly tenantsService: TenantsService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly logger: AppLoggerService,
  ) {}

  async list(tenantId: string, productId: string) {
    const product = await this.getActiveProduct(tenantId, productId);
    const images = this.getActiveImages(product);

    return {
      images: images.map((image) => this.toImageView(image)),
      primary_image_url: product.image_url || null,
    };
  }

  async signUpload(tenantId: string, productId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new AppError(ERRORS.TENANT.NOT_FOUND);
    }

    const product = await this.getActiveProduct(tenantId, productId);
    const activeCount = this.getActiveImages(product).length;
    if (activeCount >= APP.productImage.maxCount) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.LIMIT_EXCEEDED);
    }

    return this.cloudinaryService.signProductImageUpload(
      tenant.slug,
      productId,
    );
  }

  async confirmUpload(
    tenantId: string,
    productId: string,
    userId: string,
    dto: ConfirmProductImageDto,
  ) {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new AppError(ERRORS.TENANT.NOT_FOUND);
    }

    this.validateConfirmedAsset(tenant.slug, productId, dto);

    const product = await this.getActiveProduct(tenantId, productId);
    const activeImages = this.getActiveImages(product);

    if (activeImages.length >= APP.productImage.maxCount) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.LIMIT_EXCEEDED);
    }

    const duplicate = activeImages.some((img) => img.public_id === dto.public_id);
    if (duplicate) {
      const existing = activeImages.find((img) => img.public_id === dto.public_id)!;
      return {
        images: activeImages.map((image) => this.toImageView(image)),
        primary_image_url: product.image_url || null,
        image: this.toImageView(existing),
      };
    }

    const isPrimary = activeImages.length === 0;
    const image: ProductImage = {
      public_id: dto.public_id,
      secure_url: dto.secure_url,
      width: dto.width,
      height: dto.height,
      format: dto.format.toLowerCase(),
      bytes: dto.bytes,
      is_primary: isPrimary,
      sort_order: activeImages.length,
      uploaded_by: new Types.ObjectId(userId),
      is_deleted: false,
    };

    product.images = product.images ?? [];
    product.images.push(image);
    this.syncPrimaryUrl(product);
    await product.save();

    this.logger.step('ProductImagesService.confirmUpload', {
      tenantId,
      productId,
      publicId: dto.public_id,
    });

    const saved = product.images[product.images.length - 1];
    return {
      images: this.getActiveImages(product).map((item) => this.toImageView(item)),
      primary_image_url: product.image_url || null,
      image: this.toImageView(saved),
    };
  }

  async setPrimary(tenantId: string, productId: string, imageId: string) {
    const product = await this.getActiveProduct(tenantId, productId);
    const image = this.findActiveImage(product, imageId);
    if (!image) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.NOT_FOUND);
    }

    for (const item of product.images) {
      if (item.is_deleted) {
        continue;
      }
      item.is_primary = item._id?.toString() === imageId;
    }

    this.syncPrimaryUrl(product);
    await product.save();

    return {
      images: this.getActiveImages(product).map((item) => this.toImageView(item)),
      primary_image_url: product.image_url || null,
    };
  }

  async softDelete(tenantId: string, productId: string, imageId: string) {
    const product = await this.getActiveProduct(tenantId, productId);
    const image = product.images.find(
      (item) => item._id?.toString() === imageId && !item.is_deleted,
    );

    if (!image) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.NOT_FOUND);
    }

    const wasPrimary = image.is_primary;
    image.is_deleted = true;
    image.deleted_at = new Date();
    image.is_primary = false;

    const activeImages = this.getActiveImages(product);
    if (wasPrimary && activeImages.length > 0) {
      const nextPrimary = activeImages.sort(
        (a, b) => a.sort_order - b.sort_order,
      )[0];
      nextPrimary.is_primary = true;
    }

    this.reindexSortOrder(product);
    this.syncPrimaryUrl(product);
    await product.save();

    this.logger.step('ProductImagesService.softDelete', {
      tenantId,
      productId,
      imageId,
      publicId: image.public_id,
    });

    return {
      images: this.getActiveImages(product).map((item) => this.toImageView(item)),
      primary_image_url: product.image_url || null,
    };
  }

  cascadeSoftDeleteImages(product: ProductDocument): void {
    if (!product.images?.length) {
      product.image_url = '';
      return;
    }

    const now = new Date();
    for (const image of product.images) {
      if (!image.is_deleted) {
        image.is_deleted = true;
        image.deleted_at = now;
        image.is_primary = false;
      }
    }
    product.image_url = '';
  }

  buildImagesForProductResponse(product: ProductDocument): ProductImageView[] {
    return this.getActiveImages(product).map((image) => this.toImageView(image));
  }

  private validateConfirmedAsset(
    tenantSlug: string,
    productId: string,
    dto: ConfirmProductImageDto,
  ): void {
    const expectedPrefix = this.cloudinaryService.buildExpectedPublicIdPrefix(
      tenantSlug,
      productId,
    );

    if (!dto.public_id.startsWith(expectedPrefix)) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.UNAUTHORIZED_ASSET);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(dto.secure_url);
    } catch {
      throw new AppError(ERRORS.PRODUCT_IMAGE.INVALID_ASSET);
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== APP.productImage.secureUrlHost
    ) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.INVALID_ASSET);
    }

    const encodedPath = dto.public_id.split('/').pop();
    if (!encodedPath || !dto.secure_url.includes(encodedPath)) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.INVALID_ASSET);
    }

    const format = dto.format.toLowerCase();
    if (
      !APP.productImage.allowedFormats.includes(
        format as (typeof APP.productImage.allowedFormats)[number],
      )
    ) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.INVALID_ASSET, {
        message: `Unsupported image format: ${format}`,
      });
    }

    if (dto.bytes > APP.productImage.maxBytes) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.INVALID_ASSET, {
        message: 'Image exceeds maximum allowed size',
      });
    }
  }

  private async getActiveProduct(
    tenantId: string,
    productId: string,
  ): Promise<ProductDocument> {
    const product = await this.productModel.findOne({
      _id: productId,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });

    if (!product) {
      throw new AppError(ERRORS.PRODUCT.NOT_FOUND);
    }

    return product;
  }

  private getActiveImages(product: ProductDocument): ProductImage[] {
    return (product.images ?? [])
      .filter((image) => !image.is_deleted)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  private findActiveImage(
    product: ProductDocument,
    imageId: string,
  ): ProductImage | undefined {
    return this.getActiveImages(product).find(
      (image) => image._id?.toString() === imageId,
    );
  }

  private reindexSortOrder(product: ProductDocument): void {
    const active = this.getActiveImages(product);
    active.forEach((image, index) => {
      image.sort_order = index;
    });
  }

  private syncPrimaryUrl(product: ProductDocument): void {
    const primary = this.getActiveImages(product).find((image) => image.is_primary);
    product.image_url = primary?.secure_url ?? '';
  }

  private toImageView(image: ProductImage): ProductImageView {
    const urls = {
      thumb: this.safeTransformUrl(image.public_id, 'thumb'),
      list: this.safeTransformUrl(image.public_id, 'list'),
      detail: this.safeTransformUrl(image.public_id, 'detail'),
      zoom: this.safeTransformUrl(image.public_id, 'zoom'),
    };

    return {
      id: image._id!.toString(),
      public_id: image.public_id,
      secure_url: image.secure_url,
      width: image.width,
      height: image.height,
      format: image.format,
      bytes: image.bytes,
      is_primary: image.is_primary,
      sort_order: image.sort_order,
      uploaded_at: image.uploaded_at,
      urls,
    };
  }

  private safeTransformUrl(
    publicId: string,
    variant: ProductImageUrlVariant,
  ): string {
    if (!this.cloudinaryService.isConfigured()) {
      return '';
    }

    try {
      return this.cloudinaryService.buildTransformUrl(publicId, variant);
    } catch {
      return '';
    }
  }
}
