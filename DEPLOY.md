# Deploy - Exercise API

## Pré-requisitos

- Servidor com Docker e Docker Compose
- Caddy configurado como reverse proxy
- Arquivos de mídia (~366 MB de WebP)

## 1. Preparar arquivos localmente

```bash
# No seu Mac, compactar mídia
cd exercise-api
tar -czvf media.tar.gz data/media/

# Verificar backup do banco
ls -la backup.sql  # ~3.1 MB
```

## 2. Enviar para o servidor

```bash
# Enviar projeto (sem node_modules)
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.env' \
  exercise-api/ root@SEU_IP:~/stack/api-exercises/

# Enviar mídia
scp exercise-api/media.tar.gz root@SEU_IP:~/stack/

# Enviar backup
scp exercise-api/backup.sql root@SEU_IP:~/stack/
```

## 3. Configurar no servidor

```bash
ssh root@SEU_IP
cd ~/stack

# Extrair mídia
cd api-exercises
tar -xzvf ../media.tar.gz
rm ../media.tar.gz

# Criar .env
cp .env.example .env
nano .env
```

Configurar `.env`:
```env
DATABASE_URL="mysql://olym_user:SenhaForte123!@mysql-exercises:3306/olym_exercises"
API_KEY="GERAR_NOVA_CHAVE_64_CARACTERES"
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_JWT_SECRET="seu_jwt_secret"
PORT=3001
```

Gerar API Key:
```bash
openssl rand -hex 32
```

## 4. Adicionar ao docker-compose.yml

```yaml
services:
  # ... outros serviços ...

  api-exercises:
    build: ./api-exercises
    restart: unless-stopped
    env_file: ./api-exercises/.env
    depends_on:
      mysql-exercises:
        condition: service_healthy
    volumes:
      - ./api-exercises/data/media:/app/data/media:ro
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mysql-exercises:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: RootSenhaForte456!
      MYSQL_DATABASE: olym_exercises
      MYSQL_USER: olym_user
      MYSQL_PASSWORD: SenhaForte123!
    volumes:
      - mysql_exercises_data:/var/lib/mysql
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql_exercises_data:
```

## 5. Adicionar ao Caddyfile

```
exercises.olym.com.br {
    encode zstd gzip
    
    # Health check público
    @health path /health /health/*
    handle @health {
        reverse_proxy api-exercises:3001
    }
    
    # Mídia estática com cache
    @media path /media/*
    handle @media {
        header Cache-Control "public, max-age=31536000"
        reverse_proxy api-exercises:3001
    }
    
    # API
    reverse_proxy api-exercises:3001
}
```

## 6. Subir serviços

```bash
cd ~/stack

# Build e start
docker compose up -d --build mysql-exercises
sleep 30  # Aguardar MySQL iniciar

docker compose up -d --build api-exercises
docker compose restart caddy
```

## 7. Importar dados

```bash
# Rodar migrations
docker compose exec api-exercises npx prisma db push

# Importar backup
docker compose exec -T mysql-exercises mysql -u olym_user -pSenhaForte123! olym_exercises < backup.sql
```

## 8. Testar

```bash
# Health (público)
curl https://exercises.olym.com.br/health

# Stats (com auth)
curl -H "x-api-key: SUA_API_KEY" \
     -H "Authorization: Bearer TOKEN_JWT" \
     https://exercises.olym.com.br/exercises/stats

# Busca
curl -H "x-api-key: SUA_API_KEY" \
     -H "Authorization: Bearer TOKEN_JWT" \
     "https://exercises.olym.com.br/exercises?q=supino&size=5"
```

## Endpoints

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| GET | /health | ❌ | Health check |
| GET | /docs | ❌ | Swagger UI |
| GET | /exercises | ✅ | Lista com busca e filtros |
| GET | /exercises/:id | ✅ | Detalhes do exercício |
| GET | /exercises/stats | ✅ | Estatísticas |
| GET | /exercises/random | ✅ | Exercícios aleatórios |
| GET | /exercises/body-part/:part | ✅ | Por parte do corpo |
| GET | /exercises/equipment/:eq | ✅ | Por equipamento |
| GET | /exercises/target/:target | ✅ | Por músculo alvo |
| GET | /media/exercises/:id.webp | ❌ | Imagem do exercício |

## Autenticação

Headers obrigatórios (exceto /health, /docs, /media):
- `x-api-key`: Chave configurada no .env
- `Authorization: Bearer <token>`: JWT do Supabase

## Logs

```bash
# Ver logs
docker compose logs -f api-exercises

# Ver logs do MySQL
docker compose logs -f mysql-exercises
```

## Backup

```bash
# Criar backup no servidor
docker compose exec mysql-exercises mysqldump -u olym_user -pSenhaForte123! olym_exercises > backup_$(date +%Y%m%d).sql
```
