// automatically generated by the FlatBuffers compiler, do not modify

import * as flatbuffers from 'flatbuffers';

import { NodeInfo } from '../../delphy/api/node-info.js';


export class TreeInfo {
  bb: flatbuffers.ByteBuffer|null = null;
  bb_pos = 0;
  __init(i:number, bb:flatbuffers.ByteBuffer):TreeInfo {
  this.bb_pos = i;
  this.bb = bb;
  return this;
}

static getRootAsTreeInfo(bb:flatbuffers.ByteBuffer, obj?:TreeInfo):TreeInfo {
  return (obj || new TreeInfo()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
}

static getSizePrefixedRootAsTreeInfo(bb:flatbuffers.ByteBuffer, obj?:TreeInfo):TreeInfo {
  bb.setPosition(bb.position() + flatbuffers.SIZE_PREFIX_LENGTH);
  return (obj || new TreeInfo()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
}

nodeInfos(index: number, obj?:NodeInfo):NodeInfo|null {
  const offset = this.bb!.__offset(this.bb_pos, 4);
  return offset ? (obj || new NodeInfo()).__init(this.bb!.__indirect(this.bb!.__vector(this.bb_pos + offset) + index * 4), this.bb!) : null;
}

nodeInfosLength():number {
  const offset = this.bb!.__offset(this.bb_pos, 4);
  return offset ? this.bb!.__vector_len(this.bb_pos + offset) : 0;
}

static startTreeInfo(builder:flatbuffers.Builder) {
  builder.startObject(1);
}

static addNodeInfos(builder:flatbuffers.Builder, nodeInfosOffset:flatbuffers.Offset) {
  builder.addFieldOffset(0, nodeInfosOffset, 0);
}

static createNodeInfosVector(builder:flatbuffers.Builder, data:flatbuffers.Offset[]):flatbuffers.Offset {
  builder.startVector(4, data.length, 4);
  for (let i = data.length - 1; i >= 0; i--) {
    builder.addOffset(data[i]!);
  }
  return builder.endVector();
}

static startNodeInfosVector(builder:flatbuffers.Builder, numElems:number) {
  builder.startVector(4, numElems, 4);
}

static endTreeInfo(builder:flatbuffers.Builder):flatbuffers.Offset {
  const offset = builder.endObject();
  return offset;
}

static createTreeInfo(builder:flatbuffers.Builder, nodeInfosOffset:flatbuffers.Offset):flatbuffers.Offset {
  TreeInfo.startTreeInfo(builder);
  TreeInfo.addNodeInfos(builder, nodeInfosOffset);
  return TreeInfo.endTreeInfo(builder);
}
}