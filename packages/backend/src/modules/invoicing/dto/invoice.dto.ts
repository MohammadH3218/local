import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsEnum, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export class LineItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_price_cents: number;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  customer_name: string;

  @IsString()
  @IsOptional()
  customer_email?: string;

  @IsString()
  @IsOptional()
  customer_phone?: string;

  @IsString()
  @IsOptional()
  contact_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  line_items: LineItemDto[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  tax_rate?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount_amount_cents?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  due_date?: number;
}

export class UpdateInvoiceDto {
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  line_items?: LineItemDto[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  tax_rate?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount_amount_cents?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  due_date?: number;
}
