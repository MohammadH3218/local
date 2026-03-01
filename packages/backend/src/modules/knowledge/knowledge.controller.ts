import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { KnowledgeService, CreateKnowledgeDto, UpdateKnowledgeDto } from './knowledge.service';
import { CompanyId } from '../../common/decorators/auth.decorator';
import {
  KnowledgeAssistantGenerateDto,
  KnowledgeAssistantRespondDto,
} from './dto/knowledge-assistant.dto';

@Controller('knowledge-items')
export class KnowledgeController {
  constructor(private knowledgeService: KnowledgeService) {}

  @Get()
  async listKnowledgeItems(
    @CompanyId() companyId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.knowledgeService.listKnowledgeItems(companyId, {
      type,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('search')
  async searchKnowledge(
    @CompanyId() companyId: string,
    @Query('q') query: string,
    @Query('topK') topK?: string,
  ) {
    return this.knowledgeService.searchKnowledge(
      companyId,
      query,
      topK ? parseInt(topK, 10) : 5,
    );
  }

  @Get(':knowledgeId')
  async getKnowledgeItem(
    @CompanyId() companyId: string,
    @Param('knowledgeId') knowledgeId: string,
  ) {
    return this.knowledgeService.getKnowledgeItem(companyId, knowledgeId);
  }

  @Post()
  async createKnowledgeItem(
    @CompanyId() companyId: string,
    @Body() data: CreateKnowledgeDto,
  ) {
    return this.knowledgeService.createKnowledgeItem(companyId, data);
  }

  @Post('assistant/respond')
  async assistantRespond(
    @CompanyId() companyId: string,
    @Body() data: KnowledgeAssistantRespondDto,
  ) {
    return this.knowledgeService.assistantRespond(companyId, data.messages || []);
  }

  @Post('assistant/generate')
  async assistantGenerate(
    @CompanyId() companyId: string,
    @Body() data: KnowledgeAssistantGenerateDto,
  ) {
    return this.knowledgeService.generateKnowledgeFromConversation(
      companyId,
      data.messages || [],
      data.auto_create === true,
    );
  }

  @Post('assistant/extract-products')
  async assistantExtractProducts(
    @CompanyId() companyId: string,
    @Body() data: KnowledgeAssistantRespondDto,
  ) {
    return this.knowledgeService.extractAndCreateProducts(companyId, data.messages || []);
  }

  @Post('bulk-import')
  async bulkImport(
    @CompanyId() companyId: string,
    @Body() data: { items: CreateKnowledgeDto[] },
  ) {
    return this.knowledgeService.bulkImport(companyId, data.items);
  }

  @Put(':knowledgeId')
  async updateKnowledgeItem(
    @CompanyId() companyId: string,
    @Param('knowledgeId') knowledgeId: string,
    @Body() data: UpdateKnowledgeDto,
  ) {
    return this.knowledgeService.updateKnowledgeItem(companyId, knowledgeId, data);
  }

  @Delete(':knowledgeId')
  async deleteKnowledgeItem(
    @CompanyId() companyId: string,
    @Param('knowledgeId') knowledgeId: string,
  ) {
    await this.knowledgeService.deleteKnowledgeItem(companyId, knowledgeId);
    return { message: 'Knowledge item deleted successfully' };
  }
}
