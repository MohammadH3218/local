import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { CompanyId } from '../../common/decorators/auth.decorator';

@Controller('invoices')
export class InvoicingController {
  constructor(private readonly service: InvoicingService) {}

  @Post()
  create(@CompanyId() companyId: string, @Body() dto: CreateInvoiceDto) {
    return this.service.create(companyId, dto);
  }

  @Get()
  list(
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(companyId, { status, limit: limit ? Number(limit) : undefined });
  }

  @Get('stats')
  getStats(@CompanyId() companyId: string) {
    return this.service.getStats(companyId);
  }

  @Get(':id')
  getById(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getById(companyId, id);
  }

  @Put(':id')
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.service.update(companyId, id, dto);
  }

  @Post(':id/send')
  markAsSent(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.markAsSent(companyId, id);
  }

  @Post(':id/paid')
  markAsPaid(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.markAsPaid(companyId, id);
  }

  @Delete(':id')
  delete(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.delete(companyId, id);
  }
}
