import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CompanyId } from '../../common/decorators/auth.decorator';

@Controller('contacts')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Get()
  async getContacts(
    @CompanyId() companyId: string,
    @Query('limit') limit?: string,
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
  ) {
    return this.contactsService.getContacts(companyId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    });
  }

  @Get('search')
  async searchContacts(
    @CompanyId() companyId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.contactsService.searchContacts(companyId, query, {
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':contactId')
  async getContactById(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.contactsService.getContactById(companyId, contactId);
  }

  @Get(':contactId/appointments')
  async getContactAppointments(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
  ) {
    const appointments = await this.contactsService.getContactAppointments(companyId, contactId);
    return { appointments };
  }

  @Get(':contactId/calls')
  async getContactCalls(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
    @Query('limit') limit?: string,
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
  ) {
    const result = await this.contactsService.getContactCalls(companyId, contactId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    });
    return result;
  }

  @Post()
  async createContact(
    @CompanyId() companyId: string,
    @Body() data: any,
  ) {
    return this.contactsService.createContact(companyId, data);
  }

  @Put(':contactId')
  async updateContact(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
    @Body() data: any,
  ) {
    return this.contactsService.updateContact(companyId, contactId, data);
  }

  @Delete(':contactId')
  async deleteContact(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
  ) {
    await this.contactsService.deleteContact(companyId, contactId);
    return { message: 'Contact deleted successfully' };
  }
}
