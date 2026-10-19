import {afterEach,expect,it,vi} from 'vitest';
import {initialAuth,sessionView,profileView} from '../src/authState';
import {refreshQueue,timedRead} from '../src/readRequests';
afterEach(()=>vi.useRealTimers());
const profile={username:'employee',role:'staff'};
function signedIn(){return profileView(sessionView(initialAuth,'user-a'),'user-a',profile,null);}
it('returning to the same account preserves the profile and does not show the blocking login screen',()=>{
 const state=signedIn();expect(sessionView(state,'user-a')).toBe(state);
});
it('network failures preserve an already verified account, but never admit an unverified one',()=>{
 const network={status:503};const state=profileView(signedIn(),'user-a',null,network);
 expect(state.profile).toEqual(profile);expect(state.checking).toBe(false);expect(state.error).toContain('網絡');
 expect(profileView(sessionView(initialAuth,'user-a'),'user-a',null,network).profile).toBeNull();
 expect(profileView(state,'user-a',profile,null).error).toBe('');
});
it('revoked access, logout and account switches remove the previous profile; late responses cannot restore it',()=>{
 for(const error of [{code:'42501'},{code:'PGRST301'},{status:403},{status:401}])expect(profileView(signedIn(),'user-a',null,error).profile).toBeNull();
 expect(sessionView(signedIn(),null).profile).toBeNull();
 const next=sessionView(signedIn(),'user-b');expect(next.profile).toBeNull();expect(profileView(next,'user-a',profile,null)).toBe(next);
});
it('coalesces overlapping invalidations and awaits the fresh read after a write',async()=>{
 const releases:Array<()=>void>=[];let active=0,max=0,calls=0;
 const q=refreshQueue(async()=>{calls++;active++;max=Math.max(max,active);await new Promise<void>(r=>releases.push(r));active--;});
 const first=q.run();await Promise.resolve();const second=q.run();const third=q.run();expect(second).toBe(first);expect(third).toBe(first);
 releases.shift()!();await new Promise(r=>setTimeout(r,0));expect(calls).toBe(2);expect(max).toBe(1);
 releases.shift()!();await second;expect(calls).toBe(2);
});
it('disposing a refresh queue cancels its pending trailing read',async()=>{
 let release!:()=>void;const task=vi.fn(()=>new Promise<void>(r=>release=r));const q=refreshQueue(task);
 const done=q.run();await Promise.resolve();void q.run();q.stop();release();await done;await q.run();expect(task).toHaveBeenCalledTimes(1);
});
it('a hung read times out, aborts its request, and allows the queue to recover',async()=>{
 vi.useFakeTimers();let signal!:AbortSignal;const errors:string[]=[];
 const q=refreshQueue(async()=>{try{await timedRead(s=>{signal=s;return new Promise(()=>{});},100);}catch(e){errors.push((e as Error).message);}});
 const done=q.run();await vi.advanceTimersByTimeAsync(101);await done;expect(signal.aborted).toBe(true);expect(errors).toHaveLength(1);
 const retry=q.run();await vi.advanceTimersByTimeAsync(101);await retry;expect(errors).toHaveLength(2);
});
it('successful reads clear their deadline',async()=>{
 vi.useFakeTimers();expect(await timedRead(async()=>42,100)).toBe(42);expect(vi.getTimerCount()).toBe(0);
});
