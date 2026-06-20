import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { APP } from '../../shared/constants/app.constants';
import { AppError, ERRORS } from '../../shared/errors';
import type {
  ProductImageUrlVariant,
  SignedProductUploadParams,
} from './cloudinary.types';

const TRANSFORM_BY_VARIANT: Record<ProductImageUrlVariant, object[]> = {
  thumb: [{ width: 120, height: 120, crop: 'fill', quality: 'auto', fetch_format: 'auto' }],
  list: [{ width: 80, height: 80, crop: 'fill', quality: 'auto', fetch_format: 'auto' }],
  detail: [{ width: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
  zoom: [{ width: 1600, crop: 'limit', quality: 'auto' }],
};

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private cloudName = '';
  private apiKey = '';
  private apiSecret = '';
  private folderPrefix = '';
  private envSegment = '';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.cloudName = this.configService.get<string>('cloudinary.cloudName') ?? '';
    this.apiKey = this.configService.get<string>('cloudinary.apiKey') ?? '';
    this.apiSecret = this.configService.get<string>('cloudinary.apiSecret') ?? '';
    this.folderPrefix = this.configService.get<string>('cloudinary.folderPrefix') ?? 'poos';
    this.envSegment = this.configService.get<string>('nodeEnv') ?? 'development';

    if (this.isConfigured()) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new AppError(ERRORS.PRODUCT_IMAGE.NOT_CONFIGURED);
    }
  }

  buildProductFolder(tenantSlug: string, productId: string): string {
    return `${this.folderPrefix}/${this.envSegment}/tenants/${tenantSlug}/products/${productId}`;
  }

  buildExpectedPublicIdPrefix(tenantSlug: string, productId: string): string {
    return `${this.buildProductFolder(tenantSlug, productId)}/`;
  }

  signProductImageUpload(
    tenantSlug: string,
    productId: string,
  ): SignedProductUploadParams {
    this.assertConfigured();

    const timestamp = Math.round(Date.now() / 1000);
    const folder = this.buildProductFolder(tenantSlug, productId);
    const public_id = `${folder}/${randomUUID()}`;
    const transformation = APP.productImage.incomingTransformation;

    const paramsToSign: Record<string, string | number | boolean> = {
      timestamp,
      folder,
      public_id,
      overwrite: false,
      unique_filename: true,
      invalidate: true,
      transformation,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.apiSecret,
    );

    return {
      signature,
      timestamp,
      folder,
      public_id,
      api_key: this.apiKey,
      cloud_name: this.cloudName,
      upload_url: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      transformation,
    };
  }

  buildTransformUrl(
    publicId: string,
    variant: ProductImageUrlVariant = 'detail',
  ): string {
    this.assertConfigured();
    return cloudinary.url(publicId, {
      secure: true,
      transformation: TRANSFORM_BY_VARIANT[variant],
    });
  }

  async destroyAsset(publicId: string): Promise<void> {
    this.assertConfigured();
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  }
}
