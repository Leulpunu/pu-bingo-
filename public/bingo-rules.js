export function hasBingo(card, drawn) {
  const called = new Set([0, ...drawn]);
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(Array.from({length:5}, (_, j) => i * 5 + j));
    lines.push(Array.from({length:5}, (_, j) => j * 5 + i));
  }
  lines.push([0,6,12,18,24], [4,8,12,16,20]);
  return lines.filter(line => line.every(i => called.has(card[i]))).length >= 2;
}
