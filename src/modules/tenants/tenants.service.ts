import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import { TenantStatus } from '../../shared/constants/roles.enum';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async countActive(): Promise<number> {
    return this.tenantModel.countDocuments({ status: TenantStatus.ACTIVE });
  }

  async assertCanCreateTenant(): Promise<void> {
    this.logger.step('TenantsService.assertCanCreateTenant', {});

    const max = this.configService.get<number>('maxTenants') ?? 20;
    const count = await this.countActive();
    if (count >= max) {
      throw new AppError(ERRORS.TENANT.LIMIT_REACHED, {
        message: `Platform capacity reached (${max} stores max)`,
      });
    }
  }

  async create(name: string, slug: string): Promise<TenantDocument> {
    this.logger.step('TenantsService.create', { name, slug });

    return this.tenantModel.create({
      name,
      slug,
      status: TenantStatus.ACTIVE,
    });
  }

  async findById(id: string): Promise<TenantDocument | null> {
    this.logger.step('TenantsService.findById', { id });

    return this.tenantModel.findById(id);
  }

  async updateProfile(
    tenantId: string,
    updates: {
      name?: string;
      address?: string;
      phone?: string;
      city?: string;
      state?: string;
    },
  ): Promise<TenantDocument> {
    this.logger.step('TenantsService.updateProfile', { tenantId });

    const tenant = await this.findById(tenantId);
    if (!tenant) {
      throw new AppError(ERRORS.TENANT.NOT_FOUND);
    }

    if (updates.name !== undefined) {
      tenant.name = updates.name.trim();
    }
    if (updates.address !== undefined) {
      tenant.address = updates.address.trim();
    }
    if (updates.phone !== undefined) {
      tenant.phone = updates.phone.trim();
    }
    if (updates.city !== undefined) {
      tenant.city = updates.city.trim();
    }
    if (updates.state !== undefined) {
      tenant.state = updates.state.trim();
    }

    await tenant.save();
    return tenant;
  }

  slugify(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Date.now().toString(36);
    return `${base}-${suffix}`;
  }
}
