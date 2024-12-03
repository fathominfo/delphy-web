import { STAGES } from '../constants';
import { setShowFormat, setStage } from '../errors';
import { SharedState } from '../sharedstate';
import {Pythia} from '../pythia/pythia';
import { ConfigExport } from './mccconfig';
import {SequenceWarningCode} from '../pythia/delphy_api';
import { RecordQuality } from '../recordquality';

const DEMO_PATH = './ma_sars_cov_2.maple'

let pythia : Pythia;
let qc: RecordQuality;

const showFormatHints = ()=>{
  info.classList.remove("hidden");
}
setShowFormat(showFormatHints);


/* show a progress bar when possible */
const statusContainer = document.querySelector("#uploader--status") as HTMLDivElement;
const progressBar = document.querySelector("#uploader--progress") as HTMLDivElement;
const progressLabel = document.querySelector("#uploader--progress-label") as HTMLDivElement;
const showProgress = (label:string, total: number, soFar: number)=>{
  if (soFar === 0 || soFar === total) {
    activateProgressBar(false);
  } else {
    activateProgressBar(true);
    const pct = 100 * soFar / total;
    progressBar.style.width = `${pct}%`;
    progressLabel.innerHTML = label;
  }
};
const showSimpleProgress = (unit: string, total: number, soFar: number)=>{
  const label = `${soFar} / ${total} ${unit}`;
  showProgress(label, total, soFar);
};
const activateProgressBar = (showit=true)=>{
  statusContainer.classList.toggle("progressing", showit);
}

let runCallback = ()=>console.debug('runCallback not assigned'),
  configCallback = (config: ConfigExport)=>console.debug('configCallback not assigned', config);


const warningsLabelAddendum = () => {
    let result = "";
    let c = qc.getAmbiguousSiteCount();
    if (c > 0) {
      result += `<br/> ${c} ambiguous site${c === 1 ? '':'s'} masked`;
    }
    c = qc.getNoDateCount();
    if (c > 0) {
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
  },
  stageCallback = (stage: number)=>console.log(`Entering stage ${stage}`),
  parseProgressCallback = (numSeqsSoFar: number, bytesSoFar: number, totalBytes: number) => {
    const label = `${numSeqsSoFar} sequence${ numSeqsSoFar === 1 ? '' : 's' } read${
      warningsLabelAddendum()}`;
    showProgress(label, totalBytes, bytesSoFar);
    // console.log(`Read ${numSeqsSoFar} sequences so far `
    //   + `(${bytesSoFar} of ${totalBytes} bytes = ${100.0*bytesSoFar/totalBytes}%)`);
  },
  analysisProgressCallback = (numSeqsSoFar: number, totalSeqs: number) => {
    const label = `${numSeqsSoFar} sequence${ numSeqsSoFar === 1 ? '' : 's' } analyzed${
      warningsLabelAddendum()}`;
    showProgress(label, totalSeqs, numSeqsSoFar);
    // console.log(`Read ${numSeqsSoFar} sequences so far `
    //   + `(${bytesSoFar} of ${totalBytes} bytes = ${100.0*bytesSoFar/totalBytes}%)`);
  },
  initTreeProgressCallback = (tipsSoFar:number, totalTips:number) => {
    const label = `Building initial tree${
      warningsLabelAddendum()}`;
    // console.log(`Building initial tree: completed ${tipsSoFar} / ${totalTips} so far`);
    showProgress(label, totalTips, tipsSoFar);
  },
  loadWarningCallback = (seqId: string, warningCode: SequenceWarningCode, detail: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    qc.parseWarning(seqId, warningCode, detail);
  };
const errCallback = (msg:string)=>{
  console.log(msg);
  requestAnimationFrame(()=>{
    showFormatHints()
    uploadDiv.classList.remove('parsing');
    uploadDiv.classList.remove('loading');
    uploadDiv.classList.add('error');
    setTimeout(()=>alert(msg), 0);
  });
}

const maybeUploadDiv = document.querySelector("#uploader");
if (!maybeUploadDiv) {
  throw new Error("could not find the uploader div in the html");
}
const uploadDiv = maybeUploadDiv as HTMLDivElement;

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


function bindUpload(p:Pythia, sstate:SharedState, callback : ()=>void, setConfig : (config: ConfigExport)=>void) {
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
  document.querySelector("#uploader--demo-button")?.addEventListener("click", ()=>{
    setStage(STAGES.loading);
    uploadDiv.classList.add('loading');
    fetch(DEMO_PATH)
      .then(r => r.arrayBuffer())
      .then(bytesJs => {
        setStage(STAGES.parsing);
        uploadDiv.classList.remove('loading');
        uploadDiv.classList.add('parsing');
        qc.reset();
        pythia.initRunFromMaple(bytesJs, runCallback, errCallback, stageCallback, parseProgressCallback, initTreeProgressCallback, loadWarningCallback);
      })
  });

  document.querySelectorAll('.version-info').forEach((domElement)=>{
    const coreVersion = p.coreVersion;
    (domElement.querySelector('.core-version') as HTMLElement).innerText = coreVersion.version;
    (domElement.querySelector('.core-build') as HTMLElement).innerText = `${coreVersion.build}`;
    (domElement.querySelector('.core-commit') as HTMLElement).innerText = coreVersion.commit;
    domElement.classList.remove('hidden');
  })

  const fileInput = uploadDiv.querySelector("#uploader--file-input") as HTMLInputElement;
  if (fileInput) {
    fileInput?.addEventListener("change", ()=>{
      if (fileInput.files) {
        setStage(STAGES.loading);
        uploadDiv.classList.add('loading');
        checkFiles(fileInput.files);
      }
    });

  }

  const button = document.querySelector("#uploader--demo-button") as HTMLButtonElement;
  button.focus();
}

const loadNow = (url:string)=>{
  console.log(`fetching from ${url}`);
  setStage(STAGES.loading);
  uploadDiv.classList.add('loading');
  uploadDiv.classList.add('direct-loading');
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      setStage(STAGES.parsing);
      uploadDiv.classList.remove('loading');
      uploadDiv.classList.add('parsing');
      const fname = url.split('/').pop() || '';
      const asFile = new File([blob], fname);
      checkFiles([asFile]);
    });
};


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
    for (let i = 0; i < files.length; i++) {
      const file = files[i],
        fname = file.name,
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
          if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback, stageCallback, parseProgressCallback, analysisProgressCallback, initTreeProgressCallback, loadWarningCallback);
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'maple') {
        reader.addEventListener('load', event=>{
          setStage(STAGES.parsing);
          uploadDiv.classList.remove('loading');
          uploadDiv.classList.add('parsing');
          const mapleBytesJs = event.target?.result as ArrayBuffer;
          qc.reset();
          if (mapleBytesJs) pythia.initRunFromMaple(mapleBytesJs, runCallback, errCallback, stageCallback, parseProgressCallback, initTreeProgressCallback, loadWarningCallback);
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
              if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback, stageCallback, parseProgressCallback, analysisProgressCallback, initTreeProgressCallback, loadWarningCallback);
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


// const handleMessage = (message)=>{
//   const data = message.data;
//   switch(data.type) {
//   case 'loaded':
//     runCallback();
//     break;
//   case 'fail':
//     alert('bad parse');
//     break;

//   }
// };




export { bindUpload, hideUpload, loadNow };
