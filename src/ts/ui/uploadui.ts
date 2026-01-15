import { noop, STAGES } from '../constants';
import { setShowFormat, setStage } from '../errors';
import { SharedState } from '../sharedstate';
import {getEmptyRunParamConfig, Pythia, RunParamConfig} from '../pythia/pythia';
import { ConfigExport } from './mccconfig';
import {SequenceWarningCode} from '../pythia/delphy_api';
import { RecordQuality } from '../recordquality';
import { parse_iso_date } from '../pythia/dates';

const DEMO_FILES = './demofiles.json'


/* hopefully good enough. Source:
https://stackoverflow.com/questions/1500260/detect-urls-in-text-with-javascript
*/
const URL_REGEX = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig; // eslint-disable-line no-useless-escape

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

let pythia : Pythia;
let qc: RecordQuality;

const showFormatHints = ()=>{
  info.classList.remove("hidden");
}
setShowFormat(showFormatHints);

const maybeUploadDiv = document.querySelector("#uploader");
if (!maybeUploadDiv) {
  throw new Error("could not find the uploader div in the html");
}
const uploadDiv = maybeUploadDiv as HTMLDivElement;
const demoDiv = uploadDiv.querySelector("#uploader--demo") as HTMLInputElement;
const fileLabel = uploadDiv.querySelector("#uploader--file-input--label") as HTMLLabelElement;
const urlDiv = uploadDiv.querySelector("#uploader--url-message") as HTMLDivElement;

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
    hideOthers(demoDiv);
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
        if (fileToLoad.endsWith(".maple")) {
          pythia.initRunFromMaple(bytesJs, runCallback, errCallback,
            stageCallback, parseProgressCallback, initTreeProgressCallback,
            loadWarningCallback, runParams)
            .then(fetchMetadata);
        } else {
          pythia.initRunFromFasta(bytesJs, runCallback, errCallback,
            stageCallback, parseProgressCallback, analysisProgressCallback,
            initTreeProgressCallback, loadWarningCallback, runParams)
            .then(fetchMetadata);
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
        hideOthers(fileLabel);
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
    if (URL_REGEX.test(dataUrl)) {
      loadNow(dataUrl);
    } else {
      button = document.querySelector("#uploader--demo-button") as HTMLButtonElement;
      button.focus();
    }
  } else {
    button = document.querySelector("#uploader--demo-button") as HTMLButtonElement;
    button.focus();
  }
}



const loadNow = (url:string)=>{
  setStage(STAGES.loading);
  hideOthers(urlDiv);
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
  hideOthers(fileLabel);
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
          if (fastaBytesJs) {
            pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback,
              stageCallback, parseProgressCallback, analysisProgressCallback,
              initTreeProgressCallback, loadWarningCallback, null);
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
          if (mapleBytesJs) {
            pythia.initRunFromMaple(mapleBytesJs, runCallback, errCallback,
              stageCallback, parseProgressCallback,
              initTreeProgressCallback, loadWarningCallback, null);
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
              if (fastaBytesJs) {
                pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback,
                  stageCallback, parseProgressCallback, analysisProgressCallback,
                  initTreeProgressCallback, loadWarningCallback, null);
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


function hideOthers(originEle: HTMLElement) {
  const collapsingVertically = [demoDiv, fileLabel, urlDiv].filter(ele=>ele !== originEle);
  const collapsingHorizontally = [demoDiv, fileLabel, urlDiv].filter(ele=>ele !== originEle);
  requestAnimationFrame(()=>{
    collapsingVertically.forEach(ele=>{
      const ht = ele.offsetHeight;
      ele.style.height = `${ht}px`;
      ele.classList.add('collapsing');
    });
    collapsingHorizontally.forEach(ele=>{
      const width = ele.offsetWidth;
      ele.style.height = `${width}px`;
      ele.classList.add('collapsing');
    });
    requestAnimationFrame(()=>{
      collapsingVertically.forEach(ele=>ele.style.height = `0`);
      collapsingHorizontally.forEach(ele=>ele.style.width = `0`);
      if (originEle === demoDiv) {
        const openers = document.querySelector("#uploader--file-url-pathways") as HTMLDivElement;
        openers.classList.add('hidden');
      }
    });
  });
}


export { bindUpload, hideUpload, loadNow };
