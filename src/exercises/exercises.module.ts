import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';

@Module({
  controllers: [ExercisesController],
  providers: [ExercisesService, PrismaService],
})
export class ExercisesModule {}
