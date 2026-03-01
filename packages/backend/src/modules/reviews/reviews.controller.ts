import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, RespondToReviewDto } from './dto/review.dto';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post()
  createReview(@Request() req: any, @Body() dto: CreateReviewDto) {
    const customerId = req.user?.sub || req.user?.userId || 'anonymous';
    return this.service.createReview(customerId, dto);
  }

  @Get('provider/:companyId')
  @Public()
  listReviews(@Param('companyId') companyId: string) {
    return this.service.listReviews(companyId, { visible: true });
  }

  @Get('provider/:companyId/summary')
  @Public()
  getRatingSummary(@Param('companyId') companyId: string) {
    return this.service.getProviderRatingSummary(companyId);
  }

  @Post(':reviewId/respond')
  respondToReview(
    @CompanyId() companyId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: RespondToReviewDto,
  ) {
    return this.service.respondToReview(companyId, reviewId, dto);
  }

  @Post(':reviewId/report')
  reportReview(
    @CompanyId() companyId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.service.reportReview(reviewId, companyId);
  }

  @Get('my-reviews')
  getMyProviderReviews(@CompanyId() companyId: string) {
    return this.service.listReviews(companyId);
  }
}
