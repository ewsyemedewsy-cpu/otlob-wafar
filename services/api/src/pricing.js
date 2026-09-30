export function calculatePrice({marketMin,baseCost,emergencyApproved=false}) {
  const m=Number(marketMin),c=Number(baseCost);
  if(!Number.isFinite(m)||!Number.isFinite(c)||m<=0||c<=0) throw new Error('invalid_pricing_inputs');
  const floor=Math.ceil(c*1.055*100-1e-8)/100;
  const target=Math.floor(m*0.995*100+1e-8)/100;
  const risk=c*0.005;
  if(target<floor) {
    const emergencyFloor=Math.ceil(c*1.035*100-1e-8)/100;
    if(!emergencyApproved||target<emergencyFloor) return {finalPrice:null,mode:'blocked',reason:target>=emergencyFloor?'approval_required':'below_emergency_floor',marketMin:m,target,baseCost:c,riskReserve:risk,profitRate:null};
    return {finalPrice:target,mode:'emergency',reason:'explicit_approval',marketMin:m,target,baseCost:c,riskReserve:risk,profitRate:(target-c-risk)/c};
  }
  const excess=Math.max(0,target-c*1.20);
  const finalPrice=Math.max(floor,Math.floor((target-excess/2)*100+1e-8)/100);
  return {finalPrice,mode:excess>0?'optimized':'normal',reason:excess>0?'half_extra_margin_to_customer':'normal_floor',marketMin:m,target,baseCost:c,riskReserve:risk,profitRate:(finalPrice-c-risk)/c};
}
