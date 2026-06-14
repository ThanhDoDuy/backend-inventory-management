import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import { TenantStatus } from '../../shared/constants/roles.enum';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private configService: ConfigService,
  ) {}

  async countActive(): Promise<number> {
    return this.tenantModel.countDocuments({ status: TenantStatus.ACTIVE });
  }

  async assertCanCreateTenant(): Promise<void> {
    const max = this.configService.get<number>('maxTenants') ?? 20;
    const count = await this.countActive();
    if (count >= max) {
      throw new ConflictException({
        code: 'TENANT_LIMIT_REACHED',
        message: `Platform capacity reached (${max} stores max)`,
      });
    }
  }

  async create(name: string, slug: string): Promise<TenantDocument> {
    return this.tenantModel.create({
      name,
      slug,
      status: TenantStatus.ACTIVE,
    });
  }

  async findById(id: string): Promise<TenantDocument | null> {
    return this.tenantModel.findById(id);
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
