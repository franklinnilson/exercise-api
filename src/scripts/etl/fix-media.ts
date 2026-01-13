/**
 * Script para baixar mídias que falharam no pipeline
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const sharp = require('sharp');
const prisma = new PrismaClient();

const CONFIG = {
  apiKey: process.env.EXERCISEDB_API_KEY || '',
  mediaDir: 'data/media',
  delayMs: 3000,
};

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadMedia(exerciseId: string): Promise<boolean> {
  const gifUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exerciseId}&resolution=720`;
  const webpPath = path.join(CONFIG.mediaDir, `${exerciseId}.webp`);
  
  console.log(`📥 Baixando ${exerciseId}...`);
  
  try {
    const response = await axios.get(gifUrl, {
      headers: {
        'X-RapidAPI-Key': CONFIG.apiKey,
        'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
      },
      responseType: 'arraybuffer',
      timeout: 120000 // 2 min timeout
    });
    
    const gifBuffer = Buffer.from(response.data);
    console.log(`   GIF: ${(gifBuffer.length / 1024).toFixed(0)} KB`);
    
    // Converte para WebP
    const webpBuffer = await sharp(gifBuffer, { animated: true })
      .webp({ quality: 80 })
      .toBuffer();
    
    console.log(`   WebP: ${(webpBuffer.length / 1024).toFixed(0)} KB`);
    
    fs.writeFileSync(webpPath, webpBuffer);
    
    // Atualiza banco
    await prisma.exercise.update({
      where: { id: exerciseId },
      data: { 
        gifUrl: `/media/exercises/${exerciseId}.webp`,
        imageUrl: `/media/exercises/${exerciseId}.webp`
      }
    });
    
    console.log(`   ✅ Salvo!`);
    return true;
    
  } catch (error: any) {
    console.log(`   ❌ Erro: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔧 Corrigindo mídias que falharam...\n');
  
  // Busca exercícios sem mídia local
  const exercises = await prisma.exercise.findMany({
    where: {
      OR: [
        { gifUrl: { not: { startsWith: '/media' } } },
        { gifUrl: null }
      ]
    },
    select: { id: true, gifUrl: true }
  });
  
  console.log(`📊 ${exercises.length} exercícios sem mídia local\n`);
  
  if (exercises.length === 0) {
    console.log('✅ Todas as mídias já estão OK!');
    await prisma.$disconnect();
    return;
  }
  
  let success = 0;
  let failed = 0;
  
  for (const ex of exercises) {
    const ok = await downloadMedia(ex.id);
    if (ok) success++;
    else failed++;
    
    await delay(CONFIG.delayMs);
  }
  
  console.log(`\n📊 Resultado: ${success} OK, ${failed} falhas`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
