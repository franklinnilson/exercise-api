/**
 * Script para corrigir nomes duplicados usando nomenclatura de academia brasileira
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';

const prisma = new PrismaClient();

const CONFIG = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }
};

const SYSTEM_PROMPT = `Você é um Personal Trainer Brasileiro certificado (CREF) especialista em nomenclatura de exercícios de academia.

Sua tarefa é traduzir nomes de exercícios em inglês para português brasileiro, usando a nomenclatura EXATA que personal trainers e academias usam no Brasil.

REGRAS IMPORTANTES:
1. Use termos técnicos de academia brasileira
2. Diferencie variações do mesmo exercício (ex: "decline crunch" vs "decline sit-up" devem ter nomes diferentes)
3. Inclua detalhes importantes como: posição, amplitude, variação
4. Mantenha consistência com o que é usado em academias como Smart Fit, Bodytech, etc.

EXEMPLOS DE NOMENCLATURA CORRETA:
- "decline crunch" → "Abdominal Crunch Declinado"
- "decline sit-up" → "Abdominal Completo Declinado"
- "lever chest press" → "Supino Reto na Máquina"
- "lever shoulder press" → "Desenvolvimento na Máquina"
- "barbell bench squat" → "Agachamento no Banco com Barra"
- "barbell low bar squat" → "Agachamento Low Bar"
- "barbell front chest squat" → "Agachamento Frontal com Barra no Peito"
- "barbell front squat" → "Agachamento Frontal"
- "smith squat" → "Agachamento no Smith"
- "smith full squat" → "Agachamento Completo no Smith"
- "biceps pull-up" → "Barra Fixa Pegada Supinada"
- "wide grip pull-up" → "Barra Fixa Pegada Aberta"

Retorne APENAS o nome traduzido, sem explicações.`;

interface DuplicateGroup {
  namePt: string;
  exercises: { id: string; nameEn: string; equipment: string; target: string }[];
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  const exercises = await prisma.exercise.findMany({
    select: { id: true, name: true, nameEn: true, equipment: true, target: true }
  });

  // Agrupar por nome PT
  const byName = new Map<string, typeof exercises>();
  for (const ex of exercises) {
    const list = byName.get(ex.name) || [];
    list.push(ex);
    byName.set(ex.name, list);
  }

  // Filtrar apenas duplicados
  const duplicates: DuplicateGroup[] = [];
  for (const [namePt, exList] of byName) {
    if (exList.length > 1) {
      duplicates.push({
        namePt,
        exercises: exList.map(e => ({
          id: e.id,
          nameEn: e.nameEn || '',
          equipment: e.equipment,
          target: e.target
        }))
      });
    }
  }

  return duplicates;
}

async function translateName(nameEn: string, equipment: string, target: string): Promise<string> {
  const userPrompt = `Traduza este exercício para português brasileiro (nomenclatura de academia):

Nome em inglês: ${nameEn}
Equipamento: ${equipment}
Músculo alvo: ${target}

Retorne APENAS o nome traduzido.`;

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
        max_tokens: 100
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices[0]?.message?.content?.trim() || nameEn;
  } catch (error: any) {
    console.log(`   ❌ Erro na tradução: ${error.message}`);
    return nameEn;
  }
}

async function main() {
  console.log('🔧 Corrigindo nomes duplicados...\n');

  const duplicates = await findDuplicates();
  console.log(`📊 Encontrados ${duplicates.length} grupos de nomes duplicados\n`);

  let fixed = 0;
  let errors = 0;

  for (const group of duplicates) {
    console.log(`\n📌 "${group.namePt}" (${group.exercises.length} exercícios)`);

    for (const ex of group.exercises) {
      console.log(`   ${ex.id}: ${ex.nameEn}`);
      
      const newName = await translateName(ex.nameEn, ex.equipment, ex.target);
      
      if (newName && newName !== ex.nameEn) {
        console.log(`   → ${newName}`);
        
        try {
          await prisma.exercise.update({
            where: { id: ex.id },
            data: { name: newName }
          });
          fixed++;
        } catch (e: any) {
          console.log(`   ❌ Erro ao salvar: ${e.message}`);
          errors++;
        }
      }
      
      // Delay entre requests
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Resultado: ${fixed} corrigidos, ${errors} erros`);

  // Verificar se ainda há duplicados
  const remaining = await findDuplicates();
  console.log(`📊 Duplicados restantes: ${remaining.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
