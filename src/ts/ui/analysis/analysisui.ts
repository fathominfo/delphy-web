import { SharedState } from "../../sharedstate";
import { MccUI } from "../mccui";




export class AnalysisUI extends MccUI {

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#analysis .tree-canvas");
  }
}