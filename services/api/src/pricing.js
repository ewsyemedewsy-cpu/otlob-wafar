// Published card tariff, for previews only until the merchant tax treatment is confirmed.
export const PAYMOB_CARD_PREVIEW = Object.freeze({rate:0.0275,fixed:3,taxRate:0,provisional:true});

// baseCost and marketMin are merchandise totals for ONE payment, not per-item fees.
export function calculatePrice({marketMin,baseCost,emergencyApproved=false,paymentFees={rate:0,fixed:0,taxRate:0},shippingCharge=0,shippingCost=0}) {
  const m=Number(marketMin),c=Number(baseCost);
  if(!Number.isFinite(m)||!Number.isFinite(c)||m<=0||c<=0) throw new Error('invalid_pricing_inputs');
  const {rate,fixed,taxRate}=paymentFees;
  if([rate,fixed,taxRate,shippingCharge,shippingCost].some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0)||rate*(1+taxRate)>=1) throw new Error('invalid_payment_fee_inputs');
  const r=rate*(1+taxRate),f=fixed*(1+taxRate);
  const fee=p=>Math.ceil(((p+shippingCharge)*r+f)*100-1e-8)/100;
  const net=p=>p+shippingCharge-fee(p)-shippingCost;
  // Round the fee upward too: the retained amount must survive settlement rounding.
  const grossFor=retained=>{
    let p=Math.ceil(((retained+shippingCost+f)/(1-r)-shippingCharge)*100-1e-8)/100;
    if(net(p)+1e-8<retained)p=Math.round((p+0.01)*100)/100;
    return p;
  };
  const floor=grossFor(c*1.055);
  const target=Math.floor(m*0.995*100+1e-8)/100;
  const risk=c*0.005;
  if(target<floor) {
    const emergencyFloor=grossFor(c*1.035);
    if(!emergencyApproved||target<emergencyFloor) return {finalPrice:null,mode:'blocked',reason:target>=emergencyFloor?'approval_required':'below_emergency_floor',marketMin:m,target,baseCost:c,riskReserve:risk,profitRate:null};
    return {finalPrice:target,mode:'emergency',reason:'explicit_approval',marketMin:m,target,baseCost:c,riskReserve:risk,paymentFee:fee(target),profitRate:(net(target)-c-risk)/c};
  }
  const excess=Math.max(0,net(target)-c*1.20);
  const finalPrice=Math.max(floor,Math.min(target,grossFor(net(target)-excess/2)));
  return {finalPrice,mode:excess>0?'optimized':'normal',reason:excess>0?'half_extra_margin_to_customer':'normal_floor',marketMin:m,target,baseCost:c,riskReserve:risk,paymentFee:fee(finalPrice),profitRate:(net(finalPrice)-c-risk)/c};
}
