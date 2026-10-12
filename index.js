const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('WhatsApp AI Bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Web Server listening on port ${PORT}`);
});

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('انقطع الاتصال، جاري المحاولة مجدداً...');
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✓ تم الاتصال بواتساب بنجاح وهو جاهز للرد الآن!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    try {
      const prompt = `أنت مساعد شخصي ترد بالنيابة عن صاحب الرقم بلطف واختصار باللغة العربية. رسالة الطرف الآخر: "${text}"`;
      const result = await model.generateContent(prompt);
      const replyText = result.response.text();

      await sock.sendMessage(from, { text: replyText });
    } catch (err) {
      console.error('خطأ:', err.message);
    }
  });
}

startBot();
