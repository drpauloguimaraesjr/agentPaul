/**
 * Tabela TACO - Busca Nutricional por Similaridade
 * 597 alimentos brasileiros com macros (NEPA/Unicamp)
 * 
 * Estratégia: carrega tudo em memória (~127KB), busca por fuzzy matching.
 * Sem dependências externas - apenas normalização de texto.
 */

const path = require('path');

// Carrega dados TACO em memória no boot
let tacoData = [];
let tacoIndex = []; // pré-processado para busca rápida

function init() {
  if (tacoData.length > 0) return;
  
  try {
    tacoData = require(path.join(__dirname, 'data', 'taco-data.json'));
    
    // Pré-processa index: normaliza nomes para busca
    tacoIndex = tacoData.map(item => ({
      ...item,
      _normalized: normalizar(item.nome),
      _tokens: tokenizar(normalizar(item.nome)),
      _grupo_normalized: normalizar(item.grupo)
    }));
    
    console.log(`🥗 TACO carregada: ${tacoData.length} alimentos em memória`);
  } catch (error) {
    console.error('❌ Erro ao carregar TACO:', error.message);
    tacoData = [];
    tacoIndex = [];
  }
}

/**
 * Normaliza texto: remove acentos, lowercase, remove pontuação
 */
function normalizar(texto) {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokeniza texto em palavras significativas (>2 chars)
 */
function tokenizar(texto) {
  // Palavras comuns a ignorar na busca
  const stopwords = new Set([
    'com', 'sem', 'para', 'por', 'uma', 'uns', 'umas', 'dos', 'das',
    'cru', 'crua', 'crus', 'cruas', 'tipo', 'cada', 'etc'
  ]);
  
  return texto
    .split(' ')
    .filter(p => p.length > 2 && !stopwords.has(p))
    .map(p => p.trim());
}

/**
 * Calcula score de similaridade entre dois conjuntos de tokens
 * Retorna 0-1 (1 = match perfeito)
 */
function calcularSimilaridade(tokensQuery, tokensAlimento, nomeNormalizado, queryNormalizado) {
  if (tokensQuery.length === 0 || tokensAlimento.length === 0) return 0;
  
  let score = 0;
  let matchCount = 0;
  
  // Match exato de substring (alto peso)
  if (nomeNormalizado.includes(queryNormalizado)) {
    score += 0.5;
  }
  
  // Match por tokens
  for (const qt of tokensQuery) {
    let melhorMatch = 0;
    
    for (const at of tokensAlimento) {
      // Match exato de token
      if (qt === at) {
        melhorMatch = Math.max(melhorMatch, 1.0);
        continue;
      }
      
      // Match parcial (token de busca contido no token do alimento ou vice-versa)
      if (at.includes(qt) || qt.includes(at)) {
        const overlap = Math.min(qt.length, at.length) / Math.max(qt.length, at.length);
        melhorMatch = Math.max(melhorMatch, overlap * 0.8);
      }
      
      // Match por prefixo (ex: "frang" match "frango")
      const prefixLen = Math.min(qt.length, at.length, 4);
      if (qt.substring(0, prefixLen) === at.substring(0, prefixLen)) {
        melhorMatch = Math.max(melhorMatch, 0.5);
      }
    }
    
    if (melhorMatch > 0) matchCount++;
    score += melhorMatch;
  }
  
  // Normaliza: proporção de tokens da query que matcharam
  const tokenScore = matchCount / tokensQuery.length;
  
  // Score final: combina token matching + substring matching
  const finalScore = (score / tokensQuery.length) * 0.6 + tokenScore * 0.4;
  
  return Math.min(1, finalScore);
}

/**
 * Busca alimentos na Tabela TACO por texto
 * @param {string} texto - Ex: "arroz branco", "frango grelhado", "feijão"
 * @param {number} limite - Máximo de resultados (default: 3)
 * @returns {Array} Top matches com score de similaridade
 */
function buscarAlimentoTACO(texto, limite = 3) {
  init();
  
  if (!texto || tacoIndex.length === 0) {
    return [];
  }
  
  const queryNorm = normalizar(texto);
  const queryTokens = tokenizar(queryNorm);
  
  if (queryTokens.length === 0) return [];
  
  // Calcula score para cada alimento
  const resultados = tacoIndex
    .map(item => ({
      id: item.id,
      nome: item.nome,
      grupo: item.grupo,
      energia_kcal: item.energia_kcal,
      proteina_g: item.proteina_g,
      carboidrato_g: item.carboidrato_g,
      lipideos_g: item.lipideos_g,
      fibra_g: item.fibra_g,
      score: calcularSimilaridade(queryTokens, item._tokens, item._normalized, queryNorm)
    }))
    .filter(r => r.score > 0.25) // threshold mínimo
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
  
  return resultados;
}

/**
 * Busca alimentos por grupo/categoria
 * @param {string} grupo - Ex: "cereais", "carnes", "frutas"
 * @returns {Array} Alimentos do grupo
 */
function buscarPorGrupo(grupo, limite = 20) {
  init();
  
  const grupoNorm = normalizar(grupo);
  
  return tacoIndex
    .filter(item => item._grupo_normalized.includes(grupoNorm))
    .map(item => ({
      id: item.id,
      nome: item.nome,
      grupo: item.grupo,
      energia_kcal: item.energia_kcal,
      proteina_g: item.proteina_g,
      carboidrato_g: item.carboidrato_g,
      lipideos_g: item.lipideos_g,
      fibra_g: item.fibra_g
    }))
    .slice(0, limite);
}

/**
 * Busca melhor match único para um alimento
 * @param {string} texto - Nome do alimento
 * @returns {object|null} Melhor match ou null se score < 0.3
 */
function buscarMelhorMatch(texto) {
  const resultados = buscarAlimentoTACO(texto, 1);
  if (resultados.length === 0 || resultados[0].score < 0.3) return null;
  return resultados[0];
}

/**
 * Retorna macros por 100g de um alimento (formato compatível com AgentPaul)
 * @param {string} texto - Nome do alimento
 * @returns {object|null} { nome, peso: 100, macros: { proteinas, carboidratos, gorduras, calorias }, fonte: 'taco' }
 */
function buscarMacrosPorPorcao(texto, pesoGramas = 100) {
  const match = buscarMelhorMatch(texto);
  if (!match) return null;
  
  const fator = pesoGramas / 100;
  
  return {
    nome: match.nome,
    peso: pesoGramas,
    macros: {
      proteinas: Math.round(match.proteina_g * fator * 10) / 10,
      carboidratos: Math.round(match.carboidrato_g * fator * 10) / 10,
      gorduras: Math.round(match.lipideos_g * fator * 10) / 10,
      calorias: Math.round(match.energia_kcal * fator)
    },
    fibra_g: Math.round(match.fibra_g * fator * 10) / 10,
    grupo: match.grupo,
    score: match.score,
    fonte: 'taco'
  };
}

/**
 * Lista todos os grupos disponíveis
 */
function listarGrupos() {
  init();
  const grupos = {};
  tacoIndex.forEach(item => {
    if (!grupos[item.grupo]) grupos[item.grupo] = 0;
    grupos[item.grupo]++;
  });
  return grupos;
}

/**
 * Retorna estatísticas da base
 */
function stats() {
  init();
  return {
    total: tacoData.length,
    grupos: listarGrupos(),
    memoriaKB: Math.round(JSON.stringify(tacoData).length / 1024)
  };
}

module.exports = {
  buscarAlimentoTACO,
  buscarPorGrupo,
  buscarMelhorMatch,
  buscarMacrosPorPorcao,
  listarGrupos,
  stats
};
