# 🏋️ Exercise API

API REST de exercícios físicos em português brasileiro com 1.324 exercícios, imagens WebP e busca inteligente.

## 📊 Recursos

- 1.324 exercícios traduzidos para PT-BR
- Imagens WebP otimizadas (~366 MB)
- Busca inteligente com relevância
- Filtros por parte do corpo, equipamento e músculo
- Paginação e sugestões de exercícios relacionados
- Autenticação via API Key + JWT (Supabase)
- Documentação Swagger

## 🚀 Instalação

```bash
# Clonar repositório
git clone https://github.com/franklinnilson/exercise-api.git
cd exercise-api

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env
```

Edite o `.env`:
```env
DATABASE_URL="mysql://root@localhost:3306/olym_exercise"
API_KEY="sua_api_key_aqui"
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_JWT_SECRET="seu_jwt_secret"
PORT=3001
```

Gerar API Key:
```bash
openssl rand -hex 32
```

## 🗄️ Banco de Dados

```bash
# Criar banco MySQL
mysql -u root -e "CREATE DATABASE olym_exercise"

# Aplicar schema
npx prisma db push

# Importar dados (se tiver o backup)
mysql -u root olym_exercise < backup.sql
```

## ▶️ Executar

```bash
# Desenvolvimento
npm run start:dev

# Produção
npm run build
npm run start:prod
```

A API estará disponível em:
- API: http://localhost:3001
- Swagger: http://localhost:3001/docs
- Health: http://localhost:3001/health

## 📚 Endpoints

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| GET | `/health` | ❌ | Health check |
| GET | `/docs` | ❌ | Documentação Swagger |
| GET | `/exercises` | ✅ | Lista com busca e filtros |
| GET | `/exercises/:id` | ✅ | Detalhes do exercício |
| GET | `/exercises/stats` | ✅ | Estatísticas da base |
| GET | `/exercises/random` | ✅ | Exercícios aleatórios |
| GET | `/exercises/body-part/:part` | ✅ | Por parte do corpo |
| GET | `/exercises/equipment/:eq` | ✅ | Por equipamento |
| GET | `/exercises/target/:target` | ✅ | Por músculo alvo |
| GET | `/media/exercises/:id.webp` | ❌ | Imagem do exercício |

## 🔐 Autenticação

Endpoints protegidos requerem dois headers:

```bash
curl -H "x-api-key: SUA_API_KEY" \
     -H "Authorization: Bearer TOKEN_JWT_SUPABASE" \
     http://localhost:3001/exercises
```

## 🔍 Exemplos de Uso

**Busca inteligente:**
```bash
curl "http://localhost:3001/exercises?q=supino" -H "x-api-key: ..." -H "Authorization: Bearer ..."
```

**Filtros combinados:**
```bash
curl "http://localhost:3001/exercises?bodyPart=peito&equipment=halter&size=10" -H "..."
```

**Múltiplos IDs:**
```bash
curl "http://localhost:3001/exercises?ids=0001,0002,0003" -H "..."
```

**Exercícios aleatórios:**
```bash
curl "http://localhost:3001/exercises/random?count=5&bodyPart=costas" -H "..."
```

## 📦 Resposta da API

```json
{
  "data": [
    {
      "id": "0001",
      "name": "Supino reto com barra",
      "nameEn": "Barbell Bench Press",
      "bodyPart": "peito",
      "target": "peitorais",
      "equipment": "barra",
      "gifUrl": "/media/exercises/0001.webp",
      "secondaryMuscles": [
        { "muscle": "tríceps" },
        { "muscle": "deltoides anterior" }
      ],
      "instructions": [
        { "stepOrder": 1, "instruction": "Deite no banco..." }
      ]
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "size": 20,
    "totalPages": 8
  },
  "suggestions": {
    "message": "Veja também exercícios relacionados:",
    "keywords": ["crucifixo", "flexão"],
    "exercises": [...]
  }
}
```

## 🐳 Docker

```bash
# Build
docker build -t exercise-api .

# Run (com volume para mídia)
docker run -p 3001:3001 \
  -v $(pwd)/data/media:/app/data/media \
  --env-file .env \
  exercise-api
```

## 📁 Estrutura

```
exercise-api/
├── src/
│   ├── exercises/       # Módulo de exercícios
│   ├── health/          # Health checks
│   ├── auth/            # Autenticação
│   └── common/          # Guards, decorators
├── prisma/
│   └── schema.prisma    # Schema do banco
├── public/              # Arquivos estáticos
├── data/
│   └── media/           # Imagens WebP (1.324 arquivos)
├── Dockerfile
├── DEPLOY.md            # Instruções de deploy
└── docs/
    └── ETL.md           # Documentação do pipeline ETL
```

## 📖 Documentação Adicional

- [DEPLOY.md](./DEPLOY.md) - Instruções para deploy em produção
- [docs/ETL.md](./docs/ETL.md) - Pipeline de extração e tradução de exercícios

## 🔗 Links

- [ExerciseDB](https://github.com/ExerciseDB/exercisedb-api) - Fonte dos dados originais
- [Swagger UI](http://localhost:3001/docs) - Documentação interativa
