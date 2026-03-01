import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CompanyId, UserId } from '../../common/decorators/auth.decorator';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsQueryDto,
  RegisterDeviceDto,
  UpdateNotificationPreferencesDto,
} from './notifications.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('events')
  listEvents() {
    return { events: this.notifications.listEvents() };
  }

  @Get('preferences')
  async getPreferences(
    @CompanyId() companyId: string,
    @UserId() userId: string,
  ) {
    return this.notifications.getPreferences(companyId, userId);
  }

  @Put('preferences')
  async updatePreferences(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(companyId, userId, dto.preferences);
  }

  @Get()
  async listNotifications(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    let lastEvaluatedKey: any = undefined;
    if (query.lastEvaluatedKey) {
      try {
        lastEvaluatedKey = JSON.parse(query.lastEvaluatedKey);
      } catch {
        lastEvaluatedKey = undefined;
      }
    }
    return this.notifications.listNotifications(companyId, userId, {
      limit: query.limit,
      unreadOnly: query.unread_only,
      lastEvaluatedKey,
    });
  }

  @Get('unread-count')
  async unreadCount(
    @CompanyId() companyId: string,
    @UserId() userId: string,
  ) {
    const unread = await this.notifications.getUnreadCount(companyId, userId);
    return { unread };
  }

  @Post(':notificationId/read')
  async markRead(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markRead(companyId, userId, notificationId);
  }

  @Post(':notificationId/unread')
  async markUnread(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markUnread(companyId, userId, notificationId);
  }

  @Post('read-all')
  async markAllRead(
    @CompanyId() companyId: string,
    @UserId() userId: string,
  ) {
    return this.notifications.markAllRead(companyId, userId);
  }

  @Post('devices')
  async registerDevice(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notifications.registerDevice(companyId, userId, dto);
  }

  @Delete('devices/:deviceId')
  async removeDevice(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.notifications.removeDevice(companyId, userId, deviceId);
  }
}
