import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Verificar saúde da API', description: 'Retorna status da API, conexão com banco e uso de memória.' })
  @ApiResponse({ status: 200, description: 'API saudável' })
  async check() {
    return this.healthService.check();
  }

  @Get('live')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness probe', description: 'Verifica se a aplicação está rodando (para Kubernetes).' })
  @ApiResponse({ status: 200, description: 'Aplicação está viva' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Readiness probe', description: 'Verifica se a aplicação está pronta para receber tráfego.' })
  @ApiResponse({ status: 200, description: 'Aplicação pronta' })
  @ApiResponse({ status: 503, description: 'Aplicação não está pronta' })
  async ready() {
    return this.healthService.checkReadiness();
  }
}
