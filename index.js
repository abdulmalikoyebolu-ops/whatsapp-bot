require('dotenv').config();
var Client = require('whatsapp-web.js').Client;
var NoAuth = require('whatsapp-web.js').NoAuth;
var QRCode = require('qrcode');
var http = require('http');
var GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;

var GEMINI_API_KEY = process.env.GEMINI_API_KEY;
var SYSTEM_PROMPT = 'You are a helpful personal AI assistant on WhatsApp. Be conversational, concise and friendly. Keep responses short. No markdown formatting. Use emojis occasionally.';
var MAX_HISTORY = 20;
var latestQR = null;
var isConnected = false;

var genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
var conversations = {};

var client = new Client({
  authStrategy: new NoAuth(),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true
  },
  webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
});

client.on('qr', function(qr) {
  latestQR = qr;
  isConnected = false;
  console.log('QR code ready!');
});

client.on('ready', function() {
  latestQR = null;
  isConnected = true;
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
      if (text === '/clear') { conversations[chatId] = []; await message.reply('Cleared!'); return; }
      conversations[chatId].push({ role: 'user', parts: [{ text: text }] });
    } else if (message.type === 'ptt' || message.type === 'audio') {
      await message.reply('Cannot process audio yet — type instead!'); return;
    } else { return; }
    if (conversations[chatId].length > MAX_HISTORY) conversations[chatId] = conversations[chatId].slice(-MAX_HISTORY);
    var model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction: SYSTEM_PROMPT });
    var chat = model.startChat({ history: conversations[chatId].slice(0, -1) });
    var last = conversations[chatId][conversations[chatId].length - 1];
    var result = await chat.sendMessage(last.parts);
    var reply = result.response.text();
    conversations[chatId].push({ role: 'model', parts: [{ text: reply }] });
    await message.reply(reply);
  } catch (e) {
    console.error(e.message);
    await message.reply('Something went wrong!');
  }
});

var server = http.createServer(function(req, res) {
  if (isConnected) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('<html><body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif"><h2>✅ Bot is connected!</h2></body></html>');
  } else if (latestQR) {
    QRCode.toDataURL(latestQR, function(err, url) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end('<html><body style="background:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;color:#fff"><h2>Scan with WhatsApp</h2><img src="' + url + '" style="width:300px;height:300px"/><p>Open WhatsApp → Linked Devices → Link a Device</p></body></html>');
    });
  } else {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('<html><body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif"><h2>⏳ Starting up, refresh in 30 seconds...</h2></body></html>');
  }
});

server.listen(process.env.PORT || 3000, '0.0.0.0', function() {
  console.log('Server running!');
  client.initialize();
});
