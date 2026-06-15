import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RbacService } from './rbac.service';

@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  @RequirePermission(PERMISSIONS.RBAC.VIEW)
  listPermissions() {
    return this.rbacService.listPermissions();
  }

  @Get('roles')
  @RequirePermission(PERMISSIONS.RBAC.VIEW)
  listRoles(@CurrentUser() user: RequestUser) {
    return this.rbacService.listRoles(user.tenantId);
  }

  @Get('roles/:id')
  @RequirePermission(PERMISSIONS.RBAC.VIEW)
  getRole(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.rbacService.getRoleById(user.tenantId, id);
  }

  @Post('roles')
  @RequirePermission(PERMISSIONS.RBAC.UPDATE)
  createRole(@CurrentUser() user: RequestUser, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(user.tenantId, dto);
  }

  @Patch('roles/:id')
  @RequirePermission(PERMISSIONS.RBAC.UPDATE)
  updateRole(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rbacService.updateRole(user.tenantId, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission(PERMISSIONS.RBAC.UPDATE)
  deleteRole(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.rbacService.deleteRole(user.tenantId, id);
  }

  @Post('cache/clear')
  @RequirePermission(PERMISSIONS.RBAC.UPDATE)
  clearCache(@CurrentUser() user: RequestUser) {
    return this.rbacService.clearRbacCache(user.tenantId);
  }
}
