// SABLE PROTOCOL — the submission program (Node 22, standard library only).
//
// It hands the game in: copies this repository's game/ (the playable static
// files) and screenshots/ (3-4 real renders) into the output directory and
// writes dossier.json there with the kit's vendored library, so the scorer
// can verify the entry byte for byte.
//
// Run it from this directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// game/ first: the whole playable game, exactly as it sits in the repo.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// screenshots/ next: the first file by name is the cover image.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier the judge reads. These caps are the scorer's own (see the
// kit's reference/gate.json): text_max_bytes shapes the bytes, the rest
// refuse an entry the scorer would refuse, so the program fails here
// instead of handing in something invalid.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

console.log('wrote ' + out + ' (game/ + screenshots/ + dossier.json)');
