import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../modules/products/schemas/product.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const productModel = app.get<Model<ProductDocument>>(
      getModelToken(Product.name),
    );

    const products = await productModel.find({
      is_deleted: false,
      image_url: { $nin: ['', null] },
      $or: [{ images: { $exists: false } }, { images: { $size: 0 } }],
    });

    let migrated = 0;
    for (const product of products) {
      product.images = [
        {
          public_id: product.image_url,
          secure_url: product.image_url,
          width: 0,
          height: 0,
          format: 'external',
          bytes: 0,
          is_primary: true,
          sort_order: 0,
          uploaded_by: product.tenant_id,
          is_deleted: false,
        },
      ];
      await product.save();
      migrated += 1;
    }

    console.log(`Migrated ${migrated} product(s) with legacy image_url.`);
  } finally {
    await app.close().catch(() => undefined);
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
