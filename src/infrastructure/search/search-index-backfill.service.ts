import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppLoggerService } from '../logger/app-logger.service';
import { Product, ProductDocument } from '../../modules/products/schemas/product.schema';
import { Category, CategoryDocument } from '../../modules/products/schemas/category.schema';
import { Supplier, SupplierDocument } from '../../modules/suppliers/schemas/supplier.schema';
import { Customer, CustomerDocument } from '../../modules/customers/schemas/customer.schema';
import { User, UserDocument } from '../../modules/users/schemas/user.schema';
import {
  categorySearchText,
  customerSearchText,
  productSearchText,
  supplierSearchText,
  userSearchText,
} from '../../shared/utils/search.util';

@Injectable()
export class SearchIndexBackfillService implements OnModuleInit {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  onModuleInit(): void {
    void this.backfillAll();
  }

  private async backfillAll(): Promise<void> {
    try {
      const [products, categories, suppliers, customers, users] = await Promise.all([
        this.backfillProducts(),
        this.backfillCategories(),
        this.backfillSuppliers(),
        this.backfillCustomers(),
        this.backfillUsers(),
      ]);

      const total = products + categories + suppliers + customers + users;
      if (total > 0) {
        this.logger.step('SearchIndexBackfillService.backfillAll', {
          message: 'Search index backfill completed',
          updated: total,
        });
      }
    } catch (error) {
      this.logger.error('SearchIndexBackfillService.backfillAll', error);
    }
  }

  private async backfillProducts(): Promise<number> {
    const docs = await this.productModel
      .find({
        is_deleted: false,
        $or: [{ search_text: { $exists: false } }, { search_text: '' }],
      })
      .select('name sku barcode')
      .limit(5000)
      .lean();

    if (docs.length === 0) {
      return 0;
    }

    await Promise.all(
      docs.map((doc) =>
        this.productModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              search_text: productSearchText(doc.name, doc.sku, doc.barcode),
            },
          },
        ),
      ),
    );

    return docs.length;
  }

  private async backfillCategories(): Promise<number> {
    const docs = await this.categoryModel
      .find({
        is_deleted: false,
        $or: [{ search_text: { $exists: false } }, { search_text: '' }],
      })
      .select('name description')
      .limit(5000)
      .lean();

    if (docs.length === 0) {
      return 0;
    }

    await Promise.all(
      docs.map((doc) =>
        this.categoryModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              search_text: categorySearchText(doc.name, doc.description),
            },
          },
        ),
      ),
    );

    return docs.length;
  }

  private async backfillSuppliers(): Promise<number> {
    const docs = await this.supplierModel
      .find({
        is_deleted: false,
        $or: [{ search_text: { $exists: false } }, { search_text: '' }],
      })
      .select('name phone email tax_code address')
      .limit(5000)
      .lean();

    if (docs.length === 0) {
      return 0;
    }

    await Promise.all(
      docs.map((doc) =>
        this.supplierModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              search_text: supplierSearchText(
                doc.name,
                doc.phone,
                doc.email,
                doc.tax_code,
                doc.address,
              ),
            },
          },
        ),
      ),
    );

    return docs.length;
  }

  private async backfillCustomers(): Promise<number> {
    const docs = await this.customerModel
      .find({
        is_deleted: false,
        $or: [{ search_text: { $exists: false } }, { search_text: '' }],
      })
      .select('name phone email tax_code contact_person')
      .limit(5000)
      .lean();

    if (docs.length === 0) {
      return 0;
    }

    await Promise.all(
      docs.map((doc) =>
        this.customerModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              search_text: customerSearchText(
                doc.name,
                doc.phone,
                doc.email,
                doc.tax_code,
                doc.contact_person,
              ),
            },
          },
        ),
      ),
    );

    return docs.length;
  }

  private async backfillUsers(): Promise<number> {
    const docs = await this.userModel
      .find({
        is_deleted: false,
        $or: [{ search_text: { $exists: false } }, { search_text: '' }],
      })
      .select('username email')
      .limit(5000)
      .lean();

    if (docs.length === 0) {
      return 0;
    }

    await Promise.all(
      docs.map((doc) =>
        this.userModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              search_text: userSearchText(doc.username, doc.email),
            },
          },
        ),
      ),
    );

    return docs.length;
  }
}
