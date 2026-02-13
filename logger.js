/**
 * Logger do Agente NutriBuddy
 * Logging estruturado com persistência via Firestore
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Diretório de logs (local — backup, efêmero no Railway)
const LOG_DIR = process.env.LOG_DIR || './logs';

if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {
    console.warn('Não foi possível criar diretório de logs:', e.message);
  }
}

// Backend URL para persistir logs no Firestore
const BACKEND_URL = process.env.BACKEND_URL || 'https://web-production-c9eaf.up.railway.app';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'nutribuddy-secret-2024';

// Fila de logs para envio em batch (evita muitas requests)
const logQueue = [];
let flushTimer = null;
const FLUSH_INTERVAL = 5000; // 5 segundos
const FLUSH_SIZE = 20; // Envia quando acumular 20 logs

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

function timestamp() {
  return new Date().toISOString();
}

/**
 * Escreve log em arquivo local (backup)
 */
function writeToFile(entry) {
  if (process.env.NODE_ENV === 'test') return;
  
  try {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `agent-${date}.log`);
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logFile, line);
  } catch (e) {
    // Silently fail
  }
}

/**
 * Enfileira log para persistência no Firestore (assíncrono, fire-and-forget)
 */
function enqueueForPersistence(entry) {
  // Só persiste INFO+ (ignora DEBUG)
  if (LOG_LEVELS[entry.level] < LOG_LEVELS.INFO) return;

  logQueue.push(entry);

  // Flush imediato se atingiu tamanho
  if (logQueue.length >= FLUSH_SIZE) {
    flushLogs();
    return;
  }

  // Timer para flush periódico
  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, FLUSH_INTERVAL);
  }
}

/**
 * Envia batch de logs para o backend (Firestore)
 */
async function flushLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (logQueue.length === 0) return;

  const batch = logQueue.splice(0, logQueue.length);

  try {
    await axios.post(`${BACKEND_URL}/api/agent-logs`, {
      logs: batch
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET
      },
      timeout: 10000
    });
  } catch (e) {
    // Não bloqueia — fire-and-forget
    // Re-enqueue em caso de falha (max 1 retry)
    if (!batch[0]._retried) {
      batch.forEach(log => { log._retried = true; });
      logQueue.push(...batch.slice(0, 50)); // Max 50 para não acumular infinito
    }
  }
}

// Flush ao encerrar o processo
process.on('beforeExit', flushLogs);
process.on('SIGTERM', async () => {
  await flushLogs();
  process.exit(0);
});

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
    enqueueForPersistence(entry);
  },

  warn(message, data = {}) {
    if (currentLevel > LOG_LEVELS.WARN) return;
    const entry = { level: 'WARN', timestamp: timestamp(), message, ...data };
    console.warn(`⚠️ [WARN] ${message}`, data);
    writeToFile(entry);
    enqueueForPersistence(entry);
  },

  error(message, data = {}) {
    const entry = { level: 'ERROR', timestamp: timestamp(), message, ...data };
    console.error(`❌ [ERROR] ${message}`, data);
    writeToFile(entry);
    enqueueForPersistence(entry);
  },

  /**
   * Log de interação completa do agente (request + response)
   */
  agentInteraction(data) {
    const entry = {
      level: 'INTERACTION',
      timestamp: timestamp(),
      type: 'agent_interaction',
      ...data
    };
    writeToFile(entry);
    enqueueForPersistence(entry);
    
    console.log(`📊 Interação: ${data.patientId} | ${data.iterations} iterações | ${data.elapsedMs}ms`);
  },

  /**
   * Log de conversa completa (mensagem do paciente → resposta do agente)
   */
  conversation(data) {
    const entry = {
      level: 'CONVERSATION',
      timestamp: timestamp(),
      type: 'conversation',
      patientId: data.patientId,
      patientName: data.patientName,
      conversationId: data.conversationId,
      messageIn: data.messageIn?.substring(0, 500),
      responseOut: data.responseOut?.substring(0, 1000),
      hasImage: data.hasImage || false,
      hasAudio: data.hasAudio || false,
      toolsCalled: data.toolsCalled || [],
      elapsedMs: data.elapsedMs,
      iterations: data.iterations,
      model: data.model
    };
    writeToFile(entry);
    enqueueForPersistence(entry);

    console.log(`💬 Conversa: ${data.patientName || data.patientId} | "${data.messageIn?.substring(0, 40)}..." → ${data.elapsedMs}ms`);
  },

  /**
   * Log de ferramentas
   */
  toolCall(toolName, args, result, elapsedMs) {
    const entry = {
      level: 'TOOL',
      timestamp: timestamp(),
      type: 'tool_call',
      tool: toolName,
      args: JSON.stringify(args).substring(0, 500),
      success: !result?.error,
      elapsedMs
    };
    writeToFile(entry);
    enqueueForPersistence(entry);
  },

  /**
   * Log de guardrails
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
    enqueueForPersistence(entry);
    console.warn(`🛡️ Guardrail [${type}]:`, details);
  },

  /**
   * Log de escalações
   */
  escalation(data) {
    const entry = {
      level: 'ESCALATION',
      timestamp: timestamp(),
      type: 'escalation',
      ...data
    };
    writeToFile(entry);
    enqueueForPersistence(entry);
    console.log(`🚨 ESCALAÇÃO: ${data.motivo} (${data.urgencia})`);
  },

  /** Força flush dos logs pendentes */
  flush: flushLogs
};

module.exports = { logger };
