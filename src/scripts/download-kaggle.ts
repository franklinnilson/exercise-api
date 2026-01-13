/**
 * Download e Import do Dataset Kaggle - Fitness Exercises with Animations
 * 
 * Dataset: https://www.kaggle.com/datasets/edoardoba/fitness-exercises-with-animations
 * 
 * Este dataset contém ~1300 exercícios com GIFs animados!
 * 
 * SETUP:
 * 1. Crie conta no Kaggle: https://www.kaggle.com
 * 2. Vá em Settings > API > Create New Token
 * 3. Baixe o kaggle.json
 * 4. Coloque em ~/.kaggle/kaggle.json (Linux/Mac) ou %USERPROFILE%\.kaggle\kaggle.json (Windows)
 * 
 * Uso: npm run download:kaggle
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { translateArray, translateExerciseName, translateText } from './translator';

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, '../../data/kaggle');

interface KaggleExercise {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl: string;
  secondaryMuscles?: string[];
  instructions?: string[];
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadFromKaggle() {
  console.log('📥 Baixando dataset do Kaggle...\n');
  
  // Cria diretório se não existir
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  try {
    // Verifica se kaggle CLI está instalado
    execSync('kaggle --version', { stdio: 'pipe' });
  } catch {
    console.log('⚠️  Kaggle CLI não encontrado. Instalando...');
    execSync('pip install kaggle', { stdio: 'inherit' });
  }
  
  // Download do dataset
  console.log('📦 Baixando: edoardoba/fitness-exercises-with-animations');
  try {
    execSync(
      `kaggle datasets download -d edoardoba/fitness-exercises-with-animations -p ${DATA_DIR} --unzip`,
      { stdio: 'inherit' }
    );
    console.log('✅ Download concluído!\n');
    return true;
  } catch (error: any) {
    console.error('❌ Erro no download:', error.message);
    console.log('\n📝 Alternativa manual:');
    console.log('   1. Acesse: https://www.kaggle.com/datasets/edoardoba/fitness-exercises-with-animations');
    console.log('   2. Clique em "Download"');
    console.log(`   3. Extraia para: ${DATA_DIR}`);
    console.log('   4. Execute novamente este script\n');
    return false;
  }
}

async function loadExercisesFromFile(): Promise<KaggleExercise[]> {
  // Procura por arquivos JSON no diretório
  const files = fs.readdirSync(DATA_DIR);
  const jsonFile = files.find(f => f.endsWith('.json'));
  
  if (!jsonFile) {
    // Tenta CSV
    const csvFile = files.find(f => f.endsWith('.csv'));
    if (csvFile) {
      console.log(`📄 Encontrado CSV: ${csvFile}`);
      return loadFromCSV(path.join(DATA_DIR, csvFile));
    }
    throw new Error('Nenhum arquivo JSON ou CSV encontrado');
  }
  
  console.log(`📄 Carregando: ${jsonFile}`);
  const content = fs.readFileSync(path.join(DATA_DIR, jsonFile), 'utf-8');
  return JSON.parse(content);
}

async function loadFromCSV(filePath: string): Promise<KaggleExercise[]> {
  const { parse } = await import('csv-parse/sync');
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  
  return records.map((row: any) => ({
    id: row.id || row.ID || `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: row.name || row.Name || row.title || row.Title,
    bodyPart: row.bodyPart || row.BodyPart || row.body_part || 'other',
    target: row.target || row.Target || row.muscle || 'other',
    equipment: row.equipment || row.Equipment || 'body weight',
    gifUrl: row.gifUrl || row.GifUrl || row.gif_url || row.image || '',
    secondaryMuscles: row.secondaryMuscles ? JSON.parse(row.secondaryMuscles) : [],
    instructions: row.instructions ? JSON.parse(row.instructions) : []
  }));
}

async function processAndSave(exercise: KaggleExercise, index: number, total: number) {
  const progress = `[${index + 1}/${total}]`;
  
  try {
    const existing = await prisma.exercise.findUnique({ where: { id: exercise.id } });
    if (existing) {
      console.log(`${progress} ⏭️  "${exercise.name}" já existe`);
      return;
    }
    
    console.log(`${progress} 🔄 Traduzindo "${exercise.name}"...`);
    
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
    
    console.log(`${progress} ✅ "${namePt}"`);
    
  } catch (error: any) {
    console.log(`${progress} ❌ Erro: ${error.message}`);
  }
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  📦 Kaggle Dataset Downloader + Tradutor PT-BR           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Verifica se já tem dados baixados
  if (!fs.existsSync(DATA_DIR) || fs.readdirSync(DATA_DIR).length === 0) {
    const downloaded = await downloadFromKaggle();
    if (!downloaded) {
      process.exit(1);
    }
  } else {
    console.log('📁 Dados já baixados, pulando download...\n');
  }
  
  // Carrega exercícios
  const exercises = await loadExercisesFromFile();
  console.log(`📊 Total: ${exercises.length} exercícios encontrados\n`);
  
  // Processa e salva
  for (let i = 0; i < exercises.length; i++) {
    await processAndSave(exercises[i], i, exercises.length);
    await delay(150);
  }
  
  const stats = await prisma.exercise.count();
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  ✅ Importação concluída! Total: ${String(stats).padEnd(20)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
