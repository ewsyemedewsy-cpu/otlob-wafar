export const deliveryRegionCodes = ['FAYOUM', 'CAIRO', 'GIZA', 'ALEXANDRIA', 'DELTA_CANAL', 'UPPER_EGYPT'];

export function deliveryRegions(setting) {
  if (setting === undefined) return [...deliveryRegionCodes];
  const regions = [...new Set(String(setting).split(',').map(x => x.trim()))];
  if (!regions.length || regions.some(x => !deliveryRegionCodes.includes(x))) {
    throw new Error('Invalid ORDER_GOVERNORATES configuration');
  }
  return regions;
}
