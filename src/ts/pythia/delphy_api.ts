// delphy_api.js: The lowest-level JS wrapper around the C API exposed by the Delphy core

/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-spread */
/* eslint-disable prefer-rest-params */

// Emscripten's very badly modularized shim loads *after* this file loads: it's
// loaded in `index.html` by the tag `<script type="text/javascript"
// src="./ts/delphy/delphy.js" defer>`.  So this is a good moment to set up the
// global object `Module` that Emscripten uses to communicate with the outside
// world, and fill it in with any initial values of settings (e.g.,
// INITIAL_MEMORY) and callbacks (e.g., onRuntimeInitialized).

// By default, globalThis does not have the properties for 'Module' and
// 'delphy*'. This would cause the typescript linter to fail.
// It would be nice to avoid casting globalThis as 'any', but for portability's
// sake it's a compromise we are willing to make.
const globalAny:any = globalThis; // eslint-disable-line no-undef
const Module:any = globalAny['Module'] = {};

// Extract useful functions from very badly encapsulated Emscripten shim
let UTF8ToString: (ptr: number) => string = function() {
  return (UTF8ToString = globalAny['UTF8ToString']).apply(null, arguments);
};
let stringToUTF8OnStack: (str: string) => number = function() {
  return (stringToUTF8OnStack = globalAny['stringToUTF8OnStack']).apply(null, arguments);
}
let stackAlloc: (size: number) => number = function() {
  return (stackAlloc = globalAny['stackAlloc']).apply(null, arguments);
}
// withStackSave was removed from the Emscripten shim around Apr 2024
// https://github.com/emscripten-core/emscripten/issues/21763
let stackSave: () => number = function() {
  return (stackSave = globalAny['stackSave']).apply(null, arguments);
}
let stackRestore: (sp: number) => void = function() {
  return (stackRestore = globalAny['stackRestore']).apply(null, arguments);
}
function withStackSave(f: any): any {
  const sp = stackSave();
  try { return f(); }
  finally { stackRestore(sp); }
}

// Crude callbacks system
// ======================

// activeCallbacks[n] holds a currently pending callback with id 'n'.  Ids are assigned
// using the lowest available number.  There can be up to MAX_ACTIVE_CALLBACKS in flight.
// When a callback is invoked from the C++ side, the callback slot is freed and may be
// reused later.
const activeCallbacks: {[callbackId: number]: {onresult: any, onerror: any}} = {};
const MAX_ACTIVE_CALLBACKS = 1000;
function registerCallback(onresult: any, onerror: any): number {  // return callback id
  for (let i = 0; i < MAX_ACTIVE_CALLBACKS; ++i) {
    if (!((`${i}`) in activeCallbacks)) {
      // Found a slot
      activeCallbacks[i] = {onresult, onerror};
      return i;
    }
  }
  throw "No more callback slots available!";
}

function useCallback(callbackId: number): {onresult: any, onerror: any} {
  if (!(callbackId in activeCallbacks)) {
    console.log(`Bad callback, slot ${callbackId} is empty!`);
  }
  const cb = activeCallbacks[callbackId];
  // Free slot before calling callback to permit efficient callback chaining
  delete activeCallbacks[callbackId];
  return cb;
}
globalAny['delphyRunCallback'] = function(callbackId: number, ...params: any[]): void {
  // This function must be visible to EM_ASM on the C++ side, and its name must not be
  // minified, hence the "globalAny[<str>]" junk
  useCallback(callbackId).onresult(...params);
}
globalAny['delphyFailCallback'] = function(callbackId: number, ...params: any[]): void {
  // This function must be visible to EM_ASM on the C++ side, and its name must not be
  // minified, hence the "globalAny[<str>]" junk
  useCallback(callbackId).onerror(...params);
}

// Generic wrapper for async API call with callbacks.
//
// Given a C++ API function `f` that takes a callback_id as its last parameter, return
// another function that takes one fewer parameter but returns a promise that will be
// resolved with the API's result on the main thread.
const wrapRawAsyncApi = <T>(func: any) => (...args: any[]) => new Promise<T>((resolve, reject) => {
  func(...args, registerCallback(
    (result: any) => resolve(result),
    (error: any) => reject(error)));
});


// For reporting progress and warnings, we adapt the above to a slightly janky system
// of hooks, which are first registered, can then be called many times from the WASM side,
// and are finally deregistered.
const activeHooks: {[hookId: number]: any} = {};
const MAX_ACTIVE_HOOKS = 1000;
const NOOP_HOOK = -1;
function registerHook(hook: any): number {  // return hook id
  for (let i = 0; i < MAX_ACTIVE_HOOKS; ++i) {
    if (!((`${i}`) in activeHooks)) {
      // Found a slot
      activeHooks[i] = hook;
      return i;
    }
  }
  throw "No more hook slots available!";
}
function useHook(hookId: number): any {
  if (!(hookId in activeHooks)) {
    console.log(`Bad hook, slot ${hookId} is empty!`);
  }
  return activeHooks[hookId];
}
function deregisterHook(hookId: number): void {
  if (!(hookId in activeHooks)) {
    console.log(`Bad hook, slot ${hookId} is empty!`);
  }
  delete activeHooks[hookId];
}

globalAny['delphyRunHook'] = function(hookId: number, ...params: any[]): void {
  // Special case: hookId == NOOP_HOOK means ignore calls to the hook
  if (hookId === NOOP_HOOK) {
    return;
  }

  // This function must be visible to EM_ASM on the C++ side, and its name must not be
  // minified, hence the "globalAny[<str>]" junk
  useHook(hookId)(...params);
}

// Generic wrapper for managing registration/deregistration of hooks.
//
// Usage: withHook(myJsHookFunction, (hookId) => doSomething(1, 2, 3, hookId));
//
// function withHook(hookFunction: any, body: (id: number) => any) {
//   let hookId = registerHook(hookFunction);
//   try {
//     return body(hookId);
//   } finally {
//     deregisterHook(hookId);
//   }
// }

// Generic wrapper for managing registration/deregistration of hooks of async methods.
// Postpones deregistration until Promise completes (successfully or unsuccessfully).
//
// Usage: withHookAsync(myJsHookFunction, (hookId) => doSomethingAsync(1, 2, 3, hookId));
//
function withHookAsync<T>(hookFunction: any, body: (hookId: number) => Promise<T>): Promise<T> {
  const hookId = registerHook(hookFunction);
  return body(hookId).finally(() => deregisterHook(hookId));
}


// JS interface to Delphy core
// ===========================

export type HookId = number;
export type CharPtr = number;
export type DoublePtr = number;
export type StringPtr = number;
export type DelphyContextPtr = number;
export type PhyloTreePtr = number;
export type PhyloTreePtrPtr = number;
export type RunPtr = number;
export type MccTreePtr = number;
export type BaseTreeIndex = number;
export type BeastyOutputPtr = number;
export type FbHolderPtr = number;
export type NodeIndex = number;
export type NodeIndexPtr = number;
export type SiteIndex = number;
export type RealSeqLetter = number;
export const RealSeqLetter_A = 0;
export const RealSeqLetter_C = 1;
export const RealSeqLetter_G = 2;
export const RealSeqLetter_T = 3;
export type RealSeqLetterPtr = number;
export type MutationListIteratorPtr = number;

export const kNoNode: NodeIndex = -1;

export enum SequenceWarningCode {
  NoValidDate = 1,
  AmbiguityPrecisionLoss = 2,
}

export class Delphy {

  public ctx: DelphyContextPtr;  // Need to pass this on every API call

  // You have to wait until core is loaded before interacting with it
  public static waitForInit(): Promise<void> {
    return Delphy.delphyCoreInitPromise;
  }

  constructor() {
    if (!Delphy.coreInited) {
      throw "Core not initialized yet: did attach a continuation to Delphy.waitForInit()?";
    }
    const prngSeed = 0;    // 0 = Seed PRNG with system's random device
    const numThreads = 0;  // 0 = Default to hardware concurrency (always at least 1)
    this.ctx = Delphy.delphyCoreRaw.create_context(prngSeed, numThreads);
  }

  delete() {
    Delphy.delphyCoreRaw.delete_context(this.ctx);
  }

  getVersionString(): string {
    const rawVersionString = Delphy.delphyCoreRaw.get_version_string(this.ctx);
    // eslint-disable-next-line new-cap
    return UTF8ToString(rawVersionString);
  }

  getBuildNumber(): number {
    return Delphy.delphyCoreRaw.get_build_number(this.ctx);
  }

  getCommitString(): string {
    const rawCommitString = Delphy.delphyCoreRaw.get_commit_string(this.ctx);
    // eslint-disable-next-line new-cap
    return UTF8ToString(rawCommitString);
  }

  parseFastaIntoInitialTreeAsync(
    fastaBytes: ArrayBuffer,
    stageProgressHook: (stage: number) => void = () => void 0,
    fastaReadProgressHook: (seqsSoFar: number, bytesSoFar: number, totalBytes: number) => void = () => void 0,
    analysisProgressHook: (seqsSoFar: number, totalSeqs: number) => void = () => void 0,
    initialBuildProgressHook: (tipsSoFar: number, totalTips: number) => void = () => void 0,
    warningHook: (seqId: string, warningCode: SequenceWarningCode, detail: string) => void = () => void 0
  ): Promise<PhyloTree> {
    const numFastaBytes = fastaBytes.byteLength;
    const fastaBytesView = new Uint8Array(fastaBytes, 0, numFastaBytes);
    const fastaBytesWasm = Delphy.delphyCoreRaw.malloc(numFastaBytes);
    const fastaBytesWasmView = new Uint8Array(Module.HEAPU8.buffer, fastaBytesWasm, numFastaBytes);
    fastaBytesWasmView.set(fastaBytesView);

    return withHookAsync(stageProgressHook, (stageProgressHookId) =>
      withHookAsync(fastaReadProgressHook, (fastaReadProgressHookId) =>
        withHookAsync(analysisProgressHook, (analysisProgressHookId) =>
          withHookAsync(initialBuildProgressHook, (initialBuildProgressHookId) =>
            withHookAsync(warningHook, (warningHookId) =>

              Delphy.delphyCoreRaw.parse_fasta_into_initial_tree_async(this.ctx, fastaBytesWasm, numFastaBytes,
                stageProgressHookId,
                fastaReadProgressHookId,
                analysisProgressHookId,
                initialBuildProgressHookId,
                warningHookId))))))
      .then(phyloTreePtr => {
        const pt = new PhyloTree(this, phyloTreePtr);
        return pt;
      })
      .finally(() => Delphy.delphyCoreRaw.free(fastaBytesWasm));
  }

  parseMapleIntoInitialTreeAsync(mapleBytes: ArrayBuffer): Promise<PhyloTree> {
    const numMapleBytes = mapleBytes.byteLength;
    const mapleBytesView = new Uint8Array(mapleBytes, 0, numMapleBytes);
    const mapleBytesWasm = Delphy.delphyCoreRaw.malloc(numMapleBytes);
    const mapleBytesWasmView = new Uint8Array(Module.HEAPU8.buffer, mapleBytesWasm, numMapleBytes);
    mapleBytesWasmView.set(mapleBytesView);

    return Delphy.delphyCoreRaw.parse_maple_into_initial_tree_async(this.ctx, mapleBytesWasm, numMapleBytes)
      .then(phyloTreePtr => new PhyloTree(this, phyloTreePtr))
      .catch(err=>{
        console.log(`caught error during pares`, err);
        return new PhyloTree(this, 0);
      })
      .finally(() => Delphy.delphyCoreRaw.free(mapleBytesWasm));
  }

  createRun(phyloTree: PhyloTree, prngSeed = 0): Run {
    return new Run(this, phyloTree, prngSeed);
  }

  createPhyloTreeFromFlatbuffers(treeFbBytes: ArrayBuffer, treeInfoFbBytes: ArrayBuffer): PhyloTree {
    const numTreeFbBytes = treeFbBytes.byteLength;
    const treeFbBytesView = new Uint8Array(treeFbBytes, 0, numTreeFbBytes);
    const treeFbBytesWasm = Delphy.delphyCoreRaw.malloc(numTreeFbBytes);
    const treeFbBytesWasmView = new Uint8Array(Module.HEAPU8.buffer, treeFbBytesWasm, numTreeFbBytes);
    treeFbBytesWasmView.set(treeFbBytesView);

    const numTreeInfoFbBytes = treeInfoFbBytes.byteLength;
    const treeInfoFbBytesView = new Uint8Array(treeInfoFbBytes, 0, numTreeInfoFbBytes);
    const treeInfoFbBytesWasm = Delphy.delphyCoreRaw.malloc(numTreeInfoFbBytes);
    const treeInfoFbBytesWasmView = new Uint8Array(Module.HEAPU8.buffer, treeInfoFbBytesWasm, numTreeInfoFbBytes);
    treeInfoFbBytesWasmView.set(treeInfoFbBytesView);

    const phyloTreePtr = Delphy.delphyCoreRaw.phylo_tree_from_flatbuffers(
      this.ctx, treeFbBytesWasm, treeInfoFbBytesWasm);

    Delphy.delphyCoreRaw.free(treeFbBytesWasm);
    Delphy.delphyCoreRaw.free(treeInfoFbBytesWasm);

    return new PhyloTree(this, phyloTreePtr);
  }

  deriveMccTreeAsync(phyloTrees: PhyloTree[]): Promise<MccTree> {
    const sizeOfPhyloTreePtr = 4;
    const treesWasm = Delphy.delphyCoreRaw.malloc(phyloTrees.length * sizeOfPhyloTreePtr);
    const treesWasmView = new Uint32Array(Module.HEAPU32.buffer, treesWasm, phyloTrees.length);
    for (let i = 0; i !== phyloTrees.length; ++i) {
      treesWasmView[i] = phyloTrees[i].phyloTreePtr_;
    }

    return Delphy.delphyCoreRaw.derive_mcc_tree_async(this.ctx, treesWasm, phyloTrees.length)
      .then(mccTreePtr => new MccTree(this, mccTreePtr))
      .finally(() => Delphy.delphyCoreRaw.free(treesWasm));
  }

  // result[i] = avg effective population size (times generation time)
  // between t_{i-1} and t_i, where
  //
  //    t_i = t_start + i * t_step,
  //    t_step = (t_end - t_start) / num_t_cells
  //
  popModelRenderPopulationCurve(popT0: number, popN0: number, popG: number,
    tStart: number, tEnd: number, numTCells: number): number[] {

    const sizeofDouble = 8;
    const valuesWasm = Delphy.delphyCoreRaw.malloc(sizeofDouble * numTCells);
    const valuesWasmView = new Float64Array(Module.HEAPF64.buffer, valuesWasm, numTCells);

    Delphy.delphyCoreRaw.pop_model_render_population_curve(
      this.ctx, popT0, popN0, popG, tStart, tEnd, numTCells, valuesWasm);

    const result = Array.from(valuesWasmView);  // Copy out before release

    Delphy.delphyCoreRaw.free(valuesWasm);

    return result;
  }

  // result[a][i] = probability that a random probe at time t_i has state `a` in site `site`, where
  //
  //    t_i = t_start + i * t_step,
  //    t_step = (t_end - t_start) / num_t_cells
  //
  popModelProbeSiteStatesOnTree(tree: PhyloTree, popT0: number, popN0: number, popG: number, site: number,
    tStart: number, tEnd: number, numTCells: number): number[][] {

    const sizeofDouble = 8;
    const valuesWasm = Delphy.delphyCoreRaw.malloc(sizeofDouble * 4 * numTCells);
    const valuesWasmView = new Float64Array(Module.HEAPF64.buffer, valuesWasm, 4 * numTCells);

    Delphy.delphyCoreRaw.pop_model_probe_site_states_on_tree(
      this.ctx, tree.phyloTreePtr_, popT0, popN0, popG, site, tStart, tEnd, numTCells, valuesWasm);

    // Copy out before release
    const result = [
      Array.prototype.slice.call(valuesWasmView, RealSeqLetter_A * numTCells, (RealSeqLetter_A+1) * numTCells),
      Array.prototype.slice.call(valuesWasmView, RealSeqLetter_C * numTCells, (RealSeqLetter_C+1) * numTCells),
      Array.prototype.slice.call(valuesWasmView, RealSeqLetter_G * numTCells, (RealSeqLetter_G+1) * numTCells),
      Array.prototype.slice.call(valuesWasmView, RealSeqLetter_T * numTCells, (RealSeqLetter_T+1) * numTCells),
    ];

    Delphy.delphyCoreRaw.free(valuesWasm);

    return result;
  }

  // result[k][i] = probability that a random probe at time t_i has node `k` as its closest marked ancestor, where
  //
  //    t_i = t_start + i * t_step,
  //    t_step = (t_end - t_start) / num_t_cells
  //
  // If k == markedAncestorIndices.length, all ancestors of the probe were above any marked ancestors
  popModelProbeAncestorsOnTree(tree: PhyloTree, popT0: number, popN0: number, popG: number,
    markedAncestorIndices: NodeIndex[], tStart: number, tEnd: number, numTCells: number): number[][] {
    return withStackSave(() => {
      const sizeofNodeIndex = 4;
      const numMarkedAncestors = markedAncestorIndices.length;
      const markedAncestorIndicesWasm = stackAlloc(sizeofNodeIndex * (numMarkedAncestors));
      const markedAncestorIndicesWasmView = new Uint32Array(
        Module.HEAPU32.buffer, markedAncestorIndicesWasm, numMarkedAncestors);
      markedAncestorIndicesWasmView.set(markedAncestorIndices);

      const sizeofDouble = 8;
      const valuesWasm = Delphy.delphyCoreRaw.malloc(sizeofDouble * (numMarkedAncestors+1) * numTCells);
      const valuesWasmView = new Float64Array(Module.HEAPF64.buffer, valuesWasm, (numMarkedAncestors+1) * numTCells);

      Delphy.delphyCoreRaw.pop_model_probe_ancestors_on_tree(
        this.ctx, tree.phyloTreePtr_, popT0, popN0, popG, markedAncestorIndicesWasm, numMarkedAncestors,
        tStart, tEnd, numTCells, valuesWasm);

      // Copy out before release
      const result = [];
      for (let i = 0; i !== (numMarkedAncestors+1); ++i) {  // Careful with the +1 !
        result.push(Array.prototype.slice.call(valuesWasmView, i * numTCells, (i+1) * numTCells));
      }
      Delphy.delphyCoreRaw.free(valuesWasm);
      return result;
    });
  }

  extractFbHelper(body: (fbHolderWasm: FbHolderPtr) => void): ArrayBuffer {
    return withStackSave(() => {
      const sizeofFbHolder = Delphy.delphyCoreRaw.fb_holder_sizeof(this.ctx);
      const fbHolderWasm = stackAlloc(sizeofFbHolder);

      Delphy.delphyCoreRaw.fb_holder_construct(this.ctx, fbHolderWasm);

      body(fbHolderWasm);

      const numFbBytes = Delphy.delphyCoreRaw.fb_holder_get_size(this.ctx, fbHolderWasm);
      const fbBytesWasm = Delphy.delphyCoreRaw.fb_holder_get_fb(this.ctx, fbHolderWasm);

      // Copy out before release
      const fbBytes = new Uint8Array(numFbBytes);
      const fbBytesWasmView = new Uint8Array(Module.HEAPU8.buffer, fbBytesWasm, numFbBytes);
      fbBytes.set(fbBytesWasmView);

      Delphy.delphyCoreRaw.fb_holder_delete(this.ctx, fbHolderWasm);

      return fbBytes;
    });
  }

  exportStringHelper(body: () => StringPtr): ArrayBuffer {
    const stringWasm = body();

    const numStrBytes = Delphy.delphyCoreRaw.string_size(this.ctx, stringWasm);
    const strDataWasm = Delphy.delphyCoreRaw.string_data(this.ctx, stringWasm);

    // Copy out before release
    const strBytes = new Uint8Array(numStrBytes);
    const strDataWasmView = new Uint8Array(Module.HEAPU8.buffer, strDataWasm, numStrBytes);
    strBytes.set(strDataWasmView);

    Delphy.delphyCoreRaw.string_delete(this.ctx, stringWasm);

    return strBytes;
  }

  // Raw interaction with Emscripten-generated Delphy core artifact
  // --------------------------------------------------------------
  // delphyCoreRaw holds references to the wrapped raw API methods
  private static coreInited = false;
  private static delphyCoreInitPromiseResolve: any = null;
  private static delphyCoreInitPromise = new Promise<void>((resolve) => {
    Delphy.delphyCoreInitPromiseResolve = resolve;
  });
  public static delphyCoreRaw: {
    malloc: (numBytes: number) => CharPtr,
    free: (p: CharPtr) => void,
    create_context: (prngSeed: number, numThreads: number) => DelphyContextPtr
    delete_context: (ctx: DelphyContextPtr) => void,

    // Versioning
    get_version_string: (ctx: DelphyContextPtr) => CharPtr,
    get_build_number: (ctx: DelphyContextPtr) => number,
    get_commit_string: (ctx: DelphyContextPtr) => CharPtr,

    // Input
    parse_fasta_into_initial_tree_async:
      (ctx: DelphyContextPtr,
       fastaBytes: CharPtr,
       numFastaBytes: number,
       stageProgressHookId: HookId,
       fastaReadProgressHookId: HookId,
       analysisProgressHookId: HookId,
       initialBuildProgressHookId: HookId,
       warningHookId: HookId)
        => Promise<PhyloTreePtr>,
    parse_maple_into_initial_tree_async:
      (ctx: DelphyContextPtr,
       mapleBytes: CharPtr,
       numMapleBytes: number)
        => Promise<PhyloTreePtr>,

    // Phylo_tree
    phylo_tree_copy: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr) => PhyloTreePtr,
    phylo_tree_copy_from: (ctx: DelphyContextPtr, dst: PhyloTreePtr, src: PhyloTreePtr) => PhyloTreePtr,
    phylo_tree_from_flatbuffers: (ctx: DelphyContextPtr, treeFb: CharPtr, treeInfoFb: CharPtr) => PhyloTreePtr,
    phylo_tree_to_flatbuffer: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, fb: FbHolderPtr) => void,
    phylo_tree_to_info_flatbuffer: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, fb: FbHolderPtr) => void,
    phylo_tree_delete: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr) => void,

    phylo_tree_get_size: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr) => NodeIndex,
    phylo_tree_get_root: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr) => NodeIndex,
    phylo_tree_set_root: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, root: NodeIndex) => void,
    phylo_tree_get_num_sites: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr) => SiteIndex,
    phylo_tree_get_root_sequence: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr) => RealSeqLetterPtr,
    phylo_tree_set_root_sequence:
      (ctx: DelphyContextPtr,
       tree: PhyloTreePtr,
       root_sequence_data: RealSeqLetterPtr,
       root_sequence_length: SiteIndex)
        => void,

    phylo_tree_get_parent_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, node: NodeIndex) => NodeIndex,
    phylo_tree_set_parent_of:
      (ctx: DelphyContextPtr,
       phyloTree: PhyloTreePtr,
       node: NodeIndex,
       newParent: NodeIndex)
        => void,
    phylo_tree_get_num_children_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, node: NodeIndex) => number,
    phylo_tree_get_left_child_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, node: NodeIndex) => NodeIndex,
    phylo_tree_get_right_child_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, node: NodeIndex) => NodeIndex,
    phylo_tree_clear_children_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, node: NodeIndex) => void,
    phylo_tree_set_children_of:
      (ctx: DelphyContextPtr,
       phyloTree: PhyloTreePtr,
       node: NodeIndex,
       newLeftChild: NodeIndex,
       newRightChild: NodeIndex)
        => void,

    phylo_tree_get_name_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, nodeIndex: NodeIndex) => CharPtr,
    phylo_tree_set_name_of:
      (ctx: DelphyContextPtr,
       phyloTree: PhyloTreePtr,
       nodeIndex: NodeIndex,
       rawNewName: CharPtr)
        => void,
    phylo_tree_get_time_of: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, nodeIndex: NodeIndex) => number,
    phylo_tree_set_time_of:
      (ctx: DelphyContextPtr,
       phyloTree: PhyloTreePtr,
       nodeIndex: NodeIndex,
       newTime: number)
        => void,

    phylo_tree_get_mutation_list_iterators_of:
      (ctx: DelphyContextPtr,
       phyloTree: PhyloTreePtr,
       nodeIndex: NodeIndex,
       outBegin: MutationListIteratorPtr,
       outEnd: MutationListIteratorPtr)
        => void,
    phylo_tree_clear_mutations_of:  (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, nodeIndex: NodeIndex) => void,

    // Mutation_list
    mutation_list_get_iterator_size: (ctx: DelphyContextPtr) => number,
    mutation_list_iterators_are_equal:
      (ctx: DelphyContextPtr,
       lhs: MutationListIteratorPtr,
       rhs: MutationListIteratorPtr)
        => boolean,
    mutation_list_iterator_advance: (ctx: DelphyContextPtr, it: MutationListIteratorPtr) => void,
    mutation_list_iterator_get_from: (ctx: DelphyContextPtr, it: MutationListIteratorPtr) => RealSeqLetter,
    mutation_list_iterator_get_site: (ctx: DelphyContextPtr, it: MutationListIteratorPtr) => SiteIndex,
    mutation_list_iterator_get_to: (ctx: DelphyContextPtr, it: MutationListIteratorPtr) => RealSeqLetter,
    mutation_list_iterator_get_time: (ctx: DelphyContextPtr, it: MutationListIteratorPtr) => number,

    // Run
    create_run: (ctx: DelphyContextPtr, phyloTree: PhyloTreePtr, prngSeed: number) => RunPtr,
    delete_run: (ctx: DelphyContextPtr, run: RunPtr) => void
    run_steps_async:
      (ctx: DelphyContextPtr,
       run: RunPtr,
       numSteps: number)
        => Promise<void>,
    run_get_tree: (ctx: DelphyContextPtr, run: RunPtr) => PhyloTreePtr,
    run_get_step: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_step: (ctx: DelphyContextPtr, run: RunPtr, step: number) => void,
    run_get_local_moves_per_global_move: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_local_moves_per_global_move: (ctx: DelphyContextPtr, run: RunPtr, localMovesPerGlobalMove: number) => void,
    run_get_num_parts: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_num_parts: (ctx: DelphyContextPtr, run: RunPtr, numParts: number) => void,
    run_get_mu: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_mu: (ctx: DelphyContextPtr, run: RunPtr, mu: number) => void,
    run_get_alpha: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_alpha: (ctx: DelphyContextPtr, run: RunPtr, alpha: number) => void,
    run_get_hky_kappa: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_hky_kappa: (ctx: DelphyContextPtr, run: RunPtr, hky_kappa: number) => void,
    run_get_hky_pi_A: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_hky_pi_A: (ctx: DelphyContextPtr, run: RunPtr, hky_pi_A: number) => void,
    run_get_hky_pi_C: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_hky_pi_C: (ctx: DelphyContextPtr, run: RunPtr, hky_pi_C: number) => void,
    run_get_hky_pi_G: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_hky_pi_G: (ctx: DelphyContextPtr, run: RunPtr, hky_pi_G: number) => void,
    run_get_hky_pi_T: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_hky_pi_T: (ctx: DelphyContextPtr, run: RunPtr, hky_pi_T: number) => void,
    run_get_pop_t0: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_pop_t0: (ctx: DelphyContextPtr, run: RunPtr, pop_t0: number) => number,
    run_get_pop_n0: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_pop_n0: (ctx: DelphyContextPtr, run: RunPtr, pop_n0: number) => number,
    run_get_pop_g: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_pop_g: (ctx: DelphyContextPtr, run: RunPtr, pop_g: number) => number,
    run_get_log_G: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_get_log_posterior: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_get_log_coalescent_prior: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_get_log_other_priors: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_get_total_branch_length: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_get_num_mutations: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_is_mu_move_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_mu_move_enabled: (ctx: DelphyContextPtr, run: RunPtr, enabled: boolean) => void,
    run_is_mpox_hack_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_mpox_hack_enabled: (ctx: DelphyContextPtr, run: RunPtr, mpoxHackEnabled: boolean) => void,
    run_get_mpox_mu: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_mpox_mu: (ctx: DelphyContextPtr, run: RunPtr, mpox_mu: number) => void,
    run_get_mpox_mu_star: (ctx: DelphyContextPtr, run: RunPtr) => number,
    run_set_mpox_mu_star: (ctx: DelphyContextPtr, run: RunPtr, mpox_mu_star: number) => void,
    run_is_only_displacing_inner_nodes: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_only_displacing_inner_nodes: (ctx: DelphyContextPtr, run: RunPtr, b: boolean) => void,
    run_are_topology_moves_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_topology_moves_enabled: (ctx: DelphyContextPtr, run: RunPtr, b: boolean) => void,
    run_is_repartitioning_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_repartitioning_enabled: (ctx: DelphyContextPtr, run: RunPtr, b: boolean) => void,
    run_is_alpha_move_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_alpha_move_enabled: (ctx: DelphyContextPtr, run: RunPtr, enabled: boolean) => void,
    run_is_final_pop_size_move_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_final_pop_size_move_enabled: (ctx: DelphyContextPtr, run: RunPtr, enabled: boolean) => void,
    run_is_pop_growth_rate_move_enabled: (ctx: DelphyContextPtr, run: RunPtr) => boolean,
    run_set_pop_growth_rate_move_enabled: (ctx: DelphyContextPtr, run: RunPtr, enabled: boolean) => void,
    run_get_params_to_flatbuffer: (ctx: DelphyContextPtr, run: RunPtr, fb: FbHolderPtr) => void,
    run_set_params_from_flatbuffer: (ctx: DelphyContextPtr, run: RunPtr, paramsFb: CharPtr) => void,
    run_export_beast_input: (ctx: DelphyContextPtr, run: RunPtr) => StringPtr,

    // Mcc_tree
    derive_mcc_tree_async:
      (ctx: DelphyContextPtr,
       trees: PhyloTreePtrPtr,
       num_trees: number)
        => Promise<MccTreePtr>,
    mcc_tree_delete: (ctx: DelphyContextPtr, tree: MccTreePtr) => void,
    mcc_tree_get_master_base_tree_index: (ctx: DelphyContextPtr, tree: MccTreePtr) => BaseTreeIndex,
    mcc_tree_get_num_base_trees: (ctx: DelphyContextPtr, tree: MccTreePtr) => BaseTreeIndex,
    mcc_tree_get_base_tree: (ctx: DelphyContextPtr, tree: MccTreePtr, baseTreeIndex: BaseTreeIndex) => PhyloTreePtr,
    mcc_tree_get_size: (ctx: DelphyContextPtr, tree: MccTreePtr) => NodeIndex,
    mcc_tree_get_root: (ctx: DelphyContextPtr, tree: MccTreePtr) => NodeIndex,
    mcc_tree_get_parent_of: (ctx: DelphyContextPtr, tree: MccTreePtr, nodeIndex: NodeIndex) => NodeIndex,
    mcc_tree_get_num_children_of: (ctx: DelphyContextPtr, tree: MccTreePtr, nodeIndex: NodeIndex) => number,
    mcc_tree_get_left_child_of: (ctx: DelphyContextPtr, tree: MccTreePtr, nodeIndex: NodeIndex) => NodeIndex,
    mcc_tree_get_right_child_of: (ctx: DelphyContextPtr, tree: MccTreePtr, nodeIndex: NodeIndex) => NodeIndex,
    mcc_tree_get_time_of: (ctx: DelphyContextPtr, tree: MccTreePtr, nodeIndex: NodeIndex) => number,
    mcc_tree_get_mrca_time_of: (ctx: DelphyContextPtr, tree: MccTreePtr, nodeIndex: NodeIndex) => number,
    mcc_tree_get_corresponding_node_in_base_tree:
      (ctx: DelphyContextPtr,
       mccTree: MccTreePtr,
       mccNodeIndex: NodeIndex,
       baseTreeIndex: BaseTreeIndex)
      => NodeIndex,
    mcc_tree_is_exact_match_in_base_tree:
      (ctx: DelphyContextPtr,
       mccTree: MccTreePtr,
       mccNodeIndex: NodeIndex,
       baseTreeIndex: BaseTreeIndex)
        => boolean,
    mcc_tree_export: (ctx: DelphyContextPtr, tree: MccTreePtr, innerNodesDefinedAsMrcasOfTips: boolean) => StringPtr,

    // Population model
    pop_model_render_population_curve:
      (ctx: DelphyContextPtr,
       popT0: number,
       popN0: number,
       popG: number,
       tStart: number,
       tEnd: number,
       numTCells: number,
       outValues: DoublePtr)
       => void,
    pop_model_probe_site_states_on_tree:
      (ctx: DelphyContextPtr,
       tree: PhyloTreePtr,
       popT0: number,
       popN0: number,
       popG: number,
       site: number,
       tStart: number,
       tEnd: number,
       numTCells: number,
       outValues: DoublePtr)
        => void,
    pop_model_probe_ancestors_on_tree:
      (ctx: DelphyContextPtr,
       tree: PhyloTreePtr,
       popT0: number,
       popN0: number,
       popG: number,
       markerAncestorIndices: NodeIndexPtr,
       numMarkedAncestors: NodeIndex,
       tStart: number,
       tEnd: number,
       numTCells: number,
       outValues: DoublePtr)
        => void,

    // Fb_holder
    fb_holder_sizeof: (ctx: DelphyContextPtr) => number,
    fb_holder_construct: (ctx: DelphyContextPtr, out_fb_holder: FbHolderPtr) => void,
    fb_holder_delete: (ctx: DelphyContextPtr, fb_holder: FbHolderPtr) => void,
    fb_holder_get_size: (ctx: DelphyContextPtr, fb_holder: FbHolderPtr) => number,
    fb_holder_get_fb: (ctx: DelphyContextPtr, fb_holder: FbHolderPtr) => CharPtr,

    // String
    string_delete: (ctx: DelphyContextPtr, str: StringPtr) => void,
    string_data: (ctx: DelphyContextPtr, str: StringPtr) => CharPtr,
    string_size: (ctx: DelphyContextPtr, str: StringPtr) => number,

    // Beasty_output
    create_beasty_output: (ctx: DelphyContextPtr, run: RunPtr) => BeastyOutputPtr,
    delete_beasty_output: (ctx: DelphyContextPtr, bout: BeastyOutputPtr) => void,
    beasty_output_snapshot: (ctx: DelphyContextPtr, bout: BeastyOutputPtr, run: RunPtr) => void,
    beasty_output_finalize: (ctx: DelphyContextPtr, bout: BeastyOutputPtr, run: RunPtr) => void,
    beasty_output_extract_log: (ctx: DelphyContextPtr, bout: BeastyOutputPtr) => StringPtr,
    beasty_output_extract_trees: (ctx: DelphyContextPtr, bout: BeastyOutputPtr) => StringPtr,
  };
  static delphyCoreCompleteInit() {
    Delphy.delphyCoreRaw = {
      malloc: Module['_malloc'],
      free: Module['_free'],
      create_context: Module['_delphy_create_context'],
      delete_context: Module['_delphy_delete_context'],

      // Versioning
      get_version_string: Module['_delphy_get_version_string'],
      get_build_number: Module['_delphy_get_build_number'],
      get_commit_string: Module['_delphy_get_commit_string'],

      // Input
      parse_fasta_into_initial_tree_async: wrapRawAsyncApi(Module['_delphy_parse_fasta_into_initial_tree_async']),
      parse_maple_into_initial_tree_async: wrapRawAsyncApi(Module['_delphy_parse_maple_into_initial_tree_async']),

      // PhyloTree
      phylo_tree_copy: Module['_delphy_phylo_tree_copy'],
      phylo_tree_copy_from: Module['_delphy_phylo_tree_copy_from'],
      phylo_tree_from_flatbuffers: Module['_delphy_phylo_tree_from_flatbuffers'],
      phylo_tree_to_flatbuffer: Module['_delphy_phylo_tree_to_flatbuffer'],
      phylo_tree_to_info_flatbuffer: Module['_delphy_phylo_tree_to_info_flatbuffer'],
      phylo_tree_delete: Module['_delphy_phylo_tree_delete'],

      phylo_tree_get_size: Module['_delphy_phylo_tree_get_size'],
      phylo_tree_get_root: Module['_delphy_phylo_tree_get_root'],
      phylo_tree_set_root: Module['_delphy_phylo_tree_set_root'],
      phylo_tree_get_num_sites: Module['_delphy_phylo_tree_get_num_sites'],
      phylo_tree_get_root_sequence: Module['_delphy_phylo_tree_get_root_sequence'],
      phylo_tree_set_root_sequence: Module['_delphy_phylo_tree_set_root_sequence'],

      phylo_tree_get_parent_of: Module['_delphy_phylo_tree_get_parent_of'],
      phylo_tree_set_parent_of: Module['_delphy_phylo_tree_set_parent_of'],
      phylo_tree_get_num_children_of: Module['_delphy_phylo_tree_get_num_children_of'],
      phylo_tree_get_left_child_of: Module['_delphy_phylo_tree_get_left_child_of'],
      phylo_tree_get_right_child_of: Module['_delphy_phylo_tree_get_right_child_of'],
      phylo_tree_clear_children_of: Module['_delphy_phylo_tree_clear_children_of'],
      phylo_tree_set_children_of: Module['_delphy_phylo_tree_set_children_of'],

      phylo_tree_get_name_of: Module['_delphy_phylo_tree_get_name_of'],
      phylo_tree_set_name_of: Module['_delphy_phylo_tree_set_name_of'],
      phylo_tree_get_time_of: Module['_delphy_phylo_tree_get_time_of'],
      phylo_tree_set_time_of: Module['_delphy_phylo_tree_set_time_of'],

      phylo_tree_get_mutation_list_iterators_of: Module['_delphy_phylo_tree_get_mutation_list_iterators_of'],
      phylo_tree_clear_mutations_of: Module['_delphy_phylo_tree_clear_mutations_of'],

      // Mutation_list
      mutation_list_get_iterator_size: Module['_delphy_mutation_list_get_iterator_size'],
      mutation_list_iterators_are_equal: Module['_delphy_mutation_list_iterators_are_equal'],
      mutation_list_iterator_advance: Module['_delphy_mutation_list_iterator_advance'],
      mutation_list_iterator_get_from: Module['_delphy_mutation_list_iterator_get_from'],
      mutation_list_iterator_get_site: Module['_delphy_mutation_list_iterator_get_site'],
      mutation_list_iterator_get_to: Module['_delphy_mutation_list_iterator_get_to'],
      mutation_list_iterator_get_time: Module['_delphy_mutation_list_iterator_get_time'],

      // Run
      create_run: Module['_delphy_create_run'],
      delete_run: Module['_delphy_delete_run'],
      run_steps_async: wrapRawAsyncApi(Module['_delphy_run_steps_async']),
      run_get_tree: Module['_delphy_run_get_tree'],
      run_get_step: Module['_delphy_run_get_step'],
      run_set_step: Module['_delphy_run_set_step'],
      run_get_local_moves_per_global_move: Module['_delphy_run_get_local_moves_per_global_move'],
      run_set_local_moves_per_global_move: Module['_delphy_run_set_local_moves_per_global_move'],
      run_get_num_parts: Module['_delphy_run_get_num_parts'],
      run_set_num_parts: Module['_delphy_run_set_num_parts'],
      run_get_mu: Module['_delphy_run_get_mu'],
      run_set_mu: Module['_delphy_run_set_mu'],
      run_get_alpha: Module['_delphy_run_get_alpha'],
      run_set_alpha: Module['_delphy_run_set_alpha'],
      run_get_hky_kappa: Module['_delphy_run_get_hky_kappa'],
      run_set_hky_kappa: Module['_delphy_run_set_hky_kappa'],
      run_get_hky_pi_A: Module['_delphy_run_get_hky_pi_A'],
      run_set_hky_pi_A: Module['_delphy_run_set_hky_pi_A'],
      run_get_hky_pi_C: Module['_delphy_run_get_hky_pi_C'],
      run_set_hky_pi_C: Module['_delphy_run_set_hky_pi_C'],
      run_get_hky_pi_G: Module['_delphy_run_get_hky_pi_G'],
      run_set_hky_pi_G: Module['_delphy_run_set_hky_pi_G'],
      run_get_hky_pi_T: Module['_delphy_run_get_hky_pi_T'],
      run_set_hky_pi_T: Module['_delphy_run_set_hky_pi_T'],
      run_get_pop_t0: Module['_delphy_run_get_pop_t0'],
      run_set_pop_t0: Module['_delphy_run_set_pop_t0'],
      run_get_pop_n0: Module['_delphy_run_get_pop_n0'],
      run_set_pop_n0: Module['_delphy_run_set_pop_n0'],
      run_get_pop_g: Module['_delphy_run_get_pop_g'],
      run_set_pop_g: Module['_delphy_run_set_pop_g'],
      run_get_log_G: Module['_delphy_run_get_log_G'],
      run_get_log_posterior: Module['_delphy_run_get_log_posterior'],
      run_get_log_coalescent_prior: Module['_delphy_run_get_log_coalescent_prior'],
      run_get_log_other_priors: Module['_delphy_run_get_log_other_priors'],
      run_get_total_branch_length: Module['_delphy_run_get_total_branch_length'],
      run_get_num_mutations: Module['_delphy_run_get_num_mutations'],
      run_is_mu_move_enabled: Module['_delphy_run_is_mu_move_enabled'],
      run_set_mu_move_enabled: Module['_delphy_run_set_mu_move_enabled'],
      run_is_mpox_hack_enabled: Module['_delphy_run_is_mpox_hack_enabled'],
      run_set_mpox_hack_enabled: Module['_delphy_run_set_mpox_hack_enabled'],
      run_get_mpox_mu: Module['_delphy_run_get_mpox_mu'],
      run_set_mpox_mu: Module['_delphy_run_set_mpox_mu'],
      run_get_mpox_mu_star: Module['_delphy_run_get_mpox_mu_star'],
      run_set_mpox_mu_star: Module['_delphy_run_set_mpox_mu_star'],
      run_is_only_displacing_inner_nodes: Module['_delphy_run_is_only_displacing_inner_nodes'],
      run_set_only_displacing_inner_nodes: Module['_delphy_run_set_only_displacing_inner_nodes'],
      run_are_topology_moves_enabled: Module['_delphy_run_are_topology_moves_enabled'],
      run_set_topology_moves_enabled: Module['_delphy_run_set_topology_moves_enabled'],
      run_is_repartitioning_enabled: Module['_delphy_run_is_repartitioning_enabled'],
      run_set_repartitioning_enabled: Module['_delphy_run_set_repartitioning_enabled'],
      run_is_alpha_move_enabled: Module['_delphy_run_is_alpha_move_enabled'],
      run_set_alpha_move_enabled: Module['_delphy_run_set_alpha_move_enabled'],
      run_is_final_pop_size_move_enabled: Module['_delphy_run_is_final_pop_size_move_enabled'],
      run_set_final_pop_size_move_enabled: Module['_delphy_run_set_final_pop_size_move_enabled'],
      run_is_pop_growth_rate_move_enabled: Module['_delphy_run_is_pop_growth_rate_move_enabled'],
      run_set_pop_growth_rate_move_enabled: Module['_delphy_run_set_pop_growth_rate_move_enabled'],
      run_get_params_to_flatbuffer: Module['_delphy_run_get_params_to_flatbuffer'],
      run_set_params_from_flatbuffer: Module['_delphy_run_set_params_from_flatbuffer'],
      run_export_beast_input: Module['_delphy_run_export_beast_input'],

      // Mcc_tree
      derive_mcc_tree_async: wrapRawAsyncApi(Module['_delphy_derive_mcc_tree_async']),
      mcc_tree_delete: Module['_delphy_mcc_tree_delete'],
      mcc_tree_get_master_base_tree_index: Module['_delphy_mcc_tree_get_master_base_tree_index'],
      mcc_tree_get_num_base_trees: Module['_delphy_mcc_tree_get_num_base_trees'],
      mcc_tree_get_base_tree: Module['_delphy_mcc_tree_get_base_tree'],
      mcc_tree_get_size: Module['_delphy_mcc_tree_get_size'],
      mcc_tree_get_root: Module['_delphy_mcc_tree_get_root'],
      mcc_tree_get_parent_of: Module['_delphy_mcc_tree_get_parent_of'],
      mcc_tree_get_num_children_of: Module['_delphy_mcc_tree_get_num_children_of'],
      mcc_tree_get_left_child_of: Module['_delphy_mcc_tree_get_left_child_of'],
      mcc_tree_get_right_child_of: Module['_delphy_mcc_tree_get_right_child_of'],
      mcc_tree_get_time_of: Module['_delphy_mcc_tree_get_time_of'],
      mcc_tree_get_mrca_time_of: Module['_delphy_mcc_tree_get_mrca_time_of'],
      mcc_tree_get_corresponding_node_in_base_tree: Module['_delphy_mcc_tree_get_corresponding_node_in_base_tree'],
      mcc_tree_is_exact_match_in_base_tree: Module['_delphy_mcc_tree_is_exact_match_in_base_tree'],
      mcc_tree_export: Module['_delphy_mcc_tree_export'],

      // Population model
      pop_model_render_population_curve: Module['_delphy_pop_model_render_population_curve'],
      pop_model_probe_site_states_on_tree: Module['_delphy_pop_model_probe_site_states_on_tree'],
      pop_model_probe_ancestors_on_tree: Module['_delphy_pop_model_probe_ancestors_on_tree'],

      // Fb_holder
      fb_holder_sizeof: Module['_delphy_fb_holder_sizeof'],
      fb_holder_construct: Module['_delphy_fb_holder_construct'],
      fb_holder_delete: Module['_delphy_fb_holder_delete'],
      fb_holder_get_size: Module['_delphy_fb_holder_get_size'],
      fb_holder_get_fb: Module['_delphy_fb_holder_get_fb'],

      // String
      string_delete: Module['_delphy_string_delete'],
      string_data: Module['_delphy_string_data'],
      string_size: Module['_delphy_string_size'],

      // Beasty_output
      create_beasty_output: Module['_delphy_create_beasty_output'],
      delete_beasty_output: Module['_delphy_delete_beasty_output'],
      beasty_output_snapshot: Module['_delphy_beasty_output_snapshot'],
      beasty_output_finalize: Module['_delphy_beasty_output_finalize'],
      beasty_output_extract_log: Module['_delphy_beasty_output_extract_log'],
      beasty_output_extract_trees: Module['_delphy_beasty_output_extract_trees'],
    };
    Delphy.coreInited = true;
    Delphy.delphyCoreInitPromiseResolve();
  }
  static {
    // Arrange for delphyCoreCompleteInit to be called once WASM module is instantiated
    Module.onRuntimeInitialized = Delphy.delphyCoreCompleteInit;
  }
}

export interface Tree {
  getSize(): NodeIndex;
  getRootIndex(): NodeIndex;
  getParentIndexOf(nodeIndex: NodeIndex) : NodeIndex;
  getNumChildrenOf(nodeIndex: NodeIndex): number;
  getLeftChildIndexOf(nodeIndex: NodeIndex): NodeIndex;
  getRightChildIndexOf(nodeIndex: NodeIndex): NodeIndex;
  getTimeOf(nodeIndex: NodeIndex): number;
}

export interface MutableTree extends Tree {
  setParentIndexOf(nodeIndex: NodeIndex, newParentIndex: NodeIndex): void;
  clearChildIndicesOf(nodeIndex: NodeIndex): void;
  setChildIndicesOf(nodeIndex: NodeIndex, newLeftChildIndex: NodeIndex, newRightChildIndex: NodeIndex): void;
}

export interface SummaryTree extends Tree {
  getNumBaseTrees(): BaseTreeIndex;
  getBaseTree(baseTreeIndex: BaseTreeIndex): PhyloTree;
  getCorrespondingNodeInBaseTree(summaryNodeIndex: NodeIndex, baseTreeIndex: BaseTreeIndex): NodeIndex;
  isExactMatchInBaseTree(summaryNodeIndex: NodeIndex, baseTreeIndex: BaseTreeIndex): boolean;
  getMrcaTimeOf(summaryNodeIndex: NodeIndex): number;
}

export interface Mutation {
  from: RealSeqLetter;
  site: SiteIndex;
  to: RealSeqLetter;
  time: number;
}

export class PhyloTree implements MutableTree {
  constructor(private delphy: Delphy, public phyloTreePtr_: PhyloTreePtr) {
  }

  copy(): PhyloTree {
    return new PhyloTree(this.delphy, Delphy.delphyCoreRaw.phylo_tree_copy(this.delphy.ctx, this.phyloTreePtr_));
  }

  copyFrom(src: PhyloTree): void {
    Delphy.delphyCoreRaw.phylo_tree_copy_from(this.delphy.ctx, this.phyloTreePtr_, src.phyloTreePtr_);
  }

  toFlatbuffer(): ArrayBuffer {
    return this.delphy.extractFbHelper((fbHolderWasm: FbHolderPtr) =>
      Delphy.delphyCoreRaw.phylo_tree_to_flatbuffer(this.delphy.ctx, this.phyloTreePtr_, fbHolderWasm));
  }

  infoToFlatbuffer(): ArrayBuffer {
    return this.delphy.extractFbHelper((fbHolderWasm: FbHolderPtr) =>
      Delphy.delphyCoreRaw.phylo_tree_to_info_flatbuffer(this.delphy.ctx, this.phyloTreePtr_, fbHolderWasm));
  }

  delete(): void {
    Delphy.delphyCoreRaw.phylo_tree_delete(this.delphy.ctx, this.phyloTreePtr_);
  }

  getSize(): NodeIndex {
    return Delphy.delphyCoreRaw.phylo_tree_get_size(this.delphy.ctx, this.phyloTreePtr_);
  }

  getRootIndex(): NodeIndex {
    return Delphy.delphyCoreRaw.phylo_tree_get_root(this.delphy.ctx, this.phyloTreePtr_);
  }

  setRootIndex(newRootIndex: NodeIndex): void {
    return Delphy.delphyCoreRaw.phylo_tree_set_root(this.delphy.ctx, this.phyloTreePtr_, newRootIndex);
  }

  getParentIndexOf(nodeIndex: NodeIndex): NodeIndex {
    return Delphy.delphyCoreRaw.phylo_tree_get_parent_of(this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  setParentIndexOf(nodeIndex: NodeIndex, newParentIndex: NodeIndex): void {
    Delphy.delphyCoreRaw.phylo_tree_set_parent_of(
      this.delphy.ctx, this.phyloTreePtr_, nodeIndex, newParentIndex);
  }

  getNumChildrenOf(nodeIndex: NodeIndex): number {
    return Delphy.delphyCoreRaw.phylo_tree_get_num_children_of(
      this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  getLeftChildIndexOf(nodeIndex: NodeIndex): NodeIndex {
    return Delphy.delphyCoreRaw.phylo_tree_get_left_child_of(
      this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  getRightChildIndexOf(nodeIndex: NodeIndex): NodeIndex {
    return Delphy.delphyCoreRaw.phylo_tree_get_right_child_of(
      this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  clearChildIndicesOf(nodeIndex: NodeIndex): void {
    Delphy.delphyCoreRaw.phylo_tree_clear_children_of(
      this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  setChildIndicesOf(nodeIndex: NodeIndex, newLeftChildIndex: NodeIndex, newRightChildIndex: NodeIndex): void {
    Delphy.delphyCoreRaw.phylo_tree_set_children_of(
      this.delphy.ctx, this.phyloTreePtr_, nodeIndex, newLeftChildIndex, newRightChildIndex);
  }

  getNameOf(nodeIndex: NodeIndex): string {
    const rawName = Delphy.delphyCoreRaw.phylo_tree_get_name_of(this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
    // eslint-disable-next-line new-cap
    return UTF8ToString(rawName);
  }

  setNameOf(nodeIndex: NodeIndex, newName: string): void {
    withStackSave(() => {
      const rawNewName = stringToUTF8OnStack(newName);
      Delphy.delphyCoreRaw.phylo_tree_set_name_of(this.delphy.ctx, this.phyloTreePtr_, nodeIndex, rawNewName);
    });
  }

  getTimeOf(nodeIndex: NodeIndex): number {
    return Delphy.delphyCoreRaw.phylo_tree_get_time_of(this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  setTimeOf(nodeIndex: NodeIndex, newTime: number): void {
    return Delphy.delphyCoreRaw.phylo_tree_set_time_of(this.delphy.ctx, this.phyloTreePtr_, nodeIndex, newTime);
  }

  getNumSites(): SiteIndex {
    return Delphy.delphyCoreRaw.phylo_tree_get_num_sites(this.delphy.ctx, this.phyloTreePtr_);
  }

  // Each item is one of RealSeqLetter_{A,C,G,T}
  getRootSequence(): Uint8Array {
    const numSites = this.getNumSites();
    const sizeOfRealSeqLetter = 1;  // bytes
    const rootSequenceNumBytesWasm = numSites * sizeOfRealSeqLetter;
    const rootSequenceBytesWasm = Delphy.delphyCoreRaw.phylo_tree_get_root_sequence(this.delphy.ctx, this.phyloTreePtr_);
    return new Uint8Array(Module.HEAPU8.buffer, rootSequenceBytesWasm, rootSequenceNumBytesWasm);
  }

  setRootSequence(newRootSequence: Uint8Array): void {
    const curRootSequence = this.getRootSequence();
    if (curRootSequence.length === newRootSequence.length) {
      curRootSequence.set(newRootSequence);
    } else {
      const newRootSequenceNumBytesWasm = newRootSequence.length;
      const newRootSequenceBytesWasm = Delphy.delphyCoreRaw.malloc(newRootSequenceNumBytesWasm);
      const newRootSequenceBytesWasmView =
        new Uint8Array(Module.HEAPU8.buffer, newRootSequenceBytesWasm, newRootSequenceNumBytesWasm);
      newRootSequenceBytesWasmView.set(newRootSequence);

      Delphy.delphyCoreRaw.phylo_tree_set_root_sequence(
        this.delphy.ctx, this.phyloTreePtr_, newRootSequenceBytesWasm, newRootSequenceNumBytesWasm);

      Delphy.delphyCoreRaw.free(newRootSequenceBytesWasm);
    }
  }

  clearMutationsOf(nodeIndex: NodeIndex): void {
    Delphy.delphyCoreRaw.phylo_tree_clear_mutations_of(this.delphy.ctx, this.phyloTreePtr_, nodeIndex);
  }

  getMutationsOf(nodeIndex: NodeIndex): Mutation[] {
    const ms: Mutation[] = [];
    this.forEachMutationOf(nodeIndex, m => ms.push(m));
    return ms;
  }

  forEachMutationOf(nodeIndex: NodeIndex, f: (m: Mutation) => void): void {
    withStackSave(() => {
      const iteratorSize = Delphy.delphyCoreRaw.mutation_list_get_iterator_size(this.delphy.ctx);
      const it = stackAlloc(iteratorSize);
      const end = stackAlloc(iteratorSize);
      Delphy.delphyCoreRaw.phylo_tree_get_mutation_list_iterators_of(
        this.delphy.ctx, this.phyloTreePtr_, nodeIndex, it, end);

      while (!Delphy.delphyCoreRaw.mutation_list_iterators_are_equal(this.delphy.ctx, it, end)) {

        const m: Mutation = {
          from: Delphy.delphyCoreRaw.mutation_list_iterator_get_from(this.delphy.ctx, it),
          site: Delphy.delphyCoreRaw.mutation_list_iterator_get_site(this.delphy.ctx, it),
          to: Delphy.delphyCoreRaw.mutation_list_iterator_get_to(this.delphy.ctx, it),
          time: Delphy.delphyCoreRaw.mutation_list_iterator_get_time(this.delphy.ctx, it)
        };

        f(m);

        Delphy.delphyCoreRaw.mutation_list_iterator_advance(this.delphy.ctx, it);
      }
    });
  }
}

export class MccTree implements SummaryTree {
  constructor(private delphy: Delphy, public mccTreePtr_: MccTreePtr) {
  }

  delete(): void {
    Delphy.delphyCoreRaw.mcc_tree_delete(this.delphy.ctx, this.mccTreePtr_);
  }

  getNumBaseTrees(): BaseTreeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_num_base_trees(this.delphy.ctx, this.mccTreePtr_);
  }

  getMasterBaseTreeIndex(): BaseTreeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_master_base_tree_index(this.delphy.ctx, this.mccTreePtr_);
  }

  getBaseTree(baseTreeIndex: BaseTreeIndex): PhyloTree {
    const phyloTreePtr = Delphy.delphyCoreRaw.mcc_tree_get_base_tree(this.delphy.ctx, this.mccTreePtr_, baseTreeIndex);
    return new PhyloTree(this.delphy, phyloTreePtr);
  }

  getSize(): NodeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_size(this.delphy.ctx, this.mccTreePtr_);
  }

  getRootIndex(): NodeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_root(this.delphy.ctx, this.mccTreePtr_);
  }

  getParentIndexOf(nodeIndex: NodeIndex): NodeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_parent_of(this.delphy.ctx, this.mccTreePtr_, nodeIndex);
  }

  getNumChildrenOf(nodeIndex: NodeIndex): number {
    return Delphy.delphyCoreRaw.mcc_tree_get_num_children_of(
      this.delphy.ctx, this.mccTreePtr_, nodeIndex);
  }

  getLeftChildIndexOf(nodeIndex: NodeIndex): NodeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_left_child_of(
      this.delphy.ctx, this.mccTreePtr_, nodeIndex);
  }

  getRightChildIndexOf(nodeIndex: NodeIndex): NodeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_right_child_of(
      this.delphy.ctx, this.mccTreePtr_, nodeIndex);
  }

  getTimeOf(nodeIndex: NodeIndex): number {
    return Delphy.delphyCoreRaw.mcc_tree_get_time_of(this.delphy.ctx, this.mccTreePtr_, nodeIndex);
  }

  getMrcaTimeOf(nodeIndex: NodeIndex): number {
    return Delphy.delphyCoreRaw.mcc_tree_get_mrca_time_of(this.delphy.ctx, this.mccTreePtr_, nodeIndex);
  }

  getCorrespondingNodeInBaseTree(mccNodeIndex: NodeIndex, baseTreeIndex: number): NodeIndex {
    return Delphy.delphyCoreRaw.mcc_tree_get_corresponding_node_in_base_tree(
      this.delphy.ctx, this.mccTreePtr_, mccNodeIndex, baseTreeIndex);
  }

  isExactMatchInBaseTree(mccNodeIndex: NodeIndex, baseTreeIndex: number): boolean {
    return Delphy.delphyCoreRaw.mcc_tree_is_exact_match_in_base_tree(
      this.delphy.ctx, this.mccTreePtr_, mccNodeIndex, baseTreeIndex);
  }

  exportToNewick(innerNodesDefinedAsMrcasOfTips: boolean): ArrayBuffer {
    return this.delphy.exportStringHelper(() =>
      Delphy.delphyCoreRaw.mcc_tree_export(this.delphy.ctx, this.mccTreePtr_, innerNodesDefinedAsMrcasOfTips));
  }
}

export class Run {
  private run: RunPtr;

  constructor(private delphy: Delphy, phyloTree: PhyloTree, prngSeed: number) {
    this.run = Delphy.delphyCoreRaw.create_run(delphy.ctx, phyloTree.phyloTreePtr_, prngSeed);
  }

  delete() {
    Delphy.delphyCoreRaw.delete_run(this.delphy.ctx, this.run);
  }

  id(): number {
    return this.run;
  }

  runStepsAsync(numSteps: number): Promise<void> {
    return Delphy.delphyCoreRaw.run_steps_async(this.delphy.ctx, this.run, numSteps);
  }

  getTree(): PhyloTree {
    const rawTreePtr = Delphy.delphyCoreRaw.run_get_tree(this.delphy.ctx, this.run);
    return new PhyloTree(this.delphy, rawTreePtr);
  }

  getStep(): number {
    return Delphy.delphyCoreRaw.run_get_step(this.delphy.ctx, this.run);
  }

  setStep(step: number): void {
    return Delphy.delphyCoreRaw.run_set_step(this.delphy.ctx, this.run, step);
  }

  getLocalMovesPerGlobalMove(): number {
    return Delphy.delphyCoreRaw.run_get_local_moves_per_global_move(this.delphy.ctx, this.run);
  }

  setLocalMovesPerGlobalMove(localMovesPerGlobalMove: number): void {
    return Delphy.delphyCoreRaw.run_set_local_moves_per_global_move(this.delphy.ctx, this.run, localMovesPerGlobalMove);
  }

  getNumParts(): number {
    return Delphy.delphyCoreRaw.run_get_num_parts(this.delphy.ctx, this.run);
  }

  setNumParts(numParts: number): void {
    return Delphy.delphyCoreRaw.run_set_num_parts(this.delphy.ctx, this.run, numParts);
  }

  getMu(): number {
    return Delphy.delphyCoreRaw.run_get_mu(this.delphy.ctx, this.run);
  }

  setMu(mu: number): void {
    Delphy.delphyCoreRaw.run_set_mu(this.delphy.ctx, this.run, mu);
  }

  getAlpha(): number {
    return Delphy.delphyCoreRaw.run_get_alpha(this.delphy.ctx, this.run);
  }

  setAlpha(alpha: number): void {
    Delphy.delphyCoreRaw.run_set_alpha(this.delphy.ctx, this.run, alpha);
  }

  getHkyKappa(): number {
    return Delphy.delphyCoreRaw.run_get_hky_kappa(this.delphy.ctx, this.run);
  }

  setHkyKappa(hky_kappa: number): void {
    Delphy.delphyCoreRaw.run_set_hky_kappa(this.delphy.ctx, this.run, hky_kappa);
  }

  getHkyPiA(): number {
    return Delphy.delphyCoreRaw.run_get_hky_pi_A(this.delphy.ctx, this.run);
  }

  setHkyPiA(hky_pi_A: number): void {
    Delphy.delphyCoreRaw.run_set_hky_pi_A(this.delphy.ctx, this.run, hky_pi_A);
  }

  getHkyPiC(): number {
    return Delphy.delphyCoreRaw.run_get_hky_pi_C(this.delphy.ctx, this.run);
  }

  setHkyPiC(hky_pi_C: number): void {
    Delphy.delphyCoreRaw.run_set_hky_pi_A(this.delphy.ctx, this.run, hky_pi_C);
  }

  getHkyPiG(): number {
    return Delphy.delphyCoreRaw.run_get_hky_pi_G(this.delphy.ctx, this.run);
  }

  setHkyPiG(hky_pi_G: number): void {
    Delphy.delphyCoreRaw.run_set_hky_pi_A(this.delphy.ctx, this.run, hky_pi_G);
  }

  getHkyPiT(): number {
    return Delphy.delphyCoreRaw.run_get_hky_pi_T(this.delphy.ctx, this.run);
  }

  setHkyPiT(hky_pi_T: number): void {
    Delphy.delphyCoreRaw.run_set_hky_pi_A(this.delphy.ctx, this.run, hky_pi_T);
  }

  getPopT0(): number {
    return Delphy.delphyCoreRaw.run_get_pop_t0(this.delphy.ctx, this.run);
  }

  setPopT0(pop_t0: number): void {
    Delphy.delphyCoreRaw.run_set_pop_t0(this.delphy.ctx, this.run, pop_t0);
  }

  getPopN0(): number {
    return Delphy.delphyCoreRaw.run_get_pop_n0(this.delphy.ctx, this.run);
  }

  setPopN0(pop_n0: number): void {
    Delphy.delphyCoreRaw.run_set_pop_n0(this.delphy.ctx, this.run, pop_n0);
  }

  getPopG(): number {
    return Delphy.delphyCoreRaw.run_get_pop_g(this.delphy.ctx, this.run);
  }

  setPopG(pop_g: number): void {
    Delphy.delphyCoreRaw.run_set_pop_g(this.delphy.ctx, this.run, pop_g);
  }

  getLogG(): number {
    return Delphy.delphyCoreRaw.run_get_log_G(this.delphy.ctx, this.run);
  }

  getLogPosterior(): number {
    return Delphy.delphyCoreRaw.run_get_log_posterior(this.delphy.ctx, this.run);
  }

  getNumMutations(): number {
    return Delphy.delphyCoreRaw.run_get_num_mutations(this.delphy.ctx, this.run);
  }

  getLogCoalescentPrior(): number {
    return Delphy.delphyCoreRaw.run_get_log_coalescent_prior(this.delphy.ctx, this.run);
  }

  getLogOtherPriors(): number {
    return Delphy.delphyCoreRaw.run_get_log_other_priors(this.delphy.ctx, this.run);
  }

  getTotalBranchLength(): number {
    return Delphy.delphyCoreRaw.run_get_total_branch_length(this.delphy.ctx, this.run);
  }

  isMuMoveEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_is_mu_move_enabled(this.delphy.ctx, this.run);
  }

  setMuMoveEnabled(enabled: boolean): void {
    Delphy.delphyCoreRaw.run_set_mu_move_enabled(this.delphy.ctx, this.run, enabled);
  }

  isMpoxHackEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_is_mpox_hack_enabled(this.delphy.ctx, this.run);
  }

  setMpoxHackEnabled(mpoxHackEnabled: boolean): void {
    Delphy.delphyCoreRaw.run_set_mpox_hack_enabled(this.delphy.ctx, this.run, mpoxHackEnabled);
  }

  getMpoxMu(): number {
    return Delphy.delphyCoreRaw.run_get_mpox_mu(this.delphy.ctx, this.run);
  }

  setMpoxMu(mpox_mu: number): void {
    Delphy.delphyCoreRaw.run_set_mpox_mu(this.delphy.ctx, this.run, mpox_mu);
  }

  getMpoxMuStar(): number {
    return Delphy.delphyCoreRaw.run_get_mpox_mu_star(this.delphy.ctx, this.run);
  }

  setMpoxMuStar(mpox_mu_star: number): void {
    Delphy.delphyCoreRaw.run_set_mpox_mu_star(this.delphy.ctx, this.run, mpox_mu_star);
  }

  isOnlyDisplacingInnerNodes(): boolean {
    return Delphy.delphyCoreRaw.run_is_only_displacing_inner_nodes(this.delphy.ctx, this.run);
  }

  setOnlyDisplacingInnerNodes(b: boolean): void {
    Delphy.delphyCoreRaw.run_set_only_displacing_inner_nodes(this.delphy.ctx, this.run, b);
  }

  areTopologyMovesEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_are_topology_moves_enabled(this.delphy.ctx, this.run);
  }

  setTopologyMovesEnabled(b: boolean): void {
    Delphy.delphyCoreRaw.run_set_topology_moves_enabled(this.delphy.ctx, this.run, b);
  }

  isRepartitioningEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_is_repartitioning_enabled(this.delphy.ctx, this.run);
  }

  setRepartitioningEnabled(b: boolean): void {
    Delphy.delphyCoreRaw.run_set_repartitioning_enabled(this.delphy.ctx, this.run, b);
  }

  isAlphaMoveEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_is_alpha_move_enabled(this.delphy.ctx, this.run);
  }

  setAlphaMoveEnabled(enabled: boolean): void {
    Delphy.delphyCoreRaw.run_set_alpha_move_enabled(this.delphy.ctx, this.run, enabled);
  }

  isFinalPopSizeMoveEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_is_final_pop_size_move_enabled(this.delphy.ctx, this.run);
  }

  setFinalPopSizeMoveEnabled(enabled: boolean): void {
    Delphy.delphyCoreRaw.run_set_final_pop_size_move_enabled(this.delphy.ctx, this.run, enabled);
  }

  isPopGrowthRateMoveEnabled(): boolean {
    return Delphy.delphyCoreRaw.run_is_pop_growth_rate_move_enabled(this.delphy.ctx, this.run);
  }

  setPopGrowthRateMoveEnabled(enabled: boolean): void {
    Delphy.delphyCoreRaw.run_set_pop_growth_rate_move_enabled(this.delphy.ctx, this.run, enabled);
  }

  getParamsToFlatbuffer(): ArrayBuffer {
    return this.delphy.extractFbHelper((fbHolderWasm: FbHolderPtr) =>
      Delphy.delphyCoreRaw.run_get_params_to_flatbuffer(this.delphy.ctx, this.run, fbHolderWasm));
  }

  setParamsFromFlatbuffer(paramsFbBytes: ArrayBuffer): void {
    const numParamsFbBytes = paramsFbBytes.byteLength;
    const paramsFbBytesView = new Uint8Array(paramsFbBytes, 0, numParamsFbBytes);
    const paramsFbBytesWasm = Delphy.delphyCoreRaw.malloc(numParamsFbBytes);
    const paramsFbBytesWasmView = new Uint8Array(Module.HEAPU8.buffer, paramsFbBytesWasm, numParamsFbBytes);
    paramsFbBytesWasmView.set(paramsFbBytesView);

    Delphy.delphyCoreRaw.run_set_params_from_flatbuffer(this.delphy.ctx, this.run, paramsFbBytesWasm);

    Delphy.delphyCoreRaw.free(paramsFbBytesWasm);
  }

  createBeastyOutput(): BeastyOutput {
    return new BeastyOutput(this.delphy, this.run);
  }

  exportBeastInput(): ArrayBuffer {
    return this.delphy.exportStringHelper(() =>
      Delphy.delphyCoreRaw.run_export_beast_input(this.delphy.ctx, this.run));
  }
}

export class BeastyOutput {
  private beastyOutput: BeastyOutputPtr;

  constructor(private delphy: Delphy, private run: RunPtr) {
    this.beastyOutput = Delphy.delphyCoreRaw.create_beasty_output(delphy.ctx, run);
  }

  delete() {
    Delphy.delphyCoreRaw.delete_beasty_output(this.delphy.ctx, this.beastyOutput);
  }

  snapshot() {
    Delphy.delphyCoreRaw.beasty_output_snapshot(this.delphy.ctx, this.beastyOutput, this.run);
  }

  finalize() {
    Delphy.delphyCoreRaw.beasty_output_finalize(this.delphy.ctx, this.beastyOutput, this.run);
  }

  extractLog(): ArrayBuffer {
    return this.delphy.exportStringHelper(() =>
      Delphy.delphyCoreRaw.beasty_output_extract_log(this.delphy.ctx, this.beastyOutput));
  }

  extractTrees(): ArrayBuffer {
    return this.delphy.exportStringHelper(() =>
      Delphy.delphyCoreRaw.beasty_output_extract_trees(this.delphy.ctx, this.beastyOutput));
  }
}

/* eslint-enable prefer-rest-params */
/* eslint-enable prefer-spread */
/* eslint-enable  @typescript-eslint/no-explicit-any */
/* eslint-enable no-unused-vars */
