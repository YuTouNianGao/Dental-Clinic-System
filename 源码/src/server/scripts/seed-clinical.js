import { pool, query, transaction } from '../db.js';
import { makeNo, shanghaiToday } from '../utils.js';

function addDays(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const count = Number((await query('SELECT COUNT(*) AS c FROM treatment_plan'))[0].c);
  if (count > 0) {
    console.log('临床演示数据已存在，跳过。');
    return;
  }
  const patients = await query(
    `SELECT p.patient_id, pcr.clinic_id
       FROM patient p JOIN patient_clinic_relation pcr ON pcr.patient_id = p.patient_id
      GROUP BY p.patient_id, pcr.clinic_id ORDER BY p.patient_id LIMIT 6`
  );
  const dentists = await query('SELECT dentist_id FROM dentist_profile ORDER BY dentist_id LIMIT 2');
  const treatments = await query('SELECT treatment_item_id, treatment_name FROM treatment_item ORDER BY treatment_item_id LIMIT 8');
  const admin = (await query("SELECT user_id FROM user_account WHERE role_code IN ('HQ_MANAGER','CLINIC_MANAGER') ORDER BY user_id LIMIT 1"))[0];
  const priceRows = await query(
    `SELECT treatment_item_id, standard_unit_price FROM treatment_price
      WHERE approval_status = 'APPROVED' ORDER BY treatment_item_id, version_no DESC`
  );
  const priceByItem = new Map();
  for (const row of priceRows) if (!priceByItem.has(row.treatment_item_id)) priceByItem.set(row.treatment_item_id, Number(row.standard_unit_price));
  if (!patients.length || !dentists.length || !treatments.length || !admin) {
    console.log('缺少患者、牙医、治疗项目或管理员，跳过临床演示数据。');
    return;
  }
  const plans = [
    { status: 'PRESENTED', title: '后牙修复与洁牙计划', items: [[0, '16', 1], [1, null, 1], [2, '26', 1]] },
    { status: 'ACCEPTED', title: '根管治疗与全冠修复', items: [[3, '36', 1], [4, '36', 1]] },
    { status: 'IN_PROGRESS', title: '儿童防龋与涂氟计划', items: [[6, null, 1], [0, null, 1]] },
    { status: 'DRAFT', title: '种植咨询与影像检查', items: [[5, '46', 1], [8, null, 1]] },
    { status: 'COMPLETED', title: '牙周维护计划', items: [[1, null, 1], [0, null, 1]] },
    { status: 'PRESENTED', title: '前牙美学修复计划', items: [[2, '11', 1], [2, '21', 1], [4, '11', 1]] }
  ];
  const today = shanghaiToday();
  await transaction(async (conn) => {
    for (let i = 0; i < patients.length; i += 1) {
      const p = patients[i];
      const dentist = dentists[i % dentists.length];
      const def = plans[i % plans.length];
      const [planResult] = await conn.execute(
        `INSERT INTO treatment_plan (plan_no, patient_id, clinic_id, dentist_id, title, status, notes, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [makeNo('PLAN'), p.patient_id, p.clinic_id, dentist.dentist_id, def.title, def.status, '参考 OpenDental Treatment Plan / DentalPin Budgets 的演示计划。', admin.user_id]
      );
      let seq = 0;
      for (const [idx, tooth, qty] of def.items) {
        const t = treatments[idx % treatments.length];
        seq += 1;
        await conn.execute(
          `INSERT INTO treatment_plan_item (plan_id, treatment_item_id, tooth_no, quantity, unit_price, status, sequence_no, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [planResult.insertId, t.treatment_item_id, tooth, qty, priceByItem.get(t.treatment_item_id) || 0,
           def.status === 'COMPLETED' ? 'COMPLETED' : (def.status === 'ACCEPTED' ? 'SCHEDULED' : 'PLANNED'), seq, null]
        );
      }
      const teeth = [
        ['16', 'CARIES', '咬合面'],
        ['26', 'FILLING', null],
        ['36', 'ROOT_CANAL', null],
        ['46', 'MISSING', null],
        ['11', 'HEALTHY', null]
      ];
      for (const [tooth, condition, surface] of teeth) {
        await conn.execute(
          `INSERT INTO tooth_record (patient_id, tooth_no, condition_code, surface, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE condition_code=VALUES(condition_code), surface=VALUES(surface)`,
          [p.patient_id, tooth, condition, surface, admin.user_id]
        );
      }
      await conn.execute(
        `INSERT INTO patient_recall (patient_id, recall_type, due_date, status, note, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.patient_id, i % 2 ? 'CLEANING' : 'EXAM', addDays(today, i < 3 ? -3 + i : 12 + i), 'DUE', '六个月常规复查', admin.user_id]
      );
    }
  });
  console.log('临床演示数据已写入。');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await pool.end(); });
