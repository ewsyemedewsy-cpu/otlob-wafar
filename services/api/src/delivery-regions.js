export const deliveryRegionCodes = ['FAYOUM', 'CAIRO', 'GIZA', 'ALEXANDRIA', 'DELTA_CANAL', 'UPPER_EGYPT'];

export function deliveryRegions(setting) {
  if (setting === undefined) return [...deliveryRegionCodes];
  const regions = [...new Set(String(setting).split(',').map(x => x.trim()))];
  if (!regions.length || regions.some(x => !deliveryRegionCodes.includes(x))) {
    throw new Error('Invalid ORDER_GOVERNORATES configuration');
  }
  return regions;
}

export const fayoumCityOptions=[{code:'FAYOUM_CITY',label:'مدينة الفيوم'},{code:'SENOURIS',label:'مدينة سنورس'},{code:'TAMIYA',label:'مدينة طامية'},{code:'ITSA',label:'مدينة إطسا'},{code:'ABSHWAY',label:'مدينة أبشواي'}];
export function deliveryAreas(setting){
 if(setting===undefined)return {};
 if(setting!=='fayoum_cities')throw Error('Invalid ORDER_DELIVERY_SCOPE configuration');
 return {FAYOUM:fayoumCityOptions};
}
export function validateDeliveryArea({governorate,deliveryArea,address},areas){
 const options=areas[governorate];if(!options)return null;
 const normalized=String(address||'').normalize('NFKC').replace(/[\u064B-\u065F\u0640]/g,'').replace(/ى/g,'ي').replace(/[أإآ]/g,'ا').replace(/\s+/g,'');
 if(normalized.includes('يوسفالصديق'))return 'delivery_area_unavailable';
 if(!options.some(x=>x.code===deliveryArea))return 'delivery_area_required';
 return null;
}
