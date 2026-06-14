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
import { Role, UserStatus } from '../../shared/constants/roles.enum';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  ActivateUserDto,
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
  @RequirePermission('users:view')
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: Role,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      role,
      status,
    );
  }

  @Get(':id')
  @RequirePermission('users:view')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const found = await this.usersService.findByIdInTenant(user.tenantId, id);
    return found ? this.usersService.toProfile(found) : null;
  }

  @Post()
  @RequirePermission('users:create')
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    const created = await this.usersService.create(user.tenantId, dto);
    return this.usersService.toProfile(created);
  }

  @Patch(':id')
  @RequirePermission('users:update')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const updated = await this.usersService.update(user.tenantId, id, dto);
    return this.usersService.toProfile(updated);
  }

  @Patch(':id/disable')
  @RequirePermission('users:delete')
  async disable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() _dto: DisableUserDto,
  ) {
    const updated = await this.usersService.disable(user.tenantId, id);
    return this.usersService.toProfile(updated);
  }

  @Patch(':id/activate')
  @RequirePermission('users:delete')
  async activate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() _dto: ActivateUserDto,
  ) {
    const updated = await this.usersService.activate(user.tenantId, id);
    return this.usersService.toProfile(updated);
  }

  @Post(':id/reset-password')
  @RequirePermission('users:update')
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
