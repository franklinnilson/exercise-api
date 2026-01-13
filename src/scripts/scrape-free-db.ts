/**
 * Script de Scraping do free-exercise-db (100% GRATUITO)
 * 
 * Extrai exercícios do repositório GitHub yuhonas/free-exercise-db
 * que é domínio público e não requer API key.
 * 
 * Uso: npm run scrape:free
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { translateArray, translateExerciseName, translateText } from './translator';

const prisma = new PrismaClient();

const FREE_DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGES_BASE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

interface FreeExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mapeamento de músculos para body parts
const MUSCLE_TO_BODYPART: Record<string, string> = {
  'abdominals': 'waist',
  'abductors': 'upper legs',
  'adductors': 'upper legs',
  'biceps': 'upper arms',
  'calves': 'lower legs',
  'chest': 'chest',
  'forearms': 'lower arms',
  'glutes': 'upper legs',
  'hamstrings': 'upper legs',
  'lats': 'back',
  'lower back': 'back',
  'middle back': 'back',
  'neck': 'neck',
  'quadriceps': 'upper legs',
  'shoulders': 'shoulders',
  'traps': 'back',
  'triceps': 'upper arms',
};

async function fetchFreeExercises(): Promise<FreeExercise[]> {
  console.log('📥 Baixando exercícios do free-exercise-db...');
  
  try {
    const response = await axios.get(FREE_DB_URL, { timeout: 30000 });
    return response.data;
  } catch (error: any) {
    console.error('Erro ao baixar exercícios:', error.message);
    return [];
  }
}

async function processAndSaveExercise(exercise: FreeExercise, index: number, total: number) {
  const progress = `[${index + 1}/${total}]`;
  
  try {
    // Verifica se já existe
    const existing = await prisma.exercise.findUnique({
      where: { id: exercise.id }
    });
    
    if (existing) {
      console.log(`${progress} ⏭️  Pulando "${exercise.name}" (já existe)`);
      return;
    }
    
    console.log(`${progress} 🔄 Processando "${exercise.name}"...`);
    
    // Determina body part baseado no músculo primário
    const primaryMuscle = exercise.primaryMuscles[0] || 'other';
    const bodyPartEn = MUSCLE_TO_BODYPART[primaryMuscle] || 'other';
    
    // Traduz campos principais
    const [namePt, bodyPartPt, targetPt, equipmentPt] = await Promise.all([
      translateExerciseName(exercise.name),
      translateText(bodyPartEn),
      translateText(primaryMuscle),
      translateText(exercise.equipment || 'body weight')
    ]);
    
    // Traduz arrays
    const secondaryMusclesPt = await translateArray(exercise.secondaryMuscles || []);
    const instructionsPt: string[] = [];
    
    for (const instruction of (exercise.instructions || [])) {
      const translated = await translateText(instruction);
      instructionsPt.push(translated);
      await delay(150);
    }
    
    // Monta URL da primeira imagem
    const imageUrl = exercise.images?.[0] 
      ? `${IMAGES_BASE_URL}/${exercise.images[0]}`
      : null;
    
    // Mapeia difficulty
    const difficultyMap: Record<string, string> = {
      'beginner': 'iniciante',
      'intermediate': 'intermediário',
      'expert': 'avançado'
    };
    
    // Salva no banco
    await prisma.exercise.create({
      data: {
        id: exercise.id,
        name: namePt,
        nameEn: exercise.name,
        bodyPart: bodyPartPt,
        bodyPartEn: bodyPartEn,
        target: targetPt,
        targetEn: primaryMuscle,
        equipment: equipmentPt,
        equipmentEn: exercise.equipment || 'body weight',
        gifUrl: null,
        videoUrl: null,
        imageUrl: imageUrl,
        difficulty: difficultyMap[exercise.level] || exercise.level,
        category: exercise.category,
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
    
    console.log(`${progress} ✅ Salvo: "${namePt}"`);
    
  } catch (error: any) {
    console.error(`${progress} ❌ Erro em "${exercise.name}":`, error.message);
  }
}

async function main() {
  console.log('🏋️ Free Exercise DB Scraper com Tradução PT-BR');
  console.log('===============================================\n');
  console.log('📌 Fonte: github.com/yuhonas/free-exercise-db');
  console.log('📌 Licença: Domínio Público (100% gratuito)\n');
  
  const exercises = await fetchFreeExercises();
  
  if (exercises.length === 0) {
    console.error('❌ Nenhum exercício encontrado!');
    process.exit(1);
  }
  
  console.log(`📊 Total: ${exercises.length} exercícios para processar\n`);
  console.log('🔄 Traduzindo e salvando no banco de dados...\n');
  
  for (let i = 0; i < exercises.length; i++) {
    await processAndSaveExercise(exercises[i], i, exercises.length);
    await delay(100);
  }
  
  const stats = await prisma.exercise.count();
  console.log('\n===============================================');
  console.log(`✅ Scraping concluído!`);
  console.log(`📊 Total de exercícios no banco: ${stats}`);
  console.log('===============================================\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
