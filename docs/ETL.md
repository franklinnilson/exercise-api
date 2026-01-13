# 🏰 Pipeline ETL - Extração e Tradução de Exercícios

Este documento descreve o pipeline completo para extrair exercícios do ExerciseDB, traduzir para português brasileiro e carregar no banco de dados.

## 📊 Visão Geral

O pipeline extrai dados do [ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb), uma das maiores bases de exercícios disponíveis:

| Recurso | V1 (Gratuito) | V2 (PRO $29/mês) |
|---------|---------------|------------------|
| Exercícios | ~1.500 | ~11.000 |
| GIFs animados | ✅ | ✅ |
| Vídeos MP4 | ❌ | ✅ 15.000+ |
| Imagens HD | ❌ | ✅ 20.000+ |
| Instruções | ✅ | ✅ |
| Dicas de treino | ❌ | ✅ |

## 🔑 Obtendo API Key

1. Acesse [RapidAPI - ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)
2. Clique em **"Subscribe to Test"**
3. Escolha o plano **Basic (FREE)** - 500 requests/mês
4. Copie sua `X-RapidAPI-Key`
5. Adicione no `.env`:
   ```env
   EXERCISEDB_API_KEY=sua_chave_aqui
   ```

## 📁 Estrutura de Diretórios

```
data/
├── raw/
│   ├── json/          # JSONs originais da API (Fase 1)
│   └── media/         # GIFs/MP4s originais (Fase 1)
├── optimized/
│   └── media/         # WebPs otimizados (Fase 2)
├── translated/
│   └── json/          # JSONs traduzidos (Fase 3)
├── media/             # WebPs finais para produção
├── pipeline/          # Checkpoints e estado
└── logs/              # Relatórios e logs de erro
```

## 🔄 Fases do Pipeline

### Fase 0: Verificação Pré-voo
```bash
npm run etl:check
```
Verifica:
- Conectividade com a API
- ffmpeg instalado
- Espaço em disco
- Variáveis de ambiente

### Fase 1: Extração
```bash
npm run etl:extract
```
- Download de metadados JSON
- Download de GIFs/vídeos
- Rate limiting humanizado (0.8s-4s entre requests)
- Idempotente (pode parar e retomar)

### Fase 2: Otimização
```bash
npm run etl:refine
```
- Converte GIFs para WebP animado
- Redimensiona para 400px de largura
- Redução de ~75% no tamanho
- Requer ffmpeg instalado

### Fase 3: Tradução
```bash
npm run etl:translate
```
- Tradução contextual com OpenAI
- Usa terminologia de academia brasileira
- Mantém termos técnicos em inglês quando apropriado
- Cache para evitar retrabalho

### Fase 4: Carga
```bash
npm run etl:load
```
- Carrega dados no MySQL via Prisma
- Validação de integridade
- Associa mídia aos exercícios

## 🚀 Execução

### Modo Sequencial
```bash
npm run etl:all
```

### Modo Paralelo (Recomendado)
```bash
npm run etl:parallel
```

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

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# ExerciseDB API (obrigatório)
EXERCISEDB_API_KEY="sua_chave_rapidapi"

# OpenAI para tradução (obrigatório para Fase 3)
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"

# Banco de dados
DATABASE_URL="mysql://root@localhost:3306/olym_exercise"

# URL base para mídias
MEDIA_BASE_URL="/media/exercises"
```

### Pré-requisitos

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt install ffmpeg

# Verificar instalação
ffmpeg -version
```

## 🛡️ Características de Segurança

O pipeline implementa técnicas para evitar bloqueio:

- **Rate Limiting Humanizado**: Delays variáveis (0.8s-4s)
- **Pausas Aleatórias**: 5% de chance de pausas longas (5-15s)
- **User-Agents Rotativos**: 6 navegadores diferentes
- **Idempotência**: Checkpoints para retomar sem duplicar

## 📝 Sistema de Tradução

### Dicionário Local (Instantâneo)
Termos comuns traduzidos localmente:
```
chest → peito
biceps → bíceps
dumbbell → halter
barbell → barra
beginner → iniciante
```

### Tradução com IA
Para textos complexos (instruções, descrições):
- Modelo: GPT-4o-mini
- Contexto: Personal Trainer Brasileiro
- Mantém termos técnicos quando apropriado

### Termos Mantidos em Inglês
Alguns termos são comuns em academias brasileiras:
- kettlebell, medicine ball
- smith (máquina)
- trap bar, skierg
- pull-up, push-up (em alguns contextos)

## 📊 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run etl:check` | Verificação pré-voo |
| `npm run etl:extract` | Fase 1: Download |
| `npm run etl:refine` | Fase 2: Conversão WebP |
| `npm run etl:refine:cleanup` | Fase 2 + limpeza de originais |
| `npm run etl:translate` | Fase 3: Tradução |
| `npm run etl:load` | Fase 4: Carga no banco |
| `npm run etl:parallel` | Execução paralela |
| `npm run etl:all` | Execução sequencial |

## 🔧 Scripts Auxiliares

```bash
# Exportar banco para JSON
npm run export:json

# Interface visual do banco
npm run prisma:studio

# Scraping alternativo (free-exercise-db, sem API key)
npm run scrape:free
```

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
```

## 🔗 Links Úteis

- [ExerciseDB GitHub](https://github.com/ExerciseDB/exercisedb-api)
- [ExerciseDB Docs](https://edb-docs.up.railway.app/)
- [RapidAPI - ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)
- [OpenAI API](https://platform.openai.com/)
