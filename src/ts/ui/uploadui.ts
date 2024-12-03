import { STAGES } from '../constants';
import { setShowFormat, setStage } from '../errors';
import {Pythia} from '../pythia/pythia';
import { ConfigExport } from './mccconfig';

const DEMO_PATH = './ma_sars_cov_2.maple'


let pythia : Pythia;

const showFormatHints = ()=>{
  info.classList.remove("hidden");
}
setShowFormat(showFormatHints);


/* show a progress bar when possible */
const statusContainer = document.querySelector("#uploader--status") as HTMLDivElement;
const progressBar = document.querySelector("#uploader--progress") as HTMLDivElement;
const progressLabel = document.querySelector("#uploader--progress-label") as HTMLDivElement;
const showProgress = (unit: string, total: number, soFar: number)=>{
  /* if we aren't tracking progress, yield to the main status message */
  if (soFar === 0 || soFar === total) {
    activateProgressBar(false);
  } else {
    activateProgressBar(true);
    const pct = 100 * soFar / total;
    const label = `${soFar} / ${total} ${unit}`;
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = label;
  }
};
const activateProgressBar = (showit=true)=>{
  statusContainer.classList.toggle("progressing", showit);
}

let runCallback = ()=>{console.debug('runCallback not assigned')},
  configCallback = (config: ConfigExport)=>{console.debug('configCallback not assigned', config)};
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


function bindUpload(p:Pythia, callback : ()=>void, setConfig : (config: ConfigExport)=>void) {
  pythia = p;
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
        // pythia.initRunFromFasta(bytesJs, runCallback, errCallback);
        pythia.initRunFromMaple(bytesJs, runCallback, errCallback);
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
              showProgress(action, t, p);
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
          if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback);
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'maple') {
        reader.addEventListener('load', event=>{
          setStage(STAGES.parsing);
          uploadDiv.classList.remove('loading');
          uploadDiv.classList.add('parsing');
          const mapleBytesJs = event.target?.result as ArrayBuffer;
          if (mapleBytesJs) pythia.initRunFromMaple(mapleBytesJs, runCallback, errCallback);
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
              if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback);
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
