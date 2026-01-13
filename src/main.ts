import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Exercise API')
    .setDescription(`
## API de Exercícios Físicos

Base de dados com **1.324 exercícios** traduzidos para português brasileiro, incluindo:
- Nome do exercício (PT-BR e EN)
- Parte do corpo trabalhada
- Músculo alvo
- Equipamento necessário
- Músculos secundários
- Instruções passo a passo
- Imagens/GIFs demonstrativos

### Autenticação

Todos os endpoints (exceto /health) requerem:
- **x-api-key**: Chave de API no header
- **Authorization**: Bearer token JWT do Supabase

### Busca Inteligente

O parâmetro \`q\` realiza busca inteligente com:
- Ordenação por relevância
- Sugestões de exercícios relacionados
- Busca em nome, parte do corpo, músculo e equipamento
    `)
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addTag('Health', 'Verificação de saúde da API')
    .addTag('Exercises', 'Endpoints de exercícios')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Exercise API - Documentação',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🏋️ Exercise API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
