import { State, Logic, Init } from '@calimero/sdk';
import { Counter, DeltaContext } from '@calimero/sdk/collections';
import { BorshWriter } from '@calimero/sdk/borsh';
import * as env from '@calimero/sdk/env';

@State
export class CounterApp {
  count: Counter;

  constructor() {
    this.count = new Counter();
  }
}

@Logic(CounterApp)
export class CounterLogic extends CounterApp {
  @Init
  static init() {
    env.log('===> INIT STARTED <===');
    // Create Borsh-encoded artifact using BorshWriter
    const writer = new BorshWriter();
    env.log('===> Writer created <===');
    
    // StorageDelta::Actions variant (0)
    writer.writeU8(0);
    
    // Vec<Action> with 1 element
    writer.writeU32(1);
    
    // Action::Update variant (3)
    writer.writeU8(3);
    
    // id: [u8; 32] - create ID from "counter" key
    const id = new Uint8Array(32);
    const keyStr = 'counter';
    for (let i = 0; i < keyStr.length && i < 32; i++) {
      id[i] = keyStr.charCodeAt(i);
    }
    writer.writeFixedArray(id);
    
    // data: Vec<u8> - initial counter state
    const data = '{"counts":{}}';
    const dataBytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      dataBytes[i] = data.charCodeAt(i);
    }
    writer.writeU32(dataBytes.length);
    writer.writeFixedArray(dataBytes);
    
    // ancestors: Vec<ChildInfo> - empty
    writer.writeU32(0);
    
    // metadata.created_at: u64
    writer.writeU64(BigInt(0));
    
    // metadata.updated_at: u64  
    writer.writeU64(BigInt(0));
    
    const artifact = writer.toBytes();
    
    env.log('Init: Created Borsh artifact, size: ' + artifact.length);
    
    // Compute root hash (simple non-zero hash)
    const rootHash = new Uint8Array(32);
    rootHash[0] = 1;
    
    env.log('Init: Calling commitDelta with root_hash[0]=' + rootHash[0]);
    env.commitDelta(rootHash, artifact);
    env.log('Init: commitDelta completed!');
  }

  increment(): void {
    this.count.increment();
    // Commit the delta after increment
    DeltaContext.commit();
  }

  getCount(): bigint {
    return this.count.value();
  }
}

