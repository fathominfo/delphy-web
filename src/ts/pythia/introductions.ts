import { UNSET } from "../ui/common";
import { Tree } from "./delphy_api";

/*
the `score` value approximates a population curve
*/
export type LineageEntry = [time: number, numLineages: number, score: number];
/* belowCount: the number of lineages _beneath_ this entry */
export type LineageMetadataEntry = [time: number, count: number, counts: number[], belowCount: number[]];
export type LineageMetadataOverTime = {
  metadataOrder: string[],
  overTime: LineageMetadataEntry[]
};


export type TransmissionChain = {
  from: string,
  to: string,
  firstDate: number,
  lastDate: number,
  nodes: number[],
  tips: number[]
};



export const getActiveLineagesOverTime = (tree: Tree) : LineageEntry[] => {
  const rootIndex = tree.getRootIndex();
  const q = [rootIndex];
  const events: [number, number][] = [];
  let totalBranchTime = 0;
  while (q.length > 0) {
    const node = q.shift();
    if (node !== undefined) {
      if (node !== rootIndex) {
        const parent = tree.getParentIndexOf(node);
        const t0 = tree.getTimeOf(parent);
        const t1 = tree.getTimeOf(node);
        events.push([t0, 1]);
        events.push([t1, -1]);
        totalBranchTime += t1 - t0;
      }
      const left = tree.getLeftChildIndexOf(node);
      if (left !== UNSET) {
        q.push(left);
        q.push(tree.getRightChildIndexOf(node));
      }
    }
  }
  if (events.length > 0) {
    const deduped = dedupeEvents(events);
    const numTips = (tree.getSize() + 1) / 2;
    return convertEventsToActiveLineages(deduped, totalBranchTime, numTips);
  }
  return [];
}

const dedupeEvents = (events: [number, number][]): [number, number][] => {
  events.sort((a, b) => a[0] - b[0]);
  const deduped: [number, number][] = [];
  let count = 0;
  events.forEach(([time, delta]) => {
    count += delta;
    const lastIndex = deduped.length - 1;
    const prevTime = lastIndex >= 0 ? deduped[lastIndex][0] : Number.MIN_VALUE;
    if (time === prevTime) {
      deduped[lastIndex][1] = count;
    } else {
      deduped.push([time, count]);
    }
  });
  return deduped;
}

const convertEventsToActiveLineages = (deduped: [number, number][],
  totalBranchTime: number, numTips: number
) : LineageEntry[] => {
  const c = 0.5;
  const timescale = c * totalBranchTime / numTips;
  const activeOverTime: LineageEntry[] = [];
  deduped.forEach(([time, count]) => {
    const score = count === 0 ? 0 : Math.log(count * timescale);
    activeOverTime.push([time, count, score]);
  });
  return activeOverTime;
}

export const getActiveMetadataLineagesOverTime = (tree: Tree, metadataValues: string[]): LineageMetadataOverTime => {
  const rootIndex = tree.getRootIndex();
  const q = [rootIndex];
  const events: { [_: string]: [number, number][] } = {};
  while (q.length > 0) {
    const node = q.shift();
    if (node !== undefined) {
      if (node !== rootIndex) {
        const mdValue = metadataValues[node];
        if (events[mdValue] === undefined) {
          events[mdValue] = [];
        }
        const parent = tree.getParentIndexOf(node);
        const t0 = tree.getTimeOf(parent);
        const t1 = tree.getTimeOf(node);
        events[mdValue].push([t0, 1]);
        events[mdValue].push([t1, -1]);
      }
      const left = tree.getLeftChildIndexOf(node);
      if (left !== UNSET) {
        q.push(left);
        q.push(tree.getRightChildIndexOf(node));
      }
    }
  }
  const allEvents: [number, number, string][] = [];
  const currentMdCount: { [mdValue: string]: number } = {};
  const mdMaxes: { [mdValue: string]: number } = {};
  Object.entries(events).forEach(([mdValue, mdEvents]) => {
    const deduped = dedupeEvents(mdEvents);
    deduped.forEach(([time, count]) => {
      allEvents.push([time, count, mdValue]);
    });
    currentMdCount[mdValue] = 0;
    mdMaxes[mdValue] = Math.max.apply(null, deduped.map(([_, count]) => count)); // eslint-disable-line @typescript-eslint/no-unused-vars
  });
  const sortedValues = Object.entries(mdMaxes).sort((a, b) => a[1] - b[1]);
  const metadataOrder = sortedValues.map(([mdValue]) => mdValue);
  allEvents.sort((a, b) => a[0] - b[0]);
  const overTime: LineageMetadataEntry[] = [];
  allEvents.forEach(([time, count, mdValue]) => {
    currentMdCount[mdValue] = count;
    const mdCounts: number[] = [];
    const belowCount: number[] = [];
    let tot = 0;
    metadataOrder.forEach(mdv => {
      const n = currentMdCount[mdv];
      mdCounts.push(n);
      belowCount.push(tot);
      tot += n;
    });
    const lastIndex = overTime.length - 1;
    if (lastIndex >= 0 && time === overTime[lastIndex][0]) {
      overTime[lastIndex] = [time, tot, mdCounts, belowCount];
    } else {
      overTime.push([time, tot, mdCounts, belowCount]);
    }
  });
  const ldot: LineageMetadataOverTime = { metadataOrder, overTime };
  return ldot;
}


export const getTransmissionChains = (tree: Tree,
  metadataValues: string[]
) : { [metadataValue: string]: TransmissionChain[] } => {
  const rootIndex = tree.getRootIndex();
  const size = tree.getSize();
  const q = [rootIndex];

  /*
  for every node in the tree, what is the root node of the transmission chain
  */
  const chainRoot: number[] = new Array(size);
  /*
  sparse array tracking transmission chains by the root
  */
  const chains: TransmissionChain[] = [];

  while (q.length > 0) {
    const node = q.shift();
    if (node !== undefined) {
      const mdValue = metadataValues[node];
      const parent = tree.getParentIndexOf(node);
      const parentMdValue = metadataValues[parent];
      const left = tree.getLeftChildIndexOf(node);
      const isTip = left === UNSET;
      let chain: TransmissionChain;
      if (mdValue !== parentMdValue) {
        /* we have ourselves an introduction */
        chainRoot[node] = node;
        chain = {
          from: parentMdValue,
          to : mdValue,
          firstDate: tree.getTimeOf(node),
          lastDate: tree.getTimeOf(node),
          nodes: [node],
          tips: []
        };
        chains[node] = chain;
      } else {
        const rootNode = chainRoot[parent];
        chain = chains[rootNode];
        chain.nodes.push(node);
        chain.lastDate = Math.max(chain.lastDate, tree.getTimeOf(node));
        chainRoot[node] = rootNode;
      }
      if (isTip) {
        chain.tips.push(node);
      } else {
        q.push(left);
        q.push(tree.getRightChildIndexOf(node));
      }
    }
  }

  /* group chains by value */
  const groupedChains : { [metadataValue: string]: TransmissionChain[] } = {};
  chains.forEach((chain)=>{
    const value = chain.to;
    if (groupedChains[value] === undefined) {
      groupedChains[value] = [];
    }
    groupedChains[value].push(chain);
  });
  return groupedChains;
}

