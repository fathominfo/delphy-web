import { SharedState } from "../sharedstate";


/*
executed once upon completing the load of the data
*/
export const setQCPanel = (sharedState: SharedState)=>{
  const qc = sharedState.qc;
  console.log(qc);
}