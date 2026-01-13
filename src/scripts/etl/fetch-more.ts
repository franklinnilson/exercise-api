/**
 * Busca exercícios específicos da API e processa o pipeline completo
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

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
    rawJson: 'data/raw/json',
    translatedJson: 'data/translated/json',
  }
};

// Dicionário para termos técnicos
const FITNESS_DICT: Record<string, string> = {
  'back': 'costas', 'cardio': 'cardio', 'chest': 'peito', 'lower arms': 'antebraços',
  'lower legs': 'panturrilhas', 'neck': 'pescoço', 'shoulders': 'ombros',
  'upper arms': 'braços', 'upper legs': 'coxas', 'waist': 'abdômen',
  'abductors': 'abdutores', 'abs': 'abdominais', 'adductors': 'adutores',
  'biceps': 'bíceps', 'calves': 'panturrilhas', 'delts': 'deltoides',
  'forearms': 'antebraços', 'glutes': 'glúteos', 'hamstrings': 'posteriores da coxa',
  'lats': 'dorsais', 'pectorals': 'peitorais', 'quads': 'quadríceps',
  'traps': 'trapézio', 'triceps': 'tríceps', 'upper back': 'parte superior das costas',
  'lower back': 'lombar', 'obliques': 'oblíquos', 'hip flexors': 'flexores do quadril',
  'levator scapulae': 'elevador da escápula', 'serratus anterior': 'serrátil anterior',
  'assisted': 'assistido', 'band': 'elástico', 'barbell': 'barra',
  'body weight': 'peso corporal', 'cable': 'polia', 'dumbbell': 'halter',
  'ez barbell': 'barra W', 'kettlebell': 'kettlebell', 'leverage machine': 'máquina',
  'medicine ball': 'medicine ball', 'olympic barbell': 'barra olímpica',
  'resistance band': 'faixa elástica', 'roller': 'rolo', 'rope': 'corda',
  'stability ball': 'bola suíça', 'weighted': 'com peso', 'wheel roller': 'roda abdominal',
  'beginner': 'iniciante', 'intermediate': 'intermediário', 'advanced': 'avançado',
};

function translateTerm(term: string): string {
  return FITNESS_DICT[term.toLowerCase()] || term;
}

const SYSTEM_PROMPT = `Você é um Personal Trainer Brasileiro experiente e certificado (CREF), especialista em traduzir conteúdo fitness do inglês para o português brasileiro usado em academias profissionais.

REGRAS OBRIGATÓRIAS:
1. Use SEMPRE termos técnicos de academia brasileira:
   - "Dumbbell" → "Halter"
   - "Barbell" → "Barra"
   - "Bench Press" → "Supino"
   - "Squat" → "Agachamento"
   - "Deadlift" → "Levantamento Terra"
   - "Pull-up" → "Barra Fixa"
   - "Push-up" → "Flexão"
   - "Curl" → "Rosca"
   - "Row" → "Remada"
   - "Fly/Flye" → "Crucifixo"
   - "Lunge" → "Avanço"
   - "Crunch" → "Abdominal"
   - "Plank" → "Prancha"
   - "Lat Pulldown" → "Puxada Alta"
   - "Cable" → "Polia"
   - "Sit-up" → "Abdominal"

2. Instruções devem ser PROFISSIONAIS e TÉCNICAS:
   - Use linguagem de personal trainer
   - Seja preciso nas descrições de movimento
   - Mantenha tom instrucional e seguro

3. Nomes de exercícios devem ser como um brasileiro de academia falaria

4. NÃO adicione informações que não existam no original

FORMATO: Retorne APENAS JSON válido, sem markdown.`;

async function translateWithAI(exercises: any[]): Promise<any> {
  const userPrompt = `Traduza estes exercícios para português brasileiro de academia profissional:

${JSON.stringify(exercises.map(e => ({
  id: e.id,
  name: e.name,
  instructions: e.instructions,
})), null, 2)}

Retorne JSON com array "exercises" contendo objetos com: id, namePt, instructionsPt, descriptionPt (crie uma descrição profissional de 2-3 frases sobre o exercício).`;

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
      }
    }
  );

  const content = response.data.choices[0]?.message?.content;
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

async function main() {
  console.log('\n🏋️ Buscando 3 novos exercícios da API...\n');

  // Busca exercícios do offset 2 (pula 0001 e 0002)
  const response = await axios.get(`${CONFIG.api.baseUrl}/exercises?offset=2&limit=3`, {
    headers: CONFIG.api.headers
  });

  const exercises = response.data;
  console.log(`✅ ${exercises.length} exercícios encontrados:\n`);
  
  exercises.forEach((e: any) => {
    console.log(`   - ${e.id}: ${e.name}`);
  });

  // Salva JSONs brutos
  console.log('\n📁 Salvando JSONs brutos...');
  for (const ex of exercises) {
    const rawPath = path.join(CONFIG.dirs.rawJson, `${ex.id}.json`);
    fs.writeFileSync(rawPath, JSON.stringify({
      exerciseId: ex.id,
      name: ex.name,
      bodyPart: ex.bodyPart,
      target: ex.target,
      equipment: ex.equipment,
      secondaryMuscles: ex.secondaryMuscles || [],
      instructions: ex.instructions || [],
      gifUrl: ex.gifUrl,
    }, null, 2));
  }

  // Traduz com IA
  console.log('\n🤖 Traduzindo com IA (OpenAI)...\n');
  const aiResult = await translateWithAI(exercises);
  
  console.log('📝 Traduções recebidas:\n');
  for (const t of aiResult.exercises) {
    console.log(`   ${t.id}: "${t.namePt}"`);
  }

  // Monta JSONs traduzidos e salva
  console.log('\n💾 Salvando JSONs traduzidos...');
  for (const ex of exercises) {
    const aiTrans = aiResult.exercises.find((t: any) => t.id === ex.id);
    
    const translated = {
      exerciseId: ex.id,
      name: ex.name,
      bodyPart: ex.bodyPart,
      target: ex.target,
      equipment: ex.equipment,
      secondaryMuscles: ex.secondaryMuscles || [],
      instructions: ex.instructions || [],
      gifUrl: ex.gifUrl,
      difficulty: 'beginner',
      category: 'strength',
      // Traduções
      namePt: aiTrans?.namePt || ex.name,
      bodyPartPt: translateTerm(ex.bodyPart),
      targetPt: translateTerm(ex.target),
      equipmentPt: translateTerm(ex.equipment),
      difficultyPt: 'iniciante',
      descriptionPt: aiTrans?.descriptionPt || '',
      secondaryMusclesPt: (ex.secondaryMuscles || []).map((m: string) => translateTerm(m)),
      instructionsPt: aiTrans?.instructionsPt || ex.instructions,
    };

    const transPath = path.join(CONFIG.dirs.translatedJson, `${ex.id}.json`);
    fs.writeFileSync(transPath, JSON.stringify(translated, null, 2));
  }

  // Carrega no banco
  console.log('\n🗄️ Carregando no banco de dados...\n');
  
  for (const ex of exercises) {
    const transPath = path.join(CONFIG.dirs.translatedJson, `${ex.id}.json`);
    const data = JSON.parse(fs.readFileSync(transPath, 'utf-8'));

    // Deleta se existir
    await prisma.exerciseSecondaryMuscle.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exerciseInstruction.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exerciseTip.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exerciseVariation.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exerciseKeyword.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exercise.deleteMany({ where: { id: ex.id } });

    // Cria novo
    await prisma.exercise.create({
      data: {
        id: ex.id,
        name: data.namePt,
        nameEn: data.name,
        bodyPart: data.bodyPartPt,
        bodyPartEn: data.bodyPart,
        target: data.targetPt,
        targetEn: data.target,
        equipment: data.equipmentPt,
        equipmentEn: data.equipment,
        difficulty: data.difficultyPt,
        category: data.category,
        overview: data.descriptionPt,
        overviewEn: data.description,
        secondaryMuscles: {
          create: (data.secondaryMuscles || []).map((m: string, i: number) => ({
            muscle: data.secondaryMusclesPt?.[i] || m,
            muscleEn: m
          }))
        },
        instructions: {
          create: (data.instructions || []).map((inst: string, i: number) => ({
            stepOrder: i + 1,
            instruction: data.instructionsPt?.[i] || inst,
            instructionEn: inst
          }))
        }
      }
    });

    console.log(`   ✅ ${ex.id}: ${data.namePt}`);
  }

  // Estatísticas finais
  const total = await prisma.exercise.count();
  console.log(`\n📊 Total de exercícios no banco: ${total}\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
