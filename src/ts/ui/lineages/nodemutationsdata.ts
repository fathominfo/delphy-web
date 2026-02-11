import { MutationDistribution } from '../../pythia/mutationdistribution';
import { NodePair, mutationPrevalenceThreshold } from './lineagescommon';
import { getMutationName, getMutationNameParts } from '../../constants';
import { getPercentLabel, UNSET } from '../common';
import { Distribution } from '../distribution';
import { DisplayNode } from '../displaynode';



export class MutationTimelineData {
  mutation: MutationDistribution;
  nameParts: [string, string, string];
  name: string;
  className: string;
  series: Distribution;
  isApobecRun: boolean;

  constructor(mutation: MutationDistribution, isApobecRun: boolean) {
    this.mutation = mutation;
    this.nameParts = getMutationNameParts(mutation.mutation);
    this.name = getMutationName(mutation.mutation);
    this.className = "mutation";
    this.series = new Distribution(mutation.times);
    this.isApobecRun = isApobecRun;
  }

}


export class NodeMutationsData {
  nodePair: NodePair;
  minDate: number;
  maxDate: number;
  isApobecRun: boolean;
  mutationTimelineData:MutationTimelineData[];
  mutationCount: number = UNSET;

  ancestorType: DisplayNode;
  descendantType: DisplayNode;
  ancestorMedianDate: number = UNSET;
  descendantMedianDate: number = UNSET;
  thresholdLabel = "";

  constructor(nodePair: NodePair, ancestorMedianDate: number,
    descendantMedianDate: number, minDate: number, maxDate: number, isApobecRun: boolean) {
    this.nodePair = nodePair;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.isApobecRun = isApobecRun;
    this.mutationTimelineData = [];
    this.ancestorType = this.nodePair.getAncestor();
    this.descendantType = this.nodePair.getDescendant();
    this.ancestorMedianDate = ancestorMedianDate;
    this.descendantMedianDate = descendantMedianDate;

    this.setMutations(isApobecRun);

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


