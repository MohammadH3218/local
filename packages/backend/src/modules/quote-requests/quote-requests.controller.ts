import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { QuoteRequestsService } from './quote-requests.service';
import { CreateQuoteRequestDto, RespondToQuoteDto } from './dto/quote-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('quote-requests')
@UseGuards(JwtAuthGuard)
export class QuoteRequestsController {
  constructor(private readonly service: QuoteRequestsService) {}

  // Public: anyone can submit a quote request
  @Public()
  @Post()
  async createQuoteRequest(@Body() dto: CreateQuoteRequestDto) {
    return this.service.createQuoteRequest(dto);
  }

  // Public: view a specific quote request
  @Public()
  @Get(':quoteId')
  async getQuoteRequest(@Param('quoteId') quoteId: string) {
    return this.service.getQuoteRequest(quoteId);
  }

  // Public: browse open quote requests by category
  @Public()
  @Get()
  async listQuoteRequests(
    @Query('category') category?: string,
    @Query('zipcode') zipcode?: string,
  ) {
    if (!category) return { quotes: [] };
    return { quotes: await this.service.listQuoteRequestsByCategory(category, zipcode) };
  }

  // Pro: list open quotes in their area (authenticated)
  @Get('pro/available')
  async listForPro(
    @CompanyId() companyId: string,
    @Query('category') category?: string,
  ) {
    return { quotes: await this.service.listForPro(companyId, category) };
  }

  // Pro: respond to a quote request
  @Post(':quoteId/respond')
  async respondToQuote(
    @CompanyId() companyId: string,
    @Param('quoteId') quoteId: string,
    @Body() dto: RespondToQuoteDto,
  ) {
    return this.service.respondToQuote(companyId, quoteId, dto);
  }
}
