import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { Notification, NotificationDocument } from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async list(
    tenantId: string,
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      unread?: boolean;
      type?: string;
    },
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      user_id: new Types.ObjectId(userId),
    };

    if (filters.unread === true) {
      query.is_read = false;
    }
    if (filters.type) {
      query.type = filters.type;
    }

    const [items, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({
        tenant_id: new Types.ObjectId(tenantId),
        user_id: new Types.ObjectId(userId),
        is_read: false,
      }),
    ]);

    return {
      items,
      unread_count: unreadCount,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      {
        _id: id,
        tenant_id: new Types.ObjectId(tenantId),
        user_id: new Types.ObjectId(userId),
      },
      {
        $set: {
          is_read: true,
          read_at: new Date(),
        },
      },
      { returnDocument: 'after' },
    );

    if (!notification) {
      throw new AppError(ERRORS.NOTIFICATION.NOT_FOUND);
    }

    return notification.toObject();
  }

  async markAllRead(tenantId: string, userId: string) {
    const result = await this.notificationModel.updateMany(
      {
        tenant_id: new Types.ObjectId(tenantId),
        user_id: new Types.ObjectId(userId),
        is_read: false,
      },
      {
        $set: {
          is_read: true,
          read_at: new Date(),
        },
      },
    );

    return {
      message: 'All notifications marked as read',
      updated_count: result.modifiedCount,
    };
  }
}
