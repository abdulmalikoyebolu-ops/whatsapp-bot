require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BOT_NAME = process.env.BOT_NAME || 'Vektra AI';
const SYSTEM_PROMPT = `You are a helpful personal AI assistant on WhatsApp called ${BOT_NAME}. Be conversational, concise, and friendly. Keep responses short and readable. No markdown formatting. Use emojis occasionally.`;
const MAX_HISTORY = 20;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const conversations = {};

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'whatsapp-bot' }),
  puppeteer: { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], headless: true },

client.on('qr', (qr) => { qrcode.generate(qr, { small: true }); });
client.on('ready', () => { console.log(`✅ ${BOT_NAME} is online!`); });
client.on('disconnected', () => { process.exit(1); });

client.on('message', async (message) => {
  if (message.isStatus || message.fromMe) return;
  const chatId = message.from;
  if (!conversations[chatId]) conversations[chatId] = [];

  try {
    if (message.type === 'chat') {
      const text = message.body?.trim();
      if (!text) return;
      if (text === '/clear') { conversations[chatId] = []; await message.reply('🗑️ Cleared!'); return; }
      conversations[chatId].push({ role: 'user', parts: [{ text }] });
    } else if (message.type === 'image') {
      const media = await message.downloadMedia();
      const caption = message.body?.trim() || 'Describe this image.';
      conversations[chatId].push({ role: 'user', parts: [{ inlineData: { mimeType: media.mimetype, data: media.data } }, { text: caption }] });
    } else if (message.type === 'ptt' || message.type === 'audio') {
      await message.reply("🎤 Can't process audio yet — type it instead!"); return;
    } else { return; }

    if (conversations[chatId].length > MAX_HISTORY) conversations[chatId] = conversations[chatId].slice(-MAX_HISTORY);

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: SYSTEM_PROMPT });
    const chat = model.startChat({ history: conversations[chatId].slice(0, -1) });
    const last = conversations[chatId][conversations[chatId].length - 1];
    const result = await chat.sendMessage(last.parts);
    const reply = result.response.text();
    conversations[chatId].push({ role: 'model', parts: [{ text: reply }] });
    await message.reply(reply);
  } catch (e) {
    console.error(e.message);
    await message.reply("⚠️ Something went wrong, try again!");
  }
});

client.initialize();
