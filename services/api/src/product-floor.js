// Purchase cost stays separate from per-unit packaging cost.
export function normalProductFloor(product){
 const purchase=Number(product.supplier_cost),price=Number(product.retail_price);
 const bag=Number(product.specifications?.packaging_cost??0);
 if(!Number.isFinite(purchase)||purchase<=0||!Number.isFinite(bag)||bag<0||!Number.isFinite(price))return false;
 return price>=Math.ceil((purchase+bag)*1.055*100-1e-8)/100;
}
