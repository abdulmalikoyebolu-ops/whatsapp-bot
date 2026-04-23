require('dotenv').config();
var Client = require('whatsapp-web.js').Client;
var LocalAuth = require('whatsapp-web.js').LocalAuth;
var qrcode = require('qrcode-terminal');
var GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;

var GEMINI_API_KEY = process.env.GEMINI_API_KEY;
var BOT_NAME = process.env.BOT_NAME || 'Vektra AI';
var SYSTEM_PROMPT = 'You are a helpful personal AI assistant on WhatsApp. Be conversational, concise and friendly. Keep responses short. No markdown formatting. Use emojis occasionally.';
var MAX_HISTORY = 20;

var genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
var conversations = {};

var client = new Client({
  authStrategy: new LocalAuth({ clientId: 'whatsapp-bot' }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true
  }
});

client.on('qr', function(qr) {
  qrcode.generate(qr, { small: true });
  console.log('QR code generated - scan it!');
});

client.on('ready', function() {
  console.log('Bot is online!');
});

client.on('disconnected', function() {
  process.exit(1);
});

client.on('message', async function(message) {
  if (message.isStatus || message.fromMe) return;
  var chatId = message.from;
  if (!conversations[chatId]) conversations[chatId] = [];

  try {
    if (message.type === 'chat') {
      var text = message.body ? message.body.trim() : '';
      if (!text) return;
      if (text === '/clear') {
        conversations[chatId] = [];
        await message.reply('History cleared!');
        return;
      }
      conversations[chatId].push({ role: 'user', parts: [{ text: text }] });
    } else if (message.type === 'ptt' || message.type === 'audio') {
      await message.reply('I cannot process audio yet — type it instead!');
      return;
    } else {
      return;
    }

    if (conversations[chatId].length > MAX_HISTORY) {
      conversations[chatId] = conversations[chatId].slice(-MAX_HISTORY);
    }

    var model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: SYSTEM_PROMPT });
    var chat = model.startChat({ history: conversations[chatId].slice(0, -1) });
    var last = conversations[chatId][conversations[chatId].length - 1];
    var result = await chat.sendMessage(last.parts);
    var reply = result.response.text();
    conversations[chatId].push({ role: 'model', parts: [{ text: reply }] });
    await message.reply(reply);
  } catch (e) {
    console.error(e.message);
    await message.reply('Something went wrong, try again!');
  }
});

client.initialize();
