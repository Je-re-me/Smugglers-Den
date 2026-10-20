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
const startError = $('start-error');
const handLabel = $('hand');

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
});

socket.on('private', (view) => {
  seat = view.seat;
  handLabel.textContent =
    view.hand.length === 0 ? 'No cards dealt yet.' : `${view.hand.length} cards in hand.`;
});
