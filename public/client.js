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
const handLabel = $('hand');
const declareRow = $('declare');

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
  joinError.textContent = '';
  startError.textContent = '';
  renderHand([]);
});

socket.on('state', (state) => {
  phaseLabel.textContent = state.phase;
  roundLabel.textContent =
    state.phase === 'playing' ? `Round ${state.round} of ${state.totalRounds}` : '';

  const seated = state.players.find((p) => p.seat === seat);
  youLabel.textContent = seated ? `You are ${seated.name} (seat ${seat + 1})` : '';

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
    li.textContent = `${player.name} - ${player.balance}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    return li;
  });
  seatList.replaceChildren(...rows);

  const lobbyFull = state.phase === 'lobby' && state.players.length === state.playerCount;
  startButton.disabled = !lobbyFull || seat === null;
  resetButton.disabled = seat === null;
});

const DECLARABLE_VALUES = [2, 3, 4];
let selectedCards = new Set();
let declaredValue = null;
let shownHand = '';

function toggleCard(img, index) {
  if (selectedCards.has(index)) selectedCards.delete(index);
  else selectedCards.add(index);
  img.classList.toggle('selected', selectedCards.has(index));
}

function selectDeclaredValue(img, value) {
  declaredValue = value;
  for (const other of declareRow.children) {
    other.classList.toggle('selected', other === img);
  }
}

function renderDeclareRow() {
  declaredValue = null;
  declareRow.replaceChildren(
    ...DECLARABLE_VALUES.map((value) => {
      const img = document.createElement('img');
      img.src = `/assets/cards/goods-${value}.svg`;
      img.alt = `declare goods ${value}`;
      img.width = 80;
      img.height = 112;
      img.addEventListener('click', () => selectDeclaredValue(img, value));
      return img;
    }),
  );
}

function renderHand(hand) {
  const key = JSON.stringify(hand);
  if (key === shownHand) return;
  shownHand = key;
  selectedCards = new Set();

  if (hand.length === 0) {
    handLabel.textContent = 'No cards to show.';
    declareRow.replaceChildren();
    return;
  }
  renderDeclareRow();
  handLabel.replaceChildren(
    ...hand.map((card, index) => {
      const kind = card.type === 'normal' ? 'goods' : 'contraband';
      const img = document.createElement('img');
      img.src = `/assets/cards/${kind}-${card.value}.svg`;
      img.alt = `${kind} ${card.value}`;
      img.width = 100;
      img.height = 140;
      img.addEventListener('click', () => toggleCard(img, index));
      return img;
    }),
  );
}

socket.on('private', (view) => {
  seat = view.seat;
  renderHand(view.hand);
});
