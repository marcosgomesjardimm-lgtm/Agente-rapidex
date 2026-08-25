import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '0110';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Aceita GOOGLE_SHEET_URL ou SPREADSHEET_URL ou SHEET_URL
const SPREADSHEET_URL = process.env.GOOGLE_SHEET_URL || process.env.SPREADSHEET_URL || process.env.SHEET_URL;

// 1. Rota de verificação do Webhook (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WEBHOOK VERIFICADO COM SUCESSO!');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ FALHA NA VERIFICAÇÃO: Token incorreto.');
      return res.sendStatus(403);
    }
  }
  res.send('Servidor do Bot está ativo!');
});

// 2. Rota de recebimento de mensagens (POST)
app.post('/webhook', async (req, res) => {
  console.log('📬 REQUISIÇÃO RECEBIDA NO WEBHOOK:');
  console.log(JSON.stringify(req.body, null, 2));

  // Responde status 200 imediatamente para a Meta
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      const from = message.from; // Número de quem enviou
      const text = message.text?.body; // Conteúdo do texto

      console.log(`📩 Mensagem recebida de ${from}: "${text}"`);

      if (text) {
        // Responde o cliente confirmando o recebimento
        await enviarMensagemWhatsApp(from, `Recebi sua mensagem: "${text}". Estamos processando seu pedido!`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem do Webhook:', error.message);
  }
});

// Função auxiliar para enviar mensagem de volta ao cliente via Meta API
async function enviarMensagemWhatsApp(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error('❌ ERRO: WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurados nas variáveis do Render!');
    return;
  }

  try {
    await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      }
    });
    console.log(`🚀 Resposta enviada com sucesso para ${to}`);
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem pelo WhatsApp:', err.response?.data || err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`URL da Planilha configurada: ${SPREADSHEET_URL ? 'OK' : 'NÃO CONFIGURADA'}`);
});
