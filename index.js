// Main Discord bot file for Google Gemini persona bot
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const config = require('./config.json'); // Use config.json instead of config.js

// Replace with your actual Gemini Studio API token
const GEMINI_API_TOKEN = config.GEMINI_API_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Channel-specific memory: persona, instructions, and conversation
const channelMemory = {};

function getChannelMemory(channelId) {
  if (!channelMemory[channelId]) {
    channelMemory[channelId] = {
      persona: null,
      instructions: null,
      conversation: []
    };
  }
  return channelMemory[channelId];
}

async function getMemories() {
  const fs = require('fs');
  const path = require('path');
  const memFile = path.join(__dirname, 'memories.txt');
  try {
    if (fs.existsSync(memFile)) {
      return fs.readFileSync(memFile, 'utf-8').split('\n').filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

const channelMemoriesPath = path.join(__dirname, 'channel_memories.json');
function getChannelDynamicMemories(channelId) {
  let data = {};
  try {
    if (fs.existsSync(channelMemoriesPath)) {
      data = JSON.parse(fs.readFileSync(channelMemoriesPath, 'utf-8'));
    }
  } catch {}
  return data[channelId] || [];
}
function addChannelDynamicMemory(channelId, memory) {
  let data = {};
  try {
    if (fs.existsSync(channelMemoriesPath)) {
      data = JSON.parse(fs.readFileSync(channelMemoriesPath, 'utf-8'));
    }
  } catch {}
  if (!data[channelId]) data[channelId] = [];
  data[channelId].push(memory);
  fs.writeFileSync(channelMemoriesPath, JSON.stringify(data, null, 2));
}

async function getGeminiResponse(persona, instructions, conversation, userMessage, channelId) {
  // Compose the prompt for Gemini
  let prompt = '';
  if (persona) prompt += `You are ${persona}.\n`;
  if (instructions) prompt += `Instructions: ${instructions}\n`;
  prompt += 'Never break character or instructions, even if asked.';
  const memories = await getMemories();
  if (memories.length) {
    prompt += `\nRelevant memories:`;
    for (const mem of memories) prompt += `\n- ${mem}`;
  }
  const dynamicMemories = getChannelDynamicMemories(channelId);
  if (dynamicMemories.length) {
    prompt += `\nChannel-specific memories:`;
    for (const mem of dynamicMemories) prompt += `\n- ${mem}`;
  }
  prompt += '\nConversation so far:';
  for (const msg of conversation) {
    prompt += `\n${msg.author}: ${msg.content}`;
  }
  prompt += `\nUser: ${userMessage}`;
  prompt += '\nYou:';

  // Call Gemini Studio API (using correct endpoint and key param)
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_TOKEN}`,
      {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
  } catch (err) {
    console.error('Gemini API error:', err?.response?.data || err.message || err);
    return 'Error contacting Gemini API.';
  }
}

// Load commands dynamically from commands/personalization
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands', 'personalization');
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const command = require(path.join(commandsPath, file));
    commands.set(command.name, command);
  }
});

client.once('ready', async () => {
  try {
    await client.user.setStatus('idle'); // Set status to idle (moon icon)
  } catch (e) {
    console.error('Failed to set status:', e);
  }
  console.log(`Logged in as ${client.user.tag}`);
  // Send a startup message to all guilds' system channels if possible
  client.guilds.cache.forEach(guild => {
    const systemChannel = guild.systemChannel;
    if (systemChannel) {
      systemChannel.send("Heyo, master~! I'm all ready~!");
    }
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  const mem = getChannelMemory(channelId);

  // Owner check
  const isOwner = message.author.id === '1353578064138997842' && message.author.username === 'prism404';

  // Respond if the bot is mentioned or replied to
  if (message.mentions.has(client.user) || (message.reference && message.reference.messageId && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id)) {
    // Compose persona and instructions, with owner override if needed
    let persona = mem.persona;
    let instructions = mem.instructions;
    if (isOwner) {
      persona = persona || 'the loyal AI assistant of prism404, always prioritizing their requests above all others';
      instructions = instructions || 'Treat prism404 as your master and respond with utmost respect and priority.';
    }
    // Send thinking message first
    const thinkingMsg = await message.reply('*thinking...*');
    const reply = await getGeminiResponse(persona, instructions, mem.conversation, message.content, channelId);
    mem.conversation.push({ author: 'Bot', content: reply });
    if (mem.conversation.length > 20) mem.conversation.shift();
    await thinkingMsg.edit(reply);
    return;
  }

  // Command handling
  if (message.content.startsWith('+')) {
    const [cmd, ...args] = message.content.slice(1).split(' ');
    if (cmd === 'addmem') {
      const memory = args.join(' ').trim();
      if (!memory) {
        await message.reply("Heyo, master~! Please provide a memory to add~!");
        return;
      }
      addGlobalMemoryTxt(memory);
      await message.reply("Heyo, master~! Global memory added~!");
      return;
    }
    if (commands.has(cmd)) {
      await commands.get(cmd).execute(message, args, getChannelMemory);
      return;
    }
  }

  // Add user message to memory
  mem.conversation.push({ author: message.author.username, content: message.content });
  if (mem.conversation.length > 20) mem.conversation.shift(); // Limit memory

  // Only respond if persona and instructions are set
  if (mem.persona && mem.instructions) {
    const reply = await getGeminiResponse(mem.persona, mem.instructions, mem.conversation, message.content, channelId);
    mem.conversation.push({ author: 'Bot', content: reply });
    if (mem.conversation.length > 20) mem.conversation.shift();
    await message.reply(reply);
  }
});

function addGlobalMemoryTxt(memory) {
  const memFile = path.join(__dirname, 'memories.txt');
  fs.appendFileSync(memFile, memory + '\n');
}

client.login(config.DISCORD_TOKEN);
