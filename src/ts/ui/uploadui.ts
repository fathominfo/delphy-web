import { noop, STAGES } from '../constants';
import { isBadSafari, setShowFormat, setStage } from '../errors';
import { SharedState } from '../sharedstate';
import {getEmptyRunParamConfig, Pythia, RunParamConfig} from '../pythia/pythia';
import { ConfigExport } from './mccconfig';
import {SequenceWarningCode} from '../pythia/delphy_api';
import { RecordQuality } from '../recordquality';
import { parse_iso_date } from '../pythia/dates';
import { nfc, UNSET } from './common';

const DEMO_FILES = './demofiles.json'

export type configCallbackType = (config: ConfigExport)=>void;

type DemoOption = {
  folder:string,
  pathogen:string,
  label: string,
  description : string,
  paper : string,
  paper_link: string | null,
  author_info: string,
  data_link : string | null,
  data_description : string | null,
  config : object | null,
  metadata_col : number
};

// type PythiaRunFileCallback = (
//   fastaBytesJs:ArrayBuffer,
//   runReadyCallback:()=>void,
//   errCallback:(msg:string)=>void,
//   stageCallback:(stage:number)=>void,
//   parseProgressCallback:(numSeqsSoFar: number, bytesSoFar: number, totalBytes: number)=>void,
//   analysisProgressCallback:(numSeqsSoFar: number, totalSeqs: number)=>void,
//   guideTreeProgressCallback:(tipsSoFar:number, totalTips:number)=>void,
//   refinedTreeProgressCallback:(round:number, tipsSoFar:number, totalTips:number)=>void,
//   sprRefineProgressCallback:(attempt:number, maxAttempts:number, curMuts:number)=>void,
//   rootingProgressCallback:(substageId:number, substage:number, numSubstages:number, nodes:number, total:number)=>void,
//   warningCallback:(seqId:string, warningCode: SequenceWarningCode, detail:any)=>void, // eslint-disable-line @typescript-eslint/no-explicit-any
//   config: RunParamConfig | null
// )=>Promise<void>;






const uploadDiv = document.querySelector("#uploader") as HTMLDivElement;
const fileStepContainer = uploadDiv.querySelector("#uploader--data-file") as HTMLDivElement;
const fileStepTemplate = fileStepContainer?.querySelector(".uploader--data-step") as HTMLDivElement;
fileStepTemplate.remove();

class ProgressStep {
  name: string;
  container: HTMLDivElement;
  checkBox: HTMLSpanElement;
  bar: HTMLDivElement;
  barFrame: HTMLDivElement;
  label: HTMLSpanElement;
  spinner: HTMLDivElement;
  spinning: boolean;
  // unit: string;
  // unitSingular: string;
  // total = UNSET;

  // constructor(name: string, unit: string, unitSingular: string, spinning=false) {
  constructor(name: string, spinning=false) {
    this.container = fileStepTemplate.cloneNode(true) as HTMLDivElement;
    this.name = name;
    (this.container.querySelector(".uploader--data-step-name") as HTMLSpanElement).textContent = name;
    this.checkBox = this.container.querySelector(".uploader--data-step-checked") as HTMLSpanElement;
    this.barFrame = this.container.querySelector(".uploader--progress-frame") as HTMLDivElement;
    this.bar = this.container.querySelector(".uploader--progress") as HTMLDivElement;
    this.label = this.container.querySelector(".uploader--data-step-label") as HTMLSpanElement;
    this.spinner = this.container.querySelector(".uploader--progress-spinner") as HTMLDivElement;
    // this.unit = unit;
    // this.unitSingular = unitSingular;
    this.spinning = spinning;
    if (spinning) {
      this.label.classList.add("hidden");
    }
    fileStepContainer.append(this.container);
  }

  show() {
    console.log(this.name, 'show');
    if (this.spinning) { this.spinner.classList.remove("hidden");}
    else this.barFrame.classList.remove("hidden");
  }

  /* assumes success */
  complete() {
    console.log(`${this.name} complete`);
    this.bar.style.width = `100%`;
    this.barFrame.classList.add("hidden");
    this.spinner.classList.add("hidden");
    this.checkBox.classList.remove("hidden");
  }

  setLabel(label: string) {
    // const label = `${soFar} / ${this.total} ${soFar === 1 ? this.unitSingular : this.unit}`;
    this.label.innerHTML = label;
  }

  /*
  returns an indication of whether the step is complete
  */
  updateBar(soFar: number, total: number): boolean {
    if (Number.isFinite(total)) {
      const pct = 100 * soFar / total;
      this.bar.style.width = `${pct}%`;
      return soFar === total;
    }
    return false;
  }
}



const initDphyUpload = ()=>{
  new ProgressStep("parsing");

};




const initFileUpload = (filePath: string, pythia : Pythia, isMaple: boolean, jsBytes: ArrayBuffer): Promise<void>=>{
  const fileName = filePath.split('/').pop() as string;
  (uploadDiv.querySelector("#uploader--file-name") as HTMLParagraphElement).textContent = fileName;
  fileStepContainer.innerHTML = '';
  console.log('launching upload sequence')
  const parsingStep = new ProgressStep("parsing");
  const analyzingStep = new ProgressStep("analyzing");
  const buildingStep = new ProgressStep("build guide tree");
  const refiningStep = new ProgressStep("refine guide tree");
  const optimizingStep = new ProgressStep("optimize tree");
  const rootingBottomUpStep = new ProgressStep("rooting and timing: bottom-up");
  const rootingTopDownStep = new ProgressStep("rooting and timing: top-down");
  const rootingCandidateStep = new ProgressStep("rooting and timing: root candidate");
  const preparingStep = new ProgressStep("preparing delphy run", true);

  const steps = [
    parsingStep,
    analyzingStep,
    buildingStep,
    refiningStep,
    optimizingStep,
    rootingBottomUpStep,
    rootingTopDownStep,
    rootingCandidateStep,
    preparingStep
  ];
  let stepIndex = -1;

  parsingStep.show();
  const stageCallback = (stage: number)=>{
      if (steps[stepIndex]) {
        steps[stepIndex].complete();
      }
      stepIndex++;
      console.log(`Entering stage ${stage}`);
      steps[stepIndex].show();

    },
    parseProgressCallback = (numSeqsSoFar: number, bytesSoFar: number, totalBytes: number) => {
      const label = `${nfc(numSeqsSoFar)} sequence${ numSeqsSoFar === 1 ? '' : 's' } read`;
      const isComplete = parsingStep.updateBar(bytesSoFar, totalBytes);
      parsingStep.setLabel(label);
      // console.log(`Read ${numSeqsSoFar} sequences so far `
      //   + `(${bytesSoFar} of ${totalBytes} bytes = ${100.0*bytesSoFar/totalBytes}%)`);
    },
    analysisProgressCallback = (numSeqsSoFar: number, totalSeqs: number) => {
      const label = `${nfc(numSeqsSoFar)} sequence${ numSeqsSoFar === 1 ? '' : 's' } analyzed`;
      const isComplete = analyzingStep.updateBar(numSeqsSoFar, totalSeqs);
      analyzingStep.setLabel(label);
      // console.log(`Read ${numSeqsSoFar} sequences so far `
      //   + `(${bytesSoFar} of ${totalBytes} bytes = ${100.0*bytesSoFar/totalBytes}%)`);
    },
    guideTreeProgressCallback = (tipsSoFar:number, totalTips:number) => {
      // showProgress(`Building guide tree`, totalTips, tipsSoFar);
      const label = `${nfc(tipsSoFar)} tip${ tipsSoFar === 1 ? '' : 's' }`;
      const isComplete = buildingStep.updateBar(tipsSoFar, totalTips);
      buildingStep.setLabel(label);
    },
    refinedTreeProgressCallback = (round:number, tipsSoFar:number, totalTips:number) => {
      // showProgress(`Refining guide tree (round ${round})`, totalTips, tipsSoFar);
      const label = `${nfc(tipsSoFar)} tip${ tipsSoFar === 1 ? '' : 's' }`;
      const isComplete = refiningStep.updateBar(tipsSoFar, totalTips);
      refiningStep.setLabel(label);
    },
    sprRefineProgressCallback = (attempt:number, maxAttempts:number, curMuts:number) => {
      // showProgress(`Optimizing tree: ${curMuts} mutations`, maxAttempts, attempt);
      const label = `${nfc(curMuts)} mutation${ curMuts === 1 ? '' : 's' }`;
      const isComplete = optimizingStep.updateBar(attempt, maxAttempts);
      optimizingStep.setLabel(label);
    },
    // Keep in sync with the Rooting_substage enum in core/utree.h
    rootingSubstageLabels: {[id: number]: string} = {
      1: "bottom-up timing",
      2: "top-down timing",
      3: "root candidate evaluation"
    },
    rootingProgressCallback = (substageId:number, substage:number, numSubstages:number, nodes:number, total:number) => {
      // const what = rootingSubstageLabels[substageId] ?? "rooting and timing";
      // Global fraction across all passes so the bar advances monotonically (scaled to `total`
      // so showProgress renders it as a percentage).
      // const soFar = Math.round(((substage - 1) + (total > 0 ? nodes / total : 0)) / numSubstages * total);
      let step: ProgressStep = rootingBottomUpStep;
      if (substageId === 1) step = rootingBottomUpStep;
      else if (substageId === 2) step = rootingTopDownStep;
      else if (substageId === 3) step = rootingCandidateStep;
      const label = `${nfc(nodes)} nodes${ nodes === 1 ? '' : 's' }`;
      const isComplete = step.updateBar(nodes, total);
      step.setLabel(label);
      // console.log(`Rooting and timing: ${substageId}`, step.name, nodes, total);
      if (isComplete) {
        console.log(`Rooting and timing: ${substageId} complete`);
        step.complete();
        if (substageId === 1) {
          rootingTopDownStep.show();
        } else if (substageId === 2) {
          rootingCandidateStep.show();
        } else if (substageId === 3) {
          preparingStep.show();
        }
      }
    }


  const notRunning = ()=>{
    console.log("not Running");
  };

  if (isMaple) {
    return pythia.initRunFromMaple(jsBytes, notRunning /*runCallback*/, errCallback,
      stageCallback, parseProgressCallback, analysisProgressCallback,
      guideTreeProgressCallback, refinedTreeProgressCallback,
      sprRefineProgressCallback, rootingProgressCallback,
      loadWarningCallback, null);
  } else {
    return pythia.initRunFromFasta(jsBytes, notRunning /*runCallback*/, errCallback,
      stageCallback, parseProgressCallback, analysisProgressCallback,
      guideTreeProgressCallback, refinedTreeProgressCallback,
      sprRefineProgressCallback, rootingProgressCallback,
      loadWarningCallback, null);
  }
};









let pythia : Pythia;
let qc: RecordQuality;

// const demoDiv = uploadDiv.querySelector("#uploader--demo") as HTMLInputElement;
const fileLabel = uploadDiv.querySelector("#uploader--file-input--label") as HTMLLabelElement;
const urlDiv = uploadDiv.querySelector("#uploader--url-message") as HTMLDivElement;

/* show a progress bar when possible */
const statusContainer = uploadDiv.querySelector("#uploader--status") as HTMLDivElement;
const progressBar = uploadDiv.querySelector(".uploader--progress") as HTMLDivElement;
const progressLabel = uploadDiv.querySelector(".uploader--progress-label") as HTMLDivElement;
const showSimpleProgress = (unit: string, total: number, soFar: number)=>{
  const label = `${soFar} / ${total} ${unit}`;

  if (soFar === 0 || soFar === total) {
    statusContainer.classList.remove("progressing");
  } else {
    statusContainer.classList.add("progressing");
    const pct = 100 * soFar / total;
    progressBar.style.width = `${pct}%`;
    progressLabel.innerHTML = label;
  }

};


let runCallback = ()=>console.debug('runCallback not assigned'),
  configCallback = (config: ConfigExport)=>console.debug('configCallback not assigned', config);




const warningsLabelAddendum = () => {
  let result = "";
  let c;
  if (qc.hasAmbiguousSites()) {
    c = qc.getAmbiguousSiteCount();
    result += `<br/> ${c} ambiguous site${c === 1 ? '':'s'} masked`;
  }
  if (qc.hasMissingDates()) {
    c = qc.getNoDateCount();
    result += `<br/> ${c} unusable date${c === 1 ? '' : 's'}`;
  }
  if (qc.hasInvalidStates()) {
    c = qc.getInvalidStateSequenceCount();
    result += `<br/> ${c} invalid state${c === 1 ? '' : 's'}`;
  }
  if (qc.hasInvalidGaps()) {
    c = qc.getInvalidGapSequenceCount();
    result += `<br/> ${c} invalid gap${c === 1 ? '' : 's'}`;
  }
  if (qc.hasInvalidMutations()) {
    c = qc.getInvalidMutationSequenceCount();
    result += `<br/> ${c} invalid mutation${c === 1 ? '' : 's'}`;
  }
  if (qc.hasOther()) {
    c = qc.getOtherCount();
    result += `<br/> ${c} sequence${c === 1 ? '': 's'} with other data issues`;
  }
  return result;
};
const loadWarningCallback = (seqId: string, warningCode: SequenceWarningCode, detail: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    qc.parseWarning(seqId, warningCode, detail);
  },
  showCatchallSpinner = ()=>{
    progressLabel.innerHTML = "Preparing run";
    (document.querySelector(".uploader--progress-frame") as HTMLDivElement).classList.add("hidden");
    (document.querySelector(".uploader--progress-spinner") as HTMLDivElement).classList.remove("hidden");
  },
  resetProgressIndicator = ()=>{
    progressLabel.innerHTML = "";
    (document.querySelector(".uploader--progress-frame") as HTMLDivElement).classList.remove("hidden");
    (document.querySelector(".uploader--progress-spinner") as HTMLDivElement).classList.add("hidden");
  };

const errCallback = (msg:string)=>{
  console.log(msg);
  requestAnimationFrame(()=>{
    if (!isBadSafari()) {
      showFormatHints()
    }
    uploadDiv.classList.remove('parsing');
    uploadDiv.classList.remove('loading');
    uploadDiv.classList.add('error');
    setTimeout(()=>alert(msg), 0);
  });
}

const info = uploadDiv.querySelector(".uploader--info-content") as HTMLElement;
const infoToggle = uploadDiv.querySelector(".uploader--info-toggle") as HTMLButtonElement;
infoToggle.addEventListener("click", () => info.classList.toggle("hidden"));
uploadDiv.addEventListener("click", e => {
  const target = e.target as HTMLElement;
  if (target.closest(".uploader--info")) return;
  info.classList.add("hidden");
});
window.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!info.classList.contains("hidden")) {
      info.classList.add("hidden");
    }
  }
});


const showFormatHints = ()=>{
  info.classList.remove("hidden");
}
setShowFormat(showFormatHints);



function bindUpload(p:Pythia, sstate:SharedState, callback : ()=>void, setConfig : configCallbackType) {
  pythia = p;
  qc = sstate.qc;
  runCallback = callback;
  configCallback = setConfig;
  uploadDiv.classList.remove('disabled');
  document.body.addEventListener("dragover", (event:DragEvent)=>handleDrag(event));
  document.body.addEventListener("dragleave", () => handleDragLeave());
  document.body.addEventListener("drop", (event:DragEvent)=>{
    setStage(STAGES.loading);
    uploadDiv.classList.add('loading');
    handleFileUpload(event).then(()=>{
      setStage(STAGES.parsing);
      uploadDiv.classList.remove('loading');
      uploadDiv.classList.add('parsing');
      // console.log(item);
      // const {tree, refSeq, count} = item;
      // runCallback(tree, refSeq, count);
    });
  });
  const demoForm = document.querySelector("#uploader--demo-form") as HTMLFormElement;
  const demoFileOptTemplate = demoForm.querySelector(".uploader--demo-option") as HTMLLabelElement;
  const demoOptContainer = demoFileOptTemplate.parentNode;
  const runButton = document.querySelector("#uploader--demo-button") as HTMLButtonElement;
  const runDetails = document.querySelector("#uploader--demo-selection") as HTMLDivElement;
  // const pathLabel = runDetails.querySelector(".selection-pathogen") as HTMLSpanElement;
  // const authorLabel = runDetails.querySelector(".selection-paper-name") as HTMLSpanElement;
  const paperLink = runDetails.querySelector(".selection-paper-link") as HTMLAnchorElement;
  const dataLink = runDetails.querySelector(".selection-data-link") as HTMLAnchorElement;
  const dataNoteSpan = runDetails.querySelector(".selection-data-note") as HTMLSpanElement;
  const downloadLink = runDetails.querySelector("a.download") as HTMLAnchorElement;
  const descriptionEl = runDetails.querySelector(".selection-description") as HTMLParagraphElement;
  demoFileOptTemplate.remove();
  const folderData: {[fname:string]:DemoOption} = {};

  const setDemoSelection = (selection: string)=>{
    const option = folderData[selection];
    const zipFilename = `${option.folder}.zip`;
    const zipFilepath = `demo/${option.folder}/${zipFilename}`;

    // pathLabel.textContent = option.pathogen;
    // authorLabel.textContent = option.author_info;
    paperLink.textContent = option.paper_link;
    // paperLink.classList.toggle("hidden", !option.paper_link);
    paperLink.href = option.paper_link || '';
    dataLink.classList.toggle("hidden", !option.data_link);
    dataLink.href = option.data_link || '';
    dataLink.textContent = option.data_link || '';
    dataNoteSpan.classList.toggle("hidden", !option.data_description);
    dataNoteSpan.textContent = option.data_description;
    downloadLink.href = zipFilepath;
    downloadLink.download = zipFilename;
    descriptionEl.textContent = option.description;
  }

  fetch(DEMO_FILES)
    .then(r=>r.json())
    .then(optionList=>{
      (optionList as Array<DemoOption>).forEach((option, i)=>{
        const { folder, pathogen, author_info } = option;
        console.log(option);
        const copy = demoFileOptTemplate.cloneNode(true) as HTMLLabelElement;
        // copy.title = description;
        const input = copy.querySelector("input") as HTMLInputElement;
        const paperSpan = copy.querySelector(".author-info") as HTMLSpanElement;
        const pathoSpan = copy.querySelector(".pathogen") as HTMLSpanElement;
        input.value = folder;
        input.checked = i === 0;
        pathoSpan.textContent = pathogen;
        paperSpan.textContent = author_info;
        demoOptContainer?.appendChild(copy);
        folderData[folder] = option;
        if (input.checked) {
          setDemoSelection(folder);
        }
      })
    });


  demoForm.addEventListener("change", ()=>{
    const selection = demoForm.folder.value as string;
    setDemoSelection(selection);
  });

  runButton.addEventListener("click", ()=>{
    const folder = demoForm.folder.value as string;
    const fileToLoad = `./demo/${folder}/${folder}.maple`;
    const fileData = folderData[folder];
    const config = fileData.config;
    let runParams: RunParamConfig | null = null;
    if (config !== null) {
      const asObject: any = getEmptyRunParamConfig() as object; // eslint-disable-line @typescript-eslint/no-explicit-any
      Object.entries(config).forEach(([prop, value])=>{
        prop = prop as string;
        if (asObject[prop] !== undefined) {
          if (prop === "skygridStartDate") {
            value = parse_iso_date(value as string);
          }
          asObject[prop] = value;
        }
      });
      runParams = asObject as RunParamConfig;
    }

    console.log(`loading demo file ${fileToLoad}`);
    setStage(STAGES.loading);
    hideEntryPoints();
    uploadDiv.classList.add('loading');
    let fetchMetadata = noop;
    if (fileData.metadata_col >= 0) {
      const mccConfig = {
        metadataPresent : 1,
        metadataFile : `${folder}.csv`,
        selectedMDField : fileData.metadata_col,
        colorBy : 1
      } as ConfigExport;
      const metadataFilePath = `./demo/${folder}/${folder}_metadata.csv`;
      fetchMetadata = ()=>{
        fetch(metadataFilePath)
          .then(r=>r.text())
          .then(txt=>{
            mccConfig.metadataText = txt;
            mccConfig.metadataDelimiter = ',';
            configCallback(mccConfig);
          });
      }
    }

    fetch(fileToLoad)
      .then(r => r.arrayBuffer())
      .then(bytesJs => {
        setStage(STAGES.parsing);
        uploadDiv.classList.remove('loading');
        uploadDiv.classList.add('parsing');
        qc.reset();
        resetProgressIndicator();
        if (fileToLoad.endsWith(".maple")) {
          initFileUpload(fileToLoad, pythia, true, bytesJs).then(fetchMetadata);
        } else {
          initFileUpload(fileToLoad, pythia, false, bytesJs).then(fetchMetadata);
        }
      })
  });

  document.querySelectorAll('.version-info').forEach((domElement)=>{
    const coreVersion = p.coreVersion;
    const versionEle = (domElement.querySelector('.core-version') as HTMLElement);
    const buildEle = (domElement.querySelector('.core-build') as HTMLElement);
    const commitEle = (domElement.querySelector('.core-commit') as HTMLElement);
    if (versionEle) versionEle.innerText = coreVersion.version;
    if (buildEle) buildEle.innerText = `${coreVersion.build}`;
    if (commitEle) commitEle.innerText = coreVersion.commit;
    domElement.classList.remove('hidden');
  })


  const fileInput = uploadDiv.querySelector("#uploader--file-input") as HTMLInputElement;
  if (fileInput) {
    fileInput?.addEventListener("change", ()=>{
      if (fileInput.files) {
        setStage(STAGES.loading);
        hideEntryPoints();
        fileLabel.classList.add("opening");
        fileLabel.classList.add("disabled");
        fileInput.blur();
        uploadDiv.classList.add('loading');
        checkFiles(fileInput.files);
      }
    });
  }
  const urlInput = uploadDiv.querySelector("#uploader--url-input") as HTMLInputElement;
  const urlForm = uploadDiv.querySelector("#uploader--url-form") as HTMLFormElement;
  const urlFormSubmit = urlForm.querySelector("input[type='submit']") as HTMLInputElement;
  urlInput.addEventListener("input", ()=>{
    console.log(`input '${urlInput.value}'`)
    urlFormSubmit.disabled = urlInput.value.length === 0;
  });
  urlForm.addEventListener("submit", (event:SubmitEvent)=>{
    event.preventDefault();
    loadNow(urlInput.value);
    return false;
  });
  let button: HTMLButtonElement = document.querySelector("#uploader--proxy-info-activate") as HTMLButtonElement;
  button?.addEventListener("click", ()=>urlDiv?.classList.toggle("proxy-info"));
  const loc = window.location;
  if (loc.search.length > 1) {
    let dataUrl = loc.search.substring(1);
    if (!dataUrl.startsWith("http")) {
      dataUrl = `${loc.origin}${loc.pathname}${dataUrl}`;
    }
    /*
    If the url is distributed in a mailing, it may have garbage like
    `utm_source=fathominfo&utm_medium=email&utm_campaign=2024-at-fathom`
    which could trigger an error and not look good. So ignore urls with
    ampersands (is that too wide a net?).
    ref https://github.com/fathominfo/delphy-web/issues/52 [mark 260115]
    */
    if (!/&/.test(dataUrl)) {
      loadNow(dataUrl);
    } else {
      window.location.href = window.location.origin;
    }
  } else {
    button = document.querySelector("#uploader--demo-button") as HTMLButtonElement;
    button.focus();
  }
}



const loadNow = (url:string)=>{
  setStage(STAGES.loading);
  hideEntryPoints();
  urlDiv.classList.add("opening");
  uploadDiv.classList.add('loading');
  uploadDiv.classList.add('direct-loading');
  const options:RequestInit = {
    mode: "cors",
    referrerPolicy : "unsafe-url"
  };
  {
    console.log(`fetching from ${url}`);
    fetch(url, options)
      .then(response => {
        if (!response.ok) {
          if (response.type === 'opaque') {
            /*
            we can see this error when trying to load by url,
            but the remote headers don't allow cross origin access
            */
            throw new Error(`'${url}' does not allow the delphy server to load it directly. Try downloading it and loading it locally. `);
          }
          console.log(`we connected, but got status code ${response.status}, type '${response.type}'`);
          throw new Error(response.statusText || `response.type = '${response.type}'`);
        }
        return response.blob();
      })
      .then(blob => {
        setStage(STAGES.parsing);
        uploadDiv.classList.remove('loading');
        uploadDiv.classList.add('parsing');
        const fname = url.split('/').pop() || '';
        const asFile = new File([blob], fname);
        // blob.text().then(txt=>console.log(txt));
        checkFiles([asFile]);
      })
      .catch((err:TypeError)=>{
        console.log(err);
        // console.log("gonna retry by proxy");
        // loadNow(url, true);
        showURLFailureMessage(url);

      });
  }
};

const showURLFailureMessage = (url:string)=>{
  const urlDict = new URL(url);
  uploadDiv.classList.remove('loading');
  const popup = document.querySelector("#uploader--proxy-popup") as HTMLDivElement;
  const dismissButton = popup.querySelector("#uploader--bad-url-msg-dismiss") as HTMLButtonElement;
  const serverSpan = popup.querySelector("#remote-url-server") as HTMLSpanElement;
  const dismiss = ()=>{
    uploadDiv.classList.remove('direct-loading');
    dismissButton.removeEventListener("click", dismiss);
    popup.classList.remove("active");
    window.location.href = window.location.origin;
  }
  serverSpan.textContent = `of ${urlDict.hostname}`;
  dismissButton.addEventListener("click", dismiss);
  popup.classList.add("active");
}



const hideUpload = ()=>{
  document.body.classList.toggle("displaying-import-view", false);
}


const handleDrag = (event: DragEvent)=>{
  if (event && event.dataTransfer) {
    /*
    default behavior for the browser is to open the file in a new tab.
    We don't want that.
    */
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';

    uploadDiv.classList.add("dragging");
  }
}

const handleDragLeave = ()=>{
  uploadDiv.classList.remove("dragging");
}

const handleFileUpload = (event: DragEvent)=>{
  hideEntryPoints();
  return new Promise(()=>{
    if (event && event.dataTransfer) {
      event.preventDefault();
      event.stopPropagation();
      uploadDiv.classList.add('loading');
      setStage(STAGES.loading);
      const files = event.dataTransfer.files;
      checkFiles(files);
    }
  });
}

const displayParsingState = ()=>{
  setStage(STAGES.parsing);
  uploadDiv.classList.remove('loading');
  uploadDiv.classList.add('parsing');
}

const checkFiles = (files: File[] | FileList)=>{
  if (files) {
    const file = files[0];
    if (file) {
      const fname = file.name,
        tokens = fname.split('.'),
        extension = tokens[tokens.length - 1],
        reader = new FileReader();
      if (extension === 'dphy') {
        /* we are loading a saved run */
        reader.addEventListener('load', event=>{
          displayParsingState();
          const bytesJs = event.target?.result;
          if (bytesJs) {
            const progressCallback = (p:number, t:number)=>{
              const action = `${p === 1 ? 'tree' : 'trees'  } loaded`;
              showSimpleProgress(action, t, p);
            };
            pythia.initRunFromSaveFile(bytesJs as ArrayBuffer, runCallback, progressCallback)
              .then(mccConfig=>configCallback(mccConfig as ConfigExport));
          } else {
            alert(`could not read file.`);
          }
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'fasta' || extension === 'fa') {
        reader.addEventListener('load', event=>{
          displayParsingState();
          const fastaBytesJs = event.target?.result as ArrayBuffer;
          qc.reset();
          resetProgressIndicator();
          if (fastaBytesJs) {
            initFileUpload(fname, pythia, false, fastaBytesJs);
          }
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'maple') {
        reader.addEventListener('load', event=>{
          setStage(STAGES.parsing);
          uploadDiv.classList.remove('loading');
          uploadDiv.classList.add('parsing');
          const mapleBytesJs = event.target?.result as ArrayBuffer;
          qc.reset();
          resetProgressIndicator();
          if (mapleBytesJs) {
            initFileUpload(fname, pythia, true, mapleBytesJs);
          }
        });
        reader.readAsArrayBuffer(file);
      } else {
        // check if this is formatted like a fasta file
        const onload = (event:ProgressEvent)=>{
          const text = (event.target as HTMLFormElement)?.result;
          reader.removeEventListener('load', onload);
          uploadDiv.classList.remove('loading');
          // do we have a fasta file? this check is simplistic:
          if (text[0] === '>') {
            setStage(STAGES.parsing);
            uploadDiv.classList.add('parsing');
            reader.addEventListener('load', event=>{
              const fastaBytesJs = event.target?.result as ArrayBuffer;
              qc.reset();
              resetProgressIndicator();
              if (fastaBytesJs) {
                initFileUpload(fname, pythia, false, fastaBytesJs);
              }
            });
            reader.readAsArrayBuffer(file);
          } else {
            alert(`This program doesn't handle '.${extension}' files. Please upload a fasta (with a ".fa" or ".fasta" extension) or a saved Delphy (.dphy) run.`);
            uploadDiv.classList.remove('loading');
            uploadDiv.classList.remove('parsing');
            uploadDiv.classList.remove('direct-loading');
            setStage(STAGES.initialization);
          }
        }
        reader.addEventListener('load', onload);
        reader.readAsText(file);
      }
    }
  }
}


function hideEntryPoints() {
  uploadDiv.classList.add("uploading");
}




export { bindUpload, hideUpload, loadNow };
