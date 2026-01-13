import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { CombinedAuthGuard } from './common/guards/combined-auth.guard';
import { ExercisesModule } from './exercises/exercises.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60000, limit: 200 },
    ]),
    // Serve mídias dos exercícios (WebP) - path relativo ao CWD
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'data', 'media'),
      serveRoot: '/media/exercises',
      serveStaticOptions: {
        index: false,
        fallthrough: false,
        maxAge: 31536000000, // 1 ano de cache
      },
    }),
    // Serve arquivos estáticos da pasta public
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveStaticOptions: {
        index: ['index.html'],
      },
    }),
    AuthModule,
    HealthModule,
    ExercisesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
