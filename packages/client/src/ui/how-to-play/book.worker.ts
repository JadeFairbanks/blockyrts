// How to Play's worker: reads the sim's tables (all of them, which the main
// page does not load) and sends the page its whole book once.
import { buildingPic, entryModel, entryPic, goodPic } from './pictures.ts';
import { simDocs, simModules } from './sim-data.ts';
import { bookOf, buildWiki } from './wiki.ts';

const wiki = buildWiki(simModules, simDocs, {
  entry: (e) => entryPic(e, simModules),
  model: (e) => entryModel(e, simModules),
  ref: (kind, id) => (kind === 'res' ? goodPic(id) : null),
  level: (e, level) => {
    if (e.path[0] !== 'BUILDINGS') return null;
    const kind = (simModules[e.module]?.BUILDINGS as ReadonlyArray<{ kind: number }> | undefined)?.[e.path[1] as number]?.kind;
    return kind === undefined ? null : buildingPic(kind, level);
  },
});
postMessage(bookOf(wiki));
