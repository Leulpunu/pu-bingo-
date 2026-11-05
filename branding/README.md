# PU Bingo brand avatar

Created with the built-in image-generation tool. The selected image is used in the web header, browser favicon, and Apple touch icon. A JPEG copy is packaged for the Telegram bot profile API.

Files: `public/pu-bingo-avatar.png` and `public/pu-bingo-telegram.jpg`.

Final generation prompt:

> Use case: logo-brand. Create one polished square 1024x1024 brand avatar for the existing PU Bingo Telegram Mini App and website. Dark forest green background #101b17, bright lime #d4f579, matching a modern friendly bingo game. Central bold highly legible uppercase PU monogram in a lime bingo-ball emblem, with a small clean BINGO wordmark below it. Exact text: "PU" and "BINGO" only. A subtle bingo-card dot motif can support the emblem. Strong simple silhouette, tasteful soft dimensional shading, crisp professional edges, high contrast at small sizes. Keep all important content within the central 70% so it survives circular Telegram cropping. Fill entire square with dark forest background. No mockup, no collage, no border around the canvas, no other text, no watermark.

To set the configured bot's avatar, run `node --env-file=.env scripts/set-bot-avatar.mjs`. This updates the bot's profile photo using Telegram's official API and verifies that a profile photo is present. Never print or commit bot credentials.
