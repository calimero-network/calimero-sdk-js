import { BorshWriter } from '../borsh/encoder';

export function buildRequest(
  existing: Uint8Array,
  incoming: Uint8Array,
  existingCreatedAt: bigint,
  existingTs: bigint,
  incomingTs: bigint
): Uint8Array {
  const writer = new BorshWriter();
  writer.writeBytes(existing);
  writer.writeBytes(incoming);
  writer.writeU64(existingCreatedAt);
  writer.writeU64(existingTs);
  writer.writeU64(incomingTs);
  return writer.toBytes();
}
