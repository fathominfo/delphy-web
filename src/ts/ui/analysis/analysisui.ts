import { SharedState } from "../../sharedstate";
import { UIScreen } from "../uiscreen";




export class AnalysisUI extends UIScreen {



  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
  }
}