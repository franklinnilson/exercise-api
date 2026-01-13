import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ExerciseFilterDto } from './dto/exercise.dto';

@Injectable()
export class ExercisesService {
  private statsCache: { data: any; timestamp: number } | null = null;
  private readonly STATS_CACHE_TTL = 60000; // 1 minuto

  constructor(private prisma: PrismaService) {}

  // Mapa de palavras-chave relacionadas para sugestões inteligentes
  private readonly relatedKeywords: Record<string, string[]> = {
    // Treinos por grupo muscular
    'peito': ['supino', 'crucifixo', 'crossover', 'flexão', 'peck deck', 'fly'],
    'costas': ['remada', 'puxada', 'pulldown', 'barra fixa', 'serrote', 'levantamento terra'],
    'ombros': ['desenvolvimento', 'elevação lateral', 'elevação frontal', 'face pull', 'arnold'],
    'braços': ['rosca', 'tríceps', 'bíceps', 'martelo', 'francesa', 'testa'],
    'pernas': ['agachamento', 'leg press', 'extensora', 'flexora', 'stiff', 'afundo', 'panturrilha'],
    'abdômen': ['abdominal', 'prancha', 'crunch', 'elevação de pernas', 'oblíquo'],
    
    // Tipos de treino
    'push': ['supino', 'desenvolvimento', 'tríceps', 'flexão', 'paralelas'],
    'pull': ['remada', 'puxada', 'rosca', 'barra fixa', 'face pull'],
    'legs': ['agachamento', 'leg press', 'stiff', 'afundo', 'extensora', 'flexora'],
    
    // Equipamentos
    'halter': ['rosca alternada', 'supino', 'desenvolvimento', 'elevação lateral', 'fly'],
    'barra': ['supino', 'agachamento', 'levantamento terra', 'remada', 'rosca direta'],
    'polia': ['crossover', 'tríceps', 'puxada', 'face pull', 'rosca'],
    'máquina': ['leg press', 'extensora', 'flexora', 'peck deck', 'smith'],
    'peso corporal': ['flexão', 'barra fixa', 'paralelas', 'prancha', 'abdominal'],
    
    // Objetivos
    'hipertrofia': ['supino', 'agachamento', 'remada', 'desenvolvimento', 'rosca'],
    'força': ['agachamento', 'levantamento terra', 'supino', 'desenvolvimento'],
    'definição': ['crossover', 'elevação lateral', 'extensora', 'abdominal'],
    'funcional': ['agachamento', 'levantamento terra', 'flexão', 'prancha', 'burpee'],
    
    // Músculos específicos
    'bíceps': ['rosca direta', 'rosca alternada', 'rosca martelo', 'rosca scott', 'rosca concentrada'],
    'tríceps': ['tríceps testa', 'tríceps corda', 'tríceps francês', 'mergulho', 'paralelas'],
    'peitorais': ['supino reto', 'supino inclinado', 'crucifixo', 'crossover', 'flexão'],
    'dorsais': ['puxada', 'remada', 'pulldown', 'barra fixa', 'serrote'],
    'deltoides': ['desenvolvimento', 'elevação lateral', 'elevação frontal', 'crucifixo inverso'],
    'quadríceps': ['agachamento', 'leg press', 'extensora', 'afundo', 'hack'],
    'glúteos': ['agachamento', 'stiff', 'hip thrust', 'afundo', 'elevação pélvica'],
    'posterior de coxa': ['stiff', 'flexora', 'levantamento terra romeno', 'good morning'],
  };

  // Normaliza texto removendo acentos
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  // Calcula score de relevância para ordenação inteligente
  private calculateRelevanceScore(name: string, query: string): number {
    const nameNorm = this.normalizeText(name);
    const queryNorm = this.normalizeText(query);
    
    // Score máximo: match exato
    if (nameNorm === queryNorm) return 10000;
    
    // Começa exatamente com a query
    if (nameNorm.startsWith(queryNorm + ' ')) return 9000;
    if (nameNorm.startsWith(queryNorm)) return 8500;
    
    // Palavra exata no início (antes de parênteses ou vírgula)
    const firstPart = nameNorm.split(/[,(]/)[0].trim();
    if (firstPart === queryNorm) return 8000;
    if (firstPart.startsWith(queryNorm + ' ')) return 7500;
    if (firstPart.startsWith(queryNorm)) return 7000;
    
    // Palavra exata em qualquer posição
    const words = nameNorm.split(/[\s,()]+/);
    if (words.includes(queryNorm)) return 6000;
    
    // Começa com a query em alguma palavra
    if (words.some(w => w.startsWith(queryNorm))) return 5000;
    
    // Contém a query como substring
    const idx = nameNorm.indexOf(queryNorm);
    if (idx !== -1) {
      return 4000 - Math.min(idx * 10, 3000);
    }
    
    return 100;
  }

  // Calcula score para múltiplas palavras
  private calculateRelevanceScoreMultiWord(name: string, queryWords: string[]): number {
    if (queryWords.length === 1) {
      return this.calculateRelevanceScore(name, queryWords[0]);
    }
    
    const nameNorm = this.normalizeText(name);
    const nameWords = nameNorm.split(/[\s,()]+/);
    
    let totalScore = 0;
    let allWordsFound = true;
    
    for (const queryWord of queryWords) {
      const wordNorm = this.normalizeText(queryWord);
      
      const exactMatch = nameWords.includes(wordNorm);
      const startsWithMatch = nameWords.some(w => w.startsWith(wordNorm));
      const containsMatch = nameNorm.includes(wordNorm);
      
      if (!containsMatch) {
        allWordsFound = false;
        break;
      }
      
      if (exactMatch) {
        totalScore += 1000;
        if (nameWords[0] === wordNorm) totalScore += 500;
      } else if (startsWithMatch) {
        totalScore += 500;
      } else {
        totalScore += 200;
      }
    }
    
    if (!allWordsFound) return 0;
    
    // Bonus por nome mais curto (mais específico)
    totalScore += Math.max(0, 500 - name.length * 2);
    
    // Bonus se as palavras aparecem na ordem da busca
    const queryJoined = queryWords.map(w => this.normalizeText(w)).join('.*');
    if (new RegExp(queryJoined).test(nameNorm)) {
      totalScore += 300;
    }
    
    return totalScore;
  }

  // Busca palavras-chave relacionadas
  private getRelatedKeywords(query: string): string[] {
    const queryNorm = this.normalizeText(query);
    const related: Set<string> = new Set();
    
    for (const [key, values] of Object.entries(this.relatedKeywords)) {
      const keyNorm = this.normalizeText(key);
      if (keyNorm === queryNorm || keyNorm.includes(queryNorm) || queryNorm.includes(keyNorm)) {
        values.forEach(v => related.add(v));
      }
    }
    
    for (const [key, values] of Object.entries(this.relatedKeywords)) {
      const valuesNorm = values.map(v => this.normalizeText(v));
      if (valuesNorm.some(v => v.includes(queryNorm) || queryNorm.includes(v))) {
        values.forEach(v => related.add(v));
        related.add(key);
      }
    }
    
    related.delete(query);
    related.delete(queryNorm);
    
    return Array.from(related).slice(0, 10);
  }

  // Busca exercícios relacionados quando poucos resultados
  private async findRelatedExercises(query: string, limit: number = 10): Promise<any[]> {
    const relatedKeywords = this.getRelatedKeywords(query);
    
    if (relatedKeywords.length === 0) return [];
    
    const orConditions = relatedKeywords.flatMap(keyword => [
      { name: { contains: keyword } },
      { name: { contains: this.normalizeText(keyword) } },
    ]);
    
    const relatedExercises = await this.prisma.exercise.findMany({
      where: { OR: orConditions },
      take: limit * 3,
      include: {
        secondaryMuscles: true,
        instructions: { orderBy: { stepOrder: 'asc' } },
      },
    });
    
    const scored = relatedExercises.map(ex => {
      let score = 0;
      const nameNorm = this.normalizeText(ex.name);
      
      for (const keyword of relatedKeywords) {
        const keyNorm = this.normalizeText(keyword);
        if (nameNorm.startsWith(keyNorm)) score += 100;
        else if (nameNorm.includes(keyNorm)) score += 50;
      }
      
      // Bonus para exercícios com mídia
      if (ex.gifUrl || ex.imageUrl) score += 30;
      
      return { ...ex, score };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...ex }) => ex);
  }


  async findAll(filters: ExerciseFilterDto): Promise<any> {
    const { page = 1, size = 20 } = filters;
    const maxSize = Math.min(size, 100); // Limitar tamanho máximo

    const where: any = {};

    // Busca por IDs específicos - mais eficiente
    if (filters.ids) {
      const idList = filters.ids.split(',').map(id => id.trim()).filter(Boolean).slice(0, 100);
      where.id = { in: idList };
    }

    // Filtros exatos primeiro (usam índice)
    if (filters.bodyPart) {
      where.bodyPart = filters.bodyPart;
    }
    if (filters.equipment) {
      where.equipment = filters.equipment;
    }
    if (filters.target) {
      where.target = filters.target;
    }

    // Busca inteligente por texto
    if (filters.q) {
      const words = filters.q.trim().split(/\s+/).filter(w => w.length > 0);
      
      if (words.length === 1) {
        const queryNorm = this.normalizeText(words[0]);
        where.OR = [
          { name: { startsWith: filters.q } },
          { name: { startsWith: queryNorm } },
          { name: { contains: filters.q } },
          { nameEn: { startsWith: filters.q } },
          { nameEn: { contains: filters.q } },
        ];
      } else {
        where.AND = words.map(word => {
          const wordNorm = this.normalizeText(word);
          return {
            OR: [
              { name: { contains: word } },
              { name: { contains: wordNorm } },
              { nameEn: { contains: word } },
            ],
          };
        });
      }
    }

    // Limitar fetch para ordenação - máximo 500 para performance
    const fetchLimit = filters.q ? Math.min(500, maxSize * 10) : undefined;

    const [allData, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        take: fetchLimit,
        include: {
          secondaryMuscles: true,
          instructions: { orderBy: { stepOrder: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    let sortedData = allData;

    // Ordenar por relevância se tem query
    if (filters.q && !filters.ids) {
      const words = filters.q.trim().split(/\s+/).filter(w => w.length > 0);
      
      sortedData = allData
        .map(ex => ({
          ...ex,
          relevance: this.calculateRelevanceScoreMultiWord(ex.name, words) +
            (ex.gifUrl || ex.imageUrl ? 50 : 0),
        }))
        .sort((a, b) => b.relevance - a.relevance)
        .map(({ relevance, ...ex }) => ex);
    }

    // Aplicar paginação
    const skip = (page - 1) * maxSize;
    const paginatedData = sortedData.slice(skip, skip + maxSize);

    // Buscar sugestões apenas se poucos resultados e não é busca por ID
    let suggestions: any = null;
    
    if (filters.q && total < 5 && !filters.ids) {
      const relatedKeywords = this.getRelatedKeywords(filters.q);
      const relatedExercises = await this.findRelatedExercises(filters.q, 6);
      
      if (relatedExercises.length > 0) {
        suggestions = {
          message: total === 0 
            ? `Não encontramos "${filters.q}", mas você pode gostar de:`
            : `Veja também exercícios relacionados:`,
          keywords: relatedKeywords.slice(0, 5),
          exercises: relatedExercises.map(this.formatExercise),
        };
      }
    }

    const response: any = {
      data: paginatedData.map(this.formatExercise),
      meta: {
        total,
        page,
        size: maxSize,
        totalPages: Math.ceil(total / maxSize),
      },
    };

    if (suggestions) {
      response.suggestions = suggestions;
    }

    return response;
  }

  private formatExercise(ex: any) {
    return {
      id: ex.id,
      name: ex.name,
      nameEn: ex.nameEn,
      bodyPart: ex.bodyPart,
      target: ex.target,
      equipment: ex.equipment,
      gifUrl: ex.gifUrl,
      imageUrl: ex.imageUrl,
      secondaryMuscles: ex.secondaryMuscles || [],
      instructions: ex.instructions || [],
    };
  }

  async findOne(id: string) {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      include: {
        secondaryMuscles: true,
        instructions: { orderBy: { stepOrder: 'asc' } },
      },
    });

    if (!exercise) {
      throw new NotFoundException(`Exercício com ID ${id} não encontrado`);
    }

    return this.formatExercise(exercise);
  }

  async findByIds(ids: string[]) {
    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: ids } },
      include: {
        secondaryMuscles: true,
        instructions: { orderBy: { stepOrder: 'asc' } },
      },
    });

    // Manter a ordem dos IDs solicitados
    const exerciseMap = new Map(exercises.map(ex => [ex.id, ex]));
    return ids
      .map(id => exerciseMap.get(id))
      .filter(Boolean)
      .map(this.formatExercise);
  }

  async getStats() {
    // Usar cache se válido
    if (this.statsCache && Date.now() - this.statsCache.timestamp < this.STATS_CACHE_TTL) {
      return this.statsCache.data;
    }

    const [total, withMedia, bodyPartsRaw, equipmentsRaw, targetsRaw] = await Promise.all([
      this.prisma.exercise.count(),
      this.prisma.exercise.count({ 
        where: { 
          OR: [
            { gifUrl: { not: null } },
            { imageUrl: { not: null } }
          ]
        } 
      }),
      this.prisma.exercise.groupBy({ by: ['bodyPart'], _count: true }),
      this.prisma.exercise.groupBy({ by: ['equipment'], _count: true }),
      this.prisma.exercise.groupBy({ by: ['target'], _count: true }),
    ]);
    
    const bodyParts = bodyPartsRaw.map(b => b.bodyPart).filter(Boolean).sort();
    const equipments = equipmentsRaw.map(e => e.equipment).filter(Boolean).sort();
    const targets = targetsRaw.map(t => t.target).filter(Boolean).sort();
    
    const data = { 
      total, 
      withMedia, 
      bodyParts, 
      equipments,
      targets,
      bodyPartsCount: bodyPartsRaw.length,
      equipmentsCount: equipmentsRaw.length,
      targetsCount: targetsRaw.length,
    };

    // Salvar no cache
    this.statsCache = { data, timestamp: Date.now() };

    return data;
  }

  async getByBodyPart(bodyPart: string, page = 1, size = 20) {
    const where = { bodyPart };
    const [data, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        include: {
          secondaryMuscles: true,
          instructions: { orderBy: { stepOrder: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      data: data.map(this.formatExercise),
      meta: { total, page, size, totalPages: Math.ceil(total / size) },
    };
  }

  async getByEquipment(equipment: string, page = 1, size = 20) {
    const where = { equipment };
    const [data, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        include: {
          secondaryMuscles: true,
          instructions: { orderBy: { stepOrder: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      data: data.map(this.formatExercise),
      meta: { total, page, size, totalPages: Math.ceil(total / size) },
    };
  }

  async getByTarget(target: string, page = 1, size = 20) {
    const where = { target };
    const [data, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        include: {
          secondaryMuscles: true,
          instructions: { orderBy: { stepOrder: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      data: data.map(this.formatExercise),
      meta: { total, page, size, totalPages: Math.ceil(total / size) },
    };
  }

  async getRandom(count = 10, bodyPart?: string, equipment?: string) {
    const where: any = {};
    if (bodyPart) where.bodyPart = bodyPart;
    if (equipment) where.equipment = equipment;

    // Pegar todos os IDs e sortear
    const allIds = await this.prisma.exercise.findMany({
      where,
      select: { id: true },
    });

    const shuffled = allIds.sort(() => Math.random() - 0.5).slice(0, count);
    const ids = shuffled.map(e => e.id);

    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: ids } },
      include: {
        secondaryMuscles: true,
        instructions: { orderBy: { stepOrder: 'asc' } },
      },
    });

    return exercises.map(this.formatExercise);
  }
}
