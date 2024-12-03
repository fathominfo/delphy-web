import {SequenceWarningCode} from './pythia/delphy_api';


export type SiteAmbiguity = {site: number, state: string};
export type InvalidStateWarning = {state: string};
export type InvalidGapWarning = {startSite: number, endSite: number};
export type InvalidMutationWarning = {from: string, site: number, to: string};


export class RecordQuality {

  noDateSequences:string[] = [];
  ambiguousSiteSequences: {[seqid: string]: SiteAmbiguity[] } = {};
  invalidStateSequences: {[seqid: string]: InvalidStateWarning[] } = {};
  invalidGapSequences: {[seqid: string]: InvalidGapWarning[] } = {};
  invalidMutationSequences: {[seqid: string]: InvalidMutationWarning[] } = {};
  other: {[seqId: string]: any[] } = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  ambiguousSiteCount = 0;
  invalidStateCount = 0;
  invalidGapCount = 0;
  invalidMutationCount = 0;

  reset() {
    this.noDateSequences = [];

    this.ambiguousSiteSequences = {};
    this.ambiguousSiteCount = 0;

    this.invalidStateSequences = {};
    this.invalidStateCount = 0;

    this.invalidGapSequences = {};
    this.invalidGapCount = 0;

    this.invalidMutationSequences = {};
    this.invalidMutationCount = 0;

    this.other = {};
  }


  parseWarning(seqId: string, warningCode: SequenceWarningCode, detail: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (warningCode) {
    case SequenceWarningCode.NoValidDate:
      this.noDateSequences.push(seqId);
      console.warn(`WARNING (sequence '${seqId}') - No valid date`);
      break;
    case SequenceWarningCode.AmbiguityPrecisionLoss:
      if (this.ambiguousSiteSequences[seqId] === undefined) {
        this.ambiguousSiteSequences[seqId] = [];
      }
      this.ambiguousSiteSequences[seqId].push({site: detail.site, state: detail.originalState});
      this.ambiguousSiteCount++;
      console.warn(`WARNING (sequence '${seqId}') - Ambiguous state ${detail.originalState} at site ${detail.site+1} changed to N`);
      break;
    case SequenceWarningCode.InvalidState:
      if (this.invalidStateSequences[seqId] === undefined) {
        this.invalidStateSequences[seqId] = [];
      }
      this.invalidStateSequences[seqId].push({state: detail.state});
      this.invalidStateCount++;
      console.warn(`WARNING (sequence '${seqId}') - Invalid state ${detail.state}`);
      break;
    case SequenceWarningCode.InvalidGap:
      if (this.invalidGapSequences[seqId] === undefined) {
        this.invalidGapSequences[seqId] = [];
      }
      this.invalidGapSequences[seqId].push({startSite: detail.startSite, endSite: detail.endSite});
      this.invalidGapCount++;
      console.warn(`WARNING (sequence '${seqId}') - Invalid gap [${detail.startSite+1}, ${detail.endSite+1})`);
      break;
    case SequenceWarningCode.InvalidMutation:
      if (this.invalidMutationSequences[seqId] === undefined) {
        this.invalidMutationSequences[seqId] = [];
      }
      this.invalidMutationSequences[seqId].push({from: detail.from, site: detail.site, to: detail.to});
      this.invalidMutationCount++;
      console.warn(`WARNING (sequence '${seqId}') - Invalid mutation from ${detail.from} to ${detail.to} at site ${detail.site+1}`);
      break;
    default:
      if (this.other[seqId] === undefined) {
        this.other[seqId] = [];
      }
      this.other[seqId].push(detail);
      console.warn(`WARNING (sequence '${seqId}') - UNKNOWN CODE - detail:`, detail);
      break;
    }
  }


  hasAnyWarnings() {
    return this.hasAmbiguousSites()
      || this.hasMissingDates()
      || this.hasInvalidStates()
      || this.hasInvalidGaps()
      || this.hasInvalidMutations()
      || this.hasOther();
  }

  hasAmbiguousSites() {return this.ambiguousSiteCount > 0; }
  getAmbiguousSiteCount() { return this.ambiguousSiteCount; }
  hasMissingDates() {return this.noDateSequences.length > 0; }
  getNoDateCount() { return this.noDateSequences.length; }
  hasInvalidStates() {return this.invalidStateCount > 0;}
  getInvalidStateSequenceCount() {return Object.keys(this.invalidStateSequences).length;}
  hasInvalidGaps() {return this.invalidGapCount > 0;}
  getInvalidGapSequenceCount() {return Object.keys(this.invalidGapSequences).length;}
  hasInvalidMutations() {return this.invalidMutationCount > 0;}
  getInvalidMutationSequenceCount() {return Object.keys(this.invalidMutationSequences).length;}
  hasOther() {return this.getOtherCount() > 0;}
  getOtherCount() {return Object.keys(this.other).length;}

}