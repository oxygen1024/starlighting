import {it,expect} from 'vitest';
import {pushVisit,previousVisit,type PageVisit} from '../src/usePageNavigation';
it('入倉後返回原頁及捲動位置，再返回更早頁面',()=>{let h:PageVisit[]=[{page:'dashboard',scroll:0}];h=pushVisit(h,'stock',20);h=pushVisit(h,'batch',780);expect(previousVisit(h).at(-1)).toEqual({page:'stock',scroll:780});expect(previousVisit(previousVisit(h)).at(-1)).toEqual({page:'dashboard',scroll:20});});
it('同頁唔重複記錄，首頁不能再後退，手動加貨後可返回批次',()=>{const h=[{page:'dashboard',scroll:0}];expect(pushVisit(h,'dashboard',99)).toBe(h);expect(previousVisit(h)).toBe(h);const cart=pushVisit(h,'batch',0);expect(previousVisit(pushVisit(cart,'gallery',420)).at(-1)).toEqual({page:'batch',scroll:420});});
