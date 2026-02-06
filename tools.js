/**
 * Ferramentas do Agente NutriBuddy (AgentPaul)
 * Versão 3.0 - Completo com Whisper, Embalagens e Banco Local
 */

const axios = require("axios");
const OpenAI = require("openai");
const { TEMAS_FORA_ESCOPO } = require("./prompts");
const {
  buscarProdutoFirestore,
  salvarProdutoFirestore,
  carregarProdutosFirestore,
  salvarAnalisePendente,
  buscarAnalisePendente,
  limparAnalisePendente,
} = require("./firebase");
const {
  savePendingMeal,
  getPendingMeal,
  confirmPendingMeal,
  cancelPendingMeal,
  updatePendingMealFood,
  removePendingMealFood,
  addPendingMealFood,
  formatPendingMealMessage,
  isConfirmationMessage,
  isCancellationMessage,
  extractWeightCorrection,
} = require("./pending-meals");
const {
  formatDailyProgress,
  evaluateMealAgainstGoals,
} = require("./utils");

// Configuração
const BACKEND_URL =
  process.env.BACKEND_URL || "https://web-production-c9eaf.up.railway.app";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "nutribuddy-secret-2024";

// Cliente HTTP para o backend
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Webhook-Secret": WEBHOOK_SECRET,
  },
  timeout: 30000,
});

// OpenAI (lazy initialization with cleaned API key)
let openai = null;
function getOpenAI() {
  if (!openai) {
    // Limpa a API key (remove aspas, espaços, quebras de linha) - IGUAL ao index.js
    const rawKey = process.env.OPENAI_API_KEY || "";
    const cleanKey = rawKey
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[\n\r\s]/g, "");

    if (!cleanKey || !cleanKey.startsWith("sk-")) {
      console.error("❌ OPENAI_API_KEY inválida ou não definida em tools.js");
      throw new Error("OPENAI_API_KEY inválida");
    }

    console.log(
      `✅ OpenAI inicializado em tools.js (key length: ${cleanKey.length})`,
    );

    openai = new OpenAI({
      apiKey: cleanKey,
      timeout: 120000, // 120 segundos para Vision (imagens demoram mais)
      maxRetries: 3, // 3 tentativas automáticas
    });
  }
  return openai;
}

// ==========================================
// BANCO LOCAL DE PRODUTOS BRASILEIROS
// ==========================================
const BANCO_PRODUTOS_BR = {
  "activia triplo zero ameixa": {
    nome: "Activia Triplo Zero Ameixa",
    peso: 170,
    macros: { proteinas: 5.9, carboidratos: 7.5, gorduras: 0, calorias: 54 },
    observacoes: "Zero lactose, zero açúcar, zero gordura",
  },
  "activia triplo zero morango": {
    nome: "Activia Triplo Zero Morango",
    peso: 170,
    macros: { proteinas: 5.9, carboidratos: 7.5, gorduras: 0, calorias: 54 },
  },
  "activia triplo zero natural": {
    nome: "Activia Triplo Zero Natural",
    peso: 170,
    macros: { proteinas: 6.8, carboidratos: 5.1, gorduras: 0, calorias: 48 },
  },
  "activia natural": {
    nome: "Activia Natural",
    peso: 170,
    macros: { proteinas: 6, carboidratos: 10.2, gorduras: 2, calorias: 82 },
  },
  "activia morango": {
    nome: "Activia Morango",
    peso: 170,
    macros: { proteinas: 5.3, carboidratos: 13.6, gorduras: 1.7, calorias: 90 },
  },
  yakult: {
    nome: "Yakult",
    peso: 80,
    macros: { proteinas: 1.1, carboidratos: 11.5, gorduras: 0, calorias: 51 },
  },
  "danone grego natural": {
    nome: "Danone Grego Natural",
    peso: 100,
    macros: { proteinas: 5.5, carboidratos: 5.8, gorduras: 6.5, calorias: 103 },
  },
  "danone grego": {
    nome: "Danone Grego",
    peso: 100,
    macros: { proteinas: 5.5, carboidratos: 5.8, gorduras: 6.5, calorias: 103 },
  },
  "corpus zero": {
    nome: "Iogurte Corpus Zero",
    peso: 165,
    macros: { proteinas: 5.8, carboidratos: 4.5, gorduras: 0, calorias: 41 },
  },
  "corpus morango": {
    nome: "Iogurte Corpus Morango",
    peso: 165,
    macros: { proteinas: 5.5, carboidratos: 6.2, gorduras: 0, calorias: 47 },
  },
  "vigor grego": {
    nome: "Vigor Grego Natural",
    peso: 100,
    macros: { proteinas: 5.2, carboidratos: 6, gorduras: 5.8, calorias: 97 },
  },
  nesfit: {
    nome: "Iogurte Nesfit",
    peso: 170,
    macros: { proteinas: 6, carboidratos: 8, gorduras: 1.5, calorias: 69 },
  },
  "whey protein": {
    nome: "Whey Protein (1 scoop)",
    peso: 30,
    macros: { proteinas: 24, carboidratos: 3, gorduras: 1.5, calorias: 120 },
  },
};

// Palavras que indicam produto embalado
const PALAVRAS_EMBALAGEM = [
  "yogurt",
  "iogurte",
  "activia",
  "danone",
  "nestle",
  "nestlé",
  "leite",
  "suco",
  "juice",
  "milk",
  "yakult",
  "danoninho",
  "vigor",
  "batavo",
  "itambé",
  "piracanjuba",
  "elegê",
  "corpus",
  "barra",
  "bar",
  "cereal",
  "granola",
  "nescau",
  "toddy",
  "biscoito",
  "cookie",
  "bolacha",
  "cream cheese",
  "requeijão",
  "refrigerante",
  "soda",
  "coca",
  "pepsi",
  "guaraná",
  "whey",
  "nesfit",
];

// ==========================================
// VALIDADORES
// ==========================================

function validarEscopo(texto) {
  if (!texto) return { valido: true };
  const textoLower = texto.toLowerCase();
  for (const tema of TEMAS_FORA_ESCOPO) {
    if (textoLower.includes(tema)) {
      return {
        valido: false,
        motivo: `Conteúdo fora do escopo: "${tema}"`,
        tema,
      };
    }
  }
  return { valido: true };
}

const TIPOS_REFEICAO_VALIDOS = [
  "cafe_manha",
  "lanche_manha",
  "almoco",
  "lanche_tarde",
  "jantar",
  "ceia",
];

// Normaliza o mealType para o formato aceito pela API
function normalizarMealType(mealType) {
  if (!mealType) return "almoco"; // default
  
  // Mapa de conversão (acentuado/espaço -> underscore sem acento)
  const mapa = {
    "almoço": "almoco",
    "café da manhã": "cafe_manha",
    "café_da_manhã": "cafe_manha",
    "cafe da manha": "cafe_manha",
    "lanche da manhã": "lanche_manha",
    "lanche_da_manhã": "lanche_manha",
    "lanche da manha": "lanche_manha",
    "lanche da tarde": "lanche_tarde",
    "lanche_da_tarde": "lanche_tarde",
  };
  
  const normalizado = mapa[mealType.toLowerCase()] || mealType.toLowerCase();
  
  // Se ainda não estiver na lista, tenta encontrar aproximação
  if (!TIPOS_REFEICAO_VALIDOS.includes(normalizado)) {
    // Tenta remover acentos e espaços
    const semAcento = normalizado
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    
    if (TIPOS_REFEICAO_VALIDOS.includes(semAcento)) {
      return semAcento;
    }
    
    // Fallback: retorna almoco como default
    console.log(`⚠️ mealType "${mealType}" não reconhecido, usando "almoco"`);
    return "almoco";
  }
  
  return normalizado;
}

function sanitizarMensagem(mensagem) {
  let sanitizada = mensagem
    .replace(/ignore previous instructions/gi, "")
    .replace(/ignore all instructions/gi, "")
    .replace(/you are now/gi, "")
    .replace(/act as/gi, "")
    .replace(/pretend to be/gi, "");
  if (sanitizada.length > 2000) {
    sanitizada = sanitizada.substring(0, 2000) + "...";
  }
  return sanitizada;
}

// Palavras que indicam urgência/escalação para humano
const PALAVRAS_ESCALACAO = [
  'suicídio', 'suicidio', 'me matar', 'matar', 'morrer',
  'emergência', 'emergencia', 'urgente', 'hospital',
  'transtorno alimentar', 'anorexia', 'bulimia',
  'abuso', 'violência', 'violencia',
  'depressão', 'depressao', 'ansiedade grave'
];

function verificarEscalacao(texto) {
  if (!texto) return { escalar: false };
  
  const textoLower = texto.toLowerCase();
  
  for (const palavra of PALAVRAS_ESCALACAO) {
    if (textoLower.includes(palavra)) {
      return {
        escalar: true,
        motivo: `Palavra de urgência detectada: "${palavra}"`,
        gatilho: palavra
      };
    }
  }
  
  return { escalar: false };
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function buscarProdutoNoBancoLocal(texto) {
  const textoNorm = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const [chave, dados] of Object.entries(BANCO_PRODUTOS_BR)) {
    const palavrasChave = chave.split(" ");
    const coincidencias = palavrasChave.filter((p) => textoNorm.includes(p));
    if (
      coincidencias.length >= 2 ||
      (coincidencias.length === 1 && palavrasChave.length === 1)
    ) {
      return { encontrado: true, chave, dados, fonte: "memoria" };
    }
  }
  return { encontrado: false };
}

// Versão async que também busca no Firestore
async function buscarProdutoCompleto(texto) {
  // 1. Primeiro busca em memória (mais rápido)
  const buscaLocal = buscarProdutoNoBancoLocal(texto);
  if (buscaLocal.encontrado) {
    return buscaLocal;
  }

  // 2. Se não encontrar, busca no Firestore
  const textoNorm = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const dadosFirestore = await buscarProdutoFirestore(textoNorm);

  if (dadosFirestore) {
    // Adiciona ao cache em memória para próximas buscas
    BANCO_PRODUTOS_BR[dadosFirestore.chave || textoNorm] = {
      nome: dadosFirestore.nome,
      peso: dadosFirestore.peso,
      macros: dadosFirestore.macros,
      observacoes: dadosFirestore.observacoes || "",
    };

    return {
      encontrado: true,
      chave: dadosFirestore.chave || textoNorm,
      dados: dadosFirestore,
      fonte: "firestore",
    };
  }

  return { encontrado: false };
}

function detectarProdutoEmbalado(nomeAlimento) {
  const nome = nomeAlimento.toLowerCase();
  return PALAVRAS_EMBALAGEM.some((p) => nome.includes(p));
}

// Normaliza o mealType para o formato esperado pelo backend (sem acentos)
function normalizarMealType(mealType) {
  if (!mealType) return null;
  
  const normalized = mealType
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, '_'); // Substitui espaços por underscores
  
  // Mapeamento de variações para o formato padrão
  const mapeamento = {
    'cafe_da_manha': 'cafe_manha',
    'cafe': 'cafe_manha',
    'almoco': 'almoco',
    'jantar': 'jantar',
    'lanche': 'lanche_tarde',
    'lanche_da_manha': 'lanche_manha',
    'lanche_da_tarde': 'lanche_tarde',
    'ceia': 'ceia',
  };
  
  return mapeamento[normalized] || normalized;
}

// Detecta tipo de refeição baseado no horário atual
function detectarTipoRefeicaoPorHorario() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 10) return 'cafe_manha';
  if (hora >= 10 && hora < 12) return 'lanche_manha';
  if (hora >= 12 && hora < 15) return 'almoco';
  if (hora >= 15 && hora < 18) return 'lanche_tarde';
  if (hora >= 18 && hora < 22) return 'jantar';
  return 'ceia';
}

// ==========================================
// DEFINIÇÕES DAS FERRAMENTAS (17 total)
// ==========================================

const tools = [
  {
    type: "function",
    function: {
      name: "buscar_contexto_paciente",
      description:
        "Busca TODOS os dados do paciente: nome, peso, altura, objetivo, alergias, preferências, dieta, etc. Use SEMPRE no início para entender quem é o paciente.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string", description: "ID do paciente" },
        },
        required: ["patientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_dieta_paciente",
      description:
        "Busca a dieta prescrita do paciente com refeições e macros.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string", description: "ID do paciente" },
        },
        required: ["patientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisar_foto_refeicao",
      description:
        "Analisa uma foto de refeição usando GPT-4 Vision. Identifica alimentos, estima pesos e macros. Também lê rótulos de embalagens (iogurtes, etc).",
      parameters: {
        type: "object",
        properties: {
          imageUrl: {
            type: "string",
            description: "URL da imagem da refeição",
          },
          dietaContexto: {
            type: "string",
            description: "Contexto da dieta do paciente (opcional)",
          },
          instrucaoExtra: {
            type: "string",
            description: "Instruções adicionais (opcional)",
          },
        },
        required: ["imageUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_refeicao",
      description: "Registra uma refeição no diário alimentar do paciente.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string", description: "ID do paciente" },
          conversationId: { type: "string", description: "ID da conversa" },
          mealType: {
            type: "string",
            enum: [
              "cafe_manha",
              "lanche_manha",
              "almoco",
              "lanche_tarde",
              "jantar",
              "ceia",
            ],
            description: "Tipo da refeição",
          },
          alimentos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                peso: { type: "number" },
                proteinas: { type: "number" },
                carboidratos: { type: "number" },
                gorduras: { type: "number" },
                calorias: { type: "number" },
              },
            },
            description: "Lista de alimentos com macros",
          },
          imageUrl: { type: "string", description: "URL da foto (opcional)" },
        },
        required: ["patientId", "conversationId", "mealType", "alimentos"],
      },
    },
  },
  // ================================================
  // ✨ NOVA FERRAMENTA: preparar_refeicao
  // ================================================
  {
    type: "function",
    function: {
      name: "preparar_refeicao",
      description:
        "Prepara uma refeição para confirmação do paciente. NÃO registra ainda - salva como pendente e pede confirmação. Use SEMPRE após analisar_foto_refeicao para mostrar ao paciente o que foi identificado e pedir confirmação antes de registrar.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string", description: "ID do paciente" },
          conversationId: { type: "string", description: "ID da conversa" },
          mealType: {
            type: "string",
            enum: [
              "cafe_manha",
              "lanche_manha",
              "almoco",
              "lanche_tarde",
              "jantar",
              "ceia",
            ],
            description: "Tipo da refeição",
          },
          alimentos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                peso: { type: "number" },
                proteinas: { type: "number" },
                carboidratos: { type: "number" },
                gorduras: { type: "number" },
                calorias: { type: "number" },
              },
            },
            description: "Lista de alimentos com macros",
          },
          imageUrl: { type: "string", description: "URL da foto (opcional)" },
        },
        required: ["patientId", "conversationId", "mealType", "alimentos"],
      },
    },
  },
  // ================================================
  // ✨ NOVA FERRAMENTA: confirmar_refeicao
  // ================================================
  {
    type: "function",
    function: {
      name: "confirmar_refeicao",
      description:
        "Confirma e registra uma refeição que estava pendente. Use quando o paciente confirmar a refeição (responder 'sim', 'ok', 'confirma', etc).",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
        },
        required: ["conversationId"],
      },
    },
  },
  // ================================================
  // ✨ NOVA FERRAMENTA: cancelar_refeicao
  // ================================================
  {
    type: "function",
    function: {
      name: "cancelar_refeicao",
      description:
        "Cancela TODA a refeição pendente. Use SOMENTE quando o paciente disser que NÃO quer registrar NADA (ex: 'não registra', 'cancela tudo', 'não quero'). ⚠️ NÃO USE se o paciente quiser remover/trocar apenas UM ITEM específico - nesses casos use corrigir_refeicao com acao='remover' ou acao='substituir'.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
        },
        required: ["conversationId"],
      },
    },
  },
  // ================================================
  // ✨ NOVA FERRAMENTA: corrigir_refeicao
  // ================================================
  {
    type: "function",
    function: {
      name: "corrigir_refeicao",
      description:
        "Corrige um item da refeição pendente. Use quando: 'era X de arroz' (atualizar_peso), 'remove a batata' ou 'cancela a batata' (remover), 'adiciona ovo' (adicionar), 'era pequi não batata' ou 'troca batata por pequi' (substituir). ⚠️ 'Cancela a batata' = REMOVER esse item, não cancelar tudo!",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
          acao: {
            type: "string",
            enum: ["atualizar_peso", "remover", "adicionar", "substituir"],
            description: "Tipo de correção: atualizar_peso (mudar gramagem), remover (tirar item), adicionar (incluir novo), substituir (trocar um por outro)",
          },
          alimentoNome: { type: "string", description: "Nome do alimento a corrigir/remover/substituir" },
          novoPeso: { type: "number", description: "Novo peso em gramas (para atualizar_peso)" },
          novoAlimento: {
            type: "object",
            properties: {
              nome: { type: "string" },
              peso: { type: "number" },
              proteinas: { type: "number" },
              carboidratos: { type: "number" },
              gorduras: { type: "number" },
              calorias: { type: "number" },
            },
            description: "Dados do novo alimento (para adicionar ou substituir)",
          },
        },
        required: ["conversationId", "acao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_mensagem_whatsapp",
      description: "Envia mensagem para o paciente via WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
          mensagem: { type: "string", description: "Texto da mensagem" },
        },
        required: ["conversationId", "mensagem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_historico_conversa",
      description: "Busca as últimas mensagens da conversa para contexto.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
          limite: {
            type: "number",
            description: "Número de mensagens (padrão: 10)",
          },
        },
        required: ["conversationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_correcoes_aprendidas",
      description:
        "Busca correções de peso que o sistema aprendeu com feedbacks anteriores.",
      parameters: {
        type: "object",
        properties: {
          alimento: {
            type: "string",
            description: "Nome do alimento (opcional)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "salvar_correcao_peso",
      description:
        "Salva correção de peso informada pelo paciente para o sistema aprender.",
      parameters: {
        type: "object",
        properties: {
          alimento: { type: "string", description: "Nome do alimento" },
          pesoEstimado: {
            type: "number",
            description: "Peso que o sistema estimou",
          },
          pesoReal: {
            type: "number",
            description: "Peso real informado pelo paciente",
          },
          patientId: { type: "string", description: "ID do paciente" },
        },
        required: ["alimento", "pesoEstimado", "pesoReal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_resumo_diario",
      description: "Busca TODAS as refeições do dia e soma de macros. Use quando paciente perguntar: 'o que eu comi hoje?', 'quantas calorias?', 'quanto de proteína consumi?', 'meu resumo do dia', 'como estou hoje?'. Retorna lista de refeições com alimentos e totais vs metas.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string", description: "ID do paciente" },
          data: { type: "string", description: "Data no formato YYYY-MM-DD (opcional, padrão: hoje)" },
        },
        required: ["patientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transcrever_audio",
      description: "Transcreve áudio do paciente usando Whisper API.",
      parameters: {
        type: "object",
        properties: {
          audioUrl: { type: "string", description: "URL do arquivo de áudio" },
        },
        required: ["audioUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_info_restaurante",
      description:
        "Busca informações nutricionais de restaurantes conhecidos (Outback, McDonald's, Subway, etc).",
      parameters: {
        type: "object",
        properties: {
          restaurante: { type: "string", description: "Nome do restaurante" },
          prato: {
            type: "string",
            description: "Nome do prato específico (opcional)",
          },
        },
        required: ["restaurante"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aplicar_correcao_peso",
      description:
        "Aplica correção aprendida a uma estimativa de peso. Use DEPOIS de analisar_foto_refeicao para ajustar pesos com base no histórico de correções do sistema.",
      parameters: {
        type: "object",
        properties: {
          foodName: {
            type: "string",
            description: 'Nome do alimento (ex: "Arroz branco")',
          },
          foodType: {
            type: "string",
            description:
              'Tipo genérico do alimento (ex: "arroz", "feijao", "frango")',
          },
          aiEstimate: {
            type: "number",
            description: "Peso estimado pela IA em gramas",
          },
        },
        required: ["foodName", "aiEstimate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_produto_internet",
      description:
        "Busca informações nutricionais de um produto embalado na internet. Use quando identificar um produto que NÃO está no banco local (iogurtes, barras, bebidas, etc).",
      parameters: {
        type: "object",
        properties: {
          produto: {
            type: "string",
            description:
              'Nome completo do produto (marca + linha + sabor). Ex: "Danone Grego Tradicional 100g"',
          },
          marca: { type: "string", description: "Marca do produto (opcional)" },
        },
        required: ["produto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "salvar_produto_banco",
      description:
        "Salva um novo produto no banco local para uso futuro. Use DEPOIS de buscar_produto_internet quando encontrar dados confiáveis.",
      parameters: {
        type: "object",
        properties: {
          chave: {
            type: "string",
            description:
              'Chave de busca em minúsculas (ex: "danone grego tradicional")',
          },
          nome: { type: "string", description: "Nome completo do produto" },
          peso: { type: "number", description: "Peso da porção em gramas" },
          proteinas: { type: "number", description: "Proteínas em gramas" },
          carboidratos: {
            type: "number",
            description: "Carboidratos em gramas",
          },
          gorduras: { type: "number", description: "Gorduras em gramas" },
          calorias: { type: "number", description: "Calorias em kcal" },
          observacoes: {
            type: "string",
            description: 'Observações (ex: "zero lactose", "light")',
          },
        },
        required: [
          "chave",
          "nome",
          "peso",
          "proteinas",
          "carboidratos",
          "gorduras",
          "calorias",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "salvar_analise_pendente",
      description:
        "Salva os dados de uma análise de refeição ANTES de pedir confirmação ao paciente. Use SEMPRE que for pedir 'Está correto?' ao paciente. Isso garante que quando ele responder SIM, você consegue recuperar os dados.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
          patientId: { type: "string", description: "ID do paciente" },
          mealType: {
            type: "string",
            enum: [
              "cafe_manha",
              "lanche_manha",
              "almoco",
              "lanche_tarde",
              "jantar",
              "ceia",
            ],
            description: "Tipo da refeição",
          },
          alimentos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                peso: { type: "number" },
                proteinas: { type: "number" },
                carboidratos: { type: "number" },
                gorduras: { type: "number" },
                calorias: { type: "number" },
              },
            },
            description: "Lista de alimentos analisados com macros",
          },
          macrosTotais: {
            type: "object",
            properties: {
              proteinas: { type: "number" },
              carboidratos: { type: "number" },
              gorduras: { type: "number" },
              calorias: { type: "number" },
            },
            description: "Totais de macros da refeição",
          },
          imageUrl: { type: "string", description: "URL da foto (opcional)" },
        },
        required: ["conversationId", "patientId", "mealType", "alimentos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_analise_pendente",
      description:
        "Busca uma análise pendente de confirmação. Use SEMPRE quando o paciente responder SIM, OK, CONFIRMA, REGISTRA, etc. para recuperar os dados da análise anterior.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
        },
        required: ["conversationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "limpar_analise_pendente",
      description:
        "Limpa uma análise pendente após registro ou cancelamento. Use após registrar a refeição ou se o paciente cancelar.",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "ID da conversa" },
        },
        required: ["conversationId"],
      },
    },
  },
];

// ==========================================
// IMPLEMENTAÇÕES DAS FERRAMENTAS
// ==========================================

const toolImplementations = {
  async buscar_contexto_paciente({ patientId }, contexto) {
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error("Não autorizado a acessar dados de outro paciente");
    }
    const response = await api.get(
      `/api/n8n/patient/${patientId}/full-context`,
    );
    return response.data;
  },

  async buscar_dieta_paciente({ patientId }, contexto) {
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error("Não autorizado a acessar dados de outro paciente");
    }
    const response = await api.get(`/api/n8n/patients/${patientId}/diet`);
    return response.data;
  },

  async analisar_foto_refeicao({ imageUrl, dietaContexto, instrucaoExtra }) {
    if (!imageUrl || !imageUrl.startsWith("http")) {
      throw new Error("URL da imagem inválida");
    }

    // Prompt que também detecta embalagens
    const prompt = `Você é um nutricionista analisando uma foto de refeição.

${dietaContexto ? `DIETA DO PACIENTE:\n${dietaContexto}\n` : ""}
${instrucaoExtra ? `OBSERVAÇÃO: ${instrucaoExtra}\n` : ""}

INSTRUÇÕES:
1. Identifique TODOS os alimentos na imagem
2. Estime o peso em gramas de cada alimento
3. Se houver PRODUTOS EMBALADOS (iogurte, leite, etc), LEIA O RÓTULO:
   - Marca (ex: Activia, Danone, Corpus)
   - Linha/versão (ex: Triplo Zero, Grego, Light)
   - Sabor (se visível)
   - Peso da embalagem (ex: 170g)

Retorne um JSON:
{
  "alimentos": [
    {
      "nome": "nome do alimento",
      "peso": peso_em_gramas,
      "proteinas": gramas,
      "carboidratos": gramas,
      "gorduras": gramas,
      "calorias": kcal,
      "confianca": 0.0 a 1.0,
      "eh_embalado": true/false,
      "marca": "marca se embalado",
      "linha": "linha/versão se embalado"
    }
  ],
  "mealType": "almoco|jantar|cafe_manha|lanche|ceia",
  "observacoes": "qualquer observação relevante"
}

Se a imagem não for de comida, retorne:
{"erro": "Imagem não parece ser de uma refeição", "alimentos": []}

Seja preciso. Na dúvida, pergunte ao paciente.`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    let resultado;

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
      } else {
        return { raw: content };
      }
    } catch (e) {
      return { raw: content };
    }

    // Pós-processamento: verificar produtos embalados no banco local
    if (resultado.alimentos && Array.isArray(resultado.alimentos)) {
      resultado.alimentos = resultado.alimentos.map((alimento) => {
        // Tentar buscar no banco local
        const termosBusca = [
          alimento.nome,
          `${alimento.marca || ""} ${alimento.linha || ""} ${alimento.nome}`.trim(),
          `${alimento.marca || ""} ${alimento.nome}`.trim(),
        ];

        for (const termo of termosBusca) {
          const busca = buscarProdutoNoBancoLocal(termo);
          if (busca.encontrado) {
            console.log(`✅ Produto encontrado no banco local: ${busca.chave}`);
            return {
              ...alimento,
              nome: busca.dados.nome,
              peso: busca.dados.peso,
              proteinas: busca.dados.macros.proteinas,
              carboidratos: busca.dados.macros.carboidratos,
              gorduras: busca.dados.macros.gorduras,
              calorias: busca.dados.macros.calorias,
              fonte: "banco_local_br",
              observacoes: busca.dados.observacoes || "",
            };
          }
        }

        return alimento;
      });

      // Recalcular totais
      resultado.macros_totais = resultado.alimentos.reduce(
        (t, a) => ({
          proteinas: Math.round((t.proteinas + (a.proteinas || 0)) * 10) / 10,
          carboidratos:
            Math.round((t.carboidratos + (a.carboidratos || 0)) * 10) / 10,
          gorduras: Math.round((t.gorduras + (a.gorduras || 0)) * 10) / 10,
          calorias: Math.round(t.calorias + (a.calorias || 0)),
        }),
        { proteinas: 0, carboidratos: 0, gorduras: 0, calorias: 0 },
      );
    }

    // ⭐ SALVAR AUTOMATICAMENTE para confirmação posterior
    // Os dados são salvos aqui para que quando o paciente responder "SIM",
    // possamos recuperar a análise e registrar a refeição
    resultado.imageUrl = imageUrl;
    resultado.aguardando_confirmacao = true;
    
    console.log('📝 Análise de foto concluída:', {
      alimentos: resultado.alimentos?.length || 0,
      macros: resultado.macros_totais,
      mealType: resultado.mealType
    });

    return resultado;
  },

  // Função auxiliar para salvar análise após agente processar
  // O agente deve chamar esta função OU salvar_analise_pendente
  async _salvar_analise_automatica(resultado, contexto) {
    if (!contexto?.conversationId || !contexto?.patientId) {
      console.log('⚠️ Contexto incompleto, não foi possível salvar análise automática');
      return false;
    }
    
    if (!resultado.alimentos || resultado.alimentos.length === 0) {
      console.log('⚠️ Sem alimentos para salvar');
      return false;
    }
    
    const dados = {
      patientId: contexto.patientId,
      mealType: normalizarMealType(resultado.mealType) || detectarTipoRefeicaoPorHorario(),
      alimentos: resultado.alimentos,
      macrosTotais: resultado.macros_totais,
      imageUrl: resultado.imageUrl
    };
    
    await salvarAnalisePendente(contexto.conversationId, dados);
    console.log('✅ Análise salva automaticamente para confirmação');
    return true;
  },

  async registrar_refeicao(
    { patientId, conversationId, mealType, alimentos, imageUrl },
    contexto,
  ) {
    // Normalizar mealType para garantir formato correto
    const mealTypeNormalizado = normalizarMealType(mealType) || mealType;
    
    if (!TIPOS_REFEICAO_VALIDOS.includes(mealTypeNormalizado)) {
      throw new Error(`Tipo de refeição inválido: ${mealType} (normalizado: ${mealTypeNormalizado})`);
    }
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error("Não autorizado a registrar para outro paciente");
    }
    if (!Array.isArray(alimentos) || alimentos.length === 0) {
      throw new Error("Lista de alimentos não pode estar vazia");
    }

    const response = await api.post(
      `/api/n8n/patients/${patientId}/food-diary`,
      {
        type: mealTypeNormalizado,
        date: new Date().toISOString().split("T")[0],
        foods: alimentos.map((a) => ({
          name: a.nome,
          weight: a.peso,
          calories: a.calorias || 0,
          protein: a.proteinas || 0,
          carbs: a.carboidratos || 0,
          fats: a.gorduras || 0,
        })),
        macros: {
          calories: alimentos.reduce((sum, a) => sum + (a.calorias || 0), 0),
          protein: alimentos.reduce((sum, a) => sum + (a.proteinas || 0), 0),
          carbs: alimentos.reduce((sum, a) => sum + (a.carboidratos || 0), 0),
          fats: alimentos.reduce((sum, a) => sum + (a.gorduras || 0), 0),
        },
        imageUrl: imageUrl || null,
        conversationId,
        source: "agent_paul",
      },
    );
    return response.data;
  },

  // ================================================
  // ✨ PREPARAR REFEIÇÃO (salva como pendente)
  // ================================================
  async preparar_refeicao(
    { patientId, conversationId, mealType, alimentos, imageUrl },
    contexto,
  ) {
    // Normaliza o mealType para o formato aceito
    const mealTypeNormalizado = normalizarMealType(mealType);
    
    if (!TIPOS_REFEICAO_VALIDOS.includes(mealTypeNormalizado)) {
      throw new Error(`Tipo de refeição inválido: ${mealType}`);
    }
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error("Não autorizado a registrar para outro paciente");
    }
    if (!Array.isArray(alimentos) || alimentos.length === 0) {
      throw new Error("Lista de alimentos não pode estar vazia");
    }

    console.log(`📋 [Tools] Preparando refeição para confirmação...`);

    // Callback para auto-registro após timeout
    const autoRegisterCallback = async (pending) => {
      console.log(`⏰ [Tools] Auto-registrando refeição...`);
      
      try {
        // Enviar mensagem de "registrando..."
        await api.post(`/api/n8n/conversations/${pending.conversationId}/messages`, {
          mensagem: "📝 _Registrando refeição automaticamente..._",
          source: "agent_paul",
        });

        // Registrar a refeição
        const response = await api.post(
          `/api/n8n/patients/${pending.patientId}/food-diary`,
          {
            type: pending.mealType,
            date: new Date().toISOString().split("T")[0],
            foods: pending.alimentos.map((a) => ({
              name: a.nome,
              weight: a.peso,
              calories: a.calorias || 0,
              protein: a.proteinas || 0,
              carbs: a.carboidratos || 0,
              fats: a.gorduras || 0,
            })),
            macros: {
              calories: pending.macrosTotais?.calorias || 0,
              protein: pending.macrosTotais?.proteinas || 0,
              carbs: pending.macrosTotais?.carboidratos || 0,
              fats: pending.macrosTotais?.gorduras || 0,
            },
            imageUrl: pending.imageUrl || null,
            conversationId: pending.conversationId,
            source: "agent_paul_auto",
          },
        );

        // Enviar confirmação
        await api.post(`/api/n8n/conversations/${pending.conversationId}/messages`, {
          mensagem: "✅ *Refeição registrada!*\n\nSe algo estiver errado, me avise que eu corrijo. 😊",
          source: "agent_paul",
        });

        console.log(`✅ [Tools] Refeição auto-registrada com sucesso!`);
      } catch (error) {
        console.error(`❌ [Tools] Erro no auto-registro:`, error.message);
      }
    };

    // Calcular macros totais
    const macrosTotais = {
      calorias: alimentos.reduce((sum, a) => sum + (a.calorias || 0), 0),
      proteinas: alimentos.reduce((sum, a) => sum + (a.proteinas || 0), 0),
      carboidratos: alimentos.reduce((sum, a) => sum + (a.carboidratos || 0), 0),
      gorduras: alimentos.reduce((sum, a) => sum + (a.gorduras || 0), 0),
    };

    // Salvar como pendente
    const pending = savePendingMeal(
      conversationId,
      {
        patientId,
        mealType: mealTypeNormalizado,
        alimentos,
        imageUrl,
        macrosTotais,
      },
      autoRegisterCallback
    );

    // Formatar mensagem para mostrar ao paciente
    const mensagemConfirmacao = formatPendingMealMessage(pending);

    return {
      success: true,
      status: "pending_confirmation",
      message: "Refeição preparada. Aguardando confirmação do paciente.",
      mensagemConfirmacao,
      alimentos,
      macrosTotais,
      timeoutSeconds: 120,
    };
  },

  // ================================================
  // ✨ CONFIRMAR REFEIÇÃO (registra a pendente)
  // ================================================
  async confirmar_refeicao({ conversationId }, contexto) {
    console.log(`✅ [Tools] Confirmando refeição para ${conversationId}...`);

    // Buscar e remover do cache/Firebase (cancela timer)
    const pending = await confirmPendingMeal(conversationId);

    if (!pending) {
      return {
        success: false,
        error: "Nenhuma refeição pendente para confirmar.",
        message: "Não encontrei nenhuma refeição aguardando confirmação. Envie uma foto da sua refeição!",
      };
    }

    // Enviar mensagem de "registrando..."
    await api.post(`/api/n8n/conversations/${conversationId}/messages`, {
      mensagem: "📝 _Registrando refeição no diário de hoje..._",
      source: "agent_paul",
    });

    const today = new Date().toISOString().split("T")[0];

    // Registrar a refeição
    const response = await api.post(
      `/api/n8n/patients/${pending.patientId}/food-diary`,
      {
        type: pending.mealType,
        date: today,
        foods: pending.alimentos.map((a) => ({
          name: a.nome,
          weight: a.peso,
          calories: a.calorias || 0,
          protein: a.proteinas || 0,
          carbs: a.carboidratos || 0,
          fats: a.gorduras || 0,
        })),
        macros: pending.macrosTotais,
        imageUrl: pending.imageUrl || null,
        conversationId,
        source: "agent_paul",
      },
    );

    console.log(`✅ [Tools] Refeição registrada com sucesso!`);

    // ================================================
    // 📊 BUSCAR PROGRESSO DIÁRIO E METAS
    // ================================================
    let progressMessage = "";
    let evaluationMessage = "";
    
    try {
      // Buscar aderência diária (totais consumidos hoje)
      const adherenceRes = await api.get(
        `/api/n8n/patients/${pending.patientId}/daily-adherence?date=${today}`
      );
      
      // Buscar dieta prescrita do paciente
      const dietRes = await api.get(
        `/api/n8n/patients/${pending.patientId}/diet-plan`
      );
      
      const consumed = adherenceRes.data?.data || adherenceRes.data || {
        protein: pending.macrosTotais?.protein || 0,
        carbs: pending.macrosTotais?.carbs || 0,
        fats: pending.macrosTotais?.fats || 0,
        calories: pending.macrosTotais?.calories || 0,
      };
      
      const dietPlan = dietRes.data?.data || dietRes.data;
      const targets = dietPlan?.macros || {
        protein: dietPlan?.dailyProtein || 150,
        carbs: dietPlan?.dailyCarbs || 200,
        fats: dietPlan?.dailyFats || 60,
        calories: dietPlan?.dailyCalories || dietPlan?.calories || 2000,
      };
      
      console.log(`📊 [Tools] Consumido hoje:`, consumed);
      console.log(`📊 [Tools] Metas:`, targets);
      
      // Gerar barra de progresso
      if (targets.calories > 0) {
        progressMessage = formatDailyProgress(consumed, targets);
        
        // Avaliar se está dentro da meta
        const evaluation = evaluateMealAgainstGoals(consumed, targets, pending.mealType || 'refeição');
        evaluationMessage = evaluation.message;
        
        console.log(`📊 [Tools] Progresso:`, progressMessage);
        console.log(`📊 [Tools] Avaliação:`, evaluationMessage);
      }
    } catch (err) {
      console.log(`⚠️ [Tools] Erro ao buscar progresso diário:`, err.message);
      // Continua sem a barra de progresso
    }

    // Montar mensagem final
    let finalMessage = "✅ *Refeição registrada!*";
    
    if (evaluationMessage) {
      finalMessage += `\n\n${evaluationMessage}`;
    } else {
      finalMessage += " Você está indo muito bem hoje! 🎯";
    }
    
    if (progressMessage) {
      finalMessage += `\n\n${progressMessage}`;
    }

    return {
      success: true,
      status: "registered",
      message: finalMessage,
      data: response.data,
      alimentos: pending.alimentos,
      macrosTotais: pending.macrosTotais,
      progressMessage,
    };
  },

  // ================================================
  // ✨ CANCELAR REFEIÇÃO (descarta a pendente)
  // ================================================
  async cancelar_refeicao({ conversationId }, contexto) {
    console.log(`🗑️ [Tools] Cancelando refeição para ${conversationId}...`);

    const cancelled = cancelPendingMeal(conversationId);

    if (!cancelled) {
      return {
        success: false,
        error: "Nenhuma refeição pendente para cancelar.",
        message: "Não encontrei nenhuma refeição para cancelar.",
      };
    }

    return {
      success: true,
      status: "cancelled",
      message: "🗑️ Ok! Refeição descartada. Quando quiser, envie uma nova foto!",
    };
  },

  // ================================================
  // ✨ CORRIGIR REFEIÇÃO (atualiza a pendente)
  // ================================================
  async corrigir_refeicao(
    { conversationId, acao, alimentoNome, novoPeso, novoAlimento },
    contexto,
  ) {
    console.log(`✏️ [Tools] Corrigindo refeição: ${acao} - ${alimentoNome || "novo"}`);

    const pending = await getPendingMeal(conversationId);

    if (!pending) {
      return {
        success: false,
        error: "Nenhuma refeição pendente para corrigir.",
        message: "Não encontrei nenhuma refeição para corrigir. Envie uma foto da sua refeição!",
      };
    }

    let updated;

    switch (acao) {
      case "atualizar_peso":
        // Encontrar o alimento pelo nome
        const indexAtualizar = pending.alimentos.findIndex(
          (a) => a.nome.toLowerCase().includes(alimentoNome.toLowerCase())
        );

        if (indexAtualizar === -1) {
          return {
            success: false,
            error: `Alimento "${alimentoNome}" não encontrado na refeição.`,
            alimentosDisponiveis: pending.alimentos.map((a) => a.nome),
          };
        }

        // Recalcular macros baseado no novo peso
        const alimentoOriginal = pending.alimentos[indexAtualizar];
        const fatorCorrecao = novoPeso / alimentoOriginal.peso;

        updated = updatePendingMealFood(conversationId, indexAtualizar, {
          peso: novoPeso,
          proteinas: Math.round(alimentoOriginal.proteinas * fatorCorrecao * 10) / 10,
          carboidratos: Math.round(alimentoOriginal.carboidratos * fatorCorrecao * 10) / 10,
          gorduras: Math.round(alimentoOriginal.gorduras * fatorCorrecao * 10) / 10,
          calorias: Math.round(alimentoOriginal.calorias * fatorCorrecao),
        });
        break;

      case "remover":
        const indexRemover = pending.alimentos.findIndex(
          (a) => a.nome.toLowerCase().includes(alimentoNome.toLowerCase())
        );

        if (indexRemover === -1) {
          return {
            success: false,
            error: `Alimento "${alimentoNome}" não encontrado na refeição.`,
            alimentosDisponiveis: pending.alimentos.map((a) => a.nome),
          };
        }

        updated = removePendingMealFood(conversationId, indexRemover);
        break;

      case "adicionar":
        if (!novoAlimento || !novoAlimento.nome) {
          return {
            success: false,
            error: "Dados do novo alimento não informados.",
          };
        }

        updated = addPendingMealFood(conversationId, novoAlimento);
        break;

      case "substituir":
        // Primeiro remove o alimento antigo
        const indexSubstituir = pending.alimentos.findIndex(
          (a) => a.nome.toLowerCase().includes(alimentoNome.toLowerCase())
        );

        if (indexSubstituir === -1) {
          return {
            success: false,
            error: `Alimento "${alimentoNome}" não encontrado na refeição.`,
            alimentosDisponiveis: pending.alimentos.map((a) => a.nome),
          };
        }

        if (!novoAlimento || !novoAlimento.nome) {
          return {
            success: false,
            error: "Dados do novo alimento não informados para substituição.",
          };
        }

        // Remove o antigo e adiciona o novo
        removePendingMealFood(conversationId, indexSubstituir);
        updated = addPendingMealFood(conversationId, novoAlimento);
        
        console.log(`✅ Substituído "${alimentoNome}" por "${novoAlimento.nome}"`);
        break;

      default:
        return {
          success: false,
          error: `Ação desconhecida: ${acao}`,
        };
    }

    if (!updated) {
      return {
        success: false,
        error: "Erro ao atualizar refeição.",
      };
    }

    // Formatar nova mensagem
    const mensagemAtualizada = formatPendingMealMessage(updated);

    return {
      success: true,
      status: "updated",
      message: "✏️ Refeição atualizada! Confirma agora?",
      mensagemConfirmacao: mensagemAtualizada,
      alimentos: updated.alimentos,
      macrosTotais: updated.macrosTotais,
    };
  },

  async enviar_mensagem_whatsapp({ conversationId, mensagem }, contexto) {
    if (!mensagem || mensagem.trim().length === 0) {
      throw new Error("Mensagem não pode estar vazia");
    }

    const validacao = validarEscopo(mensagem);
    if (!validacao.valido) {
      mensagem =
        "Sou especializado em nutrição! Posso te ajudar com suas refeições e dieta. 😊";
    }

    mensagem = sanitizarMensagem(mensagem);

    if (
      contexto?.conversationId &&
      conversationId !== contexto.conversationId
    ) {
      throw new Error("Não autorizado a enviar para outra conversa");
    }

    const response = await api.post(
      `/api/n8n/conversations/${conversationId}/messages`,
      {
        senderId: "agent_paul",
        senderRole: "prescriber",
        content: mensagem,
        type: "text",
        isAiGenerated: true,
      },
    );
    return response.data;
  },

  async buscar_historico_conversa({ conversationId, limite = 10 }, contexto) {
    if (limite > 50) limite = 50;
    if (limite < 1) limite = 10;

    if (
      contexto?.conversationId &&
      conversationId !== contexto.conversationId
    ) {
      throw new Error("Não autorizado a acessar outra conversa");
    }

    const response = await api.get(
      `/api/n8n/conversations/${conversationId}/messages?limit=${limite}`,
    );
    return response.data;
  },

  async buscar_correcoes_aprendidas({ alimento }) {
    const url = alimento
      ? `/api/n8n/food-weight/corrections/${encodeURIComponent(alimento)}`
      : "/api/n8n/food-weight/all-corrections";
    const response = await api.get(url);
    return response.data;
  },

  async salvar_correcao_peso(
    { alimento, pesoEstimado, pesoReal, patientId },
    contexto,
  ) {
    if (pesoEstimado < 1 || pesoEstimado > 5000) {
      throw new Error("Peso estimado fora do intervalo válido (1-5000g)");
    }
    if (pesoReal < 1 || pesoReal > 5000) {
      throw new Error("Peso real fora do intervalo válido (1-5000g)");
    }

    // Salvar no Calibration Studio para aparecer nas sugestões do frontend
    const response = await api.post("/api/n8n/food-calibration/suggestions", {
      foodName: alimento,
      foodType: alimento.toLowerCase().split(' ')[0], // Ex: "Arroz branco" → "arroz"
      aiEstimate: pesoEstimado,
      userCorrection: pesoReal,
      patientId: patientId || contexto?.patientId,
      conversationId: contexto?.conversationId,
    });
    return response.data;
  },

  async buscar_resumo_diario({ patientId, data }, contexto) {
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error("Não autorizado a acessar dados de outro paciente");
    }
    
    // Se não informou data, usa hoje
    const dataConsulta = data || new Date().toISOString().split('T')[0];
    
    const response = await api.get(
      `/api/n8n/patients/${patientId}/meals/summary?date=${dataConsulta}`,
    );
    return response.data;
  },

  async transcrever_audio({ audioUrl }) {
    if (!audioUrl || !audioUrl.startsWith("http")) {
      throw new Error("URL do áudio inválida");
    }

    console.log("🎤 Baixando áudio:", audioUrl);

    // Baixar o arquivo de áudio
    const audioResponse = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    // Criar um File-like object para a API do OpenAI
    const audioBuffer = Buffer.from(audioResponse.data);
    const audioFile = new File([audioBuffer], "audio.ogg", {
      type: "audio/ogg",
    });

    console.log("🎤 Enviando para Whisper...");

    // Transcrever com Whisper
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "pt",
      response_format: "text",
    });

    console.log("✅ Transcrição:", transcription);

    return {
      transcription: transcription,
      audioUrl,
      success: true,
    };
  },

  async buscar_info_restaurante({ restaurante, prato }) {
    const RESTAURANTES = {
      outback: {
        nome: "Outback Steakhouse",
        pratos: [
          {
            nome: "Outback Special (filé)",
            porcao: "300g",
            proteinas: 62,
            carboidratos: 8,
            gorduras: 42,
            calorias: 650,
          },
          {
            nome: "Grilled Salmon",
            porcao: "220g",
            proteinas: 48,
            carboidratos: 5,
            gorduras: 24,
            calorias: 420,
          },
          {
            nome: "Queensland Chicken",
            porcao: "280g",
            proteinas: 52,
            carboidratos: 15,
            gorduras: 35,
            calorias: 580,
          },
          {
            nome: "Caesar Salad",
            porcao: "300g",
            proteinas: 32,
            carboidratos: 18,
            gorduras: 28,
            calorias: 420,
          },
        ],
        dicas: "Evite aperitivos fritos. Peça carnes grelhadas com salada.",
      },
      mcdonalds: {
        nome: "McDonald's",
        pratos: [
          {
            nome: "Big Mac",
            porcao: "1 un",
            proteinas: 25,
            carboidratos: 45,
            gorduras: 30,
            calorias: 550,
          },
          {
            nome: "McChicken",
            porcao: "1 un",
            proteinas: 15,
            carboidratos: 40,
            gorduras: 18,
            calorias: 380,
          },
          {
            nome: "Salada Caesar com Frango",
            porcao: "1 salada",
            proteinas: 25,
            carboidratos: 10,
            gorduras: 8,
            calorias: 210,
          },
        ],
        dicas: "Prefira saladas ou sanduíches grelhados. Evite batata frita.",
      },
      subway: {
        nome: "Subway",
        pratos: [
          {
            nome: "Frango Teriyaki 15cm",
            porcao: "15cm",
            proteinas: 26,
            carboidratos: 50,
            gorduras: 5,
            calorias: 350,
          },
          {
            nome: "Peito de Peru 15cm",
            porcao: "15cm",
            proteinas: 18,
            carboidratos: 45,
            gorduras: 4,
            calorias: 290,
          },
          {
            nome: "Salada Frango",
            porcao: "1 salada",
            proteinas: 22,
            carboidratos: 8,
            gorduras: 4,
            calorias: 160,
          },
        ],
        dicas: "Escolha pão integral, bastante salada, e molhos light.",
      },
      madero: {
        nome: "Madero",
        pratos: [
          {
            nome: "Cheese Burger Madero",
            porcao: "180g",
            proteinas: 38,
            carboidratos: 35,
            gorduras: 40,
            calorias: 650,
          },
          {
            nome: "Filé Mignon Grelhado",
            porcao: "250g",
            proteinas: 55,
            carboidratos: 5,
            gorduras: 25,
            calorias: 450,
          },
          {
            nome: "Salmão Grelhado",
            porcao: "200g",
            proteinas: 42,
            carboidratos: 3,
            gorduras: 22,
            calorias: 380,
          },
        ],
        dicas: "Opte por carnes grelhadas com salada.",
      },
    };

    const restauranteNorm = restaurante.toLowerCase().replace(/[''`\s]/g, "");
    const info = RESTAURANTES[restauranteNorm];

    if (!info) {
      return {
        encontrado: false,
        restaurante,
        dicas:
          "Não tenho informações específicas. Dica geral: prefira proteínas grelhadas e evite frituras.",
      };
    }

    const resposta = { encontrado: true, ...info };

    if (prato && info.pratos) {
      const pratoEncontrado = info.pratos.find((p) =>
        p.nome.toLowerCase().includes(prato.toLowerCase()),
      );
      if (pratoEncontrado) {
        resposta.prato_solicitado = pratoEncontrado;
      }
    }

    return resposta;
  },

  async aplicar_correcao_peso({ foodName, foodType, aiEstimate }) {
    console.log(`🎯 Aplicando correção para: ${foodName} (${aiEstimate}g)`);

    try {
      const response = await api.post("/api/n8n/food-weight/apply-correction", {
        foodName,
        foodType: foodType || foodName.toLowerCase().split(" ")[0],
        aiEstimate,
      });

      const data = response.data;

      if (data.applied && data.corrected !== aiEstimate) {
        console.log(
          `✅ Correção aplicada: ${aiEstimate}g → ${data.corrected}g (fator: ${data.correctionFactor})`,
        );
      } else {
        console.log(`ℹ️ Sem correção necessária para ${foodName}`);
      }

      return data;
    } catch (error) {
      // Se o endpoint não existir ou falhar, retorna o valor original
      console.log(`⚠️ Correção não disponível: ${error.message}`);
      return {
        success: true,
        original: aiEstimate,
        corrected: aiEstimate,
        correctionFactor: 1.0,
        applied: false,
        source: "fallback",
      };
    }
  },

  async buscar_produto_internet({ produto, marca }) {
    console.log(`🌐 Buscando: ${produto}`);

    // Primeiro verifica se já não está no banco local OU Firestore
    const buscaCompleta = await buscarProdutoCompleto(produto);
    if (buscaCompleta.encontrado) {
      console.log(
        `✅ Encontrado (${buscaCompleta.fonte}): ${buscaCompleta.chave}`,
      );
      return {
        encontrado: true,
        fonte: buscaCompleta.fonte,
        produto: buscaCompleta.dados.nome,
        peso: buscaCompleta.dados.peso,
        macros: buscaCompleta.dados.macros,
        observacoes: buscaCompleta.dados.observacoes || "",
        mensagem: `Produto encontrado no ${buscaCompleta.fonte === "firestore" ? "Firebase" : "banco local"}!`,
      };
    }

    // Busca via GPT-4 (que tem conhecimento de produtos brasileiros)
    const prompt = `Você é um nutricionista brasileiro. Busque informações nutricionais PRECISAS do produto:

PRODUTO: ${produto}
${marca ? `MARCA: ${marca}` : ""}

INSTRUÇÕES:
1. Use seu conhecimento sobre produtos alimentícios brasileiros
2. Busque a tabela nutricional por PORÇÃO (não por 100g, a menos que seja a porção padrão)
3. Se for iogurte, considere o pote individual típico (100g, 140g, 170g, etc)
4. Se não tiver certeza dos valores, indique "confianca": "baixa"

Retorne APENAS um JSON:
{
  "encontrado": true/false,
  "produto": "nome completo do produto",
  "marca": "marca",
  "peso": peso_da_porcao_em_gramas,
  "macros": {
    "proteinas": gramas,
    "carboidratos": gramas,
    "gorduras": gramas,
    "calorias": kcal
  },
  "confianca": "alta/media/baixa",
  "fonte": "conhecimento geral / tabela nutricional oficial",
  "observacoes": "ex: zero lactose, light, etc"
}

Se não encontrar informações confiáveis:
{
  "encontrado": false,
  "produto": "${produto}",
  "motivo": "explicação"
}`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: process.env.AGENT_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.2,
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const resultado = JSON.parse(jsonMatch[0]);
        console.log(`🌐 Resultado da busca:`, resultado);
        return resultado;
      }

      return {
        encontrado: false,
        produto,
        motivo: "Não foi possível processar a resposta",
      };
    } catch (error) {
      console.error("❌ Erro na busca:", error.message);
      return { encontrado: false, produto, motivo: error.message };
    }
  },

  async salvar_produto_banco({
    chave,
    nome,
    peso,
    proteinas,
    carboidratos,
    gorduras,
    calorias,
    observacoes,
  }) {
    // Normaliza a chave
    const chaveNorm = chave
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    // Valida os dados
    if (peso <= 0 || peso > 2000) {
      throw new Error("Peso deve ser entre 1 e 2000g");
    }
    if (calorias < 0 || calorias > 2000) {
      throw new Error("Calorias devem ser entre 0 e 2000 kcal");
    }

    const dadosProduto = {
      nome,
      peso,
      macros: {
        proteinas: proteinas || 0,
        carboidratos: carboidratos || 0,
        gorduras: gorduras || 0,
        calorias: calorias || 0,
      },
      observacoes: observacoes || "",
    };

    // 1. Adiciona ao banco em memória (cache rápido)
    BANCO_PRODUTOS_BR[chaveNorm] = {
      ...dadosProduto,
      adicionadoEm: new Date().toISOString(),
      fonte: "busca_internet",
    };

    console.log(`💾 Produto salvo em memória: ${chaveNorm}`);
    console.log(
      `   ${nome} (${peso}g) - P:${proteinas} C:${carboidratos} G:${gorduras} Cal:${calorias}`,
    );

    // 2. Persiste no Firestore (permanente)
    const salvoFirestore = await salvarProdutoFirestore(
      chaveNorm,
      dadosProduto,
    );

    return {
      sucesso: true,
      chave: chaveNorm,
      produto: dadosProduto,
      persistido: salvoFirestore ? "firestore" : "memoria_apenas",
      mensagem: salvoFirestore
        ? `Produto "${nome}" salvo no Firebase! 🔥 Próximas fotos serão reconhecidas automaticamente.`
        : `Produto "${nome}" salvo em memória. (Firebase não disponível)`,
    };
  },

  // ==========================================
  // FERRAMENTAS DE ANÁLISE PENDENTE
  // ==========================================

  async salvar_analise_pendente(
    { conversationId, patientId, mealType, alimentos, macrosTotais, imageUrl },
    contexto
  ) {
    if (!conversationId) {
      conversationId = contexto?.conversationId;
    }
    if (!patientId) {
      patientId = contexto?.patientId;
    }

    if (!conversationId) {
      throw new Error("conversationId é obrigatório");
    }
    if (!alimentos || !Array.isArray(alimentos) || alimentos.length === 0) {
      throw new Error("Lista de alimentos não pode estar vazia");
    }

    // Calcula macros se não foram passados
    if (!macrosTotais) {
      macrosTotais = alimentos.reduce(
        (t, a) => ({
          proteinas: Math.round((t.proteinas + (a.proteinas || 0)) * 10) / 10,
          carboidratos: Math.round((t.carboidratos + (a.carboidratos || 0)) * 10) / 10,
          gorduras: Math.round((t.gorduras + (a.gorduras || 0)) * 10) / 10,
          calorias: Math.round(t.calorias + (a.calorias || 0)),
        }),
        { proteinas: 0, carboidratos: 0, gorduras: 0, calorias: 0 }
      );
    }

    const dados = {
      patientId,
      mealType,
      alimentos,
      macrosTotais,
      imageUrl: imageUrl || null,
    };

    console.log(`📝 Salvando análise pendente para ${conversationId}:`, {
      patientId,
      mealType,
      totalAlimentos: alimentos.length,
    });

    const resultado = await salvarAnalisePendente(conversationId, dados);

    return {
      sucesso: true,
      ...resultado,
      mensagem: "Análise salva! Aguardando confirmação do paciente.",
      dados: {
        mealType,
        totalAlimentos: alimentos.length,
        macrosTotais,
      },
    };
  },

  async buscar_analise_pendente({ conversationId }, contexto) {
    if (!conversationId) {
      conversationId = contexto?.conversationId;
    }

    if (!conversationId) {
      throw new Error("conversationId é obrigatório");
    }

    console.log(`🔍 Buscando análise pendente: ${conversationId}`);

    const dados = await buscarAnalisePendente(conversationId);

    if (!dados) {
      return {
        encontrado: false,
        conversationId,
        mensagem: "Nenhuma análise pendente encontrada. O paciente pode ter enviado uma nova foto ou a análise expirou.",
      };
    }

    return {
      encontrado: true,
      conversationId,
      patientId: dados.patientId,
      mealType: dados.mealType,
      alimentos: dados.alimentos,
      macrosTotais: dados.macrosTotais,
      imageUrl: dados.imageUrl,
      criadoEm: dados.criadoEm,
      mensagem: "Análise pendente recuperada com sucesso!",
    };
  },

  async limpar_analise_pendente({ conversationId }, contexto) {
    if (!conversationId) {
      conversationId = contexto?.conversationId;
    }

    if (!conversationId) {
      throw new Error("conversationId é obrigatório");
    }

    console.log(`🗑️ Limpando análise pendente: ${conversationId}`);

    const resultado = await limparAnalisePendente(conversationId);

    return {
      sucesso: true,
      ...resultado,
      mensagem: "Análise pendente removida.",
    };
  },
};

// ==========================================
// EXECUTOR DE FERRAMENTAS
// ==========================================

async function executeTool(toolName, args, contexto) {
  const implementation = toolImplementations[toolName];

  if (!implementation) {
    throw new Error(`Ferramenta não encontrada: ${toolName}`);
  }

  if (!args.patientId && contexto?.patientId) {
    args.patientId = contexto.patientId;
  }
  if (!args.conversationId && contexto?.conversationId) {
    args.conversationId = contexto.conversationId;
  }

  console.log(`🔧 Executando: ${toolName}`);

  try {
    const resultado = await implementation(args, contexto);
    console.log(`✅ ${toolName} concluído`);
    return resultado;
  } catch (error) {
    console.error(`❌ ${toolName} falhou:`, error.message);
    throw error;
  }
}

module.exports = {
  tools,
  executeTool,
  toolImplementations,
  validarEscopo,
  sanitizarMensagem,
  verificarEscalacao,
  BANCO_PRODUTOS_BR,
};
