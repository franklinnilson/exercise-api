# 🏋️ Exercise API - Exercícios Físicos com Tradução PT-BR

API REST para gestão de exercícios físicos com vídeos, GIFs e tradução automática para português brasileiro.

Baseado no [ExerciseDB](https://github.com/ExerciseDB/exercisedb-api) - o melhor banco de dados de exercícios disponível.

## 📊 O que você vai ter

| Recurso | V1 (Gratuito) | V2 (PRO $29/mês) |
|---------|---------------|------------------|
| Exercícios | ~1.500 | ~11.000 |
| GIFs animados | ✅ | ✅ |
| Vídeos MP4 | ❌ | ✅ 15.000+ |
| Imagens HD | ❌ | ✅ 20.000+ |
| Instruções | ✅ | ✅ |
| Dicas de treino | ❌ | ✅ |
| Variações | ❌ | ✅ |
| Keywords/SEO | ❌ | ✅ |

---

## 🏰 OPERAÇÃO FORTALEZA - Pipeline ETL

Pipeline desacoplado em 4 fases para extração, otimização e tradução de exercícios.

### Estrutura de Diretórios

```
data/
├── raw/
│   ├── json/          # JSONs originais da API (Fase 1)
│   └── media/         # GIFs/MP4s originais (Fase 1)
├── optimized/
│   └── media/         # WebPs otimizados (Fase 2)
├── translated/
│   └── json/          # JSONs traduzidos (Fase 3)
└── logs/              # Relatórios e logs de erro
```

### Comandos do Pipeline

| Comando | Descrição |
|---------|-----------|
| `npm run etl:check` | Fase 0: Verificação pré-voo (API, ffmpeg, disco) |
| `npm run etl:extract` | Fase 1: Download inteligente com idempotência |
| `npm run etl:refine` | Fase 2: Conversão para WebP animado |
| `npm run etl:refine:cleanup` | Fase 2 + limpeza de originais |
| `npm run etl:translate` | Fase 3: Tradução contextual com IA |
| `npm run etl:load` | Fase 4: Carga no banco de dados |
| `npm run etl:parallel` | 🚀 Executa fases em paralelo (recomendado) |
| `npm run etl:all` | Executa todas as fases em sequência |

### 🚀 Modo Paralelo (Recomendado)

O modo paralelo executa as fases de forma inteligente:

```
Fase 1 (Extract) ──────────────────────────────────────►
                    │
                    ▼ (após 100 arquivos)
Fase 2 (Refine)  ──────────────────────────────────────►
                    │
                    ▼ (após 100 arquivos)
Fase 3 (Translate) ────────────────────────────────────►
                                                        │
                                                        ▼ (quando 2 e 3 terminam)
Fase 4 (Load)                                          ──►
```

- **Fase 2 e 3** iniciam assim que houver 100+ arquivos baixados
- **Fase 4** só inicia quando 2 e 3 terminarem
- **Não trava a máquina**: usa metade dos CPUs e prioridade baixa

### ⚠️ IMPORTANTE: Antes de Começar

```bash
# 1. Instale as dependências
npm install

# 2. Configure o .env com sua API Key
cp .env.example .env

# 3. Execute a verificação pré-voo
npm run etl:check

# 4. Se tudo OK, inicie a extração
npm run etl:extract
```

### Características do Pipeline

- **Idempotência**: Pode parar e retomar sem duplicar dados
- **Rate Limiting Humanizado**: Delays variáveis (0.8s-4s) para parecer navegação natural
- **Pausas Aleatórias**: 5% de chance de pausas longas (5-15s) simulando usuário distraído
- **User-Agents Rotativos**: 6 navegadores diferentes para variar fingerprint
- **Captura Híbrida**: GIF > MP4 > log de erro
- **WebP Otimizado**: Formato único, 400px, ~75% menor
- **Tradução Contextual**: IA de Personal Trainer Brasileiro
- **Validação Rigorosa**: Cruzamento de dados texto + mídia

### Pré-requisitos

```bash
# ffmpeg para conversão de mídia (Fase 2)
brew install ffmpeg  # macOS
apt install ffmpeg   # Ubuntu
```

### Variáveis de Ambiente (ETL)

```env
# OpenAI para tradução contextual (opcional)
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"

# URL base para servir mídias
MEDIA_BASE_URL="/media/exercises"
```

---

## 🚀 Setup Rápido

```bash
# 1. Entrar na pasta
cd exercise-api

# 2. Instalar dependências
npm install

# 3. Configurar ambiente
cp .env.example .env
# Edite o .env com sua API key

# 4. Criar banco de dados
npx prisma migrate dev --name init

# 5. Executar scraping
npm run scrape:exercises      # V1 com GIFs (gratuito)
npm run scrape:v2             # V2 com vídeos ($29/mês)
```

## 🔑 Obtendo API Key (GRATUITA)

1. Acesse [RapidAPI - ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)
2. Clique em **"Subscribe to Test"**
3. Escolha o plano **Basic (FREE)**
4. Copie sua `X-RapidAPI-Key`
5. Adicione no `.env`:
   ```
   EXERCISEDB_API_KEY=sua_chave_aqui
   ```

### Planos RapidAPI

| Plano | Preço | Requests/mês | Recursos |
|-------|-------|--------------|----------|
| Basic | FREE | 500 | V1 (GIFs) |
| Pro | $29 | 20.000 | V1 + V2 (vídeos) |
| Ultra | $79 | 100.000 | V1 + V2 |
| Mega | $199 | 300.000 | V1 + V2 |

## 🔄 Sistema de Tradução

O scraper traduz automaticamente todos os campos para PT-BR:

### Dicionário Local (Instantâneo)
```
chest → peito
biceps → bíceps  
dumbbell → halter
barbell → barra
beginner → iniciante
```

### API de Tradução (MyMemory - Gratuito)
- Textos longos (instruções, descrições)
- 5.000 caracteres/dia grátis
- Cache automático para evitar duplicatas

## 📦 Schema do Banco

```sql
exercises
├── id (VARCHAR 50)
├── name / nameEn
├── bodyPart / bodyPartEn
├── target / targetEn
├── equipment / equipmentEn
├── gifUrl, videoUrl, imageUrl
├── difficulty, category
└── overview / overviewEn

exercise_secondary_muscles
├── muscle / muscleEn

exercise_instructions
├── stepOrder
├── instruction / instructionEn

exercise_tips (V2 only)
├── tip / tipEn

exercise_variations (V2 only)
├── variation / variationEn

exercise_keywords (V2 only)
├── keyword / keywordEn
```

## 🛠️ Scripts

| Script | Descrição |
|--------|-----------|
| `npm run scrape:exercises` | V1 com GIFs (tier gratuito) |
| `npm run scrape:v2` | V2 com vídeos (plano PRO) |
| `npm run scrape:free` | free-exercise-db (sem API key) |
| `npm run export:json` | Exporta banco para JSON |
| `npm run prisma:studio` | Interface visual do banco |

## 📤 Exportar Dados

```bash
npm run export:json
# Gera: data/exercises-pt-br.json
```

## 🔗 Links Úteis

- [ExerciseDB GitHub](https://github.com/ExerciseDB/exercisedb-api)
- [ExerciseDB Docs](https://edb-docs.up.railway.app/)
- [RapidAPI - ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)

## 📝 Exemplo de Exercício Salvo

```json
{
  "id": "0001",
  "nome": "Rosca Bíceps com Barra",
  "nomeOriginal": "Barbell Curl",
  "parteCorpo": "braços",
  "musculoAlvo": "bíceps",
  "equipamento": "barra",
  "dificuldade": "iniciante",
  "gifUrl": "https://...",
  "videoUrl": "https://...",
  "instrucoes": [
    {
      "passo": 1,
      "instrucao": "Fique em pé com os pés na largura dos ombros...",
      "instrucaoOriginal": "Stand with feet shoulder-width apart..."
    }
  ]
}
```
