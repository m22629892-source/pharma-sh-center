import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { Actor, atomic, fail, get, list, put, remove, req, roles, models, validateValue } from './sql-store';
import { savePassword } from './credentials';
export const isManager = (a: Actor) => ['admin','developer'].includes(a.role);
const permit = (a: Actor, allowed: string[]) => { if (!allowed.includes(a.role)) fail('ليست لديك صلاحية لهذه العملية.',403); };
const now = () => new Date().toISOString();
async function audit(tx: sql.Transaction, a: Actor, action: string, item: any, before=0, after=0, notes='') {
  return put('stock_audit_logs', { id: randomUUID(), medicineId: item.id, medicineName: item.commercialName || item.name || item.nameAr || item.id, actionType: action, quantityChanged: Math.round((after-before)*1e4)/1e4, previousQuantity: before, newQuantity: after, performedByName: a.name, performedByEmail: a.email, performedById: a.id, notes, timestamp: now() }, tx);
}
export function dispenseValues(med: any, input: any, a: Actor) {
  if (a.role === 'technician' && med.isControlled) fail('لا يحق لفني الصيدلة صرف الأدوية المقيدة.',403);
  const actual = validateValue(input.actualQuantityDispensed,'decimal(19,4)','actualQuantityDispensed');
  const requested = validateValue(input.quantityDispensed,'decimal(19,4)','quantityDispensed');
  if (!(actual > 0) || !(requested >= actual)) fail('كمية الصرف غير صالحة.');
  if (actual > med.quantity) fail('الرصيد لا يكفي لصرف الكمية المطلوبة.',409);
  if (med.expiryDate && med.expiryDate.slice(0,10) < now().slice(0,10)) fail('لا يمكن صرف دواء منتهي الصلاحية.',409);
  return { actual, after: Math.round((med.quantity-actual)*1e4)/1e4, total: Math.round(actual*Number(med.price || 0)*1e4)/1e4 };
}
const reads: Record<string,string> = { fetchMedicines:'medicines', fetchDispenseRecords:'dispense_records',fetchSessions:'user_sessions',fetchStockLogs:'stock_audit_logs',fetchUsers:'users',fetchResidents:'residents',fetchDoctors:'doctors',fetchCompanies:'pharmaceutical_companies',fetchBehaviorLogs:'behavior_logs' };
export async function action(method: string, args: any[], a: Actor) {
  if (!Array.isArray(args) || args.length>5) fail('Invalid arguments.');
  if (reads[method]) {
    if (method==='fetchUsers' || method==='fetchSessions') permit(a,['admin','developer']);
    return list(reads[method]);
  }
  if (method==='fetchCollectionRaw') {
    permit(a,['developer']); return list(args[0]);
  }
  if (method==='fetchSecuritySettings') {
    const settings=await get('security_settings','config');
    return isManager(a) ? (settings || {id:'config',emailEnabled:false,whatsAppEnabled:false,alertDays:30}) : {id:'config',emailEnabled:false,whatsAppEnabled:false,alertDays:settings?.alertDays || 30};
  }
  if (method==='fetchCustomSideEffects') return (await get('settings','custom_side_effects'))?.items || [];
  if (method==='fetchUnits' || method==='fetchCategories') return (await list(method==='fetchUnits'?'item_units':'therapeutic_categories')).map(x=>x.name || x.id);
  if (method==='createFullBackup') {
    permit(a,['developer']);
    return atomic(async tx => {
      const collections: Record<string, any[]> = {};
      for (const col of Object.keys(models)) collections[col]=await list(col,tx);
      return {backupVersion:'4.0-sql2008',createdAt:now(),collections,counts:Object.fromEntries(Object.entries(collections).map(([k,v])=>[k,v.length]))};
    });
  }
  return atomic(async tx => {
    if (method==='addDispenseRecord') {
      const input=args[0] || {}, key=input.requestId;
      if (typeof key!=='string' || !/^[a-f0-9-]{36}$/.test(key)) fail('Invalid dispense request ID.');
      const med=await get('medicines',input.medicineId,tx,true); if (!med) fail('الدواء غير موجود.',404);
      const previous=await get('dispense_records',key,tx,true);
      if (previous) {
        if (previous.dispensedById!==a.id || previous.medicineId!==input.medicineId || previous.actualQuantityDispensed!==input.actualQuantityDispensed) fail('Request ID collision.',409);
        return previous;
      }
      const {actual,after,total}=dispenseValues(med,input,a);
      let doseResident:any = null;
      if (input.doseId) {
        doseResident=await get('residents',input.residentId,tx,true);
        const dose=doseResident?.dosageSchedule?.find((d:any)=>d.id===input.doseId);
        if (!dose || dose.medicineId!==med.id) fail('الجرعة غير موجودة أو تغير الدواء. أعد تحميل البيانات.',409);
        if (dose.lastDispensedDate===now().slice(0,10)) fail('تم صرف هذه الجرعة اليوم بالفعل.',409);
        if (Number.isFinite(dose.quantity) && dose.quantity!==actual) fail('كمية الجرعة تغيرت. أعد تحميل البيانات.',409);
        Object.assign(dose,{checkedToday:true,lastDispensedDate:now().slice(0,10),checkedBy:a.name,checkedAt:now(),dispenseRecordId:key,dispensedQty:actual});
      }
      if (input.residentId && !await get('residents',input.residentId,tx)) fail('المستفيد غير موجود.');
      if (input.doctorId && !await get('doctors',input.doctorId,tx)) fail('الطبيب غير موجود.');
      const rec={...input,id:key,medicineId:med.id,medicineName:med.commercialName,unit:med.unit,totalPrice:total,actualQuantityDispensed:actual,dispensedBy:a.name,dispensedById:a.id,dispensedAt:now()};
      delete rec.requestId;
      await put('medicines',{...med,quantity:after,updatedAt:now()},tx);
      await put('dispense_records',rec,tx);
      if (doseResident) await put('residents',doseResident,tx);
      await audit(tx,a,'صرف دواء لمستفيد',med,med.quantity,after,`صرف للمستفيد: ${input.residentName || ''}`);
      return rec;
    }
    if (['addMedicine','updateMedicine','deleteMedicine'].includes(method)) {
      permit(a,['developer','admin','pharmacist']);
      const id=method==='addMedicine'?randomUUID():args[0];
      const old=await get('medicines',id,tx,true);
      if (method!=='addMedicine' && !old) fail('الدواء غير موجود.',404);
      if (method==='deleteMedicine') {
        const refs=await (await req(tx)).input('id',sql.NVarChar(500),id).query('SELECT TOP (1) Id FROM dbo.ResidentDosageSchedule WHERE medicineId=@id');
        if (refs.recordset.length) fail('الدواء مرتبط بجرعات؛ عدّل الجرعات أولًا.',409);
        await remove('medicines',id,tx); await audit(tx,a,'حذف دواء',old,old.quantity,0); return true;
      }
      const data={...old,...(method==='addMedicine'?args[0]:args[1]),id,createdAt:old?.createdAt || now(),updatedAt:now()};
      if (!data.commercialName || typeof data.quantity!=='number' || data.quantity<0 || typeof data.price!=='number' || data.price<0) fail('بيانات الدواء أو الرصيد أو السعر غير صالحة.');
      await put('medicines',data,tx); await audit(tx,a,method==='addMedicine'?'إضافة دواء جديد':'تعديل دواء',data,old?.quantity || 0,data.quantity); return data;
    }
    if (['addUser','updateUser','deleteUser'].includes(method)) {
      permit(a,['developer','admin']);
      const input=args[0], id=method==='deleteUser'?input:(input.id || input.uid || randomUUID());
      const old=await get('users',id,tx,true);
      if (method==='deleteUser') {
        if (id===a.id) fail('لا يمكنك حذف حسابك الحالي.');
        if (old?.role==='developer' && a.role!=='developer') fail('لا تملك صلاحية تعديل حساب المبرمج.',403);
        if (old?.role==='developer' && (await list('users',tx)).filter(u=>u.role==='developer').length<=1) fail('لا يمكن حذف آخر مبرمج.');
        await (await req(tx)).input('id',sql.NVarChar(450),id).query('DELETE dbo.ServerAuthSessions WHERE UserId=@id');
        await remove('users',id,tx); await audit(tx,a,'إلغاء حساب مستخدم',old || {id}); return null;
      }
      if (!roles.includes(input.role) || !input.name || typeof input.email!=='string' || !input.email.includes('@')) fail('بيانات الحساب غير صالحة.');
      if ((input.role==='developer' || old?.role==='developer') && a.role!=='developer') fail('لا تملك صلاحية تعديل دور المبرمج.',403);
      if (old?.role==='developer' && input.role!=='developer' && (await list('users',tx)).filter(u=>u.role==='developer').length<=1) fail('لا يمكن تغيير دور آخر مبرمج.');
      const email=input.email.trim().toLowerCase();
      const duplicate=await (await req(tx)).input('email',sql.NVarChar(500),email).input('id',sql.NVarChar(450),id).query('SELECT TOP(1) Id FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) WHERE LOWER(LTRIM(RTRIM(email)))=@email AND Id<>@id');
      if (duplicate.recordset.length) fail('البريد الإلكتروني مستخدم بالفعل.',409);
      const data=await put('users',{...old,...input,id,uid:id,email},tx);
      if (input.password) await savePassword(id,input.password,tx);
      await audit(tx,a,old?'تعديل حساب مستخدم':'إضافة مستخدم',data); return data;
    }
    if (method==='saveSecuritySettings') {
      permit(a,['developer','admin']); const data={...await get('security_settings','config',tx),...args[0],id:'config',updatedAt:now(),updatedBy:a.name};
      await put('security_settings',data,tx); await audit(tx,a,'تعديل إعدادات النظام',{id:'config'}); return data;
    }
    if (method==='saveCustomSideEffects') {
      const items=args[0]; if (!Array.isArray(items) || items.some(x=>typeof x?.key!=='string' || typeof x?.label!=='string')) fail('Invalid side effects.');
      await put('settings',{id:'custom_side_effects',items},tx); return items;
    }
    const lookup=method.match(/^(save|add|update|delete)(Units?|Categories|Category)$/);
    if (lookup) {
      permit(a,['developer','admin','pharmacist']);
      const col=/Unit/.test(method)?'item_units':'therapeutic_categories';
      let values=(await list(col,tx)).map(x=>x.name || x.id), deleted:string[]=[];
      const op=lookup[1];
      if (op==='save') { if (!Array.isArray(args[0])) fail('Expected list.'); deleted=values.filter(v=>!args[0].includes(v)); values=args[0]; }
      if (op==='add') values.push(args[0]);
      if (op==='update') {deleted=[args[0]];values=values.map(v=>v===args[0]?args[1]:v);}
      if (op==='delete') {deleted=[args[0]];values=values.filter(v=>v!==args[0]);}
      values=[...new Set(values)];
      if (values.some(v=>typeof v!=='string' || !v.trim() || v.length>450)) fail('Invalid list entry.');
      for (const id of deleted) await remove(col,id,tx);
      for (const name of values) await put(col,{id:name,name,updatedAt:now()},tx);
      const doc=await get('settings','units_and_categories',tx) || {id:'units_and_categories'};
      doc[col==='item_units'?'units':'categories']=values; await put('settings',doc,tx); return values;
    }
    const saveMap: Record<string,string>={saveResident:'residents',syncSingleResident:'residents',addDoctor:'doctors',updateDoctor:'doctors',saveCompany:'pharmaceutical_companies',addBehaviorLog:'behavior_logs',logSession:'user_sessions',addStockLog:'stock_audit_logs'};
    if (saveMap[method]) {
      const col=saveMap[method];
      if (col==='stock_audit_logs') { const d=args[0] || {}; return audit(tx,a,d.actionType || 'إجراء مستخدم',{id:d.medicineId || a.id,name:d.medicineName},0,0,d.notes || ''); }
      const input=method==='updateDoctor'?{...args[1],id:args[0]}:args[0];
      if (!input || typeof input!=='object') fail('Invalid record.');
      const id=input.id || randomUUID(), old=await get(col,id,tx,true);
      const data={...old,...input,id};
      if (col==='doctors') {data.updatedAt=now(); data.createdAt=old?.createdAt || now();}
      if (col==='user_sessions') {data.userId=a.id;data.name=a.name;data.email=a.email;data.loginTime=now();delete data.deviceToken;}
      if (col==='behavior_logs') {data.loggedBy=a.name;data.loggedAt=now();if (!await get('residents',data.residentId,tx)) fail('المستفيد غير موجود.');}
      await put(col,data,tx); return data;
    }
    const deleteMap:Record<string,string>={deleteResident:'residents',deleteDoctor:'doctors',deleteCompany:'pharmaceutical_companies',deleteBehaviorLog:'behavior_logs'};
    if (deleteMap[method]) {
      permit(a,['developer','admin','pharmacist']);const col=deleteMap[method], old=await get(col,args[0],tx,true);
      await remove(col,args[0],tx); await audit(tx,a,'حذف سجل',old || {id:args[0]});return true;
    }
    const syncMap:Record<string,string>={syncAllResidents:'residents',syncAllCompanies:'pharmaceutical_companies',syncAllBehaviorLogs:'behavior_logs'};
    if (syncMap[method]) {
      if (!Array.isArray(args[0]) || args[0].length>2000) fail('Invalid list.');
      for (const input of args[0]) await put(syncMap[method],input,tx);
      return null;
    }
    if (method==='restoreFullBackup') {
      permit(a,['developer']); const collections=args[0]?.collections;
      if (!collections || typeof collections!=='object') fail('استخدم نسخة احتياطية كاملة تحتوي collections.');
      if (Object.keys(collections).some(k=>!models[k])) fail('تحتوي النسخة مجموعات غير معروفة.');
      const counts:Record<string,number>={};
      for (const col of Object.keys(models)) {
        if (!(col in collections)) continue;
        const rows=collections[col];if (!Array.isArray(rows) || rows.length>10000) fail('Invalid backup list.');
        for (const row of rows) await put(col,row,tx);
        counts[col]=rows.length;
      }
      await audit(tx,a,'استعادة نسخة احتياطية',{id:'backup'});
      counts.total=Object.values(counts).reduce((sum,n)=>sum+n,0);
      return {success:true,counts};
    }
    fail('العملية غير مدعومة في وضع SQL Server.',404);
  });
}
