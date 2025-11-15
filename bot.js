/*
 * Discord Music Bot - Single File Implementation
 * 
 * SETUP INSTRUCTIONS:
 * 1. Get your Discord Bot Token from https://discord.com/developers/applications
 * 2. Create a new application, go to "Bot" section
 * 3. Enable these Privileged Gateway Intents:
 *    - SERVER MEMBERS INTENT
 *    - MESSAGE CONTENT INTENT
 * 4. Set the DISCORD_BOT_TOKEN environment secret in Replit
 * 5. Invite the bot to your server with these permissions:
 *    - Send Messages
 *    - Embed Links
 *    - Connect (Voice)
 *    - Speak (Voice)
 *    - Use Voice Activity
 * 
 * COMMANDS (prefix: %)
 * - %play <song name or link> - Play a song or add to queue
 * - %skip - Skip current song
 * - %stop - Stop playback and clear queue
 * - %pause - Pause current song
 * - %resume - Resume playback
 * - %queue - Show current queue
 * - %nowplaying - Show current song with progress
 * - %loop - Toggle loop mode (off/track/queue)
 * - %help - Show all commands
 * - %setactivity <text> - Set bot status (Admin only)
 */

const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  PermissionFlagsBits,
  ActivityType 
} = require('discord.js');

const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection
} = require('@discordjs/voice');

const play = require('play-dl');
const express = require('express');

// Configuration
const PREFIX = '%';
const IDLE_TIMEOUT = 300000; // 5 minutes of inactivity before leaving
const MAX_RETRIES = 2; // Max retries for failed playback
const PORT = 5000; // Express server port

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Per-guild music queue storage
// Structure: { guildId: { queue: [], player: AudioPlayer, connection: VoiceConnection, ... } }
const queues = new Map();

// Loop modes: 0 = off, 1 = track, 2 = queue
const LoopMode = {
  OFF: 0,
  TRACK: 1,
  QUEUE: 2
};

/**
 * Get or create queue data for a guild
 */
function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      queue: [],
      player: createAudioPlayer(),
      connection: null,
      currentTrack: null,
      isPlaying: false,
      loopMode: LoopMode.OFF,
      idleTimeout: null,
      textChannel: null,
      retryCount: 0
    });
  }
  return queues.get(guildId);
}

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Create progress bar for now playing
 */
function createProgressBar(current, total, length = 20) {
  if (!total || total === 0) return '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
  const progress = Math.min(current / total, 1);
  const filledLength = Math.round(length * progress);
  const emptyLength = length - filledLength;
  return '▬'.repeat(filledLength) + '🔘' + '▬'.repeat(Math.max(0, emptyLength - 1));
}

/**
 * Clear idle timeout for a guild
 */
function clearIdleTimeout(guildId) {
  const queue = queues.get(guildId);
  if (queue && queue.idleTimeout) {
    clearTimeout(queue.idleTimeout);
    queue.idleTimeout = null;
  }
}

/**
 * Set idle timeout - disconnect if no activity
 */
function setIdleTimeout(guildId) {
  clearIdleTimeout(guildId);
  const queue = queues.get(guildId);
  if (!queue) return;
  
  queue.idleTimeout = setTimeout(() => {
    if (queue.connection) {
      queue.connection.destroy();
      queues.delete(guildId);
    }
  }, IDLE_TIMEOUT);
}

/**
 * Play the next track in queue
 */
async function playNextTrack(guildId) {
  const queue = getQueue(guildId);
  
  // Check if queue is empty
  if (queue.queue.length === 0) {
    queue.currentTrack = null;
    queue.isPlaying = false;
    setIdleTimeout(guildId);
    return;
  }
  
  clearIdleTimeout(guildId);
  
  // Get next track based on loop mode
  let track;
  if (queue.loopMode === LoopMode.TRACK && queue.currentTrack) {
    track = queue.currentTrack;
  } else {
    track = queue.queue.shift();
    if (queue.loopMode === LoopMode.QUEUE) {
      queue.queue.push(track);
    }
  }
  
  queue.currentTrack = track;
  queue.isPlaying = true;
  queue.retryCount = 0;
  
  try {
    // Get audio stream from YouTube
    console.log(`[Playback] Fetching stream for: ${track.title}`);
    const stream = await play.stream(track.url);
    
    console.log(`[Playback] Stream type: ${stream.type}`);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });
    
    // Play the track
    console.log(`[Playback] Starting playback...`);
    queue.player.play(resource);
    
    console.log(`[Playback] Player status: ${queue.player.state.status}`);
    
    // Send "Now Playing" embed
    if (queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎵 Now Playing')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: 'Duration', value: formatDuration(track.duration), inline: true },
          { name: 'Requested by', value: track.requestedBy, inline: true }
        )
        .setThumbnail(track.thumbnail)
        .setFooter({ text: `Loop: ${['Off', 'Track', 'Queue'][queue.loopMode]} | ${queue.queue.length} in queue` })
        .setTimestamp();
      
      await queue.textChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Playback error:', error);
    
    // Retry logic
    if (queue.retryCount < MAX_RETRIES) {
      queue.retryCount++;
      setTimeout(() => playNextTrack(guildId), 1000);
      return;
    }
    
    // Send error message
    if (queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Playback Error')
        .setDescription(`Failed to play **${track.title}**\nSkipping to next track...`)
        .setTimestamp();
      
      await queue.textChannel.send({ embeds: [embed] });
    }
    
    // Skip to next track
    setTimeout(() => playNextTrack(guildId), 500);
  }
}

/**
 * Search YouTube or validate URL
 */
async function searchYouTube(query) {
  try {
    // Check if it's a valid YouTube URL
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
      const info = await play.video_info(query);
      return {
        title: info.video_details.title,
        url: info.video_details.url,
        duration: info.video_details.durationInSec,
        thumbnail: info.video_details.thumbnails[0]?.url || null
      };
    }
    
    // Search YouTube
    const results = await play.search(query, { limit: 1 });
    if (results.length === 0) {
      return null;
    }
    
    const video = results[0];
    return {
      title: video.title,
      url: video.url,
      duration: video.durationInSec,
      thumbnail: video.thumbnails[0]?.url || null
    };
  } catch (error) {
    console.error('YouTube search error:', error);
    
    // Check for rate limiting (429 error)
    if (error.message && error.message.includes('429')) {
      console.error('⚠️ YouTube rate limit hit! Consider using YouTube cookies for authentication.');
    }
    
    return null;
  }
}

/**
 * Check if user has required permissions
 */
function hasPermission(member, permission) {
  return member.permissions.has(permission);
}

/**
 * Command: %play
 */
async function commandPlay(message, args) {
  const guildId = message.guild.id;
  const queue = getQueue(guildId);
  
  // Check if user is in voice channel
  if (!message.member.voice.channel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You need to join a voice channel first!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  // Check if query provided
  if (args.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ No Song Specified')
      .setDescription('Usage: `%play <song name or YouTube link>`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  const query = args.join(' ');
  
  // Send searching message
  const searchEmbed = new EmbedBuilder()
    .setColor('#FFFF00')
    .setDescription('🔍 Searching...')
    .setTimestamp();
  const searchMsg = await message.reply({ embeds: [searchEmbed] });
  
  // Search YouTube
  const videoInfo = await searchYouTube(query);
  
  if (!videoInfo) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Not Found')
      .setDescription('No results found for your search.')
      .setTimestamp();
    return searchMsg.edit({ embeds: [embed] });
  }
  
  // Add track to queue
  const track = {
    ...videoInfo,
    requestedBy: message.author.tag
  };
  
  queue.queue.push(track);
  queue.textChannel = message.channel;
  
  // Join voice channel if not connected
  if (!queue.connection) {
    const voiceChannel = message.member.voice.channel;
    
    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(message.guild.members.me);
    if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Missing Permissions')
        .setDescription('I need **Connect** and **Speak** permissions in that voice channel!')
        .setTimestamp();
      return searchMsg.edit({ embeds: [embed] });
    }
    
    // Create voice connection
    queue.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: message.guild.voiceAdapterCreator
    });
    
    queue.connection.subscribe(queue.player);
    
    // Handle connection errors
    queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(queue.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(queue.connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (error) {
        queue.connection.destroy();
        queues.delete(guildId);
      }
    });
    
    // Handle player events
    queue.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[Player] Went idle, loop mode: ${queue.loopMode}`);
      if (queue.loopMode !== LoopMode.TRACK) {
        playNextTrack(guildId);
      } else {
        setTimeout(() => playNextTrack(guildId), 100);
      }
    });
    
    queue.player.on('error', error => {
      console.error('❌ [Audio Player Error]:', error);
      console.error('Error details:', error.message);
      console.error('Error resource:', error.resource?.metadata);
      playNextTrack(guildId);
    });
    
    queue.player.on('stateChange', (oldState, newState) => {
      console.log(`[Player] State: ${oldState.status} -> ${newState.status}`);
    });
  }
  
  // Update search message
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle(queue.isPlaying ? '📝 Added to Queue' : '🎵 Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Duration', value: formatDuration(track.duration), inline: true },
      { name: 'Position', value: `#${queue.queue.length + (queue.isPlaying ? 1 : 0)}`, inline: true },
      { name: 'Requested by', value: track.requestedBy, inline: true }
    )
    .setThumbnail(track.thumbnail)
    .setFooter({ text: `${queue.queue.length} songs in queue` })
    .setTimestamp();
  
  await searchMsg.edit({ embeds: [embed] });
  
  // Start playing if not already playing
  if (!queue.isPlaying) {
    playNextTrack(guildId);
  }
}

/**
 * Command: %skip
 */
async function commandSkip(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!message.member.voice.channel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You need to be in a voice channel to skip!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (!queue || !queue.isPlaying) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Nothing Playing')
      .setDescription('There is no song currently playing.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  const skippedTrack = queue.currentTrack;
  
  // Temporarily disable track loop for skip
  const wasLooping = queue.loopMode === LoopMode.TRACK;
  if (wasLooping) {
    queue.loopMode = LoopMode.OFF;
  }
  
  queue.player.stop();
  
  // Restore loop mode
  if (wasLooping) {
    queue.loopMode = LoopMode.TRACK;
  }
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('⏭️ Skipped')
    .setDescription(`**${skippedTrack.title}**`)
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %stop
 */
async function commandStop(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!message.member.voice.channel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You need to be in a voice channel to stop playback!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (!queue || !queue.connection) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Nothing Playing')
      .setDescription('There is nothing to stop.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  // Clear queue and stop
  queue.queue = [];
  queue.currentTrack = null;
  queue.isPlaying = false;
  queue.player.stop();
  queue.connection.destroy();
  clearIdleTimeout(guildId);
  queues.delete(guildId);
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('⏹️ Stopped')
    .setDescription('Playback stopped and queue cleared.')
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %pause
 */
async function commandPause(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!message.member.voice.channel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You need to be in a voice channel!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (!queue || !queue.isPlaying) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Nothing Playing')
      .setDescription('There is no song currently playing.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (queue.player.state.status === AudioPlayerStatus.Paused) {
    const embed = new EmbedBuilder()
      .setColor('#FFFF00')
      .setTitle('⚠️ Already Paused')
      .setDescription('Playback is already paused.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  queue.player.pause();
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('⏸️ Paused')
    .setDescription(`**${queue.currentTrack.title}**`)
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %resume
 */
async function commandResume(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!message.member.voice.channel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Not in Voice Channel')
      .setDescription('You need to be in a voice channel!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (!queue || !queue.currentTrack) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Nothing to Resume')
      .setDescription('There is no song to resume.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (queue.player.state.status !== AudioPlayerStatus.Paused) {
    const embed = new EmbedBuilder()
      .setColor('#FFFF00')
      .setTitle('⚠️ Not Paused')
      .setDescription('Playback is not paused.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  queue.player.unpause();
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('▶️ Resumed')
    .setDescription(`**${queue.currentTrack.title}**`)
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %queue
 */
async function commandQueue(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Empty Queue')
      .setDescription('The queue is empty. Add songs with `%play <song>`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('📜 Music Queue')
    .setTimestamp();
  
  // Current track
  if (queue.currentTrack) {
    const isPaused = queue.player.state.status === AudioPlayerStatus.Paused;
    embed.addFields({
      name: `${isPaused ? '⏸️' : '🎵'} Now Playing`,
      value: `**[${queue.currentTrack.title}](${queue.currentTrack.url})**\n` +
             `Duration: ${formatDuration(queue.currentTrack.duration)} | ` +
             `Requested by: ${queue.currentTrack.requestedBy}`
    });
  }
  
  // Queue
  if (queue.queue.length > 0) {
    const queueList = queue.queue.slice(0, 10).map((track, index) => {
      return `**${index + 1}.** [${track.title}](${track.url})\n` +
             `Duration: ${formatDuration(track.duration)} | Requested by: ${track.requestedBy}`;
    }).join('\n\n');
    
    embed.addFields({
      name: `Up Next (${queue.queue.length} songs)`,
      value: queueList
    });
    
    if (queue.queue.length > 10) {
      embed.setFooter({ text: `And ${queue.queue.length - 10} more...` });
    }
  }
  
  embed.addFields({
    name: 'Settings',
    value: `Loop: **${['Off', 'Track', 'Queue'][queue.loopMode]}**`
  });
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %nowplaying
 */
async function commandNowPlaying(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!queue || !queue.currentTrack) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Nothing Playing')
      .setDescription('There is no song currently playing.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  const track = queue.currentTrack;
  const isPaused = queue.player.state.status === AudioPlayerStatus.Paused;
  
  // Estimate current position (approximation)
  const resource = queue.player.state.resource;
  const currentSeconds = resource ? Math.floor(resource.playbackDuration / 1000) : 0;
  const progressBar = createProgressBar(currentSeconds, track.duration);
  
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle(`${isPaused ? '⏸️' : '🎵'} Now Playing`)
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { 
        name: 'Progress', 
        value: `${progressBar}\n${formatDuration(currentSeconds)} / ${formatDuration(track.duration)}`,
        inline: false
      },
      { name: 'Requested by', value: track.requestedBy, inline: true },
      { name: 'Loop Mode', value: ['Off', 'Track', 'Queue'][queue.loopMode], inline: true }
    )
    .setThumbnail(track.thumbnail)
    .setFooter({ text: `${queue.queue.length} songs in queue` })
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %loop
 */
async function commandLoop(message) {
  const guildId = message.guild.id;
  const queue = queues.get(guildId);
  
  if (!queue || !queue.currentTrack) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Nothing Playing')
      .setDescription('Start playing a song first!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  // Cycle through loop modes: Off -> Track -> Queue -> Off
  queue.loopMode = (queue.loopMode + 1) % 3;
  
  const modes = ['Off ❌', 'Track 🔂', 'Queue 🔁'];
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🔁 Loop Mode Changed')
    .setDescription(`Loop mode is now: **${modes[queue.loopMode]}**`)
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %help
 */
async function commandHelp(message) {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('🎵 Music Bot Commands')
    .setDescription('Play music from YouTube with ease!')
    .addFields(
      { 
        name: '🎶 Music Commands', 
        value: '`%play <song>` - Play a song or add to queue\n' +
               '`%skip` - Skip the current song\n' +
               '`%stop` - Stop playback and clear queue\n' +
               '`%pause` - Pause current song\n' +
               '`%resume` - Resume playback\n' +
               '`%queue` - Show current queue\n' +
               '`%nowplaying` - Show current song with progress\n' +
               '`%loop` - Toggle loop mode (Off/Track/Queue)'
      },
      { 
        name: '⚙️ Other Commands', 
        value: '`%help` - Show this help message\n' +
               '`%setactivity <text>` - Set bot status (Admin only)'
      }
    )
    .setFooter({ text: 'Prefix: %' })
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

/**
 * Command: %setactivity (Admin only)
 */
async function commandSetActivity(message, args) {
  // Check admin permission
  if (!hasPermission(message.member, PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Permission Denied')
      .setDescription('Only administrators can use this command.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  if (args.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ No Activity Text')
      .setDescription('Usage: `%setactivity <text>`\nExample: `%setactivity Listening to %help`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }
  
  const activityText = args.join(' ').slice(0, 128); // Limit to 128 chars
  
  try {
    await client.user.setActivity(activityText, { type: ActivityType.Playing });
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Activity Updated')
      .setDescription(`Bot activity set to: **${activityText}**`)
      .setTimestamp();
    
    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Set activity error:', error);
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Error')
      .setDescription('Failed to update bot activity.')
      .setTimestamp();
    
    message.reply({ embeds: [embed] });
  }
}

// Bot ready event
client.on('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎵 Music bot is ready!`);
  console.log(`📝 Serving ${client.guilds.cache.size} guilds`);
  
  // Set default activity
  client.user.setActivity('music | %help', { type: ActivityType.Listening });
  
  // Verify play-dl is ready
  try {
    console.log('🔧 Initializing YouTube streaming...');
    // Test play-dl setup
    const testSearch = await play.search('test', { limit: 1 });
    console.log('✅ YouTube streaming ready!');
  } catch (error) {
    console.error('⚠️ Warning: YouTube streaming may have issues:', error.message);
  }
});

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bots and non-prefixed messages
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  
  // Parse command and arguments
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  
  // Route commands
  try {
    switch (command) {
      case 'play':
      case 'p':
        await commandPlay(message, args);
        break;
      case 'skip':
      case 's':
        await commandSkip(message);
        break;
      case 'stop':
        await commandStop(message);
        break;
      case 'pause':
        await commandPause(message);
        break;
      case 'resume':
      case 'r':
        await commandResume(message);
        break;
      case 'queue':
      case 'q':
        await commandQueue(message);
        break;
      case 'nowplaying':
      case 'np':
        await commandNowPlaying(message);
        break;
      case 'loop':
      case 'l':
        await commandLoop(message);
        break;
      case 'help':
      case 'h':
        await commandHelp(message);
        break;
      case 'setactivity':
        await commandSetActivity(message, args);
        break;
      default:
        // Unknown command - silently ignore or send help
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Error')
      .setDescription('An error occurred while executing the command.')
      .setTimestamp();
    
    message.reply({ embeds: [embed] }).catch(console.error);
  }
});

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Express web server setup
const app = express();

// Home page - Bot status
app.get('/', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const status = {
    botName: client.user ? client.user.tag : 'Not logged in',
    status: client.user ? 'Online' : 'Offline',
    servers: client.guilds ? client.guilds.cache.size : 0,
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    prefix: PREFIX,
    activeQueues: queues.size
  };
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Discord Music Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 600px;
          width: 100%;
        }
        h1 {
          color: #5865F2;
          margin-bottom: 10px;
          font-size: 2em;
        }
        .status {
          display: inline-block;
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 0.9em;
          font-weight: 600;
          margin-bottom: 30px;
        }
        .status.online { background: #43b581; color: white; }
        .status.offline { background: #f04747; color: white; }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .info-card {
          background: #f7f7f7;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
        }
        .info-card h3 {
          color: #666;
          font-size: 0.9em;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .info-card p {
          color: #333;
          font-size: 1.5em;
          font-weight: 600;
        }
        .commands {
          background: #f7f7f7;
          padding: 20px;
          border-radius: 10px;
          margin-top: 20px;
        }
        .commands h2 {
          color: #333;
          margin-bottom: 15px;
          font-size: 1.2em;
        }
        .command {
          background: white;
          padding: 10px 15px;
          border-radius: 5px;
          margin-bottom: 8px;
          font-family: 'Courier New', monospace;
          color: #5865F2;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #666;
          font-size: 0.9em;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎵 Discord Music Bot</h1>
        <div class="status ${status.status.toLowerCase()}">${status.status}</div>
        
        <div class="info-grid">
          <div class="info-card">
            <h3>Bot Name</h3>
            <p>${status.botName}</p>
          </div>
          <div class="info-card">
            <h3>Servers</h3>
            <p>${status.servers}</p>
          </div>
          <div class="info-card">
            <h3>Uptime</h3>
            <p>${status.uptime}</p>
          </div>
          <div class="info-card">
            <h3>Active Queues</h3>
            <p>${status.activeQueues}</p>
          </div>
        </div>
        
        <div class="commands">
          <h2>Quick Commands</h2>
          <div class="command">${PREFIX}play &lt;song&gt; - Play music</div>
          <div class="command">${PREFIX}queue - Show queue</div>
          <div class="command">${PREFIX}skip - Skip song</div>
          <div class="command">${PREFIX}help - All commands</div>
        </div>
        
        <div class="footer">
          Music bot powered by Discord.js • Prefix: ${PREFIX}
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    bot: client.user ? client.user.tag : null
  });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Login
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error('❌ ERROR: DISCORD_BOT_TOKEN environment variable is not set!');
  console.error('Please set your Discord bot token in the Replit Secrets.');
  process.exit(1);
}

client.login(token).catch(error => {
  console.error('❌ Failed to login:', error);
  process.exit(1);
});
