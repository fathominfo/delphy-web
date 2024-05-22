import {Pythia} from '../pythia/pythia';
import { ConfigExport } from './mccconfig';

const DEMO_PATH = './ma_sars_cov_2.fasta'


let pythia : Pythia;

let runCallback = ()=>{console.debug('runCallback not assigned')},
  configCallback = (config: ConfigExport)=>{console.debug('configCallback not assigned', config)};

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
    uploadDiv.classList.add('loading');
    handleFileUpload(event).then(()=>{
      uploadDiv.classList.remove('loading');
      uploadDiv.classList.add('parsing');
      // console.log(item);
      // const {tree, refSeq, count} = item;
      // runCallback(tree, refSeq, count);
    });
  });
  document.querySelector("#uploader--demo-button")?.addEventListener("click", ()=>{
    uploadDiv.classList.add('loading');
    fetch(DEMO_PATH)
      .then(r => r.arrayBuffer())
      .then(fastaBytesJs => {
        uploadDiv.classList.remove('loading');
        uploadDiv.classList.add('parsing');
        pythia.initRunFromFasta(fastaBytesJs, runCallback);
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
  uploadDiv.classList.add('loading');
  uploadDiv.classList.add('direct-loading');
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
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
      const files = event.dataTransfer.files;
      checkFiles(files);
    }
  });
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
          uploadDiv.classList.remove('loading');
          uploadDiv.classList.add('parsing');
          const bytesJs = event.target?.result;
          if (bytesJs) {
            const mccConfig = pythia.initRunFromSaveFile(bytesJs as ArrayBuffer, runCallback);
            configCallback(mccConfig as ConfigExport);
          } else {
            alert(`could not read file.`);
          }
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'fasta' || extension === 'fa') {
        reader.addEventListener('load', event=>{
          uploadDiv.classList.remove('loading');
          uploadDiv.classList.add('parsing');
          const fastaBytesJs = event.target?.result as ArrayBuffer;
          if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback);
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
            uploadDiv.classList.add('parsing');
            reader.addEventListener('load', event=>{
              const fastaBytesJs = event.target?.result as ArrayBuffer;
              if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback);
            });
            reader.readAsArrayBuffer(file);
          } else {
            alert(`This program doesn't handle '.${extension}' files. Please upload a fasta (with a ".fa" or ".fasta" extension) or a saved Delphy (.dphy) run.`);
            uploadDiv.classList.remove('loading');
            uploadDiv.classList.remove('parsing');
            uploadDiv.classList.remove('direct-loading');
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
