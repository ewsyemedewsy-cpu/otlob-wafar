export function reviewCatalogProduct(product,{rate,fixed,taxRate,shippingCharge,shippingCost}) {
 const price=Number(product.retail_price),cost=Number(product.supplier_cost);
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(cost)||cost<=0||[rate,fixed,taxRate,shippingCharge,shippingCost].some(x=>!Number.isFinite(x)||x<0)||rate*(1+taxRate)>=1)return {status:'invalid_data'};
 const paymentFee=Math.ceil(((price+shippingCharge)*rate+fixed)*(1+taxRate)*100-1e-8)/100;
 const reserve=cost*.005,profit=price+shippingCharge-paymentFee-shippingCost-cost-reserve;
 return {status:profit+1e-8>=cost*.05?'passes_scenario':'below_floor',paymentFee,reserve,profit,profitRate:profit/cost};
}
