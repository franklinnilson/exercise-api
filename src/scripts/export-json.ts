/**
 * Exporta todos os exercícios do banco para JSON
 * Útil para backup ou uso offline
 * 
 * Uso: npm run export:json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('📤 Exportando exercícios para JSON...\n');
  
  const exercises = await prisma.exercise.findMany({
    include: {
      secondaryMuscles: true,
      instructions: {
        orderBy: { stepOrder: 'asc' }
      },
      tips: true,
      variations: true,
      keywords: true
    }
  });
  
  // Formata para export
  const exportData = exercises.map(ex => ({
    id: ex.id,
    nome: ex.name,
    nomeOriginal: ex.nameEn,
    parteCorpo: ex.bodyPart,
    musculoAlvo: ex.target,
    equipamento: ex.equipment,
    dificuldade: ex.difficulty,
    categoria: ex.category,
    descricao: ex.overview,
    gifUrl: ex.gifUrl,
    videoUrl: ex.videoUrl,
    imagemUrl: ex.imageUrl,
    musculosSecundarios: ex.secondaryMuscles.map(m => ({
      musculo: m.muscle,
      musculoOriginal: m.muscleEn
    })),
    instrucoes: ex.instructions.map(i => ({
      passo: i.stepOrder,
      instrucao: i.instruction,
      instrucaoOriginal: i.instructionEn
    })),
    dicas: ex.tips.map(t => ({
      dica: t.tip,
      dicaOriginal: t.tipEn
    })),
    variacoes: ex.variations.map(v => ({
      variacao: v.variation,
      variacaoOriginal: v.variationEn
    })),
    palavrasChave: ex.keywords.map(k => k.keyword)
  }));
  
  // Salva arquivo
  const outputDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'exercises-pt-br.json');
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
  
  console.log(`✅ Exportados ${exercises.length} exercícios`);
  console.log(`📁 Arquivo: ${outputPath}`);
  
  // Estatísticas
  const withVideos = exercises.filter(e => e.videoUrl).length;
  const withGifs = exercises.filter(e => e.gifUrl).length;
  const withImages = exercises.filter(e => e.imageUrl).length;
  
  console.log('\n📊 Estatísticas:');
  console.log(`   Com vídeos: ${withVideos}`);
  console.log(`   Com GIFs: ${withGifs}`);
  console.log(`   Com imagens: ${withImages}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
