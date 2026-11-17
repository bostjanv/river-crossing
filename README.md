# River Crossing

A browser version of the River Crossing plank puzzle (TypeScript, PixiJS, Vite).
Help the Hiker cross the river by moving planks between tree stumps.

```sh
npm install
npm run dev     # play at http://localhost:5173
npm test        # rules and solver tests, including a check of every level
npm run build
```

## How to play

- Tap a stump to walk there along the planks.
- Tap a plank to pick it up. The Hiker lifts it from the end he stands on, or walks to the end nearer your tap.
- Tap a glowing gap to put the plank down. A plank fits only between two stumps exactly its length apart, in a straight line, without crossing another plank, and it must touch a stump the Hiker can reach.
- Reach the FINISH stump to win. Keys: Z undo, R restart, Esc levels.

## Levels

The 40 challenges in `src/levels.json` are original. `npm run generate-levels` creates them with a breadth-first solver (`src/game/solver.ts`) that finds the fewest plank moves. It sorts them into Beginner, Intermediate, Advanced, and Expert by that number.
