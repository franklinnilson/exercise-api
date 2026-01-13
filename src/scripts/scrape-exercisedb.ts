/**
 * Script de Scraping do ExerciseDB V1 (GIFs) + V2 (Vídeos)
 * 
 * V1: ~1.500 exercícios com GIFs (tier gratuito RapidAPI)
 * V2: ~11.000 exercícios com vídeos MP4 (plano PRO $29/mês)
 * 
 * Uso: npm run scrape:exercises
 */

import { PrismaClient } from '@prisma/client';
import axios, { AxiosError } from 'axios';
import { translateArray, translateExerciseName, translateText } from './translator';

const prisma = new PrismaClient();

// ============================================
// CONFIGURAÇÃO DAS APIs
// ============================================

const API_V1 = {
  baseUrl: 'https://exercisedb.p.rapidapi.com',
  headers: {
    'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
    'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
  }
};

// V2 com vídeos (requer plano PRO ou superior)
const API_V2 = {
  baseUrl: 'https://exercisedb-api.p.rapidapi.com/api/v1',
  headers: {
    'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
    'X-RapidAPI-Host': 'exercisedb-api.p.rapidapi.com'
  }
};

// ============================================
// INTERFACES
// ============================================

interface ExerciseV1 {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl: string;
  secondaryMuscles: string[];
  instructions: string[];
}

interface ExerciseV2 {
  exerciseId: string;
  name: string;
  bodyParts: string[];
  targetMuscles: string[];
  equipments: string[];
  secondaryMuscles: string[];
  instructions: string[];
  exerciseTips?: string[];
  variations?: string[];
  keywords?: string[];
  overview?: string;
  imageUrl?: string;
  videoUrl?: string;
  difficulty?: string;
  exerciseType?: string;
  gender?: string;
}

// ============================================
// HELPERS
// ============================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const log = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  progress: (current: number, total: number, msg: string) => 
    console.log(`[${current}/${total}] ${msg}`)
};

// ============================================
// API CALLS
// ============================================

async function fetchWithRetry<T>(
  url: string, 
  headers: Record<string, string>,
  params: Record<string, any> = {},
  retries = 3
): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, { headers, params, timeout: 30000 });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response?.status === 429) {
        log.warn(`Rate limit atingido, aguardando ${30 * (i + 1)}s...`);
        await delay(30000 * (i + 1));
        continue;
      }
      
      if (axiosError.response?.status === 403) {
        log.error('API Key inválida ou sem permissão');
        return null;
      }
      
      if (i === retries - 1) {
        log.error(`Falha após ${retries} tentativas: ${axiosError.message}`);
        return null;
      }
      
      await delay(2000 * (i + 1));
    }
  }
  return null;
}

async function fetchAllExercisesV1(): Promise<ExerciseV1[]> {
  log.info('Buscando exercícios da API V1 (com GIFs)...');
  
  const allExercises: ExerciseV1[] = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const batch = await fetchWithRetry<ExerciseV1[]>(
      `${API_V1.baseUrl}/exercises`,
      API_V1.headers,
      { offset, limit }
    );
    
    if (!batch || batch.length === 0) break;
    
    allExercises.push(...batch);
    log.info(`  Baixados ${allExercises.length} exercícios...`);
    
    offset += limit;
    await delay(500);
    
    // Limite do tier gratuito
    if (allExercises.length >= 1500) break;
  }
  
  return allExercises;
}

async function fetchAllExercisesV2(): Promise<ExerciseV2[]> {
  log.info('Buscando exercícios da API V2 (com vídeos)...');
  
  const allExercises: ExerciseV2[] = [];
  let offset = 0;
  const limit = 50;
  
  while (true) {
    const response = await fetchWithRetry<{ exercises: ExerciseV2[] } | ExerciseV2[]>(
      `${API_V2.baseUrl}/exercises`,
      API_V2.headers,
      { offset, limit }
    );
    
    if (!response) break;
    
    const batch = Array.isArray(response) ? response : response.exercises || [];
    if (batch.length === 0) break;
    
    allExercises.push(...batch);
    log.info(`  Baixados ${allExercises.length} exercícios...`);
    
    offset += limit;
    await delay(1000); // Rate limit mais conservador para V2
    
    if (allExercises.length >= 11000) break;
  }
  
  return allExercises;
}

// ============================================
// PROCESSAMENTO E SALVAMENTO
// ============================================

async function processExerciseV1(exercise: ExerciseV1, index: number, total: number) {
  try {
    const existing = await prisma.exercise.findUnique({ where: { id: exercise.id } });
    if (existing) {
      log.progress(index + 1, total, `⏭️  "${exercise.name}" já existe`);
      return;
    }
    
    log.progress(index + 1, total, `🔄 Traduzindo "${exercise.name}"...`);
    
    // Traduções
    const [namePt, bodyPartPt, targetPt, equipmentPt] = await Promise.all([
      translateExerciseName(exercise.name),
      translateText(exercise.bodyPart),
      translateText(exercise.target),
      translateText(exercise.equipment)
    ]);
    
    const secondaryMusclesPt = await translateArray(exercise.secondaryMuscles || []);
    
    const instructionsPt: string[] = [];
    for (const instruction of (exercise.instructions || [])) {
      instructionsPt.push(await translateText(instruction));
      await delay(100);
    }
    
    // Salva no banco
    await prisma.exercise.create({
      data: {
        id: exercise.id,
        name: namePt,
        nameEn: exercise.name,
        bodyPart: bodyPartPt,
        bodyPartEn: exercise.bodyPart,
        target: targetPt,
        targetEn: exercise.target,
        equipment: equipmentPt,
        equipmentEn: exercise.equipment,
        gifUrl: exercise.gifUrl,
        videoUrl: null,
        imageUrl: null,
        difficulty: null,
        category: 'strength',
        overview: null,
        overviewEn: null,
        secondaryMuscles: {
          create: (exercise.secondaryMuscles || []).map((muscle, i) => ({
            muscle: secondaryMusclesPt[i] || muscle,
            muscleEn: muscle
          }))
        },
        instructions: {
          create: (exercise.instructions || []).map((instruction, i) => ({
            stepOrder: i + 1,
            instruction: instructionsPt[i] || instruction,
            instructionEn: instruction
          }))
        }
      }
    });
    
    log.progress(index + 1, total, `✅ "${namePt}"`);
    
  } catch (error: any) {
    log.progress(index + 1, total, `❌ Erro em "${exercise.name}": ${error.message}`);
  }
}

async function processExerciseV2(exercise: ExerciseV2, index: number, total: number) {
  const exerciseId = exercise.exerciseId;
  
  try {
    const existing = await prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (existing) {
      log.progress(index + 1, total, `⏭️  "${exercise.name}" já existe`);
      return;
    }
    
    log.progress(index + 1, total, `🔄 Traduzindo "${exercise.name}"...`);
    
    const bodyPartEn = exercise.bodyParts?.[0] || 'other';
    const targetEn = exercise.targetMuscles?.[0] || 'other';
    const equipmentEn = exercise.equipments?.[0] || 'body weight';
    
    // Traduções
    const [namePt, bodyPartPt, targetPt, equipmentPt, overviewPt] = await Promise.all([
      translateExerciseName(exercise.name),
      translateText(bodyPartEn),
      translateText(targetEn),
      translateText(equipmentEn),
      exercise.overview ? translateText(exercise.overview) : Promise.resolve(null)
    ]);
    
    const secondaryMusclesPt = await translateArray(exercise.secondaryMuscles || []);
    
    const instructionsPt: string[] = [];
    for (const instruction of (exercise.instructions || [])) {
      instructionsPt.push(await translateText(instruction));
      await delay(100);
    }
    
    const tipsPt: string[] = [];
    for (const tip of (exercise.exerciseTips || [])) {
      tipsPt.push(await translateText(tip));
      await delay(100);
    }
    
    const variationsPt: string[] = [];
    for (const variation of (exercise.variations || [])) {
      variationsPt.push(await translateText(variation));
      await delay(100);
    }
    
    const keywordsPt: string[] = [];
    for (const keyword of (exercise.keywords || [])) {
      keywordsPt.push(await translateText(keyword));
      await delay(50);
    }
    
    // Mapeia difficulty
    const difficultyMap: Record<string, string> = {
      'beginner': 'iniciante',
      'intermediate': 'intermediário',
      'advanced': 'avançado'
    };
    
    await prisma.exercise.create({
      data: {
        id: exerciseId,
        name: namePt,
        nameEn: exercise.name,
        bodyPart: bodyPartPt,
        bodyPartEn: bodyPartEn,
        target: targetPt,
        targetEn: targetEn,
        equipment: equipmentPt,
        equipmentEn: equipmentEn,
        gifUrl: null,
        videoUrl: exercise.videoUrl || null,
        imageUrl: exercise.imageUrl || null,
        difficulty: difficultyMap[exercise.difficulty?.toLowerCase() || ''] || exercise.difficulty,
        category: exercise.exerciseType?.toLowerCase() || 'strength',
        overview: overviewPt,
        overviewEn: exercise.overview,
        secondaryMuscles: {
          create: (exercise.secondaryMuscles || []).map((muscle, i) => ({
            muscle: secondaryMusclesPt[i] || muscle,
            muscleEn: muscle
          }))
        },
        instructions: {
          create: (exercise.instructions || []).map((instruction, i) => ({
            stepOrder: i + 1,
            instruction: instructionsPt[i] || instruction,
            instructionEn: instruction
          }))
        },
        tips: {
          create: (exercise.exerciseTips || []).map((tip, i) => ({
            tip: tipsPt[i] || tip,
            tipEn: tip
          }))
        },
        variations: {
          create: (exercise.variations || []).map((variation, i) => ({
            variation: variationsPt[i] || variation,
            variationEn: variation
          }))
        },
        keywords: {
          create: (exercise.keywords || []).map((keyword, i) => ({
            keyword: keywordsPt[i] || keyword,
            keywordEn: keyword
          }))
        }
      }
    });
    
    const hasVideo = exercise.videoUrl ? '🎥' : '';
    const hasImage = exercise.imageUrl ? '🖼️' : '';
    log.progress(index + 1, total, `✅ "${namePt}" ${hasVideo}${hasImage}`);
    
  } catch (error: any) {
    log.progress(index + 1, total, `❌ Erro em "${exercise.name}": ${error.message}`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🏋️ ExerciseDB Scraper com Tradução Automática PT-BR     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  if (!process.env.EXERCISEDB_API_KEY) {
    log.error('EXERCISEDB_API_KEY não configurada!\n');
    console.log('📝 Para obter uma chave GRATUITA:');
    console.log('   1. Acesse https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb');
    console.log('   2. Crie uma conta gratuita');
    console.log('   3. Clique em "Subscribe to Test"');
    console.log('   4. Copie sua X-RapidAPI-Key');
    console.log('   5. Adicione no .env: EXERCISEDB_API_KEY=sua_chave\n');
    console.log('💡 Tier gratuito: 500 requests/mês');
    console.log('💡 Tier PRO ($29/mês): 20.000 requests/mês + vídeos\n');
    process.exit(1);
  }
  
  // Detecta qual versão usar
  const useV2 = process.argv.includes('--v2');
  
  if (useV2) {
    console.log('📦 Modo: V2 (com vídeos MP4) - Requer plano PRO\n');
    
    const exercises = await fetchAllExercisesV2();
    if (exercises.length === 0) {
      log.error('Nenhum exercício encontrado. Verifique sua API key e plano.');
      process.exit(1);
    }
    
    console.log(`\n📊 Total: ${exercises.length} exercícios para processar\n`);
    
    for (let i = 0; i < exercises.length; i++) {
      await processExerciseV2(exercises[i], i, exercises.length);
      await delay(200);
    }
    
  } else {
    console.log('📦 Modo: V1 (com GIFs) - Tier gratuito\n');
    
    const exercises = await fetchAllExercisesV1();
    if (exercises.length === 0) {
      log.error('Nenhum exercício encontrado. Verifique sua API key.');
      process.exit(1);
    }
    
    console.log(`\n📊 Total: ${exercises.length} exercícios para processar\n`);
    
    for (let i = 0; i < exercises.length; i++) {
      await processExerciseV1(exercises[i], i, exercises.length);
      await delay(200);
    }
  }
  
  // Estatísticas finais
  const stats = await prisma.exercise.aggregate({
    _count: { id: true }
  });
  
  const withVideos = await prisma.exercise.count({ where: { videoUrl: { not: null } } });
  const withGifs = await prisma.exercise.count({ where: { gifUrl: { not: null } } });
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Scraping Concluído!                                   ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  📊 Total de exercícios: ${String(stats._count.id).padEnd(30)}║`);
  console.log(`║  🎥 Com vídeos: ${String(withVideos).padEnd(39)}║`);
  console.log(`║  🎞️  Com GIFs: ${String(withGifs).padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
