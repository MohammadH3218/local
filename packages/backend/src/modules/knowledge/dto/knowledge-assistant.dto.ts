import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class KnowledgeAssistantMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class KnowledgeAssistantRespondDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => KnowledgeAssistantMessageDto)
  messages!: KnowledgeAssistantMessageDto[];
}

export class KnowledgeAssistantGenerateDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => KnowledgeAssistantMessageDto)
  messages!: KnowledgeAssistantMessageDto[];

  @IsOptional()
  @IsBoolean()
  auto_create?: boolean;
}
