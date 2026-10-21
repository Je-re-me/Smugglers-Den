import { readFile, writeFile } from 'node:fs/promises';
import { GOODS, CONTRABAND } from '../server/cards.js';

const CARD_DIR = new URL('../public/assets/cards/', import.meta.url);
const OVERLAY = /\s*<!-- values -->[\s\S]*?<!-- \/values -->/g;
const CORNER_VALUE = /\s*<text x="(?:30|170)" y="(?:52|250)"[^>]*font-size="30"[^>]*>[^<]*<\/text>/g;
const VALUE_CENTER_Y = 48;
const DIGIT_HALF_HEIGHT = 11;

const valueText = (x, value, fill) =>
  `<text x="${x}" y="${VALUE_CENTER_Y + DIGIT_HALF_HEIGHT}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold" fill="${fill}">${value}</text>`;

const overlay = (card) => `
  <!-- values -->
  ${valueText(38, card.caughtValue, '#c62828')}
  ${valueText(162, card.value, '#000')}
  <!-- /values -->`;

for (const card of [...GOODS, ...CONTRABAND]) {
  const file = new URL(`${card.image}.svg`, CARD_DIR);
  const original = await readFile(file, 'utf8');
  const svg = original
    .replace(OVERLAY, '')
    .replace(CORNER_VALUE, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${card.name}, passed ${card.value}, caught ${card.caughtValue}</title>`)
    .replace('</svg>', `${overlay(card)}\n</svg>`);
  await writeFile(file, svg);
  console.log(`wrote ${card.image}.svg (passed ${card.value}, caught ${card.caughtValue})`);
}
