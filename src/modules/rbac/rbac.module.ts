import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { RbacController } from './rbac.controller';
import { RbacSeedService } from './rbac.seed.service';
import { RbacService } from './rbac.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Permission.name, schema: PermissionSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  controllers: [RbacController],
  providers: [RbacService, RbacSeedService],
  exports: [RbacService],
})
export class RbacModule {}
