import { card, shuffle, hasBingo } from './game.js';
import { randomUUID } from 'node:crypto';
export const SELECTION_MS = 30_000;
export const RESULT_MS = 8_000;
export function winningCardId(room, player) {
  return (room.staked ? player.cardIds || [] : [player.cardId])
    .find(id => hasBingo(room.catalog[id - 1], room.drawn));
}
export function prepareRound(room, now = Date.now()) {
  room.round = (room.round || 0) + 1;
  room.roundKey = randomUUID();
  room.settlement = null;
  room.status = 'waiting';
  room.startsAt = now + SELECTION_MS;
  room.nextRoundAt = 0;
  room.winner = null;
  room.drawn = [];
  room.deck = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
  room.catalog ??= Array.from({ length: 450 }, () => card());
  for (const player of room.players.values()) { player.card = room.catalog[player.cardId - 1]; player.paid = false; player.cardIds = []; }
}
export function chooseCard(room, id, cardId) {
  if (room.status !== 'waiting') throw Error('Choose your cartela before the round starts.');
  if (!Number.isInteger(cardId) || cardId < 1 || cardId > room.catalog.length) throw Error('Invalid cartela number.');
  if ([...room.players.values()].some(p => p.id !== id && (p.cardId === cardId || (p.cardIds || []).includes(cardId)))) throw Error('This cartela is taken. Choose another.');
  const player = room.players.get(id);
  player.cardId = cardId;
  player.card = room.catalog[cardId - 1];
}
export function tickRound(room, now, finish) {
  if (room.status === 'finished' && now >= room.nextRoundAt) prepareRound(room, now);
  if (room.status === 'waiting' && now >= room.startsAt) {
    room.status = 'playing';
    room.nextDraw = now + 1000;
  }
  if (room.status === 'playing' && now >= room.nextDraw) {
    if (room.deck.length) {
      room.drawn.push(room.deck.pop());
      room.nextDraw = now + 4000;
    } else return finish(room, null);
  }
}
