import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ExercisesService } from './exercises.service';
import { ExerciseFilterDto } from './dto/exercise.dto';

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar exercícios' })
  findAll(@Query() filters: ExerciseFilterDto) {
    return this.exercisesService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas' })
  getStats() {
    return this.exercisesService.getStats();
  }

  @Get('random')
  @ApiOperation({ summary: 'Exercícios aleatórios' })
  getRandom(
    @Query('count', new DefaultValuePipe(10), ParseIntPipe) count: number,
    @Query('bodyPart') bodyPart?: string,
    @Query('equipment') equipment?: string,
  ) {
    return this.exercisesService.getRandom(count, bodyPart, equipment);
  }

  @Get('body-part/:bodyPart')
  @ApiOperation({ summary: 'Por parte do corpo' })
  getByBodyPart(
    @Param('bodyPart') bodyPart: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.exercisesService.getByBodyPart(bodyPart, page, size);
  }

  @Get('equipment/:equipment')
  @ApiOperation({ summary: 'Por equipamento' })
  getByEquipment(
    @Param('equipment') equipment: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.exercisesService.getByEquipment(equipment, page, size);
  }

  @Get('target/:target')
  @ApiOperation({ summary: 'Por músculo alvo' })
  getByTarget(
    @Param('target') target: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
  ) {
    return this.exercisesService.getByTarget(target, page, size);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter exercício por ID' })
  findOne(@Param('id') id: string) {
    return this.exercisesService.findOne(id);
  }
}
