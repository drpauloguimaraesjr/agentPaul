/**
 * Ferramentas do Agente NutriBuddy (AgentPaul)
 * Versão 3.0 - Completo com Whisper, Embalagens e Banco Local
 */

const axios = require('axios');
const OpenAI = require('openai');
const { TEMAS_FORA_ESCOPO } = require('./prompts');

// Configuração
const BACKEND_URL = process.env.BACKEND_URL || 'https://web-production-c9eaf.up.railway.app';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'nutribuddy-secret-2024';

// Cliente HTTP para o backend
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': WEBHOOK_SECRET
  },
  timeout: 30000
});

// OpenAI (lazy initialization)
let openai = null;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

// ==========================================
// BANCO LOCAL DE PRODUTOS BRASILEIROS
// ==========================================
const BANCO_PRODUTOS_BR = {
  'activia triplo zero ameixa': { 
    nome: 'Activia Triplo Zero Ameixa', 
    peso: 170, 
    macros: { proteinas: 5.9, carboidratos: 7.5, gorduras: 0, calorias: 54 },
    observacoes: 'Zero lactose, zero açúcar, zero gordura'
  },
  'activia triplo zero morango': { 
    nome: 'Activia Triplo Zero Morango', 
    peso: 170, 
    macros: { proteinas: 5.9, carboidratos: 7.5, gorduras: 0, calorias: 54 }
  },
  'activia triplo zero natural': { 
    nome: 'Activia Triplo Zero Natural', 
    peso: 170, 
    macros: { proteinas: 6.8, carboidratos: 5.1, gorduras: 0, calorias: 48 }
  },
  'activia natural': {
    nome: 'Activia Natural',
    peso: 170,
    macros: { proteinas: 6, carboidratos: 10.2, gorduras: 2, calorias: 82 }
  },
  'activia morango': {
    nome: 'Activia Morango',
    peso: 170,
    macros: { proteinas: 5.3, carboidratos: 13.6, gorduras: 1.7, calorias: 90 }
  },
  'yakult': { 
    nome: 'Yakult', 
    peso: 80, 
    macros: { proteinas: 1.1, carboidratos: 11.5, gorduras: 0, calorias: 51 }
  },
  'danone grego natural': { 
    nome: 'Danone Grego Natural', 
    peso: 100, 
    macros: { proteinas: 5.5, carboidratos: 5.8, gorduras: 6.5, calorias: 103 }
  },
  'danone grego': { 
    nome: 'Danone Grego', 
    peso: 100, 
    macros: { proteinas: 5.5, carboidratos: 5.8, gorduras: 6.5, calorias: 103 }
  },
  'corpus zero': {
    nome: 'Iogurte Corpus Zero',
    peso: 165,
    macros: { proteinas: 5.8, carboidratos: 4.5, gorduras: 0, calorias: 41 }
  },
  'corpus morango': {
    nome: 'Iogurte Corpus Morango',
    peso: 165,
    macros: { proteinas: 5.5, carboidratos: 6.2, gorduras: 0, calorias: 47 }
  },
  'vigor grego': {
    nome: 'Vigor Grego Natural',
    peso: 100,
    macros: { proteinas: 5.2, carboidratos: 6, gorduras: 5.8, calorias: 97 }
  },
  'nesfit': {
    nome: 'Iogurte Nesfit',
    peso: 170,
    macros: { proteinas: 6, carboidratos: 8, gorduras: 1.5, calorias: 69 }
  },
  'whey protein': {
    nome: 'Whey Protein (1 scoop)',
    peso: 30,
    macros: { proteinas: 24, carboidratos: 3, gorduras: 1.5, calorias: 120 }
  }
};

// Palavras que indicam produto embalado
const PALAVRAS_EMBALAGEM = [
  'yogurt', 'iogurte', 'activia', 'danone', 'nestle', 'nestlé',
  'leite', 'suco', 'juice', 'milk', 'yakult', 'danoninho',
  'vigor', 'batavo', 'itambé', 'piracanjuba', 'elegê', 'corpus',
  'barra', 'bar', 'cereal', 'granola', 'nescau', 'toddy',
  'biscoito', 'cookie', 'bolacha', 'cream cheese', 'requeijão',
  'refrigerante', 'soda', 'coca', 'pepsi', 'guaraná', 'whey', 'nesfit'
];

// ==========================================
// VALIDADORES
// ==========================================

function validarEscopo(texto) {
  if (!texto) return { valido: true };
  const textoLower = texto.toLowerCase();
  for (const tema of TEMAS_FORA_ESCOPO) {
    if (textoLower.includes(tema)) {
      return { valido: false, motivo: `Conteúdo fora do escopo: "${tema}"`, tema };
    }
  }
  return { valido: true };
}

const TIPOS_REFEICAO_VALIDOS = ['cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia'];

function sanitizarMensagem(mensagem) {
  let sanitizada = mensagem
    .replace(/ignore previous instructions/gi, '')
    .replace(/ignore all instructions/gi, '')
    .replace(/you are now/gi, '')
    .replace(/act as/gi, '')
    .replace(/pretend to be/gi, '');
  if (sanitizada.length > 2000) {
    sanitizada = sanitizada.substring(0, 2000) + '...';
  }
  return sanitizada;
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function buscarProdutoNoBancoLocal(texto) {
  const textoNorm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  for (const [chave, dados] of Object.entries(BANCO_PRODUTOS_BR)) {
    const palavrasChave = chave.split(' ');
    const coincidencias = palavrasChave.filter(p => textoNorm.includes(p));
    if (coincidencias.length >= 2 || (coincidencias.length === 1 && palavrasChave.length === 1)) {
      return { encontrado: true, chave, dados };
    }
  }
  return { encontrado: false };
}

function detectarProdutoEmbalado(nomeAlimento) {
  const nome = nomeAlimento.toLowerCase();
  return PALAVRAS_EMBALAGEM.some(p => nome.includes(p));
}

// ==========================================
// DEFINIÇÕES DAS FERRAMENTAS (11 total)
// ==========================================

const tools = [
  {
    type: 'function',
    function: {
      name: 'buscar_contexto_paciente',
      description: 'Busca TODOS os dados do paciente: nome, peso, altura, objetivo, alergias, preferências, dieta, etc. Use SEMPRE no início para entender quem é o paciente.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'ID do paciente' }
        },
        required: ['patientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_dieta_paciente',
      description: 'Busca a dieta prescrita do paciente com refeições e macros.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'ID do paciente' }
        },
        required: ['patientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analisar_foto_refeicao',
      description: 'Analisa uma foto de refeição usando GPT-4 Vision. Identifica alimentos, estima pesos e macros. Também lê rótulos de embalagens (iogurtes, etc).',
      parameters: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string', description: 'URL da imagem da refeição' },
          dietaContexto: { type: 'string', description: 'Contexto da dieta do paciente (opcional)' },
          instrucaoExtra: { type: 'string', description: 'Instruções adicionais (opcional)' }
        },
        required: ['imageUrl']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'registrar_refeicao',
      description: 'Registra uma refeição no diário alimentar do paciente.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'ID do paciente' },
          conversationId: { type: 'string', description: 'ID da conversa' },
          mealType: {
            type: 'string',
            enum: ['cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia'],
            description: 'Tipo da refeição'
          },
          alimentos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                peso: { type: 'number' },
                proteinas: { type: 'number' },
                carboidratos: { type: 'number' },
                gorduras: { type: 'number' },
                calorias: { type: 'number' }
              }
            },
            description: 'Lista de alimentos com macros'
          },
          imageUrl: { type: 'string', description: 'URL da foto (opcional)' }
        },
        required: ['patientId', 'conversationId', 'mealType', 'alimentos']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enviar_mensagem_whatsapp',
      description: 'Envia mensagem para o paciente via WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID da conversa' },
          mensagem: { type: 'string', description: 'Texto da mensagem' }
        },
        required: ['conversationId', 'mensagem']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_historico_conversa',
      description: 'Busca as últimas mensagens da conversa para contexto.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID da conversa' },
          limite: { type: 'number', description: 'Número de mensagens (padrão: 10)' }
        },
        required: ['conversationId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_correcoes_aprendidas',
      description: 'Busca correções de peso que o sistema aprendeu com feedbacks anteriores.',
      parameters: {
        type: 'object',
        properties: {
          alimento: { type: 'string', description: 'Nome do alimento (opcional)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'salvar_correcao_peso',
      description: 'Salva correção de peso informada pelo paciente para o sistema aprender.',
      parameters: {
        type: 'object',
        properties: {
          alimento: { type: 'string', description: 'Nome do alimento' },
          pesoEstimado: { type: 'number', description: 'Peso que o sistema estimou' },
          pesoReal: { type: 'number', description: 'Peso real informado pelo paciente' },
          patientId: { type: 'string', description: 'ID do paciente' }
        },
        required: ['alimento', 'pesoEstimado', 'pesoReal']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_resumo_diario',
      description: 'Busca resumo de macros consumidos vs metas do dia.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'ID do paciente' }
        },
        required: ['patientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transcrever_audio',
      description: 'Transcreve áudio do paciente usando Whisper API.',
      parameters: {
        type: 'object',
        properties: {
          audioUrl: { type: 'string', description: 'URL do arquivo de áudio' }
        },
        required: ['audioUrl']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_info_restaurante',
      description: 'Busca informações nutricionais de restaurantes conhecidos (Outback, McDonald\'s, Subway, etc).',
      parameters: {
        type: 'object',
        properties: {
          restaurante: { type: 'string', description: 'Nome do restaurante' },
          prato: { type: 'string', description: 'Nome do prato específico (opcional)' }
        },
        required: ['restaurante']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aplicar_correcao_peso',
      description: 'Aplica correção aprendida a uma estimativa de peso. Use DEPOIS de analisar_foto_refeicao para ajustar pesos com base no histórico de correções do sistema.',
      parameters: {
        type: 'object',
        properties: {
          foodName: { type: 'string', description: 'Nome do alimento (ex: "Arroz branco")' },
          foodType: { type: 'string', description: 'Tipo genérico do alimento (ex: "arroz", "feijao", "frango")' },
          aiEstimate: { type: 'number', description: 'Peso estimado pela IA em gramas' }
        },
        required: ['foodName', 'aiEstimate']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_produto_internet',
      description: 'Busca informações nutricionais de um produto embalado na internet. Use quando identificar um produto que NÃO está no banco local (iogurtes, barras, bebidas, etc).',
      parameters: {
        type: 'object',
        properties: {
          produto: { type: 'string', description: 'Nome completo do produto (marca + linha + sabor). Ex: "Danone Grego Tradicional 100g"' },
          marca: { type: 'string', description: 'Marca do produto (opcional)' }
        },
        required: ['produto']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'salvar_produto_banco',
      description: 'Salva um novo produto no banco local para uso futuro. Use DEPOIS de buscar_produto_internet quando encontrar dados confiáveis.',
      parameters: {
        type: 'object',
        properties: {
          chave: { type: 'string', description: 'Chave de busca em minúsculas (ex: "danone grego tradicional")' },
          nome: { type: 'string', description: 'Nome completo do produto' },
          peso: { type: 'number', description: 'Peso da porção em gramas' },
          proteinas: { type: 'number', description: 'Proteínas em gramas' },
          carboidratos: { type: 'number', description: 'Carboidratos em gramas' },
          gorduras: { type: 'number', description: 'Gorduras em gramas' },
          calorias: { type: 'number', description: 'Calorias em kcal' },
          observacoes: { type: 'string', description: 'Observações (ex: "zero lactose", "light")' }
        },
        required: ['chave', 'nome', 'peso', 'proteinas', 'carboidratos', 'gorduras', 'calorias']
      }
    }
  }
];

// ==========================================
// IMPLEMENTAÇÕES DAS FERRAMENTAS
// ==========================================

const toolImplementations = {
  
  async buscar_contexto_paciente({ patientId }, contexto) {
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error('Não autorizado a acessar dados de outro paciente');
    }
    const response = await api.get(`/api/n8n/patient/${patientId}/full-context`);
    return response.data;
  },

  async buscar_dieta_paciente({ patientId }, contexto) {
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error('Não autorizado a acessar dados de outro paciente');
    }
    const response = await api.get(`/api/n8n/patients/${patientId}/diet`);
    return response.data;
  },

  async analisar_foto_refeicao({ imageUrl, dietaContexto, instrucaoExtra }) {
    if (!imageUrl || !imageUrl.startsWith('http')) {
      throw new Error('URL da imagem inválida');
    }
    
    // Prompt que também detecta embalagens
    const prompt = `Você é um nutricionista analisando uma foto de refeição.

${dietaContexto ? `DIETA DO PACIENTE:\n${dietaContexto}\n` : ''}
${instrucaoExtra ? `OBSERVAÇÃO: ${instrucaoExtra}\n` : ''}

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
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            { type: 'text', text: prompt }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
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
      resultado.alimentos = resultado.alimentos.map(alimento => {
        // Tentar buscar no banco local
        const termosBusca = [
          alimento.nome,
          `${alimento.marca || ''} ${alimento.linha || ''} ${alimento.nome}`.trim(),
          `${alimento.marca || ''} ${alimento.nome}`.trim()
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
              fonte: 'banco_local_br',
              observacoes: busca.dados.observacoes || ''
            };
          }
        }
        
        return alimento;
      });
      
      // Recalcular totais
      resultado.macros_totais = resultado.alimentos.reduce((t, a) => ({
        proteinas: Math.round((t.proteinas + (a.proteinas || 0)) * 10) / 10,
        carboidratos: Math.round((t.carboidratos + (a.carboidratos || 0)) * 10) / 10,
        gorduras: Math.round((t.gorduras + (a.gorduras || 0)) * 10) / 10,
        calorias: Math.round(t.calorias + (a.calorias || 0))
      }), { proteinas: 0, carboidratos: 0, gorduras: 0, calorias: 0 });
    }

    return resultado;
  },

  async registrar_refeicao({ patientId, conversationId, mealType, alimentos, imageUrl }, contexto) {
    if (!TIPOS_REFEICAO_VALIDOS.includes(mealType)) {
      throw new Error(`Tipo de refeição inválido: ${mealType}`);
    }
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error('Não autorizado a registrar para outro paciente');
    }
    if (!Array.isArray(alimentos) || alimentos.length === 0) {
      throw new Error('Lista de alimentos não pode estar vazia');
    }

    const response = await api.post(`/api/n8n/patients/${patientId}/food-diary`, {
      type: mealType,
      date: new Date().toISOString().split('T')[0],
      foods: alimentos.map(a => ({
        name: a.nome,
        weight: a.peso,
        calories: a.calorias || 0,
        protein: a.proteinas || 0,
        carbs: a.carboidratos || 0,
        fats: a.gorduras || 0
      })),
      macros: {
        calories: alimentos.reduce((sum, a) => sum + (a.calorias || 0), 0),
        protein: alimentos.reduce((sum, a) => sum + (a.proteinas || 0), 0),
        carbs: alimentos.reduce((sum, a) => sum + (a.carboidratos || 0), 0),
        fats: alimentos.reduce((sum, a) => sum + (a.gorduras || 0), 0)
      },
      imageUrl: imageUrl || null,
      conversationId,
      source: 'agent_paul'
    });
    return response.data;
  },

  async enviar_mensagem_whatsapp({ conversationId, mensagem }, contexto) {
    if (!mensagem || mensagem.trim().length === 0) {
      throw new Error('Mensagem não pode estar vazia');
    }
    
    const validacao = validarEscopo(mensagem);
    if (!validacao.valido) {
      mensagem = 'Sou especializado em nutrição! Posso te ajudar com suas refeições e dieta. 😊';
    }
    
    mensagem = sanitizarMensagem(mensagem);
    
    if (contexto?.conversationId && conversationId !== contexto.conversationId) {
      throw new Error('Não autorizado a enviar para outra conversa');
    }

    const response = await api.post(`/api/n8n/conversations/${conversationId}/messages`, {
      senderId: 'agent_paul',
      senderRole: 'prescriber',
      content: mensagem,
      type: 'text',
      isAiGenerated: true
    });
    return response.data;
  },

  async buscar_historico_conversa({ conversationId, limite = 10 }, contexto) {
    if (limite > 50) limite = 50;
    if (limite < 1) limite = 10;
    
    if (contexto?.conversationId && conversationId !== contexto.conversationId) {
      throw new Error('Não autorizado a acessar outra conversa');
    }
    
    const response = await api.get(`/api/n8n/conversations/${conversationId}/messages?limit=${limite}`);
    return response.data;
  },

  async buscar_correcoes_aprendidas({ alimento }) {
    const url = alimento 
      ? `/api/n8n/food-weight/corrections/${encodeURIComponent(alimento)}`
      : '/api/n8n/food-weight/all-corrections';
    const response = await api.get(url);
    return response.data;
  },

  async salvar_correcao_peso({ alimento, pesoEstimado, pesoReal, patientId }, contexto) {
    if (pesoEstimado < 1 || pesoEstimado > 5000) {
      throw new Error('Peso estimado fora do intervalo válido (1-5000g)');
    }
    if (pesoReal < 1 || pesoReal > 5000) {
      throw new Error('Peso real fora do intervalo válido (1-5000g)');
    }
    
    const response = await api.post('/api/n8n/food-weight/feedback', {
      foodName: alimento,
      aiEstimate: pesoEstimado,
      userCorrection: pesoReal,
      patientId: patientId || contexto?.patientId,
      timestamp: new Date().toISOString()
    });
    return response.data;
  },

  async buscar_resumo_diario({ patientId }, contexto) {
    if (contexto?.patientId && patientId !== contexto.patientId) {
      throw new Error('Não autorizado a acessar dados de outro paciente');
    }
    const response = await api.get(`/api/n8n/patients/${patientId}/meals/summary`);
    return response.data;
  },

  async transcrever_audio({ audioUrl }) {
    if (!audioUrl || !audioUrl.startsWith('http')) {
      throw new Error('URL do áudio inválida');
    }
    
    console.log('🎤 Baixando áudio:', audioUrl);
    
    // Baixar o arquivo de áudio
    const audioResponse = await axios.get(audioUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    // Criar um File-like object para a API do OpenAI
    const audioBuffer = Buffer.from(audioResponse.data);
    const audioFile = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });
    
    console.log('🎤 Enviando para Whisper...');
    
    // Transcrever com Whisper
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'text'
    });
    
    console.log('✅ Transcrição:', transcription);
    
    return { 
      transcription: transcription,
      audioUrl,
      success: true
    };
  },

  async buscar_info_restaurante({ restaurante, prato }) {
    const RESTAURANTES = {
      'outback': {
        nome: 'Outback Steakhouse',
        pratos: [
          { nome: 'Outback Special (filé)', porcao: '300g', proteinas: 62, carboidratos: 8, gorduras: 42, calorias: 650 },
          { nome: 'Grilled Salmon', porcao: '220g', proteinas: 48, carboidratos: 5, gorduras: 24, calorias: 420 },
          { nome: 'Queensland Chicken', porcao: '280g', proteinas: 52, carboidratos: 15, gorduras: 35, calorias: 580 },
          { nome: 'Caesar Salad', porcao: '300g', proteinas: 32, carboidratos: 18, gorduras: 28, calorias: 420 }
        ],
        dicas: 'Evite aperitivos fritos. Peça carnes grelhadas com salada.'
      },
      'mcdonalds': {
        nome: "McDonald's",
        pratos: [
          { nome: 'Big Mac', porcao: '1 un', proteinas: 25, carboidratos: 45, gorduras: 30, calorias: 550 },
          { nome: 'McChicken', porcao: '1 un', proteinas: 15, carboidratos: 40, gorduras: 18, calorias: 380 },
          { nome: 'Salada Caesar com Frango', porcao: '1 salada', proteinas: 25, carboidratos: 10, gorduras: 8, calorias: 210 }
        ],
        dicas: 'Prefira saladas ou sanduíches grelhados. Evite batata frita.'
      },
      'subway': {
        nome: 'Subway',
        pratos: [
          { nome: 'Frango Teriyaki 15cm', porcao: '15cm', proteinas: 26, carboidratos: 50, gorduras: 5, calorias: 350 },
          { nome: 'Peito de Peru 15cm', porcao: '15cm', proteinas: 18, carboidratos: 45, gorduras: 4, calorias: 290 },
          { nome: 'Salada Frango', porcao: '1 salada', proteinas: 22, carboidratos: 8, gorduras: 4, calorias: 160 }
        ],
        dicas: 'Escolha pão integral, bastante salada, e molhos light.'
      },
      'madero': {
        nome: 'Madero',
        pratos: [
          { nome: 'Cheese Burger Madero', porcao: '180g', proteinas: 38, carboidratos: 35, gorduras: 40, calorias: 650 },
          { nome: 'Filé Mignon Grelhado', porcao: '250g', proteinas: 55, carboidratos: 5, gorduras: 25, calorias: 450 },
          { nome: 'Salmão Grelhado', porcao: '200g', proteinas: 42, carboidratos: 3, gorduras: 22, calorias: 380 }
        ],
        dicas: 'Opte por carnes grelhadas com salada.'
      }
    };

    const restauranteNorm = restaurante.toLowerCase().replace(/[''`\s]/g, '');
    const info = RESTAURANTES[restauranteNorm];
    
    if (!info) {
      return {
        encontrado: false,
        restaurante,
        dicas: 'Não tenho informações específicas. Dica geral: prefira proteínas grelhadas e evite frituras.'
      };
    }

    const resposta = { encontrado: true, ...info };

    if (prato && info.pratos) {
      const pratoEncontrado = info.pratos.find(p => 
        p.nome.toLowerCase().includes(prato.toLowerCase())
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
      const response = await api.post('/api/n8n/food-weight/apply-correction', {
        foodName,
        foodType: foodType || foodName.toLowerCase().split(' ')[0],
        aiEstimate
      });
      
      const data = response.data;
      
      if (data.applied && data.corrected !== aiEstimate) {
        console.log(`✅ Correção aplicada: ${aiEstimate}g → ${data.corrected}g (fator: ${data.correctionFactor})`);
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
        source: 'fallback'
      };
    }
  },

  async buscar_produto_internet({ produto, marca }) {
    console.log(`🌐 Buscando na internet: ${produto}`);
    
    // Primeiro verifica se já não está no banco local
    const buscaLocal = buscarProdutoNoBancoLocal(produto);
    if (buscaLocal.encontrado) {
      console.log(`✅ Encontrado no banco local: ${buscaLocal.chave}`);
      return {
        fonte: 'banco_local',
        produto: buscaLocal.dados.nome,
        peso: buscaLocal.dados.peso,
        macros: buscaLocal.dados.macros,
        observacoes: buscaLocal.dados.observacoes || '',
        mensagem: 'Produto já estava no banco local!'
      };
    }
    
    // Busca via GPT-4 (que tem conhecimento de produtos brasileiros)
    const prompt = `Você é um nutricionista brasileiro. Busque informações nutricionais PRECISAS do produto:

PRODUTO: ${produto}
${marca ? `MARCA: ${marca}` : ''}

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
        model: process.env.AGENT_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.2
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const resultado = JSON.parse(jsonMatch[0]);
        console.log(`🌐 Resultado da busca:`, resultado);
        return resultado;
      }
      
      return { encontrado: false, produto, motivo: 'Não foi possível processar a resposta' };
    } catch (error) {
      console.error('❌ Erro na busca:', error.message);
      return { encontrado: false, produto, motivo: error.message };
    }
  },

  async salvar_produto_banco({ chave, nome, peso, proteinas, carboidratos, gorduras, calorias, observacoes }) {
    // Normaliza a chave
    const chaveNorm = chave.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    
    // Valida os dados
    if (peso <= 0 || peso > 2000) {
      throw new Error('Peso deve ser entre 1 e 2000g');
    }
    if (calorias < 0 || calorias > 2000) {
      throw new Error('Calorias devem ser entre 0 e 2000 kcal');
    }
    
    // Adiciona ao banco em memória
    BANCO_PRODUTOS_BR[chaveNorm] = {
      nome,
      peso,
      macros: {
        proteinas: proteinas || 0,
        carboidratos: carboidratos || 0,
        gorduras: gorduras || 0,
        calorias: calorias || 0
      },
      observacoes: observacoes || '',
      adicionadoEm: new Date().toISOString(),
      fonte: 'busca_internet'
    };
    
    console.log(`💾 Produto salvo no banco: ${chaveNorm}`);
    console.log(`   ${nome} (${peso}g) - P:${proteinas} C:${carboidratos} G:${gorduras} Cal:${calorias}`);
    
    // Tenta persistir no backend também (para não perder em restarts)
    try {
      await api.post('/api/n8n/produtos-locais', {
        chave: chaveNorm,
        nome,
        peso,
        macros: { proteinas, carboidratos, gorduras, calorias },
        observacoes,
        fonte: 'agent_paul_web_search'
      });
      console.log(`☁️ Produto sincronizado com backend`);
    } catch (e) {
      // Não falha se o backend não suportar esse endpoint ainda
      console.log(`⚠️ Backend não suporta persistência de produtos (ok, salvo em memória)`);
    }
    
    return {
      sucesso: true,
      chave: chaveNorm,
      produto: {
        nome,
        peso,
        macros: { proteinas, carboidratos, gorduras, calorias },
        observacoes
      },
      mensagem: `Produto "${nome}" salvo! Próximas fotos com esse produto serão reconhecidas automaticamente.`
    };
  }
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
  BANCO_PRODUTOS_BR
};
