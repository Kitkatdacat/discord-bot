'use strict';

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const net    = require('net');
const { exec } = require('child_process');
const config = require('./config.json');

const SERVICES = [
  { label: 'Hub',          port: 3000 },
  { label: 'Calico SFTP',  port: 3001 },
  { label: 'Ticketing',    port: 3005 },
  { label: 'Games',        port: 3003 },
  { label: 'Dev Tools',    port: 3006 },
  { label: 'Karaoke',      port: 3007 },
  { label: 'Kitkat Board', port: 3004 },
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

function isDenverMidnight() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date());
  const hour   = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  return hour === 0 && minute === 0;
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

  // if (text.includes('test')) {  // paused
  //   await message.reply('Running all tests…');
  //   exec('bash -l ~/apps/hub/run-tests.sh', { env: { ...process.env, HOME: process.env.HOME } },
  //     (err, stdout) => {
  //       const result = (stdout && stdout.trim()) || (err ? `❌ Test runner error: \`${err.message}\`` : '(no output)');
  //       message.channel.send(result.slice(0, 1900)).catch(e => console.error('Failed to post results:', e.message));
  //     }
  //   );
  //   return;
  // }
});

// ── Startup ────────────────────────────────────────────────────────────────────

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Test post on startup
  setTimeout(postDailyStatus, 3000);

  // Scheduled midnight Denver post + nightly tests
  let lastPostDate = null;
  setInterval(() => {
    if (!isDenverMidnight()) return;
    const today = new Date().toDateString();
    if (lastPostDate === today) return;
    lastPostDate = today;
    postDailyStatus();
    // exec('bash -l ~/apps/hub/run-tests.sh', { env: { ...process.env, HOME: process.env.HOME } },  // paused
    //   async (err, stdout) => {
    //     const result = (stdout && stdout.trim()) || (err ? `❌ Test runner error: \`${err.message}\`` : '(no output)');
    //     try {
    //       const channel = await client.channels.fetch(config.channelId);
    //       await channel.send(result.slice(0, 1900));
    //     } catch (e) { console.error('Failed to post test results:', e.message); }
    //   }
    // );
  }, 60000);
});

client.login(config.token);
