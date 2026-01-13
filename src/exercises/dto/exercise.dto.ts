import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ExerciseFilterDto {
  @ApiPropertyOptional({ description: 'Número da página', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Itens por página', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number = 20;

  @ApiPropertyOptional({ description: 'Busca por nome/músculo', example: 'supino' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filtrar por parte do corpo', example: 'peito' })
  @IsOptional()
  @IsString()
  bodyPart?: string;

  @ApiPropertyOptional({ description: 'Filtrar por equipamento', example: 'halter' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ description: 'Filtrar por músculo alvo', example: 'peitorais' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ description: 'IDs específicos (separados por vírgula)', example: '0001,0002,0003' })
  @IsOptional()
  @IsString()
  ids?: string;
}

export class ExerciseResponseDto {
  @ApiProperty({ example: '0001' })
  id: string;

  @ApiProperty({ example: 'Supino reto com barra' })
  name: string;

  @ApiProperty({ example: 'Barbell Bench Press' })
  nameEn: string;

  @ApiProperty({ example: 'peito' })
  bodyPart: string;

  @ApiProperty({ example: 'peitorais' })
  target: string;

  @ApiProperty({ example: 'barra' })
  equipment: string;

  @ApiPropertyOptional({ example: '/media/exercises/0001.webp' })
  gifUrl?: string;
}

export class ExerciseDetailResponseDto extends ExerciseResponseDto {
  @ApiProperty({ type: [Object] })
  secondaryMuscles: { muscle: string }[];

  @ApiProperty({ type: [Object] })
  instructions: { stepOrder: number; instruction: string }[];
}

export class PaginatedExerciseResponseDto {
  @ApiProperty({ type: [ExerciseResponseDto] })
  data: ExerciseResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    size: number;
    totalPages: number;
  };
}
