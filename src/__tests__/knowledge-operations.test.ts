import { describe, expect, it } from 'vitest';
import { contradictsOperationDirection } from '@/lib/knowledge-operations';

describe('explicit inverse-operation exclusions', () => {
  it.each([
    ['Deserialize JSON', 'The object is serialized using JSON.stringify.'],
    ['Serialize JSON', 'JSON.parse turns stored JSON into an object.'],
    ['Decode bytes', 'Encode the input into bytes.'],
    ['Decrypt a message', 'Encrypts messages using the supplied key.'],
    ['Compress a stream', 'Decompresses the stream into its original bytes.'],
  ])('rejects opposite-only source evidence for %s', (action, evidence) => {
    expect(contradictsOperationDirection(action, evidence)).toBe(true);
  });

  it.each([
    ['Deserialize JSON', 'Deserialize JSON using serde_json::from_str.'],
    ['Deserialize JSON', 'Supports JSON.parse and JSON.stringify.'],
    ['Serialize and deserialize JSON', 'JSON.stringify serializes objects.'],
    ['Extract article text', 'Article text is extracted from HTML.'],
    ['Render widgets', 'A widget framework.'],
  ])('does not treat unknown or supported direction as an inverse: %s', (action, evidence) => {
    expect(contradictsOperationDirection(action, evidence)).toBe(false);
  });
});
