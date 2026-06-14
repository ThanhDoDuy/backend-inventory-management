import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
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
  listRoles() {
    return this.rbacService.listRoles();
  }

  @Get('roles/:code')
  @RequirePermission(PERMISSIONS.RBAC.VIEW)
  getRole(@Param('code') code: string) {
    return this.rbacService.getRoleByCode(code);
  }

  @Patch('roles/:code/permissions')
  @RequirePermission(PERMISSIONS.RBAC.UPDATE)
  updateRolePermissions(
    @Param('code') code: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rbacService.updateRolePermissions(code, dto);
  }
}
