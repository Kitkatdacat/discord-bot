'use strict';

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const net    = require('net');
const { exec } = require('child_process');
const config = require('./config.json');

const SERVICES = [
  { label: 'Hub',          port: 3000 },
  { label: 'Calico SFTP',  port: 3001 },
  { label: 'Games',        port: 3003 },
  { label: 'Kitkat Board', port: 3004 },
  { label: 'Ticketing',    port: 3005 },
  { label: 'Dev Tools',    port: 3006 },
  { label: 'Karaoke',      port: 3007 },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function checkPort(port) {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(800);
    s.once('connect', () => { s.destroy(); resolve(true); })
     .once('timeout',  () => { s.destroy(); resolve(false); })
     .once('error',    () => { s.destroy(); resolve(false); })
     .connect(port, '127.0.0.1');
  });
}

async function buildStatusEmbed() {
  const statuses = await Promise.all(SERVICES.map(async s => ({
    ...s,
    online: await checkPort(s.port),
  })));
  const allOnline = statuses.every(s => s.online);
  const embed = new EmbedBuilder()
    .setTitle('Server Status')
    .setColor(allOnline ? 0x57F287 : 0xED4245)
    .setTimestamp();
  for (const s of statuses) {
    embed.addFields({ name: s.label, value: s.online ? '🟢 Online' : '🔴 Offline', inline: true });
  }
  return embed;
}

async function postDailyStatus() {
  try {
    const channel = await client.channels.fetch(config.channelId);
    const embed = await buildStatusEmbed();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to post daily status:', err.message);
  }
}

function msTillDenverMidnight() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(now);
  const h = parseInt(parts.find(p => p.type === 'hour').value);
  const m = parseInt(parts.find(p => p.type === 'minute').value);
  const s = parseInt(parts.find(p => p.type === 'second').value);
  const msElapsedToday = ((h * 60 + m) * 60 + s) * 1000 + (now.getTime() % 1000);
  return 24 * 60 * 60 * 1000 - msElapsedToday;
}

function scheduleMidnightPost() {
  setTimeout(() => {
    postDailyStatus();
    scheduleMidnightPost();
  }, msTillDenverMidnight());
}

// ── On-demand check ────────────────────────────────────────────────────────────

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;
  const text = message.content.toLowerCase();

  if (text.includes('check')) {
    const embed = await buildStatusEmbed();
    await message.reply({ embeds: [embed] });
    return;
  }

  await message.reply("Here's what I can do:\n\u2022 `@bot check` \u2014 post a live service status report");
});

// ── Startup ────────────────────────────────────────────────────────────────────

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Test post on startup
  setTimeout(postDailyStatus, 3000);

  // Schedule daily midnight Denver post
  scheduleMidnightPost();
});

client.login(config.token);
