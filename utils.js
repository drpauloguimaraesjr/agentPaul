/**
 * utils.js - Utilitários do AgentPaul
 * Funções auxiliares para formatação e cálculos
 */

/**
 * Gera uma barra de progresso visual em ASCII para WhatsApp
 * 
 * @param {number} current - Valor atual consumido
 * @param {number} target - Meta a atingir
 * @param {number} barLength - Tamanho da barra (padrão 10)
 * @returns {object} - { bar, percentage, status }
 */
function generateProgressBar(current, target, barLength = 10) {
  // Validar inputs
  const safeCurrent = typeof current === 'number' && !isNaN(current) ? current : 0;
  const safeTarget = typeof target === 'number' && !isNaN(target) && target > 0 ? target : 1;
  
  const percentage = Math.min(Math.round((safeCurrent / safeTarget) * 100), 150);
  const filledLength = Math.min(Math.round((safeCurrent / safeTarget) * barLength), barLength);
  
  // Caracteres para barra
  const filled = '▓';
  const empty = '░';
  
  const bar = filled.repeat(filledLength) + empty.repeat(barLength - filledLength);
  
  // Status: ok, warning (perto de estourar), over (passou)
  let status = 'ok';
  let emoji = '';
  
  if (percentage >= 100) {
    status = 'over';
    emoji = '⚠️';
  } else if (percentage >= 85) {
    status = 'warning';
    emoji = '';
  } else {
    status = 'ok';
    emoji = '';
  }
  
  return {
    bar,
    percentage,
    status,
    emoji,
    current: safeCurrent,
    target: safeTarget,
    remaining: Math.max(safeTarget - safeCurrent, 0)
  };
}

/**
 * Formata o progresso diário completo
 * 
 * @param {object} consumed - { protein, carbs, fats, calories }
 * @param {object} targets - { protein, carbs, fats, calories }
 * @returns {string} - Mensagem formatada para WhatsApp
 */
function formatDailyProgress(consumed, targets) {
  if (!targets || !targets.calories || targets.calories === 0) {
    return null; // Sem dieta prescrita
  }
  
  const proteinProgress = generateProgressBar(consumed.protein || 0, targets.protein || 150);
  const carbsProgress = generateProgressBar(consumed.carbs || 0, targets.carbs || 200);
  const fatsProgress = generateProgressBar(consumed.fats || 0, targets.fats || 60);
  const caloriesProgress = generateProgressBar(consumed.calories || 0, targets.calories || 2000);
  
  // Montar mensagem compacta
  let message = '⚡ *Progresso do Dia:*\n\n';
  
  message += `P: ${proteinProgress.bar} ${proteinProgress.percentage}% ${proteinProgress.emoji}\n`;
  message += `C: ${carbsProgress.bar} ${carbsProgress.percentage}% ${carbsProgress.emoji}\n`;
  message += `G: ${fatsProgress.bar} ${fatsProgress.percentage}% ${fatsProgress.emoji}\n`;
  message += `📈 ${consumed.calories || 0}/${targets.calories} kcal`;
  
  // Adicionar alertas se perto de estourar
  const alerts = [];
  if (proteinProgress.status === 'over') alerts.push('proteína');
  if (carbsProgress.status === 'over') alerts.push('carbo');
  if (fatsProgress.status === 'over') alerts.push('gordura');
  if (caloriesProgress.status === 'over') alerts.push('calorias');
  
  if (alerts.length > 0) {
    message += `\n\n⚠️ _Atenção: ${alerts.join(', ')} passou da meta!_`;
  }
  
  return message;
}

/**
 * Formata o progresso de forma ainda mais compacta (para mensagens curtas)
 */
function formatCompactProgress(consumed, targets) {
  if (!targets || !targets.calories || targets.calories === 0) {
    return null;
  }
  
  const p = generateProgressBar(consumed.protein || 0, targets.protein || 150);
  const c = generateProgressBar(consumed.carbs || 0, targets.carbs || 200);
  const g = generateProgressBar(consumed.fats || 0, targets.fats || 60);
  
  return `⚡ P:${p.bar} ${p.percentage}% | C:${c.bar} ${c.percentage}% | G:${g.bar} ${g.percentage}% ${g.emoji || p.emoji || c.emoji}`;
}

/**
 * Calcula se o paciente está "dentro da meta" ou não
 * 
 * @param {object} consumed - Macros consumidos
 * @param {object} targets - Metas
 * @param {string} mealType - Tipo de refeição (para contexto)
 * @returns {object} - { isOnTrack, message, details }
 */
function evaluateMealAgainstGoals(consumed, targets, mealType = 'refeição') {
  if (!targets || !targets.calories || targets.calories === 0) {
    return {
      isOnTrack: true,
      message: '✅ Refeição registrada!',
      hasGoals: false
    };
  }
  
  const details = [];
  let score = 0;
  
  // Verificar proteína
  const proteinRatio = (consumed.protein || 0) / (targets.protein || 1);
  if (proteinRatio >= 0.8 && proteinRatio <= 1.2) {
    score++;
    details.push({ macro: 'proteína', status: 'ok' });
  } else if (proteinRatio < 0.8) {
    details.push({ macro: 'proteína', status: 'low', diff: targets.protein - consumed.protein });
  } else {
    details.push({ macro: 'proteína', status: 'high', diff: consumed.protein - targets.protein });
  }
  
  // Verificar carboidratos
  const carbsRatio = (consumed.carbs || 0) / (targets.carbs || 1);
  if (carbsRatio >= 0.8 && carbsRatio <= 1.2) {
    score++;
  }
  
  // Verificar gorduras
  const fatsRatio = (consumed.fats || 0) / (targets.fats || 1);
  if (fatsRatio >= 0.8 && fatsRatio <= 1.2) {
    score++;
  }
  
  // Avaliar resultado
  const isOnTrack = score >= 2; // Pelo menos 2 de 3 dentro da faixa
  
  let message;
  if (score === 3) {
    message = `✅ Dentro da meta de ${mealType}! 💪`;
  } else if (score >= 2) {
    message = `✅ Quase perfeito! Continue assim 👍`;
  } else {
    const lowMacros = details.filter(d => d.status === 'low').map(d => d.macro);
    if (lowMacros.length > 0) {
      message = `💪 Faltou um pouco de ${lowMacros.join(' e ')}. Compense na próxima!`;
    } else {
      message = `⚠️ Passou um pouco da meta. Equilibre nas próximas refeições!`;
    }
  }
  
  return {
    isOnTrack,
    message,
    hasGoals: true,
    score,
    details
  };
}

module.exports = {
  generateProgressBar,
  formatDailyProgress,
  formatCompactProgress,
  evaluateMealAgainstGoals
};
