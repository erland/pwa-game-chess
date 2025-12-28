# Training packs

This folder contains built-in training packs bundled with the app.

## What’s included

- **Basic Starter Pack** (`basic-training-pack.json`) – small smoke-test pack.
- **Core Lessons Pack** (`core_lessons.json`) – concept curriculum (openings, tactics, endgames).
- **Core Tactics Pack** (`core_tactics.json`) – foundational tactical patterns (mates, promotion, winning hanging pieces).
- **Core Openings Pack** (`core_openings.json`) – essential opening lines you can drill as White or Black (toggle drill color in the UI).
- **Core Endgames Pack** (`core_endgames.json`) – essential endgame goals (mate, promote, stalemate awareness).

`index.json` lists the packs that the app should load.

## Growing this into a “complete” suite (recommended)

A truly complete tactics curriculum usually means **thousands** of puzzles.  
The easiest way to scale is to generate additional packs from open datasets.

- **Lichess Database (including puzzles)** is released under **CC0**. citeturn0search0  
  That means you can download, filter, and redistribute puzzles freely—perfect for generating large packs.

For openings and endgame explanations, consider CC BY-SA sources like Wikibooks/Wikipedia when you want written theory. citeturn0search1turn0search2

## Pack format

See `src/domain/training/schema.ts` for the canonical JSON schema.
