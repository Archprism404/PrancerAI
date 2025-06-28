# Discord Gemini Persona Bot

## Setup

1. Install dependencies:
   ```sh
   npm install discord.js axios
   ```
2. Set your environment variables (create a `.env` file or set in your system):
   - `DISCORD_TOKEN` = Your Discord bot token
   - `GEMINI_API_TOKEN` = Your Google Gemini Studio API token

3. Start the bot:
   ```sh
   node index.js
   ```

## Commands
- `+persona [persona]` — Set the bot's persona for this channel.
- `+instructions [instructions]` — Set strict instructions for the persona in this channel.
- `+ks` — Power off the bot manually.

The bot will only respond in a channel if both persona and instructions are set. It will strictly follow the persona and instructions, never breaking character.
