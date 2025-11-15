#!/bin/bash
# Render.com build script for Discord Music Bot

echo "Installing system dependencies..."
apt-get update
apt-get install -y ffmpeg

echo "Installing Node.js dependencies..."
npm install

echo "Build complete!"
