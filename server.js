import express from 'express';
import axios from 'axios';
import Papa from 'papaparse';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Busca os dados da planilha de forma flexível e imune a erros de formatação
async function buscarCardapioGoogleSheets() {
  try {
    const url = process.env.GOOGLE_SHEET_URL;
    if (!url) {
      console.error('Erro: A variável GOOGLE_SHEET_URL não foi configurada.');
      return [];
    }

    const response = await axios.get(url);
    const parsedData = Papa.parse(response.data, { 
      header: true, 
      skipEmptyLines: true,
      transformHeader: h => h.trim() // Remove espaços antes/depois do nome das colunas
    });
    
    // Filtra os itens ignorando se 'disponivel' está com maiúscula/minúscula ou com espaços
    return parsedData.data.filter(item => {
      const chaveDisponivel = Object.keys(item).find(
        k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'disponivel'
      );
      
      if (!chaveDisponivel) return false;
      
      const valor = String(item[chaveDisponivel]).trim().toLowerCase();
      return valor === 'sim';
    });
  } catch (error) {
    console.error('Erro ao ler a planilha:', error.message);
    return [];
  }
}

// Rota de teste no navegador
app.get('/', async (req, res) => {
  const cardapio = await buscarCardapioGoogleSheets();
  res.json({ status: 'Servidor no ar!', total_itens: cardapio.length, cardapio });
});

// 2. Validação do Webhook (Exigido pela Meta)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 3. Recebe a mensagem do cliente, consulta a planilha e responde via Gemini
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];

    if (message && message.type === 'text') {
      const clienteTelefone = message.from;
      const textoCliente = message.text.body;

      const cardapio = await buscarCardapioGoogleSheets();

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const promptSystem = `
Você é o atendente virtual da pizzaria Rapidex no WhatsApp.
Cardápio em tempo real extraído da planilha:
${JSON.stringify(cardapio, null, 2)}

Regras de Atendimento:
1. Responda de forma amigável, ágil e curta.
2. Diga APENAS preços e sabores que constem na lista acima.
3. Se um item não estiver na lista ou indisponível, informe educadamente.
4. Se o cliente pedir humano, diga que está transferindo a conversa.
`;

      const result = await model.generateContent([promptSystem, `Cliente: ${textoCliente}`]);
      const respostaIA = result.response.text();

      await axios.post(
        `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: clienteTelefone,
          text: { body: respostaIA }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }
  } catch (error) {
    console.error('Erro ao processar mensagem:', error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
