const TOKEN_KEY = 'smugglersDenToken';

const socket = io();
let token = sessionStorage.getItem(TOKEN_KEY);
let seat = null;

const $ = (id) => document.getElementById(id);
const nameInput = $('name');
const joinForm = $('join-form');
const joinError = $('join-error');
const phaseLabel = $('phase');
const roundLabel = $('round');
const youLabel = $('you');
const seatList = $('seats');
const startButton = $('start');
const resetButton = $('reset');
const startError = $('start-error');
const resultsLabel = $('results');
const handSection = $('hand-section');
const handLabel = $('hand');
const handTitle = $('hand-title');
const packControls = $('pack-controls');
const declareRow = $('declare');
const bribeSlider = $('bribe');
const bribeValue = $('bribe-value');
const submitButton = $('submit-pack');
const packError = $('pack-error');
const spotlight = $('spotlight');
const inspectError = $('inspect-error');
const reviseControls = $('revise-controls');
const reviseSlider = $('revise-bribe');
const reviseValue = $('revise-value');
const submitRevise = $('submit-revise');
const reviseError = $('revise-error');
const emoteImage = $('emote');

const MAX_PACKAGE_CARDS = 5;
let goods = [];
let selectedCards = new Set();
let declaredGood = null;
let shownHand = '';
let packed = false;
let seatedInfo = null;
let reviseOpen = false;
let latestState = null;
let ownPackedCards = null;
let shownPackages = '';
let spotlightKey = '';
let hydrated = false;
const seenKeys = new Set();
const HIDDEN_CARD = { name: 'Hidden card', image: 'back' };
const EMOTE_SOURCES = {
  happy: '/assets/emotes/BlackbeardHappy.jpg',
  surprised: '/assets/emotes/BlackbeardSuprised.jpg',
};
const EMOTE_DURATION_MS = 2500;
let emoteTimer = null;

function setToken(value) {
  token = value;
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}

socket.on('connect', () => {
  if (!token) return;
  socket.emit('join', { token, name: nameInput.value }, (res) => {
    if (!res.ok) setToken(null);
  });
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  socket.emit('join', { name: nameInput.value, token }, (res) => {
    joinError.textContent = res.ok ? '' : res.error;
    if (res.ok) setToken(res.token);
  });
});

startButton.addEventListener('click', () => {
  socket.emit('start', (res) => {
    startError.textContent = res.ok ? '' : res.error;
  });
});

resetButton.addEventListener('click', () => {
  socket.emit('reset');
});

socket.on('reset', () => {
  setToken(null);
  seat = null;
  seatedInfo = null;
  ownPackedCards = null;
  reviseOpen = false;
  reviseControls.hidden = true;
  joinError.textContent = '';
  startError.textContent = '';
  packError.textContent = '';
  inspectError.textContent = '';
  reviseError.textContent = '';
  seenKeys.clear();
  renderHand([]);
});

socket.on('state', (state) => {
  latestState = state;
  goods = state.goods;
  phaseLabel.textContent = state.phase === 'lobby' ? '' : state.phase;
  roundLabel.textContent =
    state.phase === 'playing' ? `Round ${state.round} of ${state.totalRounds}` : '';

  const seated = state.players.find((p) => p.seat === seat);
  seatedInfo = seated ?? null;
  youLabel.textContent = seated
    ? `You are ${seated.name} (seat ${seat + 1})${seat === state.inspectorSeat ? ', inspector' : ''}`
    : '';
  packed = Boolean(seated?.packed);
  handSection.hidden = seat !== null && seat === state.inspectorSeat;

  resultsLabel.textContent = state.results
    ? `Game over. Winner: ${state.results.winners.join(', ')}. Final: ${state.results.balances
        .map((b) => `${b.name} ${b.balance}`)
        .join(', ')}`
    : '';

  const rows = Array.from({ length: state.playerCount }, (_, index) => {
    const player = state.players[index];
    const li = document.createElement('li');
    if (!player) {
      li.textContent = `Seat ${index + 1}: empty`;
      return li;
    }
    const tags = [];
    if (player.seat === state.inspectorSeat) tags.push('inspector');
    if (!player.connected) tags.push('disconnected');
    if (player.packed) tags.push('submitted');
    li.textContent = `${player.name} - ${player.balance}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    return li;
  });
  seatList.replaceChildren(...rows);

  updateLobbyButtons();
  renderPackages(state);
  updateRevise();
  updatePackControls();
  hydrated = true;
});

function updateLobbyButtons() {
  const lobbyFull = latestState.phase === 'lobby' && latestState.players.length === latestState.playerCount;
  startButton.disabled = !lobbyFull || seat === null;
  resetButton.disabled = seat === null;
}

function cardImage(card, width, height) {
  const img = document.createElement('img');
  img.src = `/assets/cards/${card.image}.svg`;
  img.alt = card.name;
  img.title = card.name;
  img.width = width;
  img.height = height;
  return img;
}

function decisionText(player, inspectorName) {
  switch (player.status) {
    case 'submitted':
      return `${inspectorName} is deciding on ${player.name}'s package`;
    case 'suspected':
      return `${inspectorName} suspects ${player.name}. Waiting for a bribe revision.`;
    case 'awaitingFinal':
      return `Bribe revised. ${inspectorName} is making the final call.`;
    case 'passed':
      return `${inspectorName} passed ${player.name}'s package unchecked.`;
    case 'resolved':
      return player.winner === 'inspector'
        ? `${inspectorName} caught ${player.name} smuggling!`
        : `${player.name} got through. ${inspectorName} was wrong.`;
    default:
      return '';
  }
}

function actionsFor(status) {
  if (status === 'submitted') return [['Pass', 'pass'], ['Inspect', 'inspect']];
  if (status === 'awaitingFinal') return [['Pass', 'pass'], ['Look', 'look']];
  return [];
}

function decide(target, action) {
  socket.emit('decide', { target, action }, (res) => {
    inspectError.textContent = res.ok ? '' : res.error;
  });
}

function isFreshChange(player, round) {
  const key = `${round}:${player.seat}:${player.status}`;
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return hydrated;
}

function renderPackages(state) {
  const signature = JSON.stringify([state, seat, ownPackedCards]);
  if (signature === shownPackages) return;
  shownPackages = signature;

  const isInspector = seat !== null && seat === state.inspectorSeat;
  const inspectorName =
    state.players.find((p) => p.seat === state.inspectorSeat)?.name ?? 'The inspector';
  const current = state.players.find((p) => p.seat === state.currentSeat) ?? null;
  renderSpotlight(state, current, inspectorName, isInspector);
}

function renderSpotlight(state, current, inspectorName, isInspector) {
  if (!current) {
    spotlightKey = '';
    if (state.stage === 'packing') spotlight.textContent = 'Smugglers are packing...';
    else if (state.stage === 'inspecting') spotlight.textContent = 'Round complete. Next round starting soon.';
    else spotlight.textContent = '';
    return;
  }

  const packageKey = `${state.round}:${current.seat}`;
  const entering = packageKey !== spotlightKey;
  spotlightKey = packageKey;
  const fresh = isFreshChange(current, state.round);
  const shown = current.cards ?? (current.seat === seat ? ownPackedCards : null);
  const animate = fresh && Boolean(current.cards) && current.seat !== seat;

  const title = document.createElement('h3');
  title.textContent = `${current.name}'s package`;

  const decision = document.createElement('p');
  decision.classList.add('decision');
  decision.textContent = decisionText(current, inspectorName);
  if (current.winner === 'inspector') decision.classList.add('caught');
  if (fresh) decision.classList.add('stamp');

  const faces = Array.from({ length: current.cardCount ?? 0 }, (_, index) =>
    flipCard(shown?.[index] ?? null, 100, 140, {
      revealed: Boolean(shown),
      animate,
      delay: index * 700,
    }),
  );
  const cardsRow = document.createElement('div');
  cardsRow.classList.add('spotlight-cards');
  cardsRow.replaceChildren(...faces);
  if (fresh && ['passed', 'resolved'].includes(current.status)) {
    if (animate) faces.at(-1).addEventListener('animationend', () => showEmote(current), { once: true });
    else showEmote(current);
  }

  const note = document.createElement('p');
  note.classList.add('queue-note');
  note.textContent =
    state.queuedAfterCurrent > 0
      ? `${state.queuedAfterCurrent} more to inspect after this one`
      : 'Last package this round';

  const children = [title, decision, displayedCard(current.declared, current.bribe, current.cardCount), cardsRow];
  if (isInspector) {
    const actions = document.createElement('div');
    actions.classList.add('spotlight-actions');
    actions.replaceChildren(
      ...actionsFor(current.status).map(([label, action]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => decide(current.seat, action));
        return button;
      }),
    );
    children.push(actions);
  }
  children.push(note);
  if (entering) for (const child of children) child.classList.add('spotlight-enter');
  spotlight.replaceChildren(...children);
}

function backImage(width, height) {
  const img = cardImage(HIDDEN_CARD, width, height);
  img.classList.add('face', 'back');
  return img;
}

function flipCard(card, width, height, { revealed = false, animate = false, delay = 0 } = {}) {
  const flip = document.createElement('span');
  flip.classList.add('card-flip');
  if (revealed) flip.classList.add('revealed');
  if (animate) {
    flip.classList.add('reveal-anim');
    flip.style.animationDelay = `${delay}ms`;
  }
  const front = cardImage(card ?? HIDDEN_CARD, width, height);
  front.classList.add('face', 'front');
  flip.append(front, backImage(width, height));
  return flip;
}

function updateRevise() {
  const open = seatedInfo?.status === 'suspected';
  if (open && !reviseOpen) {
    reviseSlider.max = seatedInfo.declared.value * seatedInfo.cardCount;
    reviseSlider.value = seatedInfo.bribe;
    reviseValue.textContent = reviseSlider.value;
    reviseError.textContent = '';
  }
  reviseOpen = open;
  reviseControls.hidden = !open;
}

reviseSlider.addEventListener('input', () => {
  reviseValue.textContent = reviseSlider.value;
});

submitRevise.addEventListener('click', () => {
  socket.emit('revise', { bribe: Number(reviseSlider.value) }, (res) => {
    reviseError.textContent = res.ok ? '' : res.error;
  });
});

function toggleCard(img, index) {
  if (packed) return;
  if (selectedCards.has(index)) selectedCards.delete(index);
  else selectedCards.add(index);
  img.classList.toggle('selected', selectedCards.has(index));
  updatePackControls();
}

function selectDeclaredGood(img, good) {
  if (packed) return;
  declaredGood = good;
  for (const other of declareRow.children) {
    other.classList.toggle('selected', other === img);
  }
  updatePackControls();
}

function updatePackControls() {
  const count = selectedCards.size;
  const cap = declaredGood && count ? declaredGood.value * count : 0;
  packControls.hidden = packed;
  bribeSlider.max = cap;
  bribeSlider.value = Math.min(Number(bribeSlider.value), cap);
  bribeValue.textContent = bribeSlider.value;
  bribeSlider.disabled = packed || cap === 0;
  submitButton.disabled = packed || !declaredGood || count === 0 || count > MAX_PACKAGE_CARDS;
}

function renderDeclareRow() {
  declareRow.replaceChildren(
    ...goods.map((good) => {
      const img = cardImage(good, 80, 112);
      img.addEventListener('click', () => selectDeclaredGood(img, good));
      return img;
    }),
  );
}

function displayedCard(good, bribe, count) {
  const wrapper = document.createElement('span');
  wrapper.classList.add('displayed-card');
  const counter = document.createElement('span');
  counter.classList.add('bribe-counter');
  counter.textContent = bribe;
  const coin = document.createElement('img');
  coin.src = '/assets/ui/coin.svg';
  coin.alt = 'coins';
  coin.width = 16;
  coin.height = 16;
  counter.append(coin);
  wrapper.append(cardImage(good, 80, 112), counter);
  if (count > 1) {
    const label = document.createElement('span');
    label.classList.add('card-count');
    label.textContent = `x ${count}`;
    wrapper.append(label);
  }
  return wrapper;
}

function renderHand(hand, packedCards, packedDeclared, packedBribe) {
  const key = JSON.stringify({ hand, packedCards, packedDeclared, packedBribe });
  if (key === shownHand) return;
  shownHand = key;
  selectedCards = new Set();
  declaredGood = null;

  if (packedCards) {
    handTitle.textContent = 'Your package';
    declareRow.replaceChildren();
    const displayedAs = document.createElement('span');
    displayedAs.classList.add('displayed-as');
    displayedAs.textContent = 'Displayed as';
    handLabel.replaceChildren(
      ...packedCards.map((card) => cardImage(card, 100, 140)),
      displayedAs,
      displayedCard(packedDeclared, packedBribe, packedCards.length),
    );
  } else if (hand.length === 0) {
    handTitle.textContent = 'Your hand';
    handLabel.textContent = 'No cards to show.';
    declareRow.replaceChildren();
  } else {
    handTitle.textContent = 'Your hand';
    renderDeclareRow();
    const entries = hand.map((card, index) => [card, index]);
    handLabel.replaceChildren(
      handRow(entries.filter(([card]) => card.type === 'normal')),
      handRow(entries.filter(([card]) => card.type === 'contraband')),
    );
  }
  updatePackControls();
}

function handRow(entries) {
  const row = document.createElement('div');
  row.classList.add('cards');
  row.replaceChildren(
    ...entries.map(([card, index]) => {
      const img = cardImage(card, 100, 140);
      img.addEventListener('click', () => toggleCard(img, index));
      return img;
    }),
  );
  return row;
}

bribeSlider.addEventListener('input', () => {
  bribeValue.textContent = bribeSlider.value;
});

submitButton.addEventListener('click', () => {
  const payload = {
    cardIndexes: [...selectedCards],
    good: declaredGood?.id,
    bribe: Number(bribeSlider.value),
  };
  socket.emit('pack', payload, (res) => {
    packError.textContent = res.ok ? '' : res.error;
  });
});

function showEmote(player) {
  clearTimeout(emoteTimer);
  emoteImage.src = EMOTE_SOURCES[player.winner === 'inspector' ? 'surprised' : 'happy'];
  emoteImage.hidden = false;
  emoteTimer = setTimeout(() => {
    emoteImage.hidden = true;
  }, EMOTE_DURATION_MS);
}

socket.on('private', (view) => {
  seat = view.seat;
  ownPackedCards = view.packedCards;
  renderHand(view.hand, view.packedCards, view.packedDeclared, view.packedBribe);
  if (latestState) {
    updateLobbyButtons();
    renderPackages(latestState);
  }
});
