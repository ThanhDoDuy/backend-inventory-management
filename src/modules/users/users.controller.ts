import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import { UserStatus } from '../../shared/constants/roles.enum';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  ActivateUserDto,
  AssignRoleDto,
  CreateUserDto,
  DisableUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.USERS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role_id') roleId?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      roleId,
      status,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.USERS.VIEW)
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const found = await this.usersService.findByIdInTenant(user.tenantId, id);
    return found ? this.usersService.toProfile(found) : null;
  }

  @Post()
  @RequirePermission(PERMISSIONS.USERS.CREATE)
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    const created = await this.usersService.create(user.tenantId, dto);
    return this.usersService.toProfile(created);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.USERS.UPDATE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const updated = await this.usersService.update(user.tenantId, id, dto);
    return this.usersService.toProfile(updated);
  }

  @Patch(':id/assign-role')
  @RequirePermission(PERMISSIONS.USERS.UPDATE)
  async assignRole(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    const updated = await this.usersService.assignRole(
      user.tenantId,
      id,
      dto.role_id,
    );
    return this.usersService.toProfile(updated);
  }

  @Patch(':id/disable')
  @RequirePermission(PERMISSIONS.USERS.DELETE)
  async disable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() _dto: DisableUserDto,
  ) {
    const updated = await this.usersService.disable(user.tenantId, id);
    return this.usersService.toProfile(updated);
  }

  @Patch(':id/activate')
  @RequirePermission(PERMISSIONS.USERS.DELETE)
  async activate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() _dto: ActivateUserDto,
  ) {
    const updated = await this.usersService.activate(user.tenantId, id);
    return this.usersService.toProfile(updated);
  }

  @Post(':id/reset-password')
  @RequirePermission(PERMISSIONS.USERS.UPDATE)
  async resetPassword(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.usersService.resetPassword(
      user.tenantId,
      id,
      dto.new_password,
    );
    return { message: 'Password reset successfully' };
  }
}
