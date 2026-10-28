import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../app.js';
import { pool } from '../db.js';
import { makeNo, toUtcSql } from '../utils.js';

const state = { ids:{}, agents:{}, counter: 0 };

function localDate(offset) {
  const d = new Date(Date.now() + offset * 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}
function utc(date, time) { return toUtcSql(date + 'T' + time + ':00'); }

async function addSchedule({ dentistId, clinicId, date, start='09:00', end='18:00', status='PUBLISHED', qualificationIds=[], coordinatorId=state.ids.hq }) {
  const [r] = await pool.execute(
    "INSERT INTO dentist_schedule (dentist_id,clinic_id,available_start_at,available_end_at,transfer_minutes,status,coordinator_user_id) VALUES (?,?,?,?,30,?,?)",
    [dentistId, clinicId, utc(date,start), utc(date,end), status, coordinatorId]
  );
  for (const q of qualificationIds) await pool.execute('INSERT INTO schedule_qualification (schedule_id,qualification_id) VALUES (?,?)',[r.insertId,q]);
  return r.insertId;
}

async function addAppointment({ patientId, dentistId, clinicId, scheduleId, date, start, end='18:00', status='SCHEDULED', createdBy=state.ids.front }) {
  const [r] = await pool.execute(
    "INSERT INTO appointment (appointment_no,patient_id,dentist_id,clinic_id,schedule_id,scheduled_start_at,scheduled_end_at,expected_treatment,status,created_by_user_id,attendance_recorded_by_user_id,attendance_recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [makeNo('APT'),patientId,dentistId,clinicId,scheduleId,utc(date,start),utc(date,end),'自动化测试就诊',status,createdBy,status==='ATTENDED'?createdBy:null,status==='ATTENDED'?utc(date,start):null]
  );
  return r.insertId;
}

async function addSettledVisit({ patientId, dentistId, clinicId, date, time, quantity=1, price=250, status='ACTIVE' }) {
  const scheduleId = await addSchedule({ dentistId, clinicId, date, start:'08:00', end:'19:00', qualificationIds:[state.ids.endo] });
  const appointmentId = await addAppointment({ patientId, dentistId, clinicId, scheduleId, date, start:time, end:'19:00', status:'ATTENDED' });
  const [visit] = await pool.execute("INSERT INTO visit (visit_no,appointment_id,visit_datetime,patient_problem,status) VALUES (?,?,?,?, 'COMPLETED')",[makeNo('VIS'),appointmentId,utc(date,time),'自动化测试问题']);
  const [td] = await pool.execute("INSERT INTO treatment_detail (visit_id,treatment_item_id,unit_quantity,unit_price_snapshot,status,recorded_by_user_id) VALUES (?,?,?,?, 'ACTIVE',?)",[visit.insertId,state.ids.treatment,quantity,price,state.ids.dentist]);
  const [s] = await pool.execute("INSERT INTO settlement (settlement_no,visit_id,version_no,settlement_date,total_amount,status,generated_by_user_id) VALUES (?,?,1,?,?,?,?)",[makeNo('STL'),visit.insertId,utc(date,time),quantity*price,status,state.ids.front]);
  await pool.execute("INSERT INTO settlement_detail (settlement_id,treatment_detail_id,treatment_item_id,treatment_name_snapshot,unit_quantity_snapshot,unit_price_snapshot,subtotal) VALUES (?,?,?,?,?,?,?)",[s.insertId,td.insertId,state.ids.treatment,'测试治疗',quantity,price,quantity*price]);
  return {visitId:visit.insertId,settlementId:s.insertId,appointmentId};
}

async function loginAgent(role, username) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ username, password:'TestPass@123' });
  expect(response.status).toBe(200);
  state.agents[role] = agent;
  return agent;
}

beforeAll(async () => {
  const hash = await bcrypt.hash('TestPass@123', 4);
  const userDefs = [['hq','hq_test','HQ_MANAGER'],['front','front_test','FRONT_DESK'],['manager','manager_test','CLINIC_MANAGER'],['dentist','dentist_test','DENTIST'],['dentist2','dentist2_test','DENTIST']];
  for (const [key,username,role] of userDefs) {
    const [r] = await pool.execute('INSERT INTO user_account (username,password_hash,display_name,role_code) VALUES (?,?,?,?)',[username,hash,key+'用户',role]);
    state.ids[key] = r.insertId;
  }
  for (const key of ['clinic1','clinic2','clinic3']) {
    const no = key==='clinic1'?'T-001':key==='clinic2'?'T-002':'T-003';
    const [r] = await pool.execute('INSERT INTO clinic (clinic_no,postal_address,manager_name,phone,office_area_sqm) VALUES (?,?,?,?,?)',[no,'测试地址 '+no,'测试主管','020-1000000'+no.slice(-1),120]);
    state.ids[key]=r.insertId;
  }
  await pool.execute('INSERT INTO user_clinic_scope (user_id,clinic_id) VALUES (?,?),(?,?)',[state.ids.front,state.ids.clinic1,state.ids.manager,state.ids.clinic1]);
  const [endo] = await pool.execute("INSERT INTO qualification (qualification_name) VALUES ('牙体牙髓')"); state.ids.endo=endo.insertId;
  const [perio] = await pool.execute("INSERT INTO qualification (qualification_name) VALUES ('牙周')"); state.ids.perio=perio.insertId;
  for (const key of ['dentist','dentist2']) {
    const [d] = await pool.execute('INSERT INTO dentist_profile (user_id,employee_no,birth_date,home_address,phone,email) VALUES (?,?,?,?,?,?)',[state.ids[key],'E-'+key,'1990-01-01','测试地址','13800000000',key+'@test.cn']);
    state.ids[key+'Profile']=d.insertId;
    await pool.execute("INSERT INTO dentist_qualification (dentist_id,qualification_id,verification_status,verified_by_user_id,verified_at) VALUES (?,?, 'VERIFIED',?,UTC_TIMESTAMP(6))",[d.insertId,state.ids.endo,state.ids.hq]);
  }
  for (const key of ['patient1','patient2']) {
    const [p] = await pool.execute('INSERT INTO patient (patient_no,patient_name,birth_date,billing_address,phone,email,emergency_contact_name,emergency_contact_phone) VALUES (?,?,?,?,?,?,?,?)',[makeNo('PAT'),key==='patient1'?'测试患者甲':'测试患者乙','1990-01-01','测试地址','1390000000'+key.slice(-1),key+'@test.cn','紧急联系人','13911111111']);
    state.ids[key]=p.insertId;
  }
  const [item] = await pool.execute("INSERT INTO treatment_item (treatment_name) VALUES ('测试治疗')"); state.ids.treatment=item.insertId;
  await pool.execute("INSERT INTO treatment_price (treatment_item_id,version_no,standard_unit_price,effective_from,approval_status,approved_by_user_id,approved_at,created_by_user_id) VALUES (?,1,250,'2020-01-01','APPROVED',?,UTC_TIMESTAMP(6),?)",[item.insertId,state.ids.hq,state.ids.hq]);
  await loginAgent('hq','hq_test'); await loginAgent('front','front_test'); await loginAgent('manager','manager_test'); await loginAgent('dentist','dentist_test'); await loginAgent('dentist2','dentist2_test');
});

afterAll(async () => { await pool.end(); });

describe('患者档案与权限', () => {
  it('新增、修改、查询患者及过敏历史', async () => {
    const created = await state.agents.front.post('/api/patients').send({ patientName:'接口患者',birthDate:'1995-02-03',billingAddress:'测试路 1 号',phone:'13922223333',emergencyContactName:'家属',emergencyContactPhone:'13922224444',allergies:[{allergyName:'青霉素',note:'皮试阳性',confirmationStatus:'CONFIRMED'}] });
    expect(created.status).toBe(201);
    const id=created.body.patientId;
    const detail=await state.agents.front.get('/api/patients/'+id);
    expect(detail.status).toBe(200); expect(detail.body.patient.patient_name).toBe('接口患者'); expect(detail.body.allergies[0].allergy_name).toBe('青霉素');
    const updated=await state.agents.front.put('/api/patients/'+id).send({phone:'13933334444'});
    expect(updated.status).toBe(200);
    const list=await state.agents.front.get('/api/patients?q='+encodeURIComponent('接口患者'));
    expect(list.body.items[0].phone).toBe('13933334444');
  });

  it('前台不能访问授权外诊所，也不能维护成本', async () => {
    expect((await state.agents.front.get('/api/clinics?clinicId='+state.ids.clinic3)).status).toBe(403);
    expect((await state.agents.front.post('/api/costs').send({})).status).toBe(403);
    expect((await state.agents.front.get('/api/costs')).status).toBe(403);
    expect((await state.agents.front.get('/api/performance')).status).toBe(403);
  });
});

describe('预约、排班与改期', () => {
  it('阻止牙医时间冲突，允许首尾相接', async () => {
    const date=localDate(20); const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const a=await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId,startAt:date+'T10:00',endAt:date+'T11:00',expectedTreatment:'冲突测试'});
    expect(a.status).toBe(201);
    const conflict=await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient2,scheduleId,startAt:date+'T10:30',endAt:date+'T11:30',expectedTreatment:'冲突测试'});
    expect(conflict.status).toBe(409); expect(conflict.body.error.code).toBe('CONFLICT');
    const adjacent=await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient2,scheduleId,startAt:date+'T11:00',endAt:date+'T12:00',expectedTreatment:'相邻预约'});
    expect(adjacent.status).toBe(201);
  });

  it('拒绝未发布排班、超排班范围与无效资质', async () => {
    const date=localDate(21);
    const draft=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,status:'DRAFT',qualificationIds:[state.ids.endo]});
    expect((await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId:draft,startAt:date+'T09:00',endAt:date+'T10:00',expectedTreatment:'草稿排班'})).status).toBe(409);
    expect((await state.agents.hq.post('/api/schedules/'+draft+'/publish').send({})).status).toBe(200);
    expect((await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId:draft,startAt:date+'T09:00',endAt:date+'T10:00',expectedTreatment:'发布后预约'})).status).toBe(201);
    const published=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,start:'10:00',end:'18:00',qualificationIds:[state.ids.endo]});
    expect((await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId:published,startAt:date+'T08:00',endAt:date+'T09:00',expectedTreatment:'范围外'})).status).toBe(409);
    const badQual=await state.agents.hq.post('/api/schedules').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,availableStartAt:localDate(22)+'T09:00',availableEndAt:localDate(22)+'T12:00',status:'PUBLISHED',qualificationIds:[state.ids.perio]});
    expect(badQual.status).toBe(409);
  });

  it('员工改期失败时保留原预约取消结果且不新增预约', async () => {
    const date=localDate(23); const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const original=await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId,startAt:date+'T09:00',endAt:date+'T10:00',expectedTreatment:'原预约'});
    await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient2,scheduleId,startAt:date+'T14:00',endAt:date+'T15:00',expectedTreatment:'冲突预约'});
    const before=(await pool.query('SELECT COUNT(*) AS c FROM appointment'))[0][0].c;
    const failed=await state.agents.front.post('/api/appointments/'+original.body.appointmentId+'/reschedule').send({scheduleId,startAt:date+'T14:30',endAt:date+'T15:30',reason:'测试冲突',initiator:'PATIENT'});
    expect(failed.status).toBe(409);
    const current=await state.agents.front.get('/api/appointments/'+original.body.appointmentId);
    expect(current.body.appointment.status).toBe('CANCELLED');
    const after=(await pool.query('SELECT COUNT(*) AS c FROM appointment'))[0][0].c;
    expect(after).toBe(before);
  });

  it('员工改期成功时原预约取消、新预约独立创建且无预约金', async () => {
    const date=localDate(25); const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const original=await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId,startAt:date+'T09:00',endAt:date+'T10:00',expectedTreatment:'原预约'});
    const changed=await state.agents.front.post('/api/appointments/'+original.body.appointmentId+'/reschedule').send({scheduleId,startAt:date+'T11:00',endAt:date+'T12:00',reason:'患者申请改期',initiator:'PATIENT'});
    expect(changed.status).toBe(200);
    const oldRecord=await state.agents.front.get('/api/appointments/'+original.body.appointmentId);
    const newRecord=await state.agents.front.get('/api/appointments/'+changed.body.newAppointmentId);
    expect(oldRecord.body.appointment.status).toBe('CANCELLED'); expect(newRecord.body.appointment.status).toBe('SCHEDULED');
    expect(oldRecord.body.changes[0].change_type).toBe('CANCEL');
    const [orders]=await pool.query("SELECT * FROM payment_order WHERE appointment_id=?",[changed.body.newAppointmentId]);
    expect(orders).toHaveLength(0);
  });

  it('跨店出诊安排阻止牙医时间冲突', async () => {
    const date=localDate(24);
    const first=await state.agents.hq.post('/api/schedules').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic2,availableStartAt:date+'T09:00',availableEndAt:date+'T12:00',status:'PUBLISHED',qualificationIds:[state.ids.endo]});
    expect(first.status).toBe(201);
    const conflict=await state.agents.hq.post('/api/schedules').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,availableStartAt:date+'T10:00',availableEndAt:date+'T11:00',status:'PUBLISHED',qualificationIds:[state.ids.endo]});
    expect(conflict.status).toBe(409);
    const partial=await state.agents.hq.post('/api/schedules').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,availableStartAt:date+'T11:30',availableEndAt:date+'T13:00',status:'PUBLISHED',qualificationIds:[state.ids.endo]});
    expect(partial.status).toBe(409);
  });
});


describe('就诊、结算与收入', () => {
  it('治疗明细、结算总额与单价快照一致，且重复结算被阻止', async () => {
    const date=localDate(-1);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const appointment=await state.agents.front.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId,startAt:date+'T09:00',endAt:date+'T10:00',expectedTreatment:'结算测试'});
    expect(appointment.status).toBe(201);
    const attend=await state.agents.front.post('/api/appointments/'+appointment.body.appointmentId+'/attend').send({patientProblem:'牙痛'});
    expect(attend.status).toBe(200);
    const added=await state.agents.dentist.post('/api/visits/'+attend.body.visitId+'/treatments').send({treatmentItemId:state.ids.treatment,unitQuantity:2});
    expect(added.status).toBe(201);
    const settled=await state.agents.front.post('/api/settlements/visits/'+attend.body.visitId).send({});
    expect(settled.status).toBe(201); expect(settled.body.totalAmount).toBe(500);
    const detail=await state.agents.hq.get('/api/settlements/'+settled.body.settlementId);
    expect(detail.status).toBe(200); expect(detail.body.details).toHaveLength(1); expect(Number(detail.body.details[0].subtotal)).toBe(500); expect(Number(detail.body.details[0].unit_price_snapshot)).toBe(250);
    expect(detail.body.settlement.total_amount).toBe(500);
    const duplicate=await state.agents.front.post('/api/settlements/visits/'+attend.body.visitId).send({});
    expect(duplicate.status).toBe(409);
  });

  it('结算作废后 ACTIVE 收入减少并保留原版本', async () => {
    const date='2024-02-01';
    const seeded=await addSettledVisit({patientId:state.ids.patient2,dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,time:'10:00',quantity:1,price:250});
    const before=await state.agents.hq.get('/api/settlements/'+seeded.settlementId);
    expect(before.body.settlement.status).toBe('ACTIVE');
    const voided=await state.agents.hq.post('/api/settlements/'+seeded.settlementId+'/void').send({reason:'自动化作废测试'});
    expect(voided.status).toBe(200);
    const after=await state.agents.hq.get('/api/settlements/'+seeded.settlementId);
    expect(after.body.settlement.status).toBe('VOID'); expect(after.body.versions).toHaveLength(1);
    const activeIncome=await pool.query("SELECT COALESCE(SUM(total_amount),0) AS total FROM settlement WHERE status='ACTIVE' AND settlement_id=?",[seeded.settlementId]);
    expect(Number(activeIncome[0][0].total)).toBe(0);
  });

  it('牙医不能查看其他牙医的就诊记录', async () => {
    const date=localDate(-3);
    const seeded=await addSettledVisit({patientId:state.ids.patient2,dentistId:state.ids.dentist2Profile,clinicId:state.ids.clinic1,date,time:'11:00'});
    const denied=await state.agents.dentist.get('/api/visits/'+seeded.visitId);
    expect(denied.status).toBe(403);
  });
});

describe('成本完整性与季度绩效', () => {
  it('成本草稿阻止净利润计算，审核后恢复', async () => {
    const q=Math.floor((new Date(Date.now()+8*3600000).getUTCMonth())/3)+1; const year=new Date(Date.now()+8*3600000).getUTCFullYear();
    const med=await state.agents.hq.post('/api/costs').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,periodYear:year,quarterNo:q,costType:'MEDICAL_SUPPLIES',amount:100,allocationBasis:'测试分摊'});
    expect(med.status).toBe(201);
    const op=await state.agents.hq.post('/api/costs').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,periodYear:year,quarterNo:q,costType:'OPERATING_EXPENSE',amount:50,allocationBasis:'测试分摊'});
    expect(op.status).toBe(201);
    expect((await state.agents.hq.post('/api/costs/'+med.body.costEntryId+'/verify').send({})).status).toBe(200);
    expect((await state.agents.hq.post('/api/costs/'+op.body.costEntryId+'/verify').send({})).status).toBe(200);
    let perf=await state.agents.hq.get('/api/performance?year='+year+'&quarter='+q);
    let row=perf.body.items.find(r=>r.dentist_id===state.ids.dentistProfile);
    expect(row.performance_status).toBe('PROVISIONAL_COMPLETE');
    expect(Number(row.calculated_net_profit)).toBe(Number(row.recognized_revenue)-150);
    const draft=await state.agents.hq.post('/api/costs').send({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,periodYear:year,quarterNo:q,costType:'MEDICAL_SUPPLIES',amount:10,allocationBasis:'草稿测试'});
    expect(draft.status).toBe(201);
    perf=await state.agents.hq.get('/api/performance?year='+year+'&quarter='+q);
    row=perf.body.items.find(r=>r.dentist_id===state.ids.dentistProfile);
    expect(row.calculated_net_profit).toBeNull(); expect(Number(row.draft_cost_entry_count)).toBeGreaterThan(0);
    expect((await state.agents.hq.post('/api/costs/'+draft.body.costEntryId+'/reject').send({reason:'测试驳回'})).status).toBe(200);
    perf=await state.agents.hq.get('/api/performance?year='+year+'&quarter='+q);
    row=perf.body.items.find(r=>r.dentist_id===state.ids.dentistProfile);
    expect(row.calculated_net_profit).not.toBeNull();
  });

  it('完整绩效可确认快照，并保留更正版本', async () => {
    const q=Math.floor((new Date(Date.now()+8*3600000).getUTCMonth())/3)+1; const year=new Date(Date.now()+8*3600000).getUTCFullYear();
    const first=await state.agents.hq.post('/api/performance/confirm').send({dentistId:state.ids.dentistProfile,year,quarter:q});
    expect(first.status).toBe(201); expect(first.body.version).toBe(1);
    const duplicate=await state.agents.hq.post('/api/performance/confirm').send({dentistId:state.ids.dentistProfile,year,quarter:q});
    expect(duplicate.status).toBe(409);
    const corrected=await state.agents.hq.post('/api/performance/confirm').send({dentistId:state.ids.dentistProfile,year,quarter:q,correctionReason:'自动化更正测试'});
    expect(corrected.status).toBe(201); expect(corrected.body.version).toBe(2);
    const perf=await state.agents.hq.get('/api/performance?year='+year+'&quarter='+q);
    const row=perf.body.items.find(r=>r.dentist_id===state.ids.dentistProfile);
    expect(row.performance_status).toBe('CONFIRMED_COMPLETE'); expect(row.snapshot_version_no).toBe(2);
  });

  it('确认零成本与草稿状态都能被绩效视图正确区分', async () => {
    const date=localDate(-4); await addSettledVisit({patientId:state.ids.patient1,dentistId:state.ids.dentist2Profile,clinicId:state.ids.clinic1,date,time:'15:00',quantity:1,price:250});
    const q=Math.floor((new Date(Date.now()+8*3600000).getUTCMonth())/3)+1; const year=new Date(Date.now()+8*3600000).getUTCFullYear();
    let before=await state.agents.hq.get('/api/performance?year='+year+'&quarter='+q);
    let beforeRow=before.body.items.find(r=>r.dentist_id===state.ids.dentist2Profile);
    expect(beforeRow.medical_supply_status).toBe('MISSING'); expect(beforeRow.operating_expense_status).toBe('MISSING');
    for (const type of ['MEDICAL_SUPPLIES','OPERATING_EXPENSE']) {
      const created=await state.agents.hq.post('/api/costs').send({dentistId:state.ids.dentist2Profile,clinicId:state.ids.clinic1,periodYear:year,quarterNo:q,costType:type,amount:0,allocationBasis:'确认无成本'});
      expect(created.status).toBe(201); expect((await state.agents.hq.post('/api/costs/'+created.body.costEntryId+'/verify').send({})).status).toBe(200);
    }
    const perf=await state.agents.hq.get('/api/performance?year='+year+'&quarter='+q);
    const row=perf.body.items.find(r=>r.dentist_id===state.ids.dentist2Profile);
    expect(row.medical_supply_status).toBe('CONFIRMED_ZERO'); expect(row.operating_expense_status).toBe('CONFIRMED_ZERO');
    expect(row.performance_status).toBe('PROVISIONAL_COMPLETE');
  });

  it('季度末未结算就诊使绩效不完整，且不按零收入掩盖', async () => {
    const date='2025-03-31';
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const appointmentId=await addAppointment({patientId:state.ids.patient1,dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,scheduleId,date,start:'23:00',end:'23:30',status:'ATTENDED'});
    await pool.execute("INSERT INTO visit (visit_no,appointment_id,visit_datetime,patient_problem,status) VALUES (?,?,?,?,'COMPLETED')",[makeNo('VIS'),appointmentId,utc(date,'23:00'),'季度末未结算']);
    const perf=await state.agents.hq.get('/api/performance?year=2025&quarter=1');
    const row=perf.body.items.find(r=>r.dentist_id===state.ids.dentistProfile);
    expect(Number(row.unsettled_visit_count_at_q_end)).toBeGreaterThan(0);
    expect(row.performance_status).toBe('PROVISIONAL_INCOMPLETE');
    expect(row.calculated_net_profit).toBeNull();
  });
});

describe('患者端账号、预约金与权限隔离', () => {
  async function registerPatient(username, name, clinicId=state.ids.clinic1) {
    const agent=request.agent(app);
    const response=await agent.post('/api/auth/register').send({
      registrationType:'NEW_PATIENT',username,password:'Patient@123',
      patientName:name,birthDate:'1996-01-02',phone:'139'+String(Date.now()).slice(-8),
      email:`${username}@test.cn`,billingAddress:'测试地址',emergencyContactName:'家属',
      emergencyContactPhone:'13911112222',clinicId,consent:true
    });
    expect(response.status).toBe(201);
    return { agent, user: response.body.user, patientId: response.body.user.patientId };
  }

  it('患者注册后可自助预约、支付预约金并只能访问自己的数据', async () => {
    await pool.execute('UPDATE clinic SET appointment_deposit_amount=100 WHERE clinic_id=?',[state.ids.clinic1]);
    const date=localDate(30);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const { agent, patientId }=await registerPatient('patient_portal_a','患者端甲');
    const availability=await agent.get('/api/public/availability?clinicId='+state.ids.clinic1+'&date='+date+'&durationMinutes=30');
    expect(availability.status).toBe(200);
    expect(availability.body.slots.length).toBeGreaterThan(0);
    const slot=availability.body.slots[0];
    const created=await agent.post('/api/patient/appointments').send({
      scheduleId,startAt:slot.startAt,endAt:slot.endAt,expectedTreatment:'患者端预约测试'
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING_PAYMENT');
    expect(Number(created.body.order.amount)).toBe(100);
    const paid=await agent.post('/api/patient/payment-orders/'+created.body.order.orderId+'/pay')
      .set('Idempotency-Key','patient-test-pay')
      .send({outcome:'SUCCESS'});
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe('PAID');
    const detail=await agent.get('/api/patient/appointments/'+created.body.appointmentId);
    expect(detail.status).toBe(200);
    expect(detail.body.appointment.status).toBe('SCHEDULED');
    expect((await agent.get('/api/patients')).status).toBe(403);
    expect((await agent.get('/api/appointments')).status).toBe(403);

    const other=await registerPatient('patient_portal_b','患者端乙');
    const denied=await other.agent.get('/api/patient/appointments/'+created.body.appointmentId);
    expect(denied.status).toBe(404);
    expect(Number(other.patientId)).not.toBe(Number(patientId));
  });

  it('预约金为 0 时拒绝患者自助预约；员工普通创建不生成预约金订单', async () => {
    await pool.execute('UPDATE clinic SET appointment_deposit_amount=0 WHERE clinic_id=?',[state.ids.clinic2]);
    const date=localDate(31);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic2,date,qualificationIds:[state.ids.endo]});
    const { agent }=await registerPatient('patient_portal_zero','患者端零预约金',state.ids.clinic2);
    const response=await agent.post('/api/patient/appointments').send({
      scheduleId,startAt:date+'T09:00:00.000Z',endAt:date+'T09:30:00.000Z',expectedTreatment:'零预约金测试'
    });
    expect(response.status).toBe(409);
    const staff=await state.agents.hq.post('/api/appointments').send({
      patientId:state.ids.patient2,scheduleId,startAt:date+'T10:00',endAt:date+'T10:30',expectedTreatment:'员工普通预约'
    });
    expect(staff.status).toBe(201);
    const [orders]=await pool.query('SELECT * FROM payment_order WHERE appointment_id=?',[staff.body.appointmentId]);
    expect(orders).toHaveLength(0);
  });

  it('提前取消生成待审核退款，主管审核并模拟退款成功', async () => {
    await pool.execute('UPDATE clinic SET appointment_deposit_amount=100 WHERE clinic_id=?',[state.ids.clinic1]);
    const date=localDate(32);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const { agent }=await registerPatient('patient_portal_cancel','患者端取消');
    const created=await agent.post('/api/patient/appointments').send({
      scheduleId,startAt:date+'T09:00:00.000Z',endAt:date+'T09:30:00.000Z',expectedTreatment:'取消测试'
    });
    expect(created.status).toBe(201);
    await agent.post('/api/patient/payment-orders/'+created.body.order.orderId+'/pay')
      .set('Idempotency-Key','cancel-pay').send({outcome:'SUCCESS'});
    const cancelled=await agent.post('/api/patient/appointments/'+created.body.appointmentId+'/cancel').send({reason:'提前取消'});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.refundEligible).toBe(true);
    expect(cancelled.body.refund.status).toBe('PENDING_REVIEW');
    const approved=await state.agents.hq.post('/api/staff/refunds/'+cancelled.body.refund.refund_id+'/approve').send({note:'核验通过'});
    expect(approved.status).toBe(200);
    const processed=await state.agents.hq.post('/api/staff/refunds/'+cancelled.body.refund.refund_id+'/process').send({outcome:'SUCCESS'});
    expect(processed.status).toBe(200);
    expect(processed.body.status).toBe('SUCCEEDED');
    const [order]=await pool.query('SELECT status,amount_refunded FROM payment_order WHERE order_id=?',[created.body.order.orderId]);
    expect(order[0].status).toBe('REFUNDED');
    expect(Number(order[0].amount_refunded)).toBe(100);
  });

  it('15 分钟超时关闭订单并释放预约占位', async () => {
    await pool.execute('UPDATE clinic SET appointment_deposit_amount=100 WHERE clinic_id=?',[state.ids.clinic1]);
    const date=localDate(33);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const { agent }=await registerPatient('patient_portal_expire','患者端超时');
    const created=await agent.post('/api/patient/appointments').send({
      scheduleId,startAt:date+'T09:00:00.000Z',endAt:date+'T09:30:00.000Z',expectedTreatment:'超时测试'
    });
    expect(created.status).toBe(201);
    await pool.execute("UPDATE payment_order SET expires_at=DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 MINUTE) WHERE order_id=?",[created.body.order.orderId]);
    await pool.execute("UPDATE appointment SET hold_expires_at=DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 MINUTE) WHERE appointment_id=?",[created.body.appointmentId]);
    const { expirePendingAppointments }=await import('../services/paymentService.js');
    await expirePendingAppointments(50);
    const [order]=await pool.query('SELECT status FROM payment_order WHERE order_id=?',[created.body.order.orderId]);
    const [appointment]=await pool.query('SELECT status FROM appointment WHERE appointment_id=?',[created.body.appointmentId]);
    expect(order[0].status).toBe('CLOSED');
    expect(appointment[0].status).toBe('EXPIRED');

    const late=await state.agents.hq.post('/api/staff/payment-orders/'+created.body.order.orderId+'/simulate-late-payment').send({});
    expect(late.status).toBe(200);
    expect(late.body.orderStatus).toBe('CLOSED');
    const [lateOrder]=await pool.query('SELECT status,amount_refund_reserved FROM payment_order WHERE order_id=?',[created.body.order.orderId]);
    expect(lateOrder[0].status).toBe('CLOSED');
    expect(Number(lateOrder[0].amount_refund_reserved)).toBe(100);
    const [lateRefund]=await pool.query('SELECT status FROM refund WHERE refund_id=?',[late.body.refundId]);
    expect(lateRefund[0].status).toBe('PENDING_REVIEW');
  });

  it('既有患者绑定审核前不能访问历史，审核后可访问', async () => {
    const agent=request.agent(app);
    const reg=await agent.post('/api/auth/register').send({
      registrationType:'EXISTING_PATIENT',username:'patient_bind_test',password:'Patient@123',
      patientName:'测试绑定',birthDate:'1990-01-01',phone:'13900007777',clinicId:state.ids.clinic1,consent:true
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.patientId).toBeNull();
    expect((await agent.get('/api/patient/appointments')).status).toBe(403);
    const approved=await state.agents.hq.post('/api/staff/patient-bindings/'+reg.body.user.userId+'/approve').send({patientId:state.ids.patient1,note:'身份核验'});
    expect(approved.status).toBe(200);
    const profile=await agent.get('/api/patient/profile');
    expect(profile.status).toBe(200);
    expect(profile.body.patient.patient_id).toBe(state.ids.patient1);
  });

  it('退款驳回不自动没收，资金保持预留', async () => {
    const date=localDate(34);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const { agent }=await registerPatient('patient_refund_reject','退款驳回');
    const created=await agent.post('/api/patient/appointments').send({scheduleId,startAt:date+'T09:00:00.000Z',endAt:date+'T09:30:00.000Z',expectedTreatment:'退款驳回测试'});
    await agent.post('/api/patient/payment-orders/'+created.body.order.orderId+'/pay').set('Idempotency-Key','reject-pay').send({outcome:'SUCCESS'});
    const cancelled=await agent.post('/api/patient/appointments/'+created.body.appointmentId+'/cancel').send({reason:'提前取消'});
    expect(cancelled.status).toBe(200);
    const rejected=await state.agents.hq.post('/api/staff/refunds/'+cancelled.body.refund.refund_id+'/reject').send({note:'资料不足'});
    expect(rejected.status).toBe(200);
    const [order]=await pool.query('SELECT status,amount_refund_reserved FROM payment_order WHERE order_id=?',[created.body.order.orderId]);
    expect(order[0].status).toBe('PAID');
    expect(Number(order[0].amount_refund_reserved)).toBe(100);
    const [refund]=await pool.query('SELECT status FROM refund WHERE refund_id=?',[cancelled.body.refund.refund_id]);
    expect(refund[0].status).toBe('REJECTED');
  });

  it('诊所取消自动全额退款，患者订单变为 REFUNDED', async () => {
    const date=localDate(35);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const { agent }=await registerPatient('patient_clinic_cancel','诊所取消');
    const created=await agent.post('/api/patient/appointments').send({scheduleId,startAt:date+'T09:00:00.000Z',endAt:date+'T09:30:00.000Z',expectedTreatment:'诊所取消测试'});
    await agent.post('/api/patient/payment-orders/'+created.body.order.orderId+'/pay').set('Idempotency-Key','clinic-cancel-pay').send({outcome:'SUCCESS'});
    const cancelled=await state.agents.hq.post('/api/appointments/'+created.body.appointmentId+'/cancel').send({reason:'医生临时停诊'});
    expect(cancelled.status).toBe(200);
    const [order]=await pool.query('SELECT status FROM payment_order WHERE order_id=?',[created.body.order.orderId]);
    expect(order[0].status).toBe('REFUNDED');
  });

  it('结算作废涉及资金时进入人工异常，且禁止重新结算', async () => {
    await pool.execute('UPDATE clinic SET appointment_deposit_amount=100 WHERE clinic_id=?',[state.ids.clinic1]);
    const date=localDate(36);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const { agent }=await registerPatient('patient_void_test','结算作废');
    const created=await agent.post('/api/patient/appointments').send({scheduleId,startAt:date+'T09:00:00.000Z',endAt:date+'T09:30:00.000Z',expectedTreatment:'作废测试'});
    await agent.post('/api/patient/payment-orders/'+created.body.order.orderId+'/pay').set('Idempotency-Key','void-pay').send({outcome:'SUCCESS'});
    const attend=await state.agents.hq.post('/api/appointments/'+created.body.appointmentId+'/attend').send({patientProblem:'作废测试'});
    expect(attend.status).toBe(200);
    await state.agents.hq.post('/api/visits/'+attend.body.visitId+'/treatments').send({treatmentItemId:state.ids.treatment,unitQuantity:1});
    const settled=await state.agents.hq.post('/api/settlements/visits/'+attend.body.visitId).send({});
    expect(settled.status).toBe(201);
    const voided=await state.agents.hq.post('/api/settlements/'+settled.body.settlementId+'/void').send({reason:'作废资金测试'});
    expect(voided.status).toBe(200);
    expect(voided.body.pendingManualReview).toBe(true);
    const exceptions=await state.agents.hq.get('/api/staff/settlement-exceptions');
    expect(exceptions.body.items.length).toBeGreaterThan(0);
    const again=await state.agents.hq.post('/api/settlements/visits/'+attend.body.visitId).send({});
    expect(again.status).toBe(409);
  });

  it('线下收款登记与确认分离，部分付款累计后结清', async () => {
    const date=localDate(37);
    const scheduleId=await addSchedule({dentistId:state.ids.dentistProfile,clinicId:state.ids.clinic1,date,qualificationIds:[state.ids.endo]});
    const appointment=await state.agents.hq.post('/api/appointments').send({patientId:state.ids.patient1,scheduleId,startAt:date+'T09:00',endAt:date+'T09:30',expectedTreatment:'线下收款测试'});
    expect(appointment.status).toBe(201);
    const attend=await state.agents.hq.post('/api/appointments/'+appointment.body.appointmentId+'/attend').send({patientProblem:'线下收款'});
    await state.agents.hq.post('/api/visits/'+attend.body.visitId+'/treatments').send({treatmentItemId:state.ids.treatment,unitQuantity:1});
    const settled=await state.agents.hq.post('/api/settlements/visits/'+attend.body.visitId).send({});
    expect(settled.status).toBe(201);
    const [orders]=await pool.query("SELECT * FROM payment_order WHERE settlement_id=? AND order_type='VISIT_BALANCE'",[settled.body.settlementId]);
    expect(orders[0].status).toBe('PENDING_PAYMENT');
    const recorded=await state.agents.hq.post('/api/staff/payment-orders/'+orders[0].order_id+'/offline-payments').send({amount:'100.00',channel:'CASH',receiptNo:'R-'+Date.now(),note:'前台登记'});
    expect(recorded.status).toBe(201);
    const [beforeConfirm]=await pool.query('SELECT status,amount_paid FROM payment_order WHERE order_id=?',[orders[0].order_id]);
    expect(beforeConfirm[0].status).toBe('PENDING_PAYMENT');
    expect(Number(beforeConfirm[0].amount_paid)).toBe(0);
    const confirmed=await state.agents.hq.post('/api/staff/payment-transactions/'+recorded.body.transaction_id+'/confirm').send({});
    expect(confirmed.status).toBe(200);
    const [partial]=await pool.query('SELECT status,amount_paid FROM payment_order WHERE order_id=?',[orders[0].order_id]);
    expect(partial[0].status).toBe('PARTIALLY_PAID');
    expect(Number(partial[0].amount_paid)).toBe(100);
  });
});
