export const isSQL = import.meta.env.VITE_DATA_BACKEND === 'sqlserver';
export async function sqlRequest(path:string, body?:unknown, announce401 = true) {
  const response=await fetch('/api/sql'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(35000)});
  const result=await response.json().catch(()=>({error:'تعذّر قراءة استجابة الخادم.'}));
  if (!response.ok) {
    if (announce401 && response.status===401 && !path.startsWith('/login')) window.dispatchEvent(new Event('sql-session-ended'));
    throw new Error(result.error || 'تعذّر تنفيذ العملية.');
  }
  return result;
}
export const sqlLogin=(email:string,password:string,rememberMe:boolean)=>sqlRequest('/login',{email,password,rememberMe});
export const sqlMe=(quiet = false)=>sqlRequest('/me', undefined, !quiet);
export const sqlPassword=(currentPassword:string,newPassword:string)=>sqlRequest('/password',{currentPassword,newPassword});
const overrides:Record<string,any>={
  getLocalActiveSessions:()=>({}),
  saveActiveSessionLocally:()=>{},
  releaseActiveSession:()=>sqlRequest('/logout',{}),
  subscribeToActiveSession:(_email:string,_id:string,onDisplaced:(m:string)=>void)=>{
    let stopped=false;
    const timer=setInterval(()=>{sqlMe().catch(e=>{if(!stopped)onDisplaced(e.message);});},15000);
    return ()=>{stopped=true;clearInterval(timer);};
  },
};
export const SqlDbService=new Proxy(overrides,{get(target,key:string){
  if (key in target)return target[key];
  return (...args:any[])=>{
    if (key==='addDispenseRecord') args=[{...args[0],requestId:crypto.randomUUID()}];
    return sqlRequest('/action/'+key,{args});
  };
}});
