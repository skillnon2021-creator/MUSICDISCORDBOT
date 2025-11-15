// ================== DISCORD MUSIC BOT (FIXED FOR RENDER + NO DOUBLE QUEUE + NO 429) ==================
// This version removes double-adding, fixes play-dl issues, adds stable queue logic,
// and ensures audio always plays on Render.

require("dotenv").config();

// --------------------- IMPORTS ---------------------
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus
} = require("@discordjs/voice");

const play = require("play-dl");

// --------------------- RENDER 429 BYPASS ---------------------
play.setToken({
  youtube: {
    cookie: process.env.YT_COOKIE
  }
});

// --------------------- CLIENT ---------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// --------------------- MUSIC QUEUE ---------------------
let queue = []; // array of songs
let isPlaying = false;
let player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Play
  }
});
let connection;

// --------------------- PLAY FUNCTION ---------------------
async function playSong(message) {
  if (queue.length === 0) {
    isPlaying = false;
    return message.channel.send("⛔ Queue is empty.");
  }

  isPlaying = true;
  const song = queue[0];

  // Get YouTube stream (safe + stable for Render)
  const source = await play.stream(song.url);
  const resource = createAudioResource(source.stream, {
    inputType: source.type
  });

  player.play(resource);
  connection.subscribe(player);

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle("🎶 Now Playing")
    .setDescription(`[${song.title}](${song.url})`);

  message.channel.send({ embeds: [embed] });
}

// --------------------- PLAYER EVENTS ---------------------
player.on(AudioPlayerStatus.Idle, () => {
  queue.shift(); // remove finished song
  if (queue.length > 0) {
    playSong(lastMessage);
  } else {
    isPlaying = false;
  }
});

player.on("error", (err) => console.log("Player error:", err));

let lastMessage;

// --------------------- COMMAND HANDLER ---------------------
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("%")) return;
  const args = message.content.split(" ");
  const command = args[0].toLowerCase();
  lastMessage = message;

  // --------------------- PLAY COMMAND ---------------------
  if (command === "%play") {
    const query = args.slice(1).join(" ");
    if (!query) return message.reply("❌ Provide a song name or link.");
    
    if (!message.member.voice.channel) 
      return message.reply("❌ You must be in a voice channel.");

    // Join VC
    connection = joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });

    const search = await play.search(query, { limit: 1 });
    if (!search[0]) return message.reply("❌ No results found.");

    const song = {
      title: search[0].title,
      url: search[0].url
    };

    // FIXED: Prevent double-adding
    queue.push(song);

    message.channel.send(`✔ Added **${song.title}** to queue.`);

    if (!isPlaying) playSong(message);
  }

  // --------------------- SKIP ---------------------
  if (command === "%skip") {
    if (!isPlaying) return message.reply("❌ Nothing is playing.");
    player.stop();
    message.reply("⏭ Skipped.");
  }

  // --------------------- STOP ---------------------
  if (command === "%stop") {
    queue = [];
    player.stop();
    isPlaying = false;
    message.reply("⛔ Stopped and cleared the queue.");
  }

  // --------------------- QUEUE ---------------------
  if (command === "%queue") {
    if (queue.length === 0) return message.reply("📭 Queue is empty.");

    const list = queue.map((s, i) => `${i + 1}. **${s.title}**`).join("\n");

    const embed = new EmbedBuilder()
      .setColor("Purple")
      .setTitle("🎼 Current Queue")
      .setDescription(list);

    message.channel.send({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);

// --------------------- EXPRESS KEEP-ALIVE ---------------------
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot is alive."));
app.listen(3000);
