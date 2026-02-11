import { MutationDistribution } from '../../pythia/mutationdistribution';
import { NodePair, getAncestorType, getDescendantType } from './lineagescommon';
import { getMutationName, getMutationNameParts } from '../../constants';
import { DisplayNode, getMedian, getPercentLabel, numericSort, UNSET } from '../common';
import { Distribution } from '../distribution';


/* should we provide an interface to this ? [mark 230524]*/
/* adding it for now! [katherine 230608] */
export const mutationPrevalenceThreshold = 0.5;




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
    descendantMedianDate: number, minDate: number, maxDate: number,
    isApobecRun: boolean) {
    this.nodePair = nodePair;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.isApobecRun = isApobecRun;
    this.mutationTimelineData = [];
    this.ancestorType = getAncestorType(this.nodePair.pairType);
    this.descendantType = getDescendantType(this.nodePair.pairType);
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



