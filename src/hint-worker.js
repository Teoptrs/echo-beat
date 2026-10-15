// Plots a new hint route off the main thread, so the board keeps drawing.
import { Sim } from './sim.js';
import { LEVELS } from './levels.js';
import { solveFrom } from './solver.js';

self.onmessage = ({ data: { id, levelId, snap, budgetMs, limitMs } }) => {
  const s = new Sim(LEVELS.find((l) => l.id === levelId));
  s.restore(snap);
  self.postMessage({ id, route: solveFrom(s, { budgetMs, limitMs }) });
};
