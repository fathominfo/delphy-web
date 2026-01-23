import { MutationDistribution } from '../../pythia/mutationdistribution';
import { NodePair, NodeComparisonData, getAncestorType, getDescendantType } from './lineagescommon';
import { getMutationName, getMutationNameParts } from '../../constants';
import { DisplayNode, getPercentLabel, UNSET } from '../common';
import { DistributionSeries } from '../timedistributioncanvas';


/* should we provide an interface to this ? [mark 230524]*/
/* adding it for now! [katherine 230608] */
export const mutationPrevalenceThreshold = 0.5;




export class MutationTimelineData {
  mutation: MutationDistribution;
  nameParts: [string, string, string];
  name: string;
  className: string;
  series: DistributionSeries;
  isApobecRun: boolean;

  constructor(mutation: MutationDistribution, isApobecRun: boolean) {
    this.mutation = mutation;
    this.nameParts = getMutationNameParts(mutation.mutation);
    this.name = getMutationName(mutation.mutation);
    this.className = "mutation";
    this.series = new DistributionSeries(mutation.times);
    this.isApobecRun = isApobecRun;
  }

}


export class NodeComparisonChartData {
  nodePair: NodePair;
  minDate: number;
  maxDate: number;
  isApobecRun: boolean;
  mutationTimelineData:MutationTimelineData[];
  overlapCount: number;
  treeCount: number = UNSET;
  mutationCount: number = UNSET;

  ancestorType: DisplayNode;
  descendantType: DisplayNode;
  series: [DistributionSeries, DistributionSeries?];
  thresholdLabel = "";

  constructor(nodeComparisonData : NodeComparisonData, minDate: number, maxDate: number, isApobecRun: boolean) {
    this.nodePair = nodeComparisonData.nodePair;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.isApobecRun = isApobecRun;
    this.mutationTimelineData = [];


    this.ancestorType = getAncestorType(this.nodePair.pairType);
    this.descendantType = getDescendantType(this.nodePair.pairType);

    this.overlapCount = nodeComparisonData.overlapCount;
    this.treeCount = nodeComparisonData.upperNodeTimes.length;

    this.setMutations(isApobecRun);

    const createSeries = (dn: DisplayNode, i: number) => {
      const times = (i === 0) ? nodeComparisonData.upperNodeTimes : nodeComparisonData.lowerNodeTimes;
      const ds = new DistributionSeries(times);
      return ds;
    }
    if (this.descendantType === UNSET) {
      this.series = [this.ancestorType].map(createSeries) as [DistributionSeries];
    } else {
      this.series = [this.ancestorType, this.descendantType].map(createSeries) as [DistributionSeries, DistributionSeries];
    }


  }


  setMutations(isApobecRun: boolean):void {
    const shownMutations = this.nodePair.mutations.filter((md:MutationDistribution)=>md.getConfidence() >= mutationPrevalenceThreshold);
    this.mutationCount = shownMutations.length;
    this.mutationTimelineData = shownMutations.map((md:MutationDistribution)=>new MutationTimelineData(md, isApobecRun));
    this.thresholdLabel = `${getPercentLabel(mutationPrevalenceThreshold)}%`;
    if (mutationPrevalenceThreshold < 1.0) {
      this.thresholdLabel += ' or more'
    }

  }


}


