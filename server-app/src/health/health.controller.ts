import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';

// Chequeo de salud que Railway/Render usan para decidir si un deploy está
// listo y si el proceso sigue vivo — sin esto, un deploy roto puede quedar
// marcado como saludable. Vive fuera de /api/v1 (ver main.ts) porque es
// infraestructura, no parte del contrato público versionado de la API.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness/readiness check (pings the Mongo connection)',
  })
  @ApiResponse({ status: 200, description: 'The service is healthy.' })
  @ApiResponse({ status: 503, description: 'The service is unhealthy.' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.mongoose.pingCheck('mongodb')]);
  }
}
