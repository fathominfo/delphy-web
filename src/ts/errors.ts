import { STAGES } from "./constants";

const STAGE_LABELS = [
  "initialization",
  "selecting file",
  "loading",
  "parsing",
  "ready",
  "resetting"
];
let stage = STAGES.initialization;

let showFormatCallback:()=>void = ()=>{console.debug("errors.showFormatCallback has not been assigned")};

export const setStage = (newStage:number)=>{
  stage = newStage;
}

export const setShowFormat = (fnc:()=>void)=>{
  showFormatCallback = fnc;
}



/*
add a last chance error handler
*/

const shownCodes: boolean[] = [];

const onError = (err: ErrorEvent)=>{
  console.warn(`Error encountered in the ${STAGE_LABELS[stage]} stage\n`, err);
  if (!shownCodes[stage]) {
    shownCodes[stage] = true;
    let msg = "";
    switch(stage) {
    case STAGES.initialization:
      msg = "Could not initialize delphy. Please check your network connection and try again.";
      msg += "If you continue to have trouble, please let us know at delphy@fathom.info.";
      break;
    case STAGES.selecting:
      msg = "Something went wrong while trying to select your file. ";
      break;
    case STAGES.loading:
      msg = "Could not load file. Please check your network connection and try again.";
      msg += "If you continue to have trouble, please let us know at delphy@fathom.info.";
      break;
    case STAGES.parsing:
      msg = "Could not parse your file. Please check that the fasta file is formatted correctly, reload the page, and try again. ";
      msg += "If you continue to have trouble, please let us know at delphy@fathom.info.";
      showFormatCallback();
      break;
    case STAGES.loaded:
      msg = "An unknown error occured while running your file. Please try again.";
      msg += "If you continue to have trouble, please let us know at delphy@fathom.info.";
      showFormatCallback();
      break;
    case STAGES.resetting:
      msg = "An unknown error encountered while resetting the parameters. If you reload the page and edit the parameters before the run, it should work fine.";
      msg += "If you continue to have trouble, please let us know at delphy@fathom.info.";
      showFormatCallback();
      break;
    }
    if (msg.length > 0) {
      setTimeout(()=>alert(msg), 30);
    }
  }
}

export const initErrors = ()=>window.addEventListener("error", onError);




