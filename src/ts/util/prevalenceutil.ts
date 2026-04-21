import { BaseTreeSeriesType } from "../constants";
import { calcHPD } from "../ui/distribution";


/*
averages: average value for each node / series for each day / bin
  (e.g. averages[node][day] = average across [tree])
distributions: [hpdMin, hpdMax, median] value for each node / series for each day / bin
  (e.g. [node][day][stat] = [hpdMin, hpdMax, median] across [tree])
*/
export interface PrevalenceData {
  averages: number[][],
  distributions: number[][][]
}

/*
Take series data compiled for many nodes across many trees
and return the average across all trees for the series / nodes.
So transform like
  [tree][series][day] = value
into
  [series][day] = average value across all trees
and also return the HPD and median:
  [series][day] = [hpd min, hpd max, median] across all trees
*/
export const calculateAcrossTrees = (dist: BaseTreeSeriesType) : PrevalenceData =>{
  // dist:  tree, series, day
  const treeCount = dist.length;
  const seriesCount = dist[0].length;
  const binCount = dist[0][0].length;

  const averages: number[][] = new Array(seriesCount);
  const distributions: number[][][] = new Array(seriesCount);
  let d: number;
  let tot: number;
  let t: number;
  let v: number;
  const acrossTrees: number[] = new Array(treeCount);

  for (let s = 0; s < seriesCount; s++) {
    // for each tree, daily values for this series
    averages[s] = Array(binCount);
    distributions[s] = Array(binCount);
    for (d = 0; d < binCount; d++) {
      tot = 0;
      for (t = 0; t < treeCount; t++) {
        v = dist[t][s][d];
        tot += v;
        acrossTrees[t] = v;
      }
      averages[s][d] = tot / treeCount;
      distributions[s][d] = calcHPD(acrossTrees);
    }
  }
  return {averages, distributions};
}
