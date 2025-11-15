# Discord Music Bot

A fully-featured Discord music bot focused on playing music from YouTube with a clean, modern interface.

## Overview

This is a production-ready Discord music bot implemented in a single file (`bot.js`). It supports YouTube playback with search capabilities, queue management, loop modes, and admin controls.

## Features

### Music Commands (Prefix: %)
- `%play <song name or link>` - Play a song from YouTube or add it to the queue
- `%skip` - Skip the current song
- `%stop` - Stop playback and clear the queue
- `%pause` - Pause the current song
- `%resume` - Resume paused playback
- `%queue` - Display the current queue with metadata
- `%nowplaying` - Show the currently playing song with a progress bar
- `%loop` - Toggle loop mode (Off → Track → Queue → Off)
- `%help` - Display all available commands

### Admin Commands
- `%setactivity <text>` - Set the bot's activity status (Administrator permission required)

### Key Features
- **Reliable YouTube Playback**: Uses play-dl library for stable streaming
- **Per-Guild Queues**: Each server has its own independent queue
- **Modern Embeds**: All responses use professional, clean embed designs
- **Error Handling**: Automatic retry logic and graceful error recovery
- **No Duplicate Messages**: Single response per user action
- **Idle Timeout**: Automatically disconnects after 5 minutes of inactivity
- **Loop Modes**: Support for track looping and queue looping
- **Permission Checks**: Validates user and bot permissions before actions

## Setup Instructions

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section
4. Click "Add Bot"
5. Under "Privileged Gateway Intents", enable:
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT**
6. Copy your bot token (you'll need this for step 2)

### 2. Set Bot Token in Replit

1. In Replit, go to the "Secrets" tab (lock icon in the left sidebar)
2. Create a new secret:
   - Key: `DISCORD_BOT_TOKEN`
   - Value: (paste your bot token from step 1)

### 3. Invite Bot to Your Server

Use this URL template (replace `YOUR_CLIENT_ID` with your Application ID from the Developer Portal):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=36703232&scope=bot
```

Required Permissions:
- Send Messages
- Embed Links
- Connect (Voice)
- Speak (Voice)
- Use Voice Activity

### 4. Run the Bot

Click the "Run" button in Replit. The bot will start and you should see:
```
✅ Logged in as YourBotName#1234
🎵 Music bot is ready!
📝 Serving X guilds
```

## Project Structure

```
discord-music-bot/
├── bot.js              # Main bot file (all functionality in one file)
├── package.json        # Node.js dependencies
├── replit.md          # This documentation
└── .gitignore         # Git ignore rules
```

## Technical Details

### Dependencies
- **discord.js** - Discord API wrapper
- **@discordjs/voice** - Voice connection handling
- **play-dl** - YouTube streaming and search
- **ffmpeg-static** - Audio processing
- **opusscript** - Audio encoding

### Architecture
- Single-file implementation as requested
- In-memory per-guild queue storage
- Event-driven audio playback
- Automatic error recovery with retry logic

## Recent Changes

- **2025-11-15**: Initial bot creation with all core features
  - Implemented all music commands with % prefix
  - Added YouTube search and URL support
  - Created per-guild queue management system
  - Added loop modes (track and queue)
  - Implemented admin-only setactivity command
  - Added comprehensive error handling
  - Created modern embed-based UI

## User Preferences

None specified yet.

## Troubleshooting

### Bot doesn't respond to commands
- Make sure MESSAGE CONTENT INTENT is enabled in the Developer Portal
- Verify the bot has "Send Messages" and "Embed Links" permissions in your server
- Check that you're using the correct prefix (`%`)

### Bot can't play music
- Ensure the bot has "Connect" and "Speak" permissions in your voice channels
- Make sure you're in a voice channel when using `%play`
- Check that ffmpeg-static is properly installed

### Bot disconnects unexpectedly
- The bot automatically disconnects after 5 minutes of inactivity to save resources
- This is normal behavior - just use `%play` to reconnect

## Support

For issues with the bot code, check the Replit console logs for error messages. Common issues:
- Missing DISCORD_BOT_TOKEN secret
- Insufficient permissions
- YouTube rate limiting (handled automatically with retries)
