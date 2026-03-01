import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CreateReviewDto, RespondToReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  async createReview(customerId: string, dto: CreateReviewDto) {
    // Check for duplicate review on same booking
    const existing = await this.dynamodb.scan('reviews', {
      filterExpression: '#booking_id = :booking_id AND #customer_user_id = :customer_id',
      expressionAttributeNames: { '#booking_id': 'booking_id', '#customer_user_id': 'customer_user_id' },
      expressionAttributeValues: { ':booking_id': dto.booking_id, ':customer_id': customerId },
      limit: 1,
    });
    if (existing.items?.length) {
      throw new BadRequestException('You have already reviewed this booking');
    }

    const now = Date.now();
    const reviewId = uuidv4();
    const review = {
      provider_company_id: dto.provider_company_id,
      review_id: reviewId,
      customer_user_id: customerId,
      booking_id: dto.booking_id,
      rating: dto.rating,
      comment: dto.comment,
      service_type: dto.service_type,
      visible: true,
      reported: false,
      created_at: now,
      updated_at: now,
    };

    await this.dynamodb.put('reviews', review);
    await this.updateProviderRating(dto.provider_company_id);
    return review;
  }

  async listReviews(providerCompanyId: string, options?: { limit?: number; visible?: boolean }) {
    const result = await this.dynamodb.query(
      'reviews',
      '#provider_company_id = :provider_company_id',
      { '#provider_company_id': 'provider_company_id' },
      { ':provider_company_id': providerCompanyId },
      { limit: options?.limit || 50 },
    );

    let items = result.items || [];
    if (options?.visible !== false) {
      items = items.filter((r: any) => r.visible !== false);
    }

    return items.sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0));
  }

  async respondToReview(providerCompanyId: string, reviewId: string, dto: RespondToReviewDto) {
    const review = await this.dynamodb.get('reviews', { provider_company_id: providerCompanyId, review_id: reviewId });
    if (!review) throw new NotFoundException('Review not found');

    await this.dynamodb.update(
      'reviews',
      { provider_company_id: providerCompanyId, review_id: reviewId },
      { response: dto.response, response_at: Date.now(), updated_at: Date.now() },
    );

    return this.dynamodb.get('reviews', { provider_company_id: providerCompanyId, review_id: reviewId });
  }

  async reportReview(reviewId: string, providerCompanyId: string) {
    await this.dynamodb.update(
      'reviews',
      { provider_company_id: providerCompanyId, review_id: reviewId },
      { reported: true, updated_at: Date.now() },
    );
    return { reported: true };
  }

  async getProviderRatingSummary(providerCompanyId: string) {
    const reviews = await this.listReviews(providerCompanyId, { limit: 500 });
    if (!reviews.length) return { overall_rating: 0, total_reviews: 0, breakdown: {} };

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews as any[]) {
      const rating = Number(r.rating || 0);
      if (rating >= 1 && rating <= 5) {
        breakdown[rating] = (breakdown[rating] || 0) + 1;
        sum += rating;
      }
    }

    return {
      overall_rating: Math.round((sum / reviews.length) * 10) / 10,
      total_reviews: reviews.length,
      breakdown,
    };
  }

  private async updateProviderRating(providerCompanyId: string) {
    const summary = await this.getProviderRatingSummary(providerCompanyId);
    await this.dynamodb.update(
      'companies',
      { company_id: providerCompanyId },
      {
        overall_rating: summary.overall_rating,
        total_reviews: summary.total_reviews,
        updated_at: Date.now(),
      },
    );
  }
}
