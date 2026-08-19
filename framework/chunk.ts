export const chunk = <T>(items: T[], size: number): T[][] => {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`chunk size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};
