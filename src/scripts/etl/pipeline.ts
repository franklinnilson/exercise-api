/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - PIPELINE UNIFICADO v3.1
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Pipeline profissional para 11.000+ exercícios da ExerciseDB API
 * COM SISTEMA DE CHECKPOINT - retoma exatamente de onde parou!
 * 
 * FASES:
 * 1. Extrai exercícios da API ExerciseDB (com checkpoint de offset)
 * 2. Traduz com IA (OpenAI) - nome, instruções, descrição
 * 3. Carrega no banco MySQL com todos os campos v2
 * 4. Baixa GIFs e converte para WebP (menor tamanho)
 * 
 * CHECKPOINT:
 * - Salva progresso a cada lote em data/pipeline/checkpoint.json
 * - Se cair energia/ban/erro, execute novamente e continua de onde parou
 * - Não gasta requests da API desnecessariamente
 * 
 * REQUISITOS:
 * - Plano MEGA ($29.99/mês) para 11.000 exercícios + GIFs
 * - OpenAI API Key para tradução
 * 
 * Uso:
 *   npm run etl:pipeline                 # Processa/retoma automaticamente
 *   npm run etl:pipeline -- --limit=100  # Limita quantidade (teste)
 *   npm run etl:pipeline -- --force      # Re-processa todos (limpa checkpoint)
 *   npm run etl:pipeline -- --reset      # Limpa checkpoint e inicia do zero
 * 
 * @author Olym Team
 * @version 3.1.0
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  api: {
    baseUrl: 'https://exercisedb.p.rapidapi.com',
    headers: {
      'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
      'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
    }
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },
  dirs: {
    data: 'data/pipeline',
    media: 'data/media',  // Relativo ao diretório exercise-api
    logs: 'data/logs'
  },
  batch: {
    fetchSize: 50,          // Lotes menores (mais seguro)
    translateSize: 10,      // Menos exercícios por tradução
    loadSize: 50,
    delayMs: 2500,          // 2.5s entre requests API (parece humano)
    delayTranslate: 1000,   // 1s entre traduções
  },
  estimates: {
    totalExercises: 1324,         // Total real na API v2.2.0
    apiRequestsNeeded: 27,        // 1324 / 50
    translateRequests: 133,       // 1324 / 10
    estimatedTimeMinutes: 45,     // ~45 min (conservador)
    estimatedCostUSD: 1.50,
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DICIONÁRIOS DE TRADUÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const FITNESS_DICT: Record<string, string> = {
  // Partes do corpo
  'back': 'costas', 'cardio': 'cardio', 'chest': 'peito',
  'lower arms': 'antebraços', 'lower legs': 'panturrilhas',
  'neck': 'pescoço', 'shoulders': 'ombros', 'upper arms': 'braços',
  'upper legs': 'coxas', 'waist': 'abdômen', 'core': 'core',
  
  // Músculos
  'abductors': 'abdutores', 'abs': 'abdominais', 'adductors': 'adutores',
  'biceps': 'bíceps', 'calves': 'panturrilhas', 'delts': 'deltoides',
  'forearms': 'antebraços', 'glutes': 'glúteos',
  'hamstrings': 'posteriores da coxa', 'lats': 'dorsais',
  'levator scapulae': 'elevador da escápula', 'pectorals': 'peitorais',
  'quads': 'quadríceps', 'serratus anterior': 'serrátil anterior',
  'spine': 'coluna', 'traps': 'trapézio', 'triceps': 'tríceps',
  'upper back': 'parte superior das costas', 'lower back': 'lombar',
  'obliques': 'oblíquos', 'hip flexors': 'flexores do quadril',
  'cardiovascular system': 'sistema cardiovascular',
  'rotator cuff': 'manguito rotador',
  
  // Equipamentos
  'assisted': 'assistido', 
  'band': 'elástico',
  'barbell': 'barra',
  'body weight': 'peso corporal', 
  'bosu ball': 'bosu',
  'cable': 'polia',
  'dumbbell': 'halter', 
  'elliptical machine': 'elíptico',
  'ez barbell': 'barra W', 
  'hammer': 'martelo',
  'kettlebell': 'kettlebell',
  'leverage machine': 'máquina', 
  'medicine ball': 'medicine ball',
  'olympic barbell': 'barra olímpica', 
  'resistance band': 'faixa elástica',
  'roller': 'rolo', 
  'rope': 'corda', 
  'skierg machine': 'skierg',
  'sled machine': 'trenó', 
  'smith machine': 'smith',
  'stability ball': 'bola suíça', 
  'stationary bike': 'bicicleta ergométrica',
  'stepmill machine': 'escada ergométrica', 
  'tire': 'pneu',
  'trap bar': 'trap bar', 
  'upper body ergometer': 'ergômetro de braço',
  'weighted': 'com peso',
  'wheel roller': 'roda abdominal',
};

const DIFFICULTY_DICT: Record<string, string> = {
  'beginner': 'iniciante',
  'intermediate': 'intermediário',
  'advanced': 'avançado',
  'expert': 'expert',
};

const CATEGORY_DICT: Record<string, string> = {
  'strength': 'força',
  'cardio': 'cardio',
  'mobility': 'mobilidade',
  'balance': 'equilíbrio',
  'stretching': 'alongamento',
  'plyometrics': 'pliometria',
  'rehabilitation': 'reabilitação',
};

// Equipamentos com modificadores (ex: "assisted (towel)")
const EQUIPMENT_MODIFIERS: Record<string, string> = {
  'towel': 'toalha',
  'band': 'elástico',
  'rope': 'corda',
  'chair': 'cadeira',
  'bench': 'banco',
  'wall': 'parede',
  'bar': 'barra',
};

function translateTerm(term: string): string {
  if (!term) return term;
  
  const lower = term.toLowerCase().trim();
  
  // Verifica se tem modificador entre parênteses: "assisted (towel)"
  const match = lower.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) {
    const base = FITNESS_DICT[match[1].trim()] || match[1].trim();
    const modifier = EQUIPMENT_MODIFIERS[match[2].trim()] || match[2].trim();
    return `${base} (${modifier})`;
  }
  
  return FITNESS_DICT[lower] || term;
}

function translateDifficulty(diff: string): string {
  if (!diff) return 'iniciante';
  return DIFFICULTY_DICT[diff.toLowerCase().trim()] || diff;
}

function translateCategory(cat: string): string {
  if (!cat) return 'força';
  return CATEGORY_DICT[cat.toLowerCase().trim()] || cat;
}


// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface ExerciseRaw {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl?: string;
  secondaryMuscles: string[];
  instructions: string[];
  description?: string;
  difficulty?: string;
  category?: string;
}

interface ExerciseTranslated {
  id: string;
  name: string;
  namePt: string;
  bodyPart: string;
  bodyPartPt: string;
  target: string;
  targetPt: string;
  equipment: string;
  equipmentPt: string;
  secondaryMuscles: string[];
  secondaryMusclesPt: string[];
  instructions: string[];
  instructionsPt: string[];
  descriptionPt: string;
  descriptionEn: string;
  difficulty: string;
  difficultyPt: string;
  category: string;
  categoryPt: string;
  gifUrl: string | null;
}

interface PipelineStats {
  fetched: number;
  translated: number;
  loaded: number;
  skipped: number;
  mediaDownloaded: number;
  mediaSkipped: number;
  mediaErrors: number;
  totalGifSize: number;
  totalWebpSize: number;
  errors: string[];
  tokensUsed: number;
  startTime: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

const log = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  progress: (current: number, total: number, msg: string) => 
    process.stdout.write(`\r[${current}/${total}] ${msg}`.padEnd(80)),
  section: (title: string) => {
    console.log('\n' + '═'.repeat(60));
    console.log(`  ${title}`);
    console.log('═'.repeat(60) + '\n');
  }
};

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// Delay humanizado com variação aleatória (parece navegação real)
async function humanDelay(baseMs: number): Promise<void> {
  const variation = Math.random() * 0.5; // 0-50% de variação
  const actualDelay = baseMs + (baseMs * variation);
  await delay(actualDelay);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// CHECKPOINT - RETOMADA INTELIGENTE
// ═══════════════════════════════════════════════════════════════════════════

interface Checkpoint {
  phase: 'extract' | 'translate' | 'load' | 'media' | 'done';
  extractOffset: number;
  extractedCount: number;
  lastUpdate: string;
}

const CHECKPOINT_FILE = 'data/pipeline/checkpoint.json';
const EXTRACTED_FILE = 'data/pipeline/extracted.json';

function loadCheckpoint(): Checkpoint | null {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    log.warn('Checkpoint corrompido, iniciando do zero');
  }
  return null;
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  checkpoint.lastUpdate = new Date().toISOString();
  ensureDir(path.dirname(CHECKPOINT_FILE));
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function loadExtractedData(): ExerciseRaw[] {
  try {
    if (fs.existsSync(EXTRACTED_FILE)) {
      const data = fs.readFileSync(EXTRACTED_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    log.warn('Dados extraídos corrompidos');
  }
  return [];
}

function saveExtractedData(exercises: ExerciseRaw[]): void {
  ensureDir(path.dirname(EXTRACTED_FILE));
  fs.writeFileSync(EXTRACTED_FILE, JSON.stringify(exercises, null, 2));
}

function clearCheckpoint(): void {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }
  if (fs.existsSync(EXTRACTED_FILE)) {
    fs.unlinkSync(EXTRACTED_FILE);
  }
  log.info('🗑️ Checkpoint limpo');
}


// ═══════════════════════════════════════════════════════════════════════════
// FASE 1: EXTRAÇÃO (com retomada de offset)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchExercises(limit?: number, force?: boolean, checkpoint?: Checkpoint | null): Promise<ExerciseRaw[]> {
  log.section('FASE 1: EXTRAÇÃO DA API');
  
  if (!CONFIG.api.headers['X-RapidAPI-Key']) {
    throw new Error('EXERCISEDB_API_KEY não configurada no .env');
  }
  
  // Se force, limpa checkpoint
  if (force) {
    clearCheckpoint();
    checkpoint = null;
  }
  
  // Carrega dados já extraídos (se existirem)
  let exercises = loadExtractedData();
  
  // Retoma do offset salvo no checkpoint
  let offset = checkpoint?.extractOffset || 0;
  
  // Se já tem dados extraídos e checkpoint indica que extração completou
  if (checkpoint?.phase !== 'extract' && exercises.length > 0) {
    log.info(`✅ Usando ${exercises.length} exercícios já extraídos`);
    
    // Filtra para o limite se necessário
    if (limit && exercises.length > limit) {
      exercises = exercises.slice(0, limit);
    }
    
    return exercises;
  }
  
  // Se já extraiu o suficiente
  if (limit && exercises.length >= limit) {
    log.info(`✅ Já extraídos ${exercises.length} exercícios (limite: ${limit})`);
    return exercises.slice(0, limit);
  }
  
  if (offset > 0) {
    log.info(`🔄 RETOMANDO do offset ${offset} (${exercises.length} já extraídos)`);
  }
  
  log.info(`🎯 Meta: ${limit || 'TODOS'} exercícios`);
  log.info(`📊 Estimativa: ~${CONFIG.estimates.totalExercises} exercícios disponíveis`);
  
  let consecutiveEmpty = 0;
  
  // Cria ou atualiza checkpoint
  const cp: Checkpoint = checkpoint || {
    phase: 'extract',
    extractOffset: 0,
    extractedCount: exercises.length,
    lastUpdate: new Date().toISOString()
  };
  
  // Salva checkpoint inicial
  saveCheckpoint(cp);
  
  while (true) {
    const pct = limit 
      ? Math.min(100, Math.round((exercises.length / limit) * 100))
      : Math.round((exercises.length / CONFIG.estimates.totalExercises) * 100);
    
    log.progress(exercises.length, limit || CONFIG.estimates.totalExercises, 
      `Buscando exercícios... ${pct}%`);
    
    try {
      const response = await axios.get(
        `${CONFIG.api.baseUrl}/exercises?offset=${offset}&limit=${CONFIG.batch.fetchSize}`,
        { headers: CONFIG.api.headers, timeout: 30000 }
      );
      
      if (!response.data || response.data.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
        offset += CONFIG.batch.fetchSize;
        continue;
      }
      
      consecutiveEmpty = 0;
      
      // Adiciona novos exercícios (evita duplicatas)
      const existingIds = new Set(exercises.map(e => e.id));
      for (const ex of response.data) {
        if (!existingIds.has(ex.id)) {
          exercises.push(ex);
        }
      }
      
      offset += CONFIG.batch.fetchSize;
      cp.extractOffset = offset;
      cp.extractedCount = exercises.length;
      
      // Salva checkpoint e dados a cada lote
      saveCheckpoint(cp);
      saveExtractedData(exercises);
      
      // Pausa longa a cada 500 exercícios NOVOS
      if (exercises.length > 0 && exercises.length % 500 === 0) {
        log.info(`\n☕ Pausa de 30s após ${exercises.length} exercícios...`);
        await delay(30000);
      }
      
      if (limit && exercises.length >= limit) {
        exercises = exercises.slice(0, limit);
        break;
      }
      
      // Delay humanizado (2.5s + variação aleatória)
      await humanDelay(CONFIG.batch.delayMs);
      
    } catch (error: any) {
      // Salva checkpoint antes de tratar erro
      saveCheckpoint(cp);
      saveExtractedData(exercises);
      
      if (error.response?.status === 429) {
        log.warn(`\n⚠️ Rate limit! Aguardando 60s...`);
        await delay(60000);
        continue;
      }
      throw error;
    }
  }
  
  console.log('');
  log.success(`${exercises.length} exercícios extraídos da API`);
  
  // Atualiza fase no checkpoint
  cp.phase = 'translate';
  saveCheckpoint(cp);
  saveExtractedData(exercises);
  
  // Na API v2, os GIFs são acessados via endpoint separado
  const gifBaseUrl = 'https://exercisedb.p.rapidapi.com/image';
  
  for (const ex of exercises) {
    if (!ex.gifUrl) {
      ex.gifUrl = `${gifBaseUrl}?exerciseId=${ex.id}&resolution=720`;
    }
  }
  
  const withGif = exercises.length;
  const withDesc = exercises.filter(e => e.description).length;
  const withDiff = exercises.filter(e => e.difficulty).length;
  
  log.info(`🎬 Com gifUrl: ${withGif}/${exercises.length} (via Image Service)`);
  log.info(`📝 Com description: ${withDesc}/${exercises.length}`);
  log.info(`💪 Com difficulty: ${withDiff}/${exercises.length}`);
  
  return exercises;
}


// ═══════════════════════════════════════════════════════════════════════════
// FASE 2: TRADUÇÃO COM IA
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Você é um Personal Trainer Brasileiro certificado (CREF), especialista em traduzir conteúdo fitness para português brasileiro de academia.

REGRAS:
1. Use SEMPRE termos técnicos de academia brasileira:
   - Dumbbell → Halter | Barbell → Barra | Bench Press → Supino
   - Squat → Agachamento | Deadlift → Levantamento Terra
   - Pull-up → Barra Fixa | Push-up → Flexão | Curl → Rosca
   - Row → Remada | Fly → Crucifixo | Lunge → Avanço
   - Crunch → Abdominal | Plank → Prancha | Cable → Polia

2. Instruções devem ser PROFISSIONAIS e TÉCNICAS
3. Crie uma descrição de 2-3 frases sobre o exercício
4. NÃO adicione informações que não existam no original

FORMATO: Retorne APENAS JSON válido, sem markdown.`;

async function translateBatch(
  exercises: ExerciseRaw[],
  stats: PipelineStats
): Promise<Map<string, { namePt: string; instructionsPt: string[]; descriptionPt: string }>> {
  const translations = new Map();
  
  if (!CONFIG.openai.apiKey) {
    log.warn('OPENAI_API_KEY não configurada. Usando apenas dicionário.');
    return translations;
  }
  
  const userPrompt = `Traduza estes exercícios:

${JSON.stringify(exercises.map(e => ({
  id: e.id,
  name: e.name,
  instructions: e.instructions,
})), null, 2)}

Retorne JSON: { "exercises": [{ "id", "namePt", "instructionsPt", "descriptionPt" }] }`;

  try {
    const response = await axios.post(
      `${CONFIG.openai.baseUrl}/chat/completions`,
      {
        model: CONFIG.openai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    stats.tokensUsed += response.data.usage?.total_tokens || 0;
    
    const content = response.data.choices[0]?.message?.content;
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    for (const t of parsed.exercises) {
      translations.set(t.id, {
        namePt: t.namePt,
        instructionsPt: t.instructionsPt,
        descriptionPt: t.descriptionPt
      });
    }
    
  } catch (error: any) {
    log.error(`Erro na tradução: ${error.message}`);
    stats.errors.push(`Tradução: ${error.message}`);
  }
  
  return translations;
}

async function translateExercises(
  exercises: ExerciseRaw[],
  stats: PipelineStats
): Promise<ExerciseTranslated[]> {
  log.section('FASE 2: TRADUÇÃO COM IA');
  
  const translated: ExerciseTranslated[] = [];
  const totalBatches = Math.ceil(exercises.length / CONFIG.batch.translateSize);
  
  log.info(`📊 ${exercises.length} exercícios em ${totalBatches} lotes`);
  log.info(`💰 Custo estimado: ~$${(exercises.length * 0.0003).toFixed(2)} USD`);
  
  for (let i = 0; i < exercises.length; i += CONFIG.batch.translateSize) {
    const batch = exercises.slice(i, i + CONFIG.batch.translateSize);
    const batchNum = Math.floor(i / CONFIG.batch.translateSize) + 1;
    
    log.progress(i + batch.length, exercises.length, 
      `Traduzindo lote ${batchNum}/${totalBatches}...`);
    
    const aiTranslations = await translateBatch(batch, stats);
    
    for (const ex of batch) {
      const ai = aiTranslations.get(ex.id);
      
      translated.push({
        id: ex.id,
        name: ex.name,
        namePt: ai?.namePt || ex.name,
        bodyPart: ex.bodyPart,
        bodyPartPt: translateTerm(ex.bodyPart),
        target: ex.target,
        targetPt: translateTerm(ex.target),
        equipment: ex.equipment,
        equipmentPt: translateTerm(ex.equipment),
        secondaryMuscles: ex.secondaryMuscles || [],
        secondaryMusclesPt: (ex.secondaryMuscles || []).map(m => translateTerm(m)),
        instructions: ex.instructions || [],
        instructionsPt: ai?.instructionsPt || ex.instructions || [],
        descriptionPt: ai?.descriptionPt || '',
        descriptionEn: ex.description || '',
        difficulty: ex.difficulty || 'beginner',
        difficultyPt: translateDifficulty(ex.difficulty || 'beginner'),
        category: ex.category || 'strength',
        categoryPt: translateCategory(ex.category || 'strength'),
        gifUrl: ex.gifUrl || null,
      });
      
      stats.translated++;
    }
    
    await delay(CONFIG.batch.delayTranslate);
  }
  
  console.log('');
  log.success(`${translated.length} exercícios traduzidos`);
  
  return translated;
}


// ═══════════════════════════════════════════════════════════════════════════
// FASE 3: CARGA NO BANCO
// ═══════════════════════════════════════════════════════════════════════════

async function loadExercises(
  exercises: ExerciseTranslated[],
  stats: PipelineStats,
  force: boolean
): Promise<void> {
  log.section('FASE 3: CARGA NO BANCO');
  
  let toLoad = exercises;
  
  if (!force) {
    const existingIds = await prisma.exercise.findMany({ select: { id: true } });
    const existingSet = new Set(existingIds.map(e => e.id));
    toLoad = exercises.filter(e => !existingSet.has(e.id));
    stats.skipped = exercises.length - toLoad.length;
    
    if (stats.skipped > 0) {
      log.info(`⏭️ Pulando ${stats.skipped} exercícios já existentes`);
    }
  }
  
  if (toLoad.length === 0) {
    log.info('✅ Nenhum exercício novo para carregar');
    return;
  }
  
  log.info(`📥 Carregando ${toLoad.length} exercícios...`);
  
  for (let i = 0; i < toLoad.length; i++) {
    const ex = toLoad[i];
    log.progress(i + 1, toLoad.length, `Carregando no banco...`);
    
    try {
      if (force) {
        const existing = await prisma.exercise.findUnique({ where: { id: ex.id } });
        if (existing) {
          await prisma.$transaction([
            prisma.exerciseSecondaryMuscle.deleteMany({ where: { exerciseId: ex.id } }),
            prisma.exerciseInstruction.deleteMany({ where: { exerciseId: ex.id } }),
            prisma.exerciseTip.deleteMany({ where: { exerciseId: ex.id } }),
            prisma.exerciseVariation.deleteMany({ where: { exerciseId: ex.id } }),
            prisma.exerciseKeyword.deleteMany({ where: { exerciseId: ex.id } }),
            prisma.exercise.delete({ where: { id: ex.id } }),
          ]);
        }
      }
      
      await prisma.exercise.create({
        data: {
          id: ex.id,
          name: ex.namePt,
          nameEn: ex.name,
          bodyPart: ex.bodyPartPt,
          bodyPartEn: ex.bodyPart,
          target: ex.targetPt,
          targetEn: ex.target,
          equipment: ex.equipmentPt,
          equipmentEn: ex.equipment,
          overview: ex.descriptionPt || null,
          overviewEn: ex.descriptionEn || null,
          difficulty: ex.difficultyPt,
          category: ex.categoryPt,
          gifUrl: ex.gifUrl,
          secondaryMuscles: {
            create: ex.secondaryMuscles.map((m, idx) => ({
              muscle: ex.secondaryMusclesPt[idx] || m,
              muscleEn: m
            }))
          },
          instructions: {
            create: ex.instructions.map((inst, idx) => ({
              stepOrder: idx + 1,
              instruction: ex.instructionsPt[idx] || inst,
              instructionEn: inst
            }))
          }
        }
      });
      
      stats.loaded++;
      
    } catch (error: any) {
      stats.errors.push(`Load ${ex.id}: ${error.message}`);
    }
  }
  
  console.log('');
  log.success(`${stats.loaded} exercícios carregados no banco`);
}


// ═══════════════════════════════════════════════════════════════════════════
// FASE 4: DOWNLOAD E CONVERSÃO DE MÍDIA (GIF → WebP)
// ═══════════════════════════════════════════════════════════════════════════

async function downloadAndConvertMedia(
  exercises: ExerciseTranslated[],
  stats: PipelineStats
): Promise<void> {
  log.section('FASE 4: DOWNLOAD E CONVERSÃO DE MÍDIA');
  
  const mediaDir = CONFIG.dirs.media;
  ensureDir(mediaDir);
  
  // Busca TODOS os exercícios do banco que precisam de mídia
  // (não apenas os que foram processados nesta execução)
  const allExercises = await prisma.exercise.findMany({
    select: { id: true, gifUrl: true }
  });
  
  // Verifica quais arquivos realmente existem no disco
  const toDownload: string[] = [];
  let alreadyExists = 0;
  
  for (const ex of allExercises) {
    const webpPath = path.join(mediaDir, `${ex.id}.webp`);
    if (fs.existsSync(webpPath)) {
      // Arquivo existe - garante que o banco está atualizado
      if (!ex.gifUrl?.startsWith('/media')) {
        await prisma.exercise.update({
          where: { id: ex.id },
          data: { 
            gifUrl: `/media/exercises/${ex.id}.webp`,
            imageUrl: `/media/exercises/${ex.id}.webp`
          }
        });
      }
      alreadyExists++;
    } else {
      toDownload.push(ex.id);
    }
  }
  
  stats.mediaSkipped = alreadyExists;
  
  if (alreadyExists > 0) {
    log.info(`⏭️ ${alreadyExists} mídias já existem localmente`);
  }
  
  if (toDownload.length === 0) {
    log.info('✅ Todas as mídias já foram baixadas');
    return;
  }
  
  log.info(`📥 Baixando ${toDownload.length} GIFs...`);
  log.info(`💾 Convertendo para WebP (menor tamanho)`);
  
  for (let i = 0; i < toDownload.length; i++) {
    const exId = toDownload[i];
    const gifUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exId}&resolution=720`;
    const webpPath = path.join(mediaDir, `${exId}.webp`);
    
    log.progress(i + 1, toDownload.length, `Baixando ${exId}...`);
    
    try {
      // Download do GIF
      const response = await axios.get(gifUrl, {
        headers: CONFIG.api.headers,
        responseType: 'arraybuffer',
        timeout: 60000
      });
      
      const gifBuffer = Buffer.from(response.data);
      const gifSize = gifBuffer.length;
      stats.totalGifSize += gifSize;
      
      // Converte GIF para WebP animado
      const webpBuffer = await sharp(gifBuffer, { animated: true })
        .webp({ quality: 80 })
        .toBuffer();
      
      const webpSize = webpBuffer.length;
      stats.totalWebpSize += webpSize;
      
      // Salva WebP PRIMEIRO
      fs.writeFileSync(webpPath, webpBuffer);
      
      // SÓ DEPOIS atualiza o banco
      await prisma.exercise.update({
        where: { id: exId },
        data: { 
          gifUrl: `/media/exercises/${exId}.webp`,
          imageUrl: `/media/exercises/${exId}.webp`
        }
      });
      
      stats.mediaDownloaded++;
      
      // Pausa a cada 100 downloads
      if (stats.mediaDownloaded % 100 === 0) {
        const reduction = ((1 - stats.totalWebpSize / stats.totalGifSize) * 100).toFixed(1);
        log.info(`\n📊 Progresso: ${stats.mediaDownloaded} mídias, ${reduction}% redução`);
        log.info(`☕ Pausa de 30s...`);
        await delay(30000);
      }
      
      // Delay humanizado entre downloads
      await humanDelay(CONFIG.batch.delayMs);
      
    } catch (error: any) {
      stats.mediaErrors++;
      stats.errors.push(`Media ${exId}: ${error.message}`);
      
      // Se for rate limit, espera mais
      if (error.response?.status === 429) {
        log.warn(`\n⚠️ Rate limit! Aguardando 120s...`);
        await delay(120000);
        i--; // Tenta novamente
      }
    }
  }
  
  console.log('');
  
  const reduction = stats.totalGifSize > 0 
    ? ((1 - stats.totalWebpSize / stats.totalGifSize) * 100).toFixed(1)
    : '0';
  
  log.success(`${stats.mediaDownloaded} mídias baixadas e convertidas`);
  log.info(`📉 Redução de tamanho: ${reduction}%`);
  log.info(`💾 GIF total: ${(stats.totalGifSize / 1024 / 1024).toFixed(1)} MB`);
  log.info(`💾 WebP total: ${(stats.totalWebpSize / 1024 / 1024).toFixed(1)} MB`);
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs(): { limit?: number; force: boolean; reset: boolean } {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let force = false;
  let reset = false;
  
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    }
    if (arg === '--force') {
      force = true;
    }
    if (arg === '--reset') {
      reset = true;
    }
  }
  
  return { limit, force, reset };
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - PIPELINE v3.1                       ║');
  console.log('║  Suporte para 11.000+ exercícios com CHECKPOINT              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  const { limit, force, reset } = parseArgs();
  
  // Carrega checkpoint existente
  let checkpoint = loadCheckpoint();
  
  if (reset) {
    clearCheckpoint();
    checkpoint = null;
    log.info('🔄 Checkpoint resetado - iniciando do zero');
  }
  
  if (checkpoint) {
    log.info(`📍 CHECKPOINT ENCONTRADO:`);
    log.info(`   Fase: ${checkpoint.phase}`);
    log.info(`   Offset: ${checkpoint.extractOffset}`);
    log.info(`   Extraídos: ${checkpoint.extractedCount}`);
    log.info(`   Última atualização: ${checkpoint.lastUpdate}`);
    console.log('');
  }
  
  if (limit) log.info(`🎯 Limite: ${limit} exercícios`);
  if (force) log.info(`🔄 Modo FORCE: re-processando todos`);
  
  const targetCount = limit || CONFIG.estimates.totalExercises;
  const estimatedTime = Math.ceil(targetCount / 120);
  log.info(`⏱️ Tempo estimado: ~${estimatedTime} minutos (modo seguro)`);
  log.info(`🛡️ Delays humanizados ativados para evitar detecção`);
  log.info(`💾 Checkpoint salvo a cada lote (retomada automática)`);
  
  ensureDir(CONFIG.dirs.data);
  ensureDir(CONFIG.dirs.media);
  ensureDir(CONFIG.dirs.logs);
  
  const stats: PipelineStats = {
    fetched: 0,
    translated: 0,
    loaded: 0,
    skipped: 0,
    mediaDownloaded: 0,
    mediaSkipped: 0,
    mediaErrors: 0,
    totalGifSize: 0,
    totalWebpSize: 0,
    errors: [],
    tokensUsed: 0,
    startTime: new Date()
  };
  
  try {
    const raw = await fetchExercises(limit, force, checkpoint);
    stats.fetched = raw.length;
    
    // Recarrega checkpoint após extração
    checkpoint = loadCheckpoint();
    
    const translated = await translateExercises(raw, stats);
    
    const backupPath = path.join(CONFIG.dirs.data, `backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(translated, null, 2));
    log.info(`💾 Backup salvo: ${backupPath}`);
    
    await loadExercises(translated, stats, force);
    
    // FASE 4: Download e conversão de mídia
    await downloadAndConvertMedia(translated, stats);
    
    // Pipeline completo - limpa checkpoint
    clearCheckpoint();
    log.success('🎉 Pipeline completo! Checkpoint limpo.');
    
  } catch (error: any) {
    log.error(`Erro fatal: ${error.message}`);
    stats.errors.push(error.message);
    log.info('💾 Checkpoint salvo - execute novamente para retomar');
  }
  
  const duration = (Date.now() - stats.startTime.getTime()) / 1000;
  const durationMin = (duration / 60).toFixed(1);
  
  log.section('RELATÓRIO FINAL');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 ESTATÍSTICAS DO PIPELINE                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📥 Extraídos:     ${String(stats.fetched).padStart(6)}                                ║`);
  console.log(`║  🌐 Traduzidos:    ${String(stats.translated).padStart(6)}                                ║`);
  console.log(`║  💾 Carregados:    ${String(stats.loaded).padStart(6)}                                ║`);
  console.log(`║  ⏭️  Pulados:       ${String(stats.skipped).padStart(6)}                                ║`);
  console.log(`║  🎬 Mídias:        ${String(stats.mediaDownloaded).padStart(6)}                                ║`);
  console.log(`║  ❌ Erros:         ${String(stats.errors.length).padStart(6)}                                ║`);
  console.log(`║  🤖 Tokens IA:     ${String(stats.tokensUsed).padStart(6)}                                ║`);
  console.log(`║  ⏱️  Duração:      ${durationMin.padStart(6)} min                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const costInput = (stats.tokensUsed * 0.6) * 0.00000015;
  const costOutput = (stats.tokensUsed * 0.4) * 0.0000006;
  const totalCost = costInput + costOutput;
  log.info(`💰 Custo estimado OpenAI: $${totalCost.toFixed(4)}`);
  
  const reportPath = path.join(CONFIG.dirs.logs, `pipeline-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration,
    durationMinutes: parseFloat(durationMin),
    stats,
    cost: totalCost
  }, null, 2));
  
  if (stats.errors.length > 0) {
    log.warn(`\n⚠️ Erros encontrados:`);
    stats.errors.slice(0, 5).forEach(e => log.error(`  ${e}`));
    if (stats.errors.length > 5) {
      log.warn(`  ... e mais ${stats.errors.length - 5} erros`);
    }
  }
  
  const dbTotal = await prisma.exercise.count();
  const dbWithMedia = await prisma.exercise.count({ 
    where: { gifUrl: { startsWith: '/media' } } 
  });
  
  log.info(`\n📊 Total no banco: ${dbTotal} exercícios`);
  log.info(`🎬 Com mídia local: ${dbWithMedia} exercícios`);
  
  if (stats.mediaDownloaded > 0) {
    const reduction = ((1 - stats.totalWebpSize / stats.totalGifSize) * 100).toFixed(1);
    log.info(`📉 Redução média: ${reduction}%`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
