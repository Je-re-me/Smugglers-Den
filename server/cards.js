export const GOODS = [
  { id: 'tomato', name: 'Tomato', value: 2, caughtValue: 2, image: 'tomato', copies: 8 },
  { id: 'coconut', name: 'Coconut', value: 2, caughtValue: 2, image: 'coconut', copies: 8 },
  { id: 'fish', name: 'Fish', value: 3, caughtValue: 2, image: 'fish', copies: 6 },
  { id: 'cheese', name: 'Cheese', value: 4, caughtValue: 2, image: 'cheese', copies: 4 },
];

export const CONTRABAND = [
  { type: 'contraband', id: 'map', name: 'map', value: 12, caughtValue: 6, image: 'map', copies: 3 },
  { type: 'contraband', id: 'jewel', name: 'jewel', value: 7, caughtValue: 4, image: 'jewel', copies: 5 },
  { type: 'contraband', id: 'dagger', name: 'dagger', value: 8, caughtValue: 4, image: 'dagger', copies: 4 },
  { type: 'contraband', id: 'musket', name: 'musket', value: 10, caughtValue: 5, image: 'musket', copies: 2 },
  { type: 'contraband', id: 'meat', name: 'meat', value: 15, caughtValue: 8, image: 'meat', copies: 2 },
];

const expandCopies = (entries) =>
  entries.flatMap(({ copies, ...card }) => Array.from({ length: copies }, () => card));

export const NORMAL_POOL = expandCopies(GOODS.map((good) => ({ type: 'normal', ...good })));
export const CONTRABAND_POOL = expandCopies(CONTRABAND);
