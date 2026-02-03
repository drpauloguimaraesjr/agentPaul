/**
 * Logger do Agente NutriBuddy
 * Logging estruturado para auditoria e debug
 */

const fs = require('fs');
const path = require('path');

// Diretório de logs
const LOG_DIR = process.env.LOG_DIR || './logs';

// Garante que o diretório existe
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {
    console.warn('Não foi possível criar diretório de logs:', e.message);
  }
}

/**
 * Níveis de log
 */
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

/**
 * Formata timestamp
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Escreve log em arquivo
 */
function writeToFile(entry) {
  if (process.env.NODE_ENV === 'test') return;
  
  try {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `agent-${date}.log`);
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logFile, line);
  } catch (e) {
    // Silently fail - não queremos que erro de log quebre o sistema
  }
}

/**
 * Logger principal
 */
const logger = {
  debug(message, data = {}) {
    if (currentLevel > LOG_LEVELS.DEBUG) return;
    const entry = { level: 'DEBUG', timestamp: timestamp(), message, ...data };
    console.log(`[DEBUG] ${message}`, data);
    writeToFile(entry);
  },

  info(message, data = {}) {
    if (currentLevel > LOG_LEVELS.INFO) return;
    const entry = { level: 'INFO', timestamp: timestamp(), message, ...data };
    console.log(`[INFO] ${message}`, Object.keys(data).length ? data : '');
    writeToFile(entry);
  },

  warn(message, data = {}) {
    if (currentLevel > LOG_LEVELS.WARN) return;
    const entry = { level: 'WARN', timestamp: timestamp(), message, ...data };
    console.warn(`⚠️ [WARN] ${message}`, data);
    writeToFile(entry);
  },

  error(message, data = {}) {
    const entry = { level: 'ERROR', timestamp: timestamp(), message, ...data };
    console.error(`❌ [ERROR] ${message}`, data);
    writeToFile(entry);
  },

  /**
   * Log específico para interações do agente
   */
  agentInteraction(data) {
    const entry = {
      level: 'INTERACTION',
      timestamp: timestamp(),
      type: 'agent_interaction',
      ...data
    };
    writeToFile(entry);
    
    // Log resumido no console
    console.log(`📊 Interação: ${data.patientId} | ${data.iterations} iterações | ${data.elapsedMs}ms`);
  },

  /**
   * Log específico para ferramentas
   */
  toolCall(toolName, args, result, elapsedMs) {
    const entry = {
      level: 'TOOL',
      timestamp: timestamp(),
      type: 'tool_call',
      tool: toolName,
      args: JSON.stringify(args).substring(0, 500), // Limita tamanho
      success: !result?.error,
      elapsedMs
    };
    writeToFile(entry);
  },

  /**
   * Log específico para guardrails
   */
  guardrail(type, details) {
    const entry = {
      level: 'GUARDRAIL',
      timestamp: timestamp(),
      type: 'guardrail_triggered',
      guardrailType: type,
      ...details
    };
    writeToFile(entry);
    console.warn(`🛡️ Guardrail [${type}]:`, details);
  },

  /**
   * Log específico para escalações
   */
  escalation(data) {
    const entry = {
      level: 'ESCALATION',
      timestamp: timestamp(),
      type: 'escalation',
      ...data
    };
    writeToFile(entry);
    console.log(`🚨 ESCALAÇÃO: ${data.motivo} (${data.urgencia})`);
  }
};

module.exports = { logger };
