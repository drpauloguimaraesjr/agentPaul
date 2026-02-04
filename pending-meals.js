/**
 * ================================================
 * 🍽️ PENDING MEALS - Sistema de Confirmação
 * ================================================
 * Gerencia refeições aguardando confirmação do paciente.
 * - Guarda refeição analisada temporariamente
 * - Timer de auto-registro (2 minutos)
 * - Permite correções antes de confirmar
 * ================================================
 */

// Cache de refeições pendentes
// Estrutura: Map<conversationId, PendingMeal>
const pendingMeals = new Map();

// Tempo para auto-registro (em millisegundos)
const AUTO_REGISTER_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos

/**
 * @typedef {Object} PendingMeal
 * @property {string} conversationId - ID da conversa
 * @property {string} patientId - ID do paciente
 * @property {string} mealType - Tipo da refeição (almoco, jantar, etc)
 * @property {Array} alimentos - Lista de alimentos identificados
 * @property {string} imageUrl - URL da foto original
 * @property {number} createdAt - Timestamp de criação
 * @property {NodeJS.Timeout} timer - Timer de auto-registro
 * @property {Object} macrosTotais - Totais de macros
 * @property {string} patientPhone - Telefone do paciente (para envio de mensagens)
 */

/**
 * Salva uma refeição como pendente (aguardando confirmação)
 * @param {string} conversationId 
 * @param {PendingMeal} mealData 
 * @param {Function} onAutoRegister - Callback chamado quando auto-registrar
 */
function savePendingMeal(conversationId, mealData, onAutoRegister) {
  // Se já tinha uma pendente, limpa o timer antigo
  if (pendingMeals.has(conversationId)) {
    const old = pendingMeals.get(conversationId);
    if (old.timer) {
      clearTimeout(old.timer);
    }
    console.log(`⚠️ [PendingMeals] Substituindo refeição pendente anterior`);
  }

  // Criar timer de auto-registro
  const timer = setTimeout(async () => {
    console.log(`⏰ [PendingMeals] Timeout! Auto-registrando refeição para ${conversationId}`);
    
    const pending = pendingMeals.get(conversationId);
    if (pending) {
      try {
        // Callback para auto-registrar
        if (onAutoRegister) {
          await onAutoRegister(pending);
        }
        
        // Limpar do cache
        pendingMeals.delete(conversationId);
        console.log(`✅ [PendingMeals] Refeição auto-registrada e removida do cache`);
      } catch (error) {
        console.error(`❌ [PendingMeals] Erro no auto-registro:`, error.message);
      }
    }
  }, AUTO_REGISTER_TIMEOUT_MS);

  // Salvar no cache
  const pendingMeal = {
    ...mealData,
    conversationId,
    createdAt: Date.now(),
    timer,
  };

  pendingMeals.set(conversationId, pendingMeal);

  console.log(`📝 [PendingMeals] Refeição salva como pendente para ${conversationId}`);
  console.log(`   ⏳ Auto-registro em ${AUTO_REGISTER_TIMEOUT_MS / 1000} segundos`);
  console.log(`   🍽️ Alimentos: ${mealData.alimentos?.length || 0} itens`);

  return pendingMeal;
}

/**
 * Busca refeição pendente de uma conversa
 * @param {string} conversationId 
 * @returns {PendingMeal|null}
 */
function getPendingMeal(conversationId) {
  const pending = pendingMeals.get(conversationId);
  if (!pending) {
    console.log(`🔍 [PendingMeals] Nenhuma refeição pendente para ${conversationId}`);
    return null;
  }
  
  const ageSeconds = Math.round((Date.now() - pending.createdAt) / 1000);
  console.log(`🔍 [PendingMeals] Refeição pendente encontrada (idade: ${ageSeconds}s)`);
  
  return pending;
}

/**
 * Confirma e remove refeição pendente (para registro manual)
 * @param {string} conversationId 
 * @returns {PendingMeal|null}
 */
function confirmPendingMeal(conversationId) {
  const pending = pendingMeals.get(conversationId);
  if (!pending) {
    return null;
  }

  // Limpar timer
  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  // Remover do cache
  pendingMeals.delete(conversationId);
  
  console.log(`✅ [PendingMeals] Refeição confirmada e removida do cache`);
  
  return pending;
}

/**
 * Cancela refeição pendente (paciente desistiu)
 * @param {string} conversationId 
 * @returns {boolean}
 */
function cancelPendingMeal(conversationId) {
  const pending = pendingMeals.get(conversationId);
  if (!pending) {
    return false;
  }

  // Limpar timer
  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  // Remover do cache
  pendingMeals.delete(conversationId);
  
  console.log(`🗑️ [PendingMeals] Refeição cancelada e removida do cache`);
  
  return true;
}

/**
 * Atualiza um alimento na refeição pendente (correção)
 * @param {string} conversationId 
 * @param {number} index - Índice do alimento
 * @param {Object} updates - Campos a atualizar
 * @returns {PendingMeal|null}
 */
function updatePendingMealFood(conversationId, index, updates) {
  const pending = pendingMeals.get(conversationId);
  if (!pending || !pending.alimentos[index]) {
    return null;
  }

  // Atualizar alimento
  pending.alimentos[index] = {
    ...pending.alimentos[index],
    ...updates,
  };

  // Recalcular macros totais
  pending.macrosTotais = calculateTotalMacros(pending.alimentos);

  // Resetar timer (paciente está interagindo)
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  
  // Criar novo timer
  const onAutoRegister = pending.onAutoRegister;
  pending.timer = setTimeout(async () => {
    const p = pendingMeals.get(conversationId);
    if (p && onAutoRegister) {
      await onAutoRegister(p);
      pendingMeals.delete(conversationId);
    }
  }, AUTO_REGISTER_TIMEOUT_MS);

  console.log(`✏️ [PendingMeals] Alimento ${index} atualizado:`, updates);
  
  return pending;
}

/**
 * Remove um alimento da refeição pendente
 * @param {string} conversationId 
 * @param {number} index - Índice do alimento
 * @returns {PendingMeal|null}
 */
function removePendingMealFood(conversationId, index) {
  const pending = pendingMeals.get(conversationId);
  if (!pending || !pending.alimentos[index]) {
    return null;
  }

  // Remover alimento
  const removed = pending.alimentos.splice(index, 1)[0];

  // Recalcular macros totais
  pending.macrosTotais = calculateTotalMacros(pending.alimentos);

  console.log(`🗑️ [PendingMeals] Alimento removido: ${removed.nome}`);
  
  return pending;
}

/**
 * Adiciona um alimento à refeição pendente
 * @param {string} conversationId 
 * @param {Object} alimento - Alimento a adicionar
 * @returns {PendingMeal|null}
 */
function addPendingMealFood(conversationId, alimento) {
  const pending = pendingMeals.get(conversationId);
  if (!pending) {
    return null;
  }

  // Adicionar alimento
  pending.alimentos.push(alimento);

  // Recalcular macros totais
  pending.macrosTotais = calculateTotalMacros(pending.alimentos);

  console.log(`➕ [PendingMeals] Alimento adicionado: ${alimento.nome}`);
  
  return pending;
}

/**
 * Calcula macros totais de uma lista de alimentos
 * @param {Array} alimentos 
 * @returns {Object}
 */
function calculateTotalMacros(alimentos) {
  return alimentos.reduce(
    (total, a) => ({
      proteinas: Math.round((total.proteinas + (a.proteinas || 0)) * 10) / 10,
      carboidratos: Math.round((total.carboidratos + (a.carboidratos || 0)) * 10) / 10,
      gorduras: Math.round((total.gorduras + (a.gorduras || 0)) * 10) / 10,
      calorias: Math.round(total.calorias + (a.calorias || 0)),
    }),
    { proteinas: 0, carboidratos: 0, gorduras: 0, calorias: 0 }
  );
}

/**
 * Formata refeição pendente para exibição ao paciente
 * @param {PendingMeal} pending 
 * @returns {string}
 */
function formatPendingMealMessage(pending) {
  if (!pending || !pending.alimentos) {
    return "❌ Nenhuma refeição pendente encontrada.";
  }

  const lines = ["📸 *Identifiquei na sua refeição:*\n"];

  pending.alimentos.forEach((a, i) => {
    const emoji = getEmojiForFood(a.nome);
    lines.push(`${emoji} ${a.nome} - ${a.peso}g (${a.calorias} kcal)`);
  });

  const m = pending.macrosTotais || calculateTotalMacros(pending.alimentos);
  lines.push("");
  lines.push(`📊 *Total:* ${m.calorias} kcal | ${m.proteinas}g prot | ${m.carboidratos}g carbs | ${m.gorduras}g gord`);
  lines.push("");
  lines.push("✅ *Confirma essa refeição?*");
  lines.push("_Responda 'sim' para registrar ou me diz se quer corrigir algo!_");
  lines.push("");
  lines.push("_(registro automático em 2 min se não responder)_");

  return lines.join("\n");
}

/**
 * Retorna emoji apropriado para o alimento
 * @param {string} nome 
 * @returns {string}
 */
function getEmojiForFood(nome) {
  const lower = nome.toLowerCase();
  
  if (lower.includes("arroz")) return "🍚";
  if (lower.includes("feijão") || lower.includes("feijao")) return "🫘";
  if (lower.includes("frango") || lower.includes("galinha")) return "🍗";
  if (lower.includes("carne") || lower.includes("bife") || lower.includes("boi")) return "🥩";
  if (lower.includes("peixe") || lower.includes("salmão") || lower.includes("atum")) return "🐟";
  if (lower.includes("ovo")) return "🥚";
  if (lower.includes("salada") || lower.includes("alface") || lower.includes("verde")) return "🥗";
  if (lower.includes("legume") || lower.includes("batata") || lower.includes("mandioca")) return "🥔";
  if (lower.includes("fruta") || lower.includes("maçã") || lower.includes("banana")) return "🍎";
  if (lower.includes("iogurte") || lower.includes("yogurt") || lower.includes("activia")) return "🥛";
  if (lower.includes("pão") || lower.includes("torrada")) return "🍞";
  if (lower.includes("macarrão") || lower.includes("massa") || lower.includes("espaguete")) return "🍝";
  if (lower.includes("queijo")) return "🧀";
  if (lower.includes("café") || lower.includes("cafe")) return "☕";
  if (lower.includes("suco") || lower.includes("juice")) return "🧃";
  if (lower.includes("água") || lower.includes("agua")) return "💧";
  
  return "🍽️";
}

/**
 * Verifica se uma mensagem é uma confirmação
 * @param {string} mensagem 
 * @returns {boolean}
 */
function isConfirmationMessage(mensagem) {
  if (!mensagem) return false;
  const lower = mensagem.toLowerCase().trim();
  
  const confirmWords = [
    "sim", "s", "ok", "confirma", "confirmo", "confirmado",
    "isso", "certo", "perfeito", "registra", "pode registrar",
    "tá certo", "ta certo", "está certo", "pode ser", "beleza",
    "👍", "✅", "👌", "🆗"
  ];
  
  return confirmWords.some(word => lower === word || lower.startsWith(word + " "));
}

/**
 * Verifica se uma mensagem é um cancelamento
 * @param {string} mensagem 
 * @returns {boolean}
 */
function isCancellationMessage(mensagem) {
  if (!mensagem) return false;
  const lower = mensagem.toLowerCase().trim();
  
  const cancelWords = [
    "não", "nao", "cancela", "cancelar", "esquece", "esqueça",
    "descarta", "descartar", "não registra", "nao registra",
    "❌", "👎"
  ];
  
  return cancelWords.some(word => lower.includes(word));
}

/**
 * Extrai correção de peso de uma mensagem
 * Exemplos: "era 200g de arroz", "arroz era 200g", "200g o arroz"
 * @param {string} mensagem 
 * @returns {{ alimento: string, peso: number }|null}
 */
function extractWeightCorrection(mensagem) {
  if (!mensagem) return null;
  const lower = mensagem.toLowerCase();
  
  // Padrões para detectar correção de peso
  const patterns = [
    // "era 200g de arroz" ou "era 200 gramas de arroz"
    /era\s+(\d+)\s*(?:g|gramas?)\s+(?:de\s+)?(\w+)/i,
    // "arroz era 200g"
    /(\w+)\s+era\s+(\d+)\s*(?:g|gramas?)/i,
    // "200g de arroz" ou "200g o arroz"
    /(\d+)\s*(?:g|gramas?)\s+(?:de\s+|o\s+)?(\w+)/i,
    // "o arroz era 200g"
    /o\s+(\w+)\s+era\s+(\d+)\s*(?:g|gramas?)/i,
    // "corrige arroz para 200g"
    /corrige?\s+(\w+)\s+(?:para|pra)\s+(\d+)\s*(?:g|gramas?)/i,
  ];
  
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      // Extrair alimento e peso (ordem varia por padrão)
      let alimento, peso;
      
      if (/^\d+$/.test(match[1])) {
        peso = parseInt(match[1]);
        alimento = match[2];
      } else {
        alimento = match[1];
        peso = parseInt(match[2]);
      }
      
      if (alimento && peso > 0) {
        return { alimento, peso };
      }
    }
  }
  
  return null;
}

/**
 * Retorna estatísticas do cache de refeições pendentes
 * @returns {Object}
 */
function getPendingMealsStats() {
  return {
    total: pendingMeals.size,
    conversations: Array.from(pendingMeals.keys()),
    oldestAge: pendingMeals.size > 0 
      ? Math.round((Date.now() - Math.min(...Array.from(pendingMeals.values()).map(p => p.createdAt))) / 1000)
      : 0,
  };
}

// Exports
module.exports = {
  // Core functions
  savePendingMeal,
  getPendingMeal,
  confirmPendingMeal,
  cancelPendingMeal,
  
  // Modification functions
  updatePendingMealFood,
  removePendingMealFood,
  addPendingMealFood,
  
  // Helpers
  calculateTotalMacros,
  formatPendingMealMessage,
  getEmojiForFood,
  
  // Message detection
  isConfirmationMessage,
  isCancellationMessage,
  extractWeightCorrection,
  
  // Stats
  getPendingMealsStats,
  
  // Constants
  AUTO_REGISTER_TIMEOUT_MS,
};
