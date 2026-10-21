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
const packagesList = $('packages');
const inspectError = $('inspect-error');
const reviseControls = $('revise-controls');
const reviseSlider = $('revise-bribe');
const reviseValue = $('revise-value');
const submitRevise = $('submit-revise');
const reviseError = $('revise-error');

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

function describeStatus(player) {
  switch (player.status) {
    case 'submitted':
      return 'waiting for inspector';
    case 'suspected':
      return 'suspected, awaiting bribe revision';
    case 'awaitingFinal':
      return 'suspected, awaiting final call';
    case 'passed':
      return 'passed unchecked';
    case 'resolved':
      return player.winner === 'inspector' ? 'inspector caught it' : 'smuggler got through';
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

function renderPackages(state) {
  const isInspector = seat !== null && seat === state.inspectorSeat;
  const inspecting = state.stage === 'inspecting';
  const items = state.players
    .filter((player) => player.seat !== state.inspectorSeat && player.packed)
    .map((player) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${player.name}: ${describeStatus(player)} `;
      li.append(text);
      const shownCards = player.cards ?? (player.seat === seat ? ownPackedCards : null);
      if (shownCards) {
        const cards = document.createElement('span');
        cards.classList.add('cards');
        cards.replaceChildren(...shownCards.map((card) => cardImage(card, 60, 84)));
        li.append(cards);
      }
      li.append(displayedCard(player.declared, player.bribe));
      if (isInspector && inspecting) {
        for (const [label, action] of actionsFor(player.status)) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.addEventListener('click', () => decide(player.seat, action));
          li.append(' ', button);
        }
      }
      return li;
    });
  packagesList.replaceChildren(...items);
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

function displayedCard(good, bribe) {
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
      displayedCard(packedDeclared, packedBribe),
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

socket.on('private', (view) => {
  seat = view.seat;
  ownPackedCards = view.packedCards;
  renderHand(view.hand, view.packedCards, view.packedDeclared, view.packedBribe);
  if (latestState) {
    updateLobbyButtons();
    renderPackages(latestState);
  }
});
