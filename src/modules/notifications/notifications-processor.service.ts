import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import {
  APP,
  DomainEventPayload,
} from '../../shared/constants/app.constants';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Role, RoleDocument } from '../rbac/schemas/role.schema';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { buildNotificationRedirectUrl } from './notification-redirect.util';

@Injectable()
export class NotificationsProcessorService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async processEvent(event: DomainEventPayload): Promise<void> {
    this.logger.step('NotificationsProcessorService.processEvent', {
      type: event.type,
      tenantId: event.tenantId,
    });

    switch (event.type) {
      case APP.queue.domainEvents.INVENTORY_LOW_STOCK:
        await this.handleLowStock(event);
        break;
      case APP.queue.domainEvents.PO_RECEIVED:
        await this.handlePoReceived(event);
        break;
      case APP.queue.domainEvents.INVOICE_PAID:
        await this.handleInvoicePaid(event);
        break;
      default:
        this.logger.warn('NotificationsProcessorService.unknown_event', {
          type: event.type,
        });
    }
  }

  private async handleLowStock(event: DomainEventPayload): Promise<void> {
    const productName = String(event.data.productName ?? 'Product');
    const availableQuantity = Number(event.data.availableQuantity ?? 0);
    const minimumStock = Number(event.data.minimumStock ?? 0);

    const recipients = await this.findUsersByRoles(event.tenantId, [
      RoleCode.ADMIN,
      RoleCode.MANAGER,
    ]);

    await this.createForUsers(recipients, {
      tenantId: event.tenantId,
      type: APP.notification.types.LOW_STOCK,
      title: 'Low stock alert',
      message: `${productName} is below minimum stock (${availableQuantity} / ${minimumStock})`,
      payload: event.data,
      redirectUrl: buildNotificationRedirectUrl(
        APP.notification.types.LOW_STOCK,
        event.data,
      ),
    });
  }

  private async handlePoReceived(event: DomainEventPayload): Promise<void> {
    const poNumber = String(event.data.poNumber ?? 'PO');
    const recipients = await this.findUsersByRoles(event.tenantId, [
      RoleCode.ADMIN,
      RoleCode.MANAGER,
    ]);

    await this.createForUsers(recipients, {
      tenantId: event.tenantId,
      type: APP.notification.types.PO_RECEIVED,
      title: 'Purchase order received',
      message: `${poNumber} has been received`,
      payload: event.data,
      redirectUrl: buildNotificationRedirectUrl(
        APP.notification.types.PO_RECEIVED,
        event.data,
      ),
    });
  }

  private async handleInvoicePaid(event: DomainEventPayload): Promise<void> {
    const invoiceNumber = String(event.data.invoiceNumber ?? 'Invoice');
    const actorUserId = event.actorUserId;
    const managerRecipients = await this.findUsersByRoles(event.tenantId, [
      RoleCode.ADMIN,
      RoleCode.MANAGER,
    ]);

    const recipientIds = new Set(managerRecipients);
    if (actorUserId) {
      recipientIds.add(actorUserId);
    }

    await this.createForUsers([...recipientIds], {
      tenantId: event.tenantId,
      type: APP.notification.types.INVOICE_PAID,
      title: 'Invoice paid',
      message: `Invoice ${invoiceNumber} has been paid`,
      payload: event.data,
      redirectUrl: buildNotificationRedirectUrl(
        APP.notification.types.INVOICE_PAID,
        event.data,
      ),
    });
  }

  private async findUsersByRoles(
    tenantId: string,
    roleCodes: RoleCode[],
  ): Promise<string[]> {
    const roles = await this.roleModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        code: { $in: roleCodes },
        is_active: true,
      })
      .select('_id')
      .lean();

    if (roles.length === 0) {
      return [];
    }

    const users = await this.userModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        role_id: { $in: roles.map((role) => role._id) },
        is_deleted: false,
      })
      .select('_id')
      .lean();

    return users.map((user) => user._id.toString());
  }

  private async createForUsers(
    userIds: string[],
    params: {
      tenantId: string;
      type: string;
      title: string;
      message: string;
      payload: Record<string, unknown>;
      redirectUrl?: string;
    },
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const tenantObjectId = new Types.ObjectId(params.tenantId);
    const docs = userIds.map((userId) => ({
      tenant_id: tenantObjectId,
      user_id: new Types.ObjectId(userId),
      type: params.type,
      title: params.title,
      message: params.message,
      payload: params.payload,
      redirect_url:
        params.redirectUrl ??
        buildNotificationRedirectUrl(params.type, params.payload),
      is_read: false,
    }));

    await this.notificationModel.insertMany(docs);
  }
}
