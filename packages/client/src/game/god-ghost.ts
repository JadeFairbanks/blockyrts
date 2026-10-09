// The unit godmode holds on the cursor (Jade's Patch 5: "the corresponding
// opaque unit model"): one state row, made the way the sim makes the real
// thing (a scratch entity given its kit by the sim's own applyKit), so the
// ghost wears the same body, kit and mount as what a click will place.
import {
  applyKit,
  EntityStore,
  GOD_SPAWNS,
  godKit,
  LAIRS,
  mageMaxMana,
  MANA_SCALE,
  Mob,
  MONSTERS,
  Mount,
  mountSpec,
  TOP_MAGE_TIER,
  Troop,
  UnitKind,
  WILD,
} from '@blockyrts/sim';
import { S, STATE_STRIDE } from '../messages.ts';

/** The state row of one of GOD_SPAWNS as it will stand once placed by `player`, facing the way placed units face; null for none. */
export function godGhostRow(k: number, player: number): Int32Array | null {
  const g = GOD_SPAWNS[k];
  if (!g) return null;
  const owner = g.side === 'player' ? player : g.side === 'wild' ? WILD : MONSTERS;
  const kind =
    g.what === 'worker'
      ? UnitKind.Worker
      : g.what === 'troop' || g.what === 'crewman'
        ? UnitKind.Warrior
        : g.what === 'mage'
          ? UnitKind.Mage
          : g.what === 'engine'
            ? UnitKind.Engine
            : g.what === 'animal'
              ? UnitKind.Animal
              : UnitKind.Mob;
  const e = new EntityStore(1);
  const i = e.add(1, owner, 0, 0, 0, 0, kind);
  if (g.what === 'troop' || g.what === 'crewman') {
    const troop = g.what === 'troop' ? g.id : Troop.Crew;
    e.troop[i] = troop;
    const kit = g.what === 'troop' ? godKit(troop) : { w: 0, a: 0, s: 0 };
    e.wTier[i] = kit.w;
    e.aTier[i] = kit.a;
    e.sTier[i] = kit.s;
    applyKit(e, i, 'warrior');
    if (troop === Troop.Cavalry) e.mount[i] = Mount.Horse;
  } else if (g.what === 'mage') {
    e.school[i] = g.id;
    e.wTier[i] = TOP_MAGE_TIER;
    e.aTier[i] = TOP_MAGE_TIER;
    applyKit(e, i, 'mage');
  } else if (g.what === 'lair') e.mob[i] = LAIRS[g.id]!.mob;
  else if (g.what === 'boss') e.mob[i] = Mob.Morvath;
  else if (g.what !== 'worker') e.mob[i] = g.id;
  const row = new Int32Array(STATE_STRIDE);
  row[S.id] = 1;
  row[S.owner] = owner;
  row[S.kind] = kind;
  row[S.heading] = 32768;
  row[S.order] = e.order[i]!;
  row[S.hp] = 1;
  row[S.maxHp] = 1;
  row[S.rank] = 1;
  row[S.mob] = e.mob[i]!;
  row[S.weapon] = e.weapon[i]!;
  row[S.troop] = e.troop[i]!;
  row[S.ranged] = e.ranged[i]!;
  row[S.shield] = e.shield[i]!;
  row[S.armour] = e.armour[i]!;
  row[S.wTier] = e.wTier[i]!;
  row[S.aTier] = e.aTier[i]!;
  row[S.toolChop] = e.toolChop[i]!;
  row[S.toolBreak] = e.toolBreak[i]!;
  row[S.toolBuild] = e.toolBuild[i]!;
  row[S.toolCut] = e.toolCut[i]!;
  if (kind === UnitKind.Mage) {
    row[S.school] = g.id;
    row[S.maxMana] = Math.floor(mageMaxMana(1, TOP_MAGE_TIER) / MANA_SCALE);
    row[S.mana] = row[S.maxMana]!;
  }
  if (e.mount[i] !== Mount.None) {
    row[S.mount] = e.mount[i]!;
    row[S.mountMax] = mountSpec(e.mount[i]!).hp;
    row[S.mountHp] = row[S.mountMax]!;
  }
  return row;
}
