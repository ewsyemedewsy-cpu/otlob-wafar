import math
def calculate_price(market_min, base_cost):
    m,c=float(market_min),float(base_cost)
    if not math.isfinite(m) or not math.isfinite(c) or m<=0 or c<=0:
        raise ValueError('invalid_pricing_inputs')
    floor=math.ceil(c*1.055*100-1e-8)/100
    target=math.floor(m*.995*100+1e-8)/100
    if target<floor:return None
    excess=max(0,target-c*1.2)
    return max(floor,math.floor((target-excess/2)*100+1e-8)/100)
