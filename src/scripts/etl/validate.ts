/**
 * Script de validação completa
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 VALIDAÇÃO COMPLETA DO PIPELINE\n');
  console.log('='.repeat(50));
  
  // 1. Total no banco
  const total = await prisma.exercise.count();
  console.log(`\n📊 Total de exercícios no banco: ${total}`);
  
  // 2. Com mídia local
  const withMedia = await prisma.exercise.count({
    where: { gifUrl: { startsWith: '/media' } }
  });
  console.log(`🎬 Com mídia local (gifUrl): ${withMedia}`);
  
  // 3. Arquivos no disco
  const mediaDir = 'data/media';
  const files = fs.readdirSync(mediaDir).filter(f => f.endsWith('.webp'));
  console.log(`💾 Arquivos WebP no disco: ${files.length}`);
  
  // 4. Verificar correspondência
  console.log('\n🔍 Verificando correspondência banco <-> disco...');
  
  const exercises = await prisma.exercise.findMany({ select: { id: true, gifUrl: true } });
  
  let missingFiles = 0;
  let wrongPath = 0;
  const missingIds: string[] = [];
  
  for (const ex of exercises) {
    const expectedFile = path.join(mediaDir, `${ex.id}.webp`);
    
    if (!fs.existsSync(expectedFile)) {
      missingFiles++;
      missingIds.push(ex.id);
    }
    
    if (!ex.gifUrl?.startsWith('/media')) {
      wrongPath++;
    }
  }
  
  // 5. Verificar arquivos órfãos (no disco mas não no banco)
  const dbIds = new Set(exercises.map(e => e.id));
  let orphanFiles = 0;
  
  for (const file of files) {
    const id = file.replace('.webp', '');
    if (!dbIds.has(id)) {
      orphanFiles++;
    }
  }
  
  // 6. Testar algumas imagens aleatórias
  console.log('\n🖼️ Testando 5 imagens aleatórias...');
  const sampleIds = exercises.slice(0, 5).map(e => e.id);
  
  for (const id of sampleIds) {
    const filePath = path.join(mediaDir, `${id}.webp`);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`   ${id}.webp: ${(stats.size / 1024).toFixed(0)} KB ✅`);
    } else {
      console.log(`   ${id}.webp: MISSING ❌`);
    }
  }
  
  // Resultado
  console.log('\n' + '='.repeat(50));
  console.log('📋 RESULTADO DA VALIDAÇÃO:');
  console.log('='.repeat(50));
  
  const allOk = missingFiles === 0 && wrongPath === 0 && orphanFiles === 0 && total === withMedia;
  
  console.log(`   Exercícios no banco:     ${total}`);
  console.log(`   Com gifUrl correto:      ${withMedia}`);
  console.log(`   Arquivos no disco:       ${files.length}`);
  console.log(`   Arquivos faltando:       ${missingFiles}`);
  console.log(`   gifUrl incorreto:        ${wrongPath}`);
  console.log(`   Arquivos órfãos:         ${orphanFiles}`);
  
  if (missingIds.length > 0) {
    console.log(`\n⚠️ IDs sem arquivo: ${missingIds.join(', ')}`);
  }
  
  console.log('\n' + (allOk ? '✅ TUDO OK!' : '❌ PROBLEMAS ENCONTRADOS'));
  
  await prisma.$disconnect();
}

main().catch(console.error);
