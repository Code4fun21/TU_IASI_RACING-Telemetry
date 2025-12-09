export const transformToColumnar = (decodedBuffer: any[]) => {
  const result: Record<string, { timestamps: number[], values: number[] }> = {};

  // 1. Scan the buffer
  decodedBuffer.forEach(point => {
    const ts = point.timestamp;

    // 2. Iterate over all keys in this point (rpm, speed, temp...)
    Object.keys(point).forEach(key => {
      // Skip metadata keys like 'canId' or 'timestamp' itself
      if (key === 'timestamp' || key === 'canId' || key === 'rawHex') return;

      // Initialize the column if it doesn't exist
      if (!result[key]) {
        result[key] = { timestamps: [], values: [] };
      }

      // 3. Push data to the specific column arrays
      // Only push if the value is a valid number
      if (typeof point[key] === 'number') {
        result[key].timestamps.push(ts);
        result[key].values.push(point[key]);
      }
    });
  });

  return result;
};